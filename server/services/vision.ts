import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { lstat, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import type { Garment, VisionModelId, VisionModelJob, VisionModelStatus, VisionModelsResponse, VisionTagSuggestion } from "../../src/shared/types";
import type { AppDatabase } from "../db";
import { ensureGarmentLocalThumbnail, getGarmentById, saveGarmentVisionTags, updateGarmentCutoutImage } from "../db";
import { ApiError, GARMENT_CATEGORIES } from "../validation";
import { normalizeGarmentEmbedding, upsertGarmentEmbedding } from "./garmentSimilarity";
import { defaultThumbnailOutputDir, MAX_THUMBNAIL_IMAGE_PIXELS } from "./thumbnails";

export interface RembgRunInput {
  inputPath: string;
  outputPath: string;
  model: string;
  modelDir: string;
  provider: string;
}

export interface VisionTagInput {
  garment: Garment;
  imagePath?: string;
  modelDir: string;
  device: string;
}

export interface VisionTagInferenceResult extends VisionTagSuggestion {
  embedding?: readonly number[];
}

export interface VisionServiceOptions {
  modelRoot?: string;
  thumbnailCaptureRoot?: string;
  thumbnailOutputDir?: string;
  thumbnailDelayMs?: number;
  thumbnailMaxDownloadsPerGarment?: number;
  thumbnailFetcher?: typeof fetch;
  visionDevice?: string;
  rembgProvider?: string;
  visionModelJobTimeoutMs?: number;
  visionProcessTimeoutMs?: number;
  visionProcessMaxOutputBytes?: number;
  runRembg?: (input: RembgRunInput) => Promise<void>;
  inferVisionTags?: (input: VisionTagInput) => Promise<VisionTagInferenceResult>;
}

interface VisionModelDefinition {
  id: VisionModelId;
  label: string;
  kind: VisionModelStatus["kind"];
  commandName: "rembg" | "clip";
  relativePath: string[];
}

const MODEL_DEFINITIONS: VisionModelDefinition[] = [
  {
    id: "rembg-isnet",
    label: "rembg isnet-general-use",
    kind: "background-removal",
    commandName: "rembg",
    relativePath: ["rembg"]
  },
  {
    id: "clip-vit-base-patch32",
    label: "Xenova clip-vit-base-patch32",
    kind: "tagging",
    commandName: "clip",
    relativePath: ["huggingface", "Xenova", "clip-vit-base-patch32"]
  }
];
const REMBG_MODEL_FALLBACKS = ["isnet-general-use", "u2netp", "silueta"];
const DEFAULT_VISION_DEVICE = "dml";
const DEFAULT_REMBG_PROVIDER = "cuda";
const DEFAULT_VISION_MODEL_JOB_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_VISION_PROCESS_TIMEOUT_MS = 120_000;
const DEFAULT_VISION_PROCESS_MAX_OUTPUT_BYTES = 1024 * 1024;
const CLIP_REQUIRED_FILES = [
  "config.json",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.json",
  "merges.txt"
];

const visionJobs = new Map<string, VisionModelJob>();
const visionProcesses = new Set<ChildProcess>();
const visionModelJobCancellations = new Map<ChildProcess, () => void>();

export function defaultVisionModelRoot(): string {
  return join(process.cwd(), "output", "models");
}

function defaultVisionDevice(options: VisionServiceOptions = {}): string {
  return normalizeVisionDevice(options.visionDevice || process.env.OUTFIT_VISION_DEVICE || DEFAULT_VISION_DEVICE);
}

function defaultRembgProvider(options: VisionServiceOptions = {}): string {
  return normalizeRembgProvider(options.rembgProvider || process.env.OUTFIT_REMBG_PROVIDER || DEFAULT_REMBG_PROVIDER);
}

export async function getVisionModelResponse(options: VisionServiceOptions = {}): Promise<VisionModelsResponse> {
  const modelRoot = options.modelRoot || defaultVisionModelRoot();
  const models = await Promise.all(MODEL_DEFINITIONS.map((definition) => visionModelStatus(modelRoot, definition)));
  return {
    modelRoot,
    models: models.map((model) => ({
      ...model,
      job: latestJobForModel(model.id)
    })),
    jobs: Array.from(visionJobs.values()).sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  };
}

export function startVisionModelDownload(modelId: string, options: VisionServiceOptions = {}): VisionModelJob {
  return startVisionModelJob(modelId, "download", options);
}

export function startVisionModelVerification(modelId: string, options: VisionServiceOptions = {}): VisionModelJob {
  return startVisionModelJob(modelId, "verify", options);
}

function startVisionModelJob(modelId: string, action: VisionModelJob["action"], options: VisionServiceOptions = {}): VisionModelJob {
  const definition = getModelDefinition(modelId);
  const running = Array.from(visionJobs.values()).find((job) => job.modelId === definition.id && job.status === "running");
  if (running) return running;

  const modelRoot = options.modelRoot || defaultVisionModelRoot();
  mkdirSync(modelRoot, { recursive: true });
  const now = new Date().toISOString();
  const job: VisionModelJob = {
    id: `vision_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`,
    modelId: definition.id,
    action,
    status: "running",
    message: action === "download" ? `本地模型下载已启动：${definition.label}` : `本地模型验证已启动：${definition.label}`,
    startedAt: now,
    updatedAt: now
  };
  visionJobs.set(job.id, job);

  const child = spawn(process.execPath, ["scripts/models.mjs", action, definition.commandName], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OUTFIT_MODEL_ROOT: modelRoot,
      OUTFIT_VISION_DEVICE: defaultVisionDevice(options),
      OUTFIT_REMBG_PROVIDER: defaultRembgProvider(options)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  visionProcesses.add(child);
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const finish = (status: VisionModelJob["status"], message: string, terminate = false): void => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    visionProcesses.delete(child);
    visionModelJobCancellations.delete(child);
    if (terminate) terminateVisionProcess(child);
    updateJob(job.id, status, message);
  };
  const cancel = (): void => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    visionProcesses.delete(child);
    visionModelJobCancellations.delete(child);
    terminateVisionProcess(child);
  };
  const timeoutMs = positiveInteger(options.visionModelJobTimeoutMs, DEFAULT_VISION_MODEL_JOB_TIMEOUT_MS);
  timeout = setTimeout(() => {
    finish(
      "failed",
      action === "download"
        ? "本地模型下载超时，请检查网络连接后重试。"
        : "本地模型验证超时，请检查模型运行环境后重试。",
      true
    );
  }, timeoutMs);
  timeout.unref?.();
  visionModelJobCancellations.set(child, cancel);
  child.stdout?.on("data", () => {
    // Drain output so long-running downloads cannot block on a full pipe.
  });
  child.stderr?.on("data", () => {
    // Drain output so long-running downloads cannot block on a full pipe.
  });
  job.pid = child.pid || undefined;
  child.on("error", (error) => {
    finish("failed", error.message);
  });
  child.on("close", (code) => {
    if (code === 0) {
      finish("succeeded", action === "download" ? `本地模型已准备好：${definition.label}` : `本地模型验证通过：${definition.label}`);
    } else {
      finish("failed", action === "download" ? `模型下载失败，退出码 ${code ?? "unknown"}` : `模型验证失败，退出码 ${code ?? "unknown"}`);
    }
  });
  return job;
}

export function clearVisionJobs(): void {
  for (const cancel of visionModelJobCancellations.values()) {
    cancel();
  }
  visionModelJobCancellations.clear();
  for (const child of visionProcesses) {
    terminateVisionProcess(child);
  }
  visionProcesses.clear();
  visionJobs.clear();
}

export async function createGarmentCutout(db: AppDatabase, id: number, options: VisionServiceOptions = {}): Promise<Garment> {
  const modelRoot = options.modelRoot || defaultVisionModelRoot();
  const status = await visionModelStatus(modelRoot, getModelDefinition("rembg-isnet"));
  if (!status.installed) {
    throw missingModelError(status);
  }
  const rembgModel = await installedRembgModel(status.path, modelRoot) || "isnet-general-use";
  const garment = getGarmentById(db, id);
  const thumbnailDir = options.thumbnailOutputDir || defaultThumbnailOutputDir();
  const inputPath = await resolveOriginalThumbnailPath(db, garment, thumbnailDir, options);
  if (!inputPath) {
    throw new ApiError("VISION_INPUT_NOT_FOUND", "未能自动生成这件衣物的本地缩略图，无法执行去背景。", 400);
  }
  const outputPath = cutoutPath(inputPath, randomUUID());
  const runner = options.runRembg || ((input: RembgRunInput) => runRembgCli(input, options));
  await runner({
    inputPath,
    outputPath,
    model: rembgModel,
    modelDir: modelPath(modelRoot, getModelDefinition("rembg-isnet")),
    provider: defaultRembgProvider(options)
  });
  if (!existsSync(outputPath)) {
    throw new ApiError("VISION_OUTPUT_MISSING", "去背景输出文件未生成，请检查本地视觉模型运行结果。", 500);
  }
  await validateAndNormalizeCutoutOutput(outputPath);
  return updateGarmentCutoutImage(db, id, `/api/garment-thumbnails/${basename(outputPath)}`);
}

export async function createGarmentVisionTags(db: AppDatabase, id: number, options: VisionServiceOptions = {}): Promise<VisionTagSuggestion> {
  const modelRoot = options.modelRoot || defaultVisionModelRoot();
  const status = await visionModelStatus(modelRoot, getModelDefinition("clip-vit-base-patch32"));
  if (!status.installed) {
    throw missingModelError(status);
  }
  const garment = getGarmentById(db, id);
  const thumbnailDir = options.thumbnailOutputDir || defaultThumbnailOutputDir();
  const imagePath = await resolveVisionImagePath(db, garment, thumbnailDir, options);
  const tagger = options.inferVisionTags || ((input: VisionTagInput) => inferVisionTagsCli(input, options));
  const inference = await tagger({
    garment,
    imagePath: imagePath && existsSync(imagePath) ? imagePath : undefined,
    modelDir: modelPath(modelRoot, getModelDefinition("clip-vit-base-patch32")),
    device: defaultVisionDevice(options)
  });
  const suggestion = normalizeVisionTagSuggestion(inference);
  if (inference.embedding === undefined) {
    return saveGarmentVisionTags(db, id, suggestion);
  }

  const normalizedEmbedding = normalizeGarmentEmbedding(inference.embedding);
  db.exec("BEGIN IMMEDIATE");
  try {
    const saved = saveGarmentVisionTags(db, id, suggestion);
    upsertGarmentEmbedding(db, id, Array.from(normalizedEmbedding));
    db.exec("COMMIT");
    return saved;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function visionModelStatus(modelRoot: string, definition: VisionModelDefinition): Promise<VisionModelStatus> {
  const path = modelPath(modelRoot, definition);
  const rembgModel = definition.id === "rembg-isnet" ? await installedRembgModel(path, modelRoot) : undefined;
  const installed = definition.id === "rembg-isnet"
    ? Boolean(rembgModel)
    : await clipModelReady(path, modelRoot);
  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
    installed,
    path,
    message: installed ? (rembgModel ? `已可用：${rembgModel}` : "已可用") : "未下载"
  };
}

async function hasOnnxFile(root: string, trustedRoot = root): Promise<boolean> {
  try {
    if (!await isSafeModelDirectory(root, trustedRoot)) return false;
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(root, entry.name);
      if (entry.isDirectory() && await hasOnnxFile(fullPath, trustedRoot)) return true;
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".onnx") && await isRegularNonEmptyFile(fullPath, trustedRoot)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function getModelDefinition(modelId: string): VisionModelDefinition {
  const definition = MODEL_DEFINITIONS.find((item) => item.id === modelId);
  if (!definition) {
    throw new ApiError("VISION_MODEL_NOT_FOUND", "未知的本地视觉模型", 404);
  }
  return definition;
}

function modelPath(modelRoot: string, definition: VisionModelDefinition): string {
  return join(modelRoot, ...definition.relativePath);
}

function latestJobForModel(modelId: VisionModelId): VisionModelJob | undefined {
  return Array.from(visionJobs.values())
    .filter((job) => job.modelId === modelId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
}

function updateJob(id: string, status: VisionModelJob["status"], message: string): void {
  const current = visionJobs.get(id);
  if (!current) return;
  visionJobs.set(id, {
    ...current,
    status,
    message,
    error: status === "failed" ? message : current.error,
    updatedAt: new Date().toISOString()
  });
}

function missingModelError(status: VisionModelStatus): ApiError {
  return new ApiError("VISION_MODEL_MISSING", `请先下载本地视觉模型：${status.id}`, 409, { modelId: status.id, path: status.path });
}

async function resolveOriginalThumbnailPath(db: AppDatabase, garment: Garment, thumbnailDir: string, options: VisionServiceOptions): Promise<string | undefined> {
  const currentPath = existingLocalThumbnailPath(garment.imageUrl, thumbnailDir);
  if (currentPath) return currentPath;
  const refreshed = await ensureGarmentLocalThumbnail(db, garment.id, {
    captureRoot: options.thumbnailCaptureRoot,
    outputDir: thumbnailDir,
    maxDownloadsPerGarment: options.thumbnailMaxDownloadsPerGarment,
    delayMs: options.thumbnailDelayMs,
    fetcher: options.thumbnailFetcher,
    force: true
  });
  return existingLocalThumbnailPath(refreshed.imageUrl, thumbnailDir);
}

async function resolveVisionImagePath(db: AppDatabase, garment: Garment, thumbnailDir: string, options: VisionServiceOptions): Promise<string | undefined> {
  const currentPath = existingLocalThumbnailPath(garment.cutoutImageUrl, thumbnailDir) || existingLocalThumbnailPath(garment.imageUrl, thumbnailDir);
  if (currentPath) return currentPath;
  const refreshed = await ensureGarmentLocalThumbnail(db, garment.id, {
    captureRoot: options.thumbnailCaptureRoot,
    outputDir: thumbnailDir,
    maxDownloadsPerGarment: options.thumbnailMaxDownloadsPerGarment,
    delayMs: options.thumbnailDelayMs,
    fetcher: options.thumbnailFetcher,
    force: true
  });
  return existingLocalThumbnailPath(refreshed.cutoutImageUrl, thumbnailDir) || existingLocalThumbnailPath(refreshed.imageUrl, thumbnailDir);
}

function existingLocalThumbnailPath(value: string | undefined, thumbnailDir: string): string | undefined {
  const path = localThumbnailPath(value, thumbnailDir);
  return path && existsSync(path) ? path : undefined;
}

function localThumbnailPath(value: string | undefined, thumbnailDir: string): string | undefined {
  const prefix = "/api/garment-thumbnails/";
  if (!value?.startsWith(prefix)) return undefined;
  const fileName = basename(value.slice(prefix.length));
  const fullPath = normalize(join(thumbnailDir, fileName));
  const normalizedRoot = normalize(thumbnailDir);
  return fullPath.startsWith(normalizedRoot) ? fullPath : undefined;
}

function cutoutPath(inputPath: string, outputId: string): string {
  const extension = extname(inputPath) || ".png";
  return join(dirname(inputPath), `${basename(inputPath, extension)}-cutout-${outputId}.png`);
}

async function validateAndNormalizeCutoutOutput(outputPath: string): Promise<void> {
  try {
    const fileStat = await lstat(outputPath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new Error("cutout output is not a regular file");
    }
    const metadata = await sharp(outputPath, {
      failOn: "error",
      limitInputPixels: MAX_THUMBNAIL_IMAGE_PIXELS,
      sequentialRead: true
    }).metadata();
    if (
      metadata.format !== "png" ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error("cutout output is not a single-page PNG");
    }
    const { data, info } = await sharp(outputPath, {
      failOn: "error",
      limitInputPixels: MAX_THUMBNAIL_IMAGE_PIXELS,
      sequentialRead: true
    })
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    if (info.format !== "png" || info.width <= 0 || info.height <= 0 || data.byteLength <= 0) {
      throw new Error("cutout output could not be normalized");
    }
    await writeFile(outputPath, data);
  } catch {
    throw new ApiError("VISION_OUTPUT_INVALID", "去背景输出文件无效，请检查本地视觉模型运行结果。", 500);
  }
}

async function installedRembgModel(path: string, trustedRoot = path): Promise<string | undefined> {
  for (const model of REMBG_MODEL_FALLBACKS) {
    if (await isRegularNonEmptyFile(join(path, `${model}.onnx`), trustedRoot)) return model;
  }
  return undefined;
}

async function clipModelReady(path: string, trustedRoot = path): Promise<boolean> {
  const requiredFilesReady = await Promise.all(
    CLIP_REQUIRED_FILES.map((file) => isRegularModelFile(join(path, file), file === "merges.txt", trustedRoot))
  );
  return requiredFilesReady.every(Boolean) && await hasOnnxFile(path, trustedRoot);
}

async function isRegularNonEmptyFile(filePath: string, trustedRoot = dirname(filePath)): Promise<boolean> {
  return isRegularModelFile(filePath, false, trustedRoot);
}

async function isRegularModelFile(filePath: string, allowEmpty: boolean, trustedRoot = dirname(filePath)): Promise<boolean> {
  try {
    const trustedRealRoot = await trustedModelRealRoot(trustedRoot);
    if (!trustedRealRoot) return false;
    const file = await lstat(filePath);
    if (!file.isFile() || file.isSymbolicLink() || (!allowEmpty && file.size <= 0)) return false;
    return isInsideRealRoot(trustedRealRoot, await realpath(filePath));
  } catch {
    return false;
  }
}

async function isSafeModelDirectory(directoryPath: string, trustedRoot: string): Promise<boolean> {
  try {
    const trustedRealRoot = await trustedModelRealRoot(trustedRoot);
    if (!trustedRealRoot) return false;
    const directory = await lstat(directoryPath);
    if (!directory.isDirectory() || directory.isSymbolicLink()) return false;
    return isInsideRealRoot(trustedRealRoot, await realpath(directoryPath));
  } catch {
    return false;
  }
}

async function trustedModelRealRoot(root: string): Promise<string | undefined> {
  try {
    const resolvedRoot = resolve(root);
    const rootStat = await lstat(resolvedRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return undefined;
    return realpath(resolvedRoot);
  } catch {
    return undefined;
  }
}

function isInsideRealRoot(realRoot: string, candidate: string): boolean {
  const relativePath = relative(realRoot, candidate);
  return relativePath === "" || (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

async function runRembgCli(input: RembgRunInput, options: VisionServiceOptions): Promise<void> {
  await runProcess(process.env.PYTHON || "python", [
    "scripts/vision_rembg.py",
    "--input",
    input.inputPath,
    "--output",
    input.outputPath,
    "--model",
    input.model,
    "--model-dir",
    input.modelDir,
    "--provider",
    input.provider
  ], options);
}

async function inferVisionTagsCli(input: VisionTagInput, options: VisionServiceOptions): Promise<VisionTagInferenceResult> {
  if (!input.imagePath) {
    throw new ApiError("VISION_INPUT_NOT_FOUND", "请先为这件衣物生成本地缩略图，再执行图片分析。", 400);
  }
  const stdout = await runProcess(process.execPath, [
    "scripts/vision_tags.mjs",
    "--image",
    input.imagePath,
    "--model-dir",
    input.modelDir,
    "--device",
    input.device
  ], options);
  try {
    return JSON.parse(stdout) as VisionTagInferenceResult;
  } catch {
    throw invalidVisionTagOutput("本地视觉模型输出不是有效 JSON");
  }
}

function normalizeVisionDevice(value: string): string {
  const normalized = value.trim().toLowerCase();
  return ["auto", "gpu", "cpu", "wasm", "webgpu", "cuda", "dml"].includes(normalized) ? normalized : "auto";
}

function normalizeRembgProvider(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "gpu" || normalized === "webgpu" || normalized === "wasm") {
    return "auto";
  }
  return ["auto", "cpu", "cuda", "dml"].includes(normalized) ? normalized : "auto";
}

async function runProcess(command: string, args: string[], options: VisionServiceOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    visionProcesses.add(child);
    const timeoutMs = positiveInteger(options.visionProcessTimeoutMs, DEFAULT_VISION_PROCESS_TIMEOUT_MS);
    const maxOutputBytes = positiveInteger(
      options.visionProcessMaxOutputBytes,
      DEFAULT_VISION_PROCESS_MAX_OUTPUT_BYTES
    );
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new ApiError(
        "VISION_PROCESS_TIMEOUT",
        "本地视觉模型处理超时，请稍后重试或检查模型运行环境。",
        504
      ), true);
    }, timeoutMs);
    timeout.unref?.();

    const finish = (error?: Error, value?: string, terminate = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      visionProcesses.delete(child);
      if (terminate) {
        terminateVisionProcess(child);
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(value ?? "");
    };
    const fail = (error: Error, terminate = false) => finish(error, undefined, terminate);
    const appendOutput = (target: "stdout" | "stderr", chunk: unknown) => {
      if (settled) return;
      const text = String(chunk);
      const byteLength = Buffer.isBuffer(chunk)
        ? chunk.byteLength
        : Buffer.byteLength(text);
      if (outputBytes + byteLength > maxOutputBytes) {
        fail(new ApiError(
          "VISION_PROCESS_OUTPUT_LIMIT",
          "本地视觉模型输出过多，处理已终止。",
          500
        ), true);
        return;
      }
      outputBytes += byteLength;
      if (target === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }
    };

    child.stdout?.on("data", (chunk) => appendOutput("stdout", chunk));
    child.stderr?.on("data", (chunk) => appendOutput("stderr", chunk));
    child.on("error", (error) => {
      fail(new ApiError(
        "VISION_PROCESS_FAILED",
        "无法启动本地视觉模型进程，请检查运行环境。",
        500
      ));
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish(undefined, stdout.trim());
        return;
      }
      fail(new ApiError(
        "VISION_PROCESS_FAILED",
        `本地视觉模型处理失败（退出码 ${code ?? "unknown"}）。`,
        500
      ));
    });
  });
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.floor(Number(value))
    : fallback;
}

function terminateVisionProcess(child: ChildProcess): void {
  const pid = child.pid;
  try {
    child.kill();
  } catch {
    // Best-effort cancellation continues with platform process-tree cleanup.
  }
  if (process.platform === "win32" && pid && !isTestRuntime()) {
    try {
      execFileSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
    } catch {
      // The child may already be gone.
    }
  }
}

function isTestRuntime(): boolean {
  return Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID || process.env.NODE_ENV === "test");
}

function normalizeVisionTagSuggestion(value: unknown): VisionTagSuggestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidVisionTagOutput("标签结果必须是对象");
  }
  const record = value as Record<string, unknown>;
  if (
    record.category !== undefined &&
    (typeof record.category !== "string" || !GARMENT_CATEGORIES.includes(
      record.category as (typeof GARMENT_CATEGORIES)[number]
    ))
  ) {
    throw invalidVisionTagOutput("category 不在允许范围内");
  }
  return {
    ...(record.category === undefined
      ? {}
      : { category: record.category as VisionTagSuggestion["category"] }),
    styles: normalizeVisionStringArray(record.styles, "styles"),
    patterns: normalizeVisionStringArray(record.patterns, "patterns"),
    tags: normalizeVisionStringArray(record.tags, "tags"),
    scores: normalizeVisionScores(record.scores)
  };
}

function normalizeVisionStringArray(values: unknown, field: string): string[] {
  if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) {
    throw invalidVisionTagOutput(`${field} 必须是字符串数组`);
  }
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).slice(0, 16);
}

function normalizeVisionScores(values: unknown): VisionTagSuggestion["scores"] {
  if (!Array.isArray(values)) {
    throw invalidVisionTagOutput("scores 必须是数组");
  }
  const normalized = values.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw invalidVisionTagOutput("score 必须是对象");
    }
    const score = value as Record<string, unknown>;
    if (typeof score.label !== "string" || !score.label.trim() ||
      typeof score.score !== "number" || !Number.isFinite(score.score)) {
      throw invalidVisionTagOutput("score 必须包含非空 label 和有限数值");
    }
    return {
      label: score.label.trim(),
      score: Number(score.score.toFixed(4))
    };
  });
  return normalized.slice(0, 12);
}

function invalidVisionTagOutput(detail: string): ApiError {
  return new ApiError(
    "VISION_TAG_OUTPUT_INVALID",
    `本地视觉模型返回的标签结果无效：${detail}`,
    500
  );
}
