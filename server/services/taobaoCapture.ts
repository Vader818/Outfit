import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CaptureArtifact, CaptureJob, CaptureJobMode, TaobaoWardrobeFilterSummary } from "../../src/shared/types";
import { filterTaobaoBatchForWardrobe } from "./importTaobao";
import { ApiError, ValidationError } from "../validation";

export type TaobaoCaptureMode = "orders" | "item-detail";

export interface TaobaoCaptureStartResult {
  started: true;
  mode: TaobaoCaptureMode;
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
  statSync(path: string): { mtimeMs: number; isFile: () => boolean };
  readFileSync(path: string, encoding: BufferEncoding): string;
}

export interface ReadLatestTaobaoCaptureOptions {
  wardrobeOnly?: boolean;
}

const OUTPUT_DIR = "output/taobao-captures";
const DEFAULT_ORDER_MAX_PAGES = 3;
const DEFAULT_LOGIN_WAIT_SECONDS = 60;

interface InternalCaptureJob extends CaptureJob {
  child?: {
    kill?: () => unknown;
    on?: (event: string, callback: (code: number | null, signal: NodeJS.Signals | null) => void) => unknown;
  };
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
  ]);
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
  ]);
}

export function startTaobaoCaptureJob(input: {
  mode: CaptureJobMode;
  maxPages?: number;
  loginWait?: number;
  url?: string;
}): CaptureJob {
  const id = createCaptureJobId();
  const outputDir = `${OUTPUT_DIR}/${id}`;
  const logPath = `${outputDir}/capture.log`;
  fs.mkdirSync(outputDir, { recursive: true });

  const args = buildCaptureArgs(input, outputDir);
  const now = new Date().toISOString();
  const command = process.env.PYTHON || "python";
  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: false,
    stdio: ["ignore", "ignore", "ignore"],
    shell: false
  });
  const job: InternalCaptureJob = {
    id,
    mode: input.mode,
    status: "running",
    pid: child.pid ?? 0,
    outputDir,
    logPath,
    message: "Selenium 采集任务已启动。请在打开的 Chrome 中登录或处理验证。",
    createdAt: now,
    updatedAt: now,
    child
  };

  captureJobs.set(id, job);
  child.on?.("exit", (code, signal) => {
    if (job.status === "cancelled") return;
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
    job.child?.kill?.();
    job.status = "cancelled";
    job.message = "采集任务已取消。";
    job.updatedAt = new Date().toISOString();
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
  const fileNames = readCaptureDirectory(outputDir, fileSystem);
  const candidates = fileNames
    .filter((fileName) => fileName.toLowerCase().endsWith(".json"))
    .map((fileName) => {
      const filePath = path.join(outputDir, fileName);
      const stat = fileSystem.statSync(filePath);
      return stat.isFile() ? { fileName, filePath, mtimeMs: stat.mtimeMs } : null;
    })
    .filter((candidate): candidate is { fileName: string; filePath: string; mtimeMs: number } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.fileName.localeCompare(left.fileName));

  const latest = candidates[0];
  if (!latest) {
    throw new Error(`没有找到 Selenium 采集产物：${outputDir}`);
  }

  const jsonText = fileSystem.readFileSync(latest.filePath, "utf8");
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

function spawnCapture(mode: TaobaoCaptureMode, args: string[]): TaobaoCaptureStartResult {
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
    pid: child.pid ?? 0,
    outputDir: OUTPUT_DIR,
    message: "Selenium 采集已启动。请在打开的 Chrome 中登录或处理验证，采集 JSON 会保存到 output/taobao-captures。"
  };
}

function buildCaptureArgs(input: {
  mode: CaptureJobMode;
  maxPages?: number;
  loginWait?: number;
  url?: string;
}, outputDir: string): string[] {
  const loginWait = String(input.loginWait ?? DEFAULT_LOGIN_WAIT_SECONDS);
  if (input.mode === "orders") {
    return [
      "scripts/taobao_order_selenium_capture.py",
      "--max-pages",
      String(input.maxPages ?? DEFAULT_ORDER_MAX_PAGES),
      "--login-wait",
      loginWait,
      "--output-dir",
      outputDir
    ];
  }

  if (!input.url) {
    throw new ValidationError("请输入有效的淘宝或天猫商品链接");
  }
  return [
    "scripts/taobao_selenium_capture.py",
    "--url",
    input.url,
    "--login-wait",
    loginWait,
    "--output-dir",
    outputDir
  ];
}

function createCaptureJobId(): string {
  return `cap_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function publicJob(job: InternalCaptureJob): CaptureJob {
  const { child: _child, ...rest } = job;
  return { ...rest };
}

function refreshJobFromArtifact(job: InternalCaptureJob): void {
  if (job.status !== "running" && job.status !== "pending") return;
  const artifact = findLatestJsonArtifact(job.outputDir);
  if (!artifact) return;
  job.status = "succeeded";
  job.artifactPath = artifact.filePath;
  job.message = "采集完成，产物已生成。";
  job.updatedAt = new Date().toISOString();
}

function findLatestJsonArtifact(outputDir: string): { fileName: string; filePath: string; mtimeMs: number } | null {
  try {
    return fs.readdirSync(outputDir)
      .filter((fileName) => fileName.toLowerCase().endsWith(".json"))
      .map((fileName) => {
        const filePath = path.join(outputDir, fileName);
        const stat = fs.statSync(filePath);
        return stat.isFile() ? { fileName, filePath, mtimeMs: stat.mtimeMs } : null;
      })
      .filter((candidate): candidate is { fileName: string; filePath: string; mtimeMs: number } => Boolean(candidate))
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
