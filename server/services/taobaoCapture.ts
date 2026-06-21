import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CaptureArtifact, CaptureEngine, CaptureJob, CaptureJobMode, TaobaoWardrobeFilterSummary } from "../../src/shared/types";
import { filterTaobaoBatchForWardrobe } from "./importTaobao";
import { ApiError, ValidationError } from "../validation";

export type TaobaoCaptureMode = "orders" | "item-detail";

export interface TaobaoCaptureStartResult {
  started: true;
  mode: TaobaoCaptureMode;
  engine: CaptureEngine;
  pid: number;
  outputDir: string;
  message: string;
}

export interface TaobaoLatestCaptureResult {
  outputDir: string;
  fileName: string;
  path: string;
  jsonText: string;
  payload: unknown;
  filterSummary?: TaobaoWardrobeFilterSummary;
}

export interface CaptureFileSystem {
  readdirSync(path: string): string[];
  statSync(path: string): { mtimeMs: number; size?: number; isFile: () => boolean; isDirectory?: () => boolean };
  readFileSync(path: string, encoding: BufferEncoding): string;
}

export interface ReadLatestTaobaoCaptureOptions {
  wardrobeOnly?: boolean;
}

const OUTPUT_DIR = "output/taobao-captures";
const DEFAULT_ORDER_MAX_PAGES = 3;
const DEFAULT_LOGIN_WAIT_SECONDS = 60;
const MAX_CAPTURE_SCAN_DEPTH = 2;
const MAX_CAPTURE_ARTIFACT_BYTES = 20 * 1024 * 1024;

interface InternalCaptureJob extends CaptureJob {
  child?: {
    pid?: number;
    kill?: () => unknown;
    on?: (event: string, callback: (...args: unknown[]) => void) => unknown;
  };
  logFd?: number;
}

const captureJobs = new Map<string, InternalCaptureJob>();

export function startTaobaoOrderCapture(input: unknown): TaobaoCaptureStartResult {
  const record = asRecord(input);
  const maxPages = positiveInteger(record.maxPages, DEFAULT_ORDER_MAX_PAGES, 1, 20);
  const loginWait = positiveInteger(record.loginWait, DEFAULT_LOGIN_WAIT_SECONDS, 1, 600);
  return spawnCapture("orders", [
    "scripts/taobao_order_selenium_capture.py",
    "--max-pages",
    String(maxPages),
    "--login-wait",
    String(loginWait)
  ], "selenium");
}

export function startTaobaoItemCapture(input: unknown): TaobaoCaptureStartResult {
  const record = asRecord(input);
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!isTaobaoItemUrl(url)) {
    throw new Error("请输入有效的淘宝或天猫商品链接");
  }
  const loginWait = positiveInteger(record.loginWait, DEFAULT_LOGIN_WAIT_SECONDS, 1, 600);
  return spawnCapture("item-detail", [
    "scripts/taobao_selenium_capture.py",
    "--url",
    url,
    "--login-wait",
    String(loginWait)
  ], "selenium");
}

export function startTaobaoCaptureJob(input: {
  mode: CaptureJobMode;
  maxPages?: number;
  loginWait?: number;
  url?: string;
}): CaptureJob {
  const activeJob = findActiveCaptureJob();
  if (activeJob) {
    throw new ApiError("CAPTURE_JOB_RUNNING", "已有采集任务正在运行，请等待完成或取消后再启动。", 409);
  }

  const id = createCaptureJobId();
  const outputDir = `${OUTPUT_DIR}/${id}`;
  const logPath = `${outputDir}/capture.log`;
  const runner = buildCaptureRunner(input, outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const now = new Date().toISOString();
  const logFd = fs.openSync(logPath, "a");
  fs.writeSync(logFd, `[${now}] Starting ${input.mode} capture: engine=${runner.engine} command=${runner.command} args=${JSON.stringify(runner.args)}\n`);
  const child = spawn(runner.command, runner.args, {
    cwd: process.cwd(),
    detached: false,
    stdio: ["ignore", logFd, logFd],
    shell: false
  });
  const job: InternalCaptureJob = {
    id,
    mode: input.mode,
    engine: runner.engine,
    status: "running",
    pid: child.pid ?? 0,
    outputDir,
    logPath,
    message: captureStartMessage(runner.engine),
    createdAt: now,
    updatedAt: now,
    child,
    logFd
  };
  let completed = false;

  captureJobs.set(id, job);
  child.on?.("exit", (code, signal) => {
    if (completed || job.status === "cancelled") return;
    completed = true;
    const artifact = findLatestJsonArtifact(job.outputDir);
    if (artifact) {
      job.status = "succeeded";
      job.artifactPath = artifact.filePath;
      job.message = "采集完成，产物已生成。";
    } else {
      job.status = "failed";
      job.error = code === 0 ? "采集进程结束，但没有生成 JSON 产物。" : `采集进程退出：code=${code ?? "null"} signal=${signal ?? "null"}`;
      job.message = job.error;
    }
    job.updatedAt = new Date().toISOString();
    closeJobLog(job);
    delete job.child;
  });
  child.on?.("error", (error) => {
    if (completed || job.status === "cancelled") return;
    completed = true;
    const message = error instanceof Error ? error.message : String(error);
    job.status = "failed";
    job.error = message;
    job.message = message;
    job.updatedAt = new Date().toISOString();
    closeJobLog(job);
    delete job.child;
  });

  return publicJob(job);
}

export function getTaobaoCaptureJob(id: string): CaptureJob {
  const job = captureJobs.get(id);
  if (!job) {
    throw new ApiError("NOT_FOUND", "采集任务不存在", 404);
  }
  refreshJobFromArtifact(job);
  return publicJob(job);
}

export function cancelTaobaoCaptureJob(id: string): CaptureJob {
  const job = captureJobs.get(id);
  if (!job) {
    throw new ApiError("NOT_FOUND", "采集任务不存在", 404);
  }
  if (job.status === "running" || job.status === "pending") {
    terminateCaptureProcess(job);
    job.status = "cancelled";
    job.message = "采集任务已取消。";
    job.updatedAt = new Date().toISOString();
    closeJobLog(job);
    delete job.child;
  }
  return publicJob(job);
}

export function readTaobaoCaptureJobArtifact(id: string, options: ReadLatestTaobaoCaptureOptions = {}): CaptureArtifact {
  const job = captureJobs.get(id);
  if (!job) {
    throw new ApiError("NOT_FOUND", "采集任务不存在", 404);
  }
  const latest = readLatestTaobaoCapture(job.outputDir, fs, options);
  job.status = "succeeded";
  job.artifactPath = latest.path;
  job.message = "采集产物已读取。";
  job.updatedAt = new Date().toISOString();
  closeJobLog(job);
  return {
    jobId: id,
    outputDir: latest.outputDir,
    fileName: latest.fileName,
    path: latest.path,
    jsonText: latest.jsonText,
    payload: latest.payload,
    filterSummary: latest.filterSummary
  };
}

export function readLatestTaobaoCapture(outputDir = OUTPUT_DIR, fileSystem: CaptureFileSystem = fs, options: ReadLatestTaobaoCaptureOptions = {}): TaobaoLatestCaptureResult {
  const candidates = collectJsonArtifacts(outputDir, fileSystem)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.fileName.localeCompare(left.fileName));

  const latest = candidates[0];
  if (!latest) {
    throw new Error(`没有找到 Selenium 采集产物：${outputDir}`);
  }
  if (latest.size !== undefined && latest.size > MAX_CAPTURE_ARTIFACT_BYTES) {
    throw new ApiError("CAPTURE_ARTIFACT_TOO_LARGE", `Selenium 采集产物超过 ${MAX_CAPTURE_ARTIFACT_BYTES} 字节上限：${latest.fileName}`, 413);
  }

  const jsonText = fileSystem.readFileSync(latest.filePath, "utf8");
  if (Buffer.byteLength(jsonText, "utf8") > MAX_CAPTURE_ARTIFACT_BYTES) {
    throw new ApiError("CAPTURE_ARTIFACT_TOO_LARGE", `Selenium 采集产物超过 ${MAX_CAPTURE_ARTIFACT_BYTES} 字节上限：${latest.fileName}`, 413);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    throw new Error(`最新 Selenium 采集产物不是有效 JSON：${latest.fileName}`);
  }

  if (options.wardrobeOnly) {
    const filtered = filterTaobaoBatchForWardrobe(payload);
    return {
      outputDir,
      fileName: latest.fileName,
      path: latest.filePath,
      jsonText: JSON.stringify(filtered.payload, null, 2),
      payload: filtered.payload,
      filterSummary: filtered.filterSummary
    };
  }

  return {
    outputDir,
    fileName: latest.fileName,
    path: latest.filePath,
    jsonText,
    payload
  };
}

function spawnCapture(mode: TaobaoCaptureMode, args: string[], engine: CaptureEngine): TaobaoCaptureStartResult {
  const command = process.env.PYTHON || "python";
  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    shell: false
  });
  child.unref();

  return {
    started: true,
    mode,
    engine,
    pid: child.pid ?? 0,
    outputDir: OUTPUT_DIR,
    message: "Selenium 采集已启动。请在打开的 Chrome 中登录或处理验证，采集 JSON 会保存到 output/taobao-captures。"
  };
}

export function buildCaptureRunner(input: {
  mode: CaptureJobMode;
  maxPages?: number;
  loginWait?: number;
  url?: string;
}, outputDir: string): { engine: CaptureEngine; command: string; args: string[] } {
  const loginWait = String(input.loginWait ?? DEFAULT_LOGIN_WAIT_SECONDS);
  if (input.mode === "orders") {
    return {
      engine: "selenium",
      command: process.env.PYTHON || "python",
      args: [
        "scripts/taobao_order_selenium_capture.py",
        "--max-pages",
        String(input.maxPages ?? DEFAULT_ORDER_MAX_PAGES),
        "--login-wait",
        loginWait,
        "--output-dir",
        outputDir
      ]
    };
  }

  if (!input.url) {
    throw new ValidationError("请输入有效的淘宝或天猫商品链接");
  }
  const engine = resolveItemDetailEngine();
  if (engine === "playwright") {
    return {
      engine,
      command: process.execPath,
      args: [
        "scripts/taobao_playwright_capture.mjs",
        "--url",
        input.url,
        "--login-wait",
        loginWait,
        "--output-dir",
        outputDir
      ]
    };
  }

  return {
    engine,
    command: process.env.PYTHON || "python",
    args: [
      "scripts/taobao_selenium_capture.py",
      "--url",
      input.url,
      "--login-wait",
      loginWait,
      "--output-dir",
      outputDir
    ]
  };
}

function resolveItemDetailEngine(): CaptureEngine {
  const rawValue = process.env.OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE;
  const normalized = String(rawValue || "selenium").trim().toLowerCase();
  if (normalized === "selenium" || normalized === "playwright") {
    return normalized;
  }
  throw new ApiError(
    "CAPTURE_ENGINE_INVALID",
    "OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE 必须是 selenium 或 playwright",
    400,
    { value: rawValue }
  );
}

function captureStartMessage(engine: CaptureEngine): string {
  if (engine === "playwright") {
    return "Playwright 采集任务已启动。请在打开的 Chrome 中登录或处理验证。";
  }
  return "Selenium 采集任务已启动。请在打开的 Chrome 中登录或处理验证。";
}

function createCaptureJobId(): string {
  return `cap_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function publicJob(job: InternalCaptureJob): CaptureJob {
  const { child: _child, logFd: _logFd, ...rest } = job;
  return { ...rest };
}

function findActiveCaptureJob(): InternalCaptureJob | null {
  for (const job of captureJobs.values()) {
    refreshJobFromArtifact(job);
    if (job.status === "running" || job.status === "pending") {
      return job;
    }
  }
  return null;
}

function refreshJobFromArtifact(job: InternalCaptureJob): void {
  if (job.status !== "running" && job.status !== "pending") return;
  const artifact = findLatestJsonArtifact(job.outputDir);
  if (!artifact) return;
  job.status = "succeeded";
  job.artifactPath = artifact.filePath;
  job.message = "采集完成，产物已生成。";
  job.updatedAt = new Date().toISOString();
  closeJobLog(job);
}

function findLatestJsonArtifact(outputDir: string): { fileName: string; filePath: string; mtimeMs: number; size?: number } | null {
  try {
    return collectJsonArtifacts(outputDir, fs)
      .sort((left, right) => right.mtimeMs - left.mtimeMs || right.fileName.localeCompare(left.fileName))[0] ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function positiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isTaobaoItemUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      /(^|\.)((item\.taobao\.com)|(detail\.tmall\.com)|(item\.tmall\.com))$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function readCaptureDirectory(outputDir: string, fileSystem: CaptureFileSystem): string[] {
  try {
    return fileSystem.readdirSync(outputDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function collectJsonArtifacts(outputDir: string, fileSystem: CaptureFileSystem, depth = 0): Array<{ fileName: string; filePath: string; mtimeMs: number; size?: number }> {
  const candidates: Array<{ fileName: string; filePath: string; mtimeMs: number; size?: number }> = [];
  for (const fileName of readCaptureDirectory(outputDir, fileSystem)) {
    const filePath = path.join(outputDir, fileName);
    const stat = fileSystem.statSync(filePath);
    if (stat.isFile() && fileName.toLowerCase().endsWith(".json")) {
      candidates.push({ fileName, filePath, mtimeMs: stat.mtimeMs, size: stat.size });
      continue;
    }
    if (depth < MAX_CAPTURE_SCAN_DEPTH && stat.isDirectory?.()) {
      candidates.push(...collectJsonArtifacts(filePath, fileSystem, depth + 1));
    }
  }
  return candidates;
}

function terminateCaptureProcess(job: InternalCaptureJob): void {
  const pid = job.pid || job.child?.pid;
  try {
    job.child?.kill?.();
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

function closeJobLog(job: InternalCaptureJob): void {
  if (job.logFd === undefined) return;
  try {
    fs.closeSync(job.logFd);
  } catch {
    // Closing a process-owned fd is best effort.
  }
  delete job.logFd;
}

function isTestRuntime(): boolean {
  return Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID || process.env.NODE_ENV === "test");
}
