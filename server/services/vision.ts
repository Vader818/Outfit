import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, extname, join, normalize } from "node:path";
import type { Garment, VisionModelId, VisionModelJob, VisionModelStatus, VisionModelsResponse, VisionTagSuggestion } from "../../src/shared/types";
import type { AppDatabase } from "../db";
import { getGarmentById, saveGarmentVisionTags, updateGarmentCutoutImage } from "../db";
import { ApiError } from "../validation";
import { defaultThumbnailOutputDir } from "./thumbnails";

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

export interface VisionServiceOptions {
  modelRoot?: string;
  thumbnailOutputDir?: string;
  visionDevice?: string;
  rembgProvider?: string;
  runRembg?: (input: RembgRunInput) => Promise<void>;
  inferVisionTags?: (input: VisionTagInput) => Promise<VisionTagSuggestion>;
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
  child.stdout?.on("data", () => {
    // Drain output so long-running downloads cannot block on a full pipe.
  });
  child.stderr?.on("data", () => {
    // Drain output so long-running downloads cannot block on a full pipe.
  });
  job.pid = child.pid || undefined;
  child.on("error", (error) => {
    updateJob(job.id, "failed", error.message);
  });
  child.on("close", (code) => {
    if (code === 0) {
      updateJob(job.id, "succeeded", action === "download" ? `本地模型已准备好：${definition.label}` : `本地模型验证通过：${definition.label}`);
    } else {
      updateJob(job.id, "failed", action === "download" ? `模型下载失败，退出码 ${code ?? "unknown"}` : `模型验证失败，退出码 ${code ?? "unknown"}`);
    }
  });
  return job;
}

export async function createGarmentCutout(db: AppDatabase, id: number, options: VisionServiceOptions = {}): Promise<Garment> {
  const modelRoot = options.modelRoot || defaultVisionModelRoot();
  const status = await visionModelStatus(modelRoot, getModelDefinition("rembg-isnet"));
  if (!status.installed) {
    throw missingModelError(status);
  }
  const rembgModel = installedRembgModel(status.path) || "isnet-general-use";
  const garment = getGarmentById(db, id);
  const thumbnailDir = options.thumbnailOutputDir || defaultThumbnailOutputDir();
  const inputPath = localThumbnailPath(garment.imageUrl, thumbnailDir);
  if (!inputPath || !existsSync(inputPath)) {
    throw new ApiError("VISION_INPUT_NOT_FOUND", "请先为这件衣物生成本地缩略图，再执行去背景。", 400);
  }
  const outputPath = cutoutPath(inputPath);
  const runner = options.runRembg || runRembgCli;
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
  const imagePath = localThumbnailPath(garment.cutoutImageUrl || garment.imageUrl, thumbnailDir);
  const tagger = options.inferVisionTags || inferVisionTagsCli;
  const suggestion = normalizeVisionTagSuggestion(await tagger({
    garment,
    imagePath: imagePath && existsSync(imagePath) ? imagePath : undefined,
    modelDir: modelPath(modelRoot, getModelDefinition("clip-vit-base-patch32")),
    device: defaultVisionDevice(options)
  }));
  return saveGarmentVisionTags(db, id, suggestion);
}

async function visionModelStatus(modelRoot: string, definition: VisionModelDefinition): Promise<VisionModelStatus> {
  const path = modelPath(modelRoot, definition);
  const rembgModel = definition.id === "rembg-isnet" ? installedRembgModel(path) : undefined;
  const installed = definition.id === "rembg-isnet"
    ? Boolean(rembgModel)
    : await clipModelReady(path);
  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
    installed,
    path,
    message: installed ? (rembgModel ? `已可用：${rembgModel}` : "已可用") : "未下载"
  };
}

async function hasOnnxFile(root: string): Promise<boolean> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(root, entry.name);
      if (entry.isDirectory() && await hasOnnxFile(fullPath)) return true;
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".onnx")) return true;
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

function localThumbnailPath(value: string | undefined, thumbnailDir: string): string | undefined {
  const prefix = "/api/garment-thumbnails/";
  if (!value?.startsWith(prefix)) return undefined;
  const fileName = basename(value.slice(prefix.length));
  const fullPath = normalize(join(thumbnailDir, fileName));
  const normalizedRoot = normalize(thumbnailDir);
  return fullPath.startsWith(normalizedRoot) ? fullPath : undefined;
}

function cutoutPath(inputPath: string): string {
  const extension = extname(inputPath) || ".png";
  return join(dirname(inputPath), `${basename(inputPath, extension)}-cutout.png`);
}

function installedRembgModel(path: string): string | undefined {
  return REMBG_MODEL_FALLBACKS.find((model) => existsSync(join(path, `${model}.onnx`)));
}

async function clipModelReady(path: string): Promise<boolean> {
  return CLIP_REQUIRED_FILES.every((file) => existsSync(join(path, file))) && await hasOnnxFile(path);
}

async function runRembgCli(input: RembgRunInput): Promise<void> {
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
  ]);
}

async function inferVisionTagsCli(input: VisionTagInput): Promise<VisionTagSuggestion> {
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
  ]);
  return JSON.parse(stdout) as VisionTagSuggestion;
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

async function runProcess(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new ApiError("VISION_PROCESS_FAILED", stderr.trim() || `视觉模型进程退出码 ${code ?? "unknown"}`, 500));
    });
  });
}

function normalizeVisionTagSuggestion(value: VisionTagSuggestion): VisionTagSuggestion {
  return {
    category: value.category,
    styles: uniqueStrings(value.styles),
    patterns: uniqueStrings(value.patterns),
    tags: uniqueStrings(value.tags),
    scores: Array.isArray(value.scores)
      ? value.scores
          .filter((score) => typeof score.label === "string" && Number.isFinite(score.score))
          .slice(0, 12)
          .map((score) => ({ label: score.label, score: Number(score.score.toFixed(4)) }))
      : []
  };
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).slice(0, 16);
}
