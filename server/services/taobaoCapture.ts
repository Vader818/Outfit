import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
}

export interface CaptureFileSystem {
  readdirSync(path: string): string[];
  statSync(path: string): { mtimeMs: number; isFile: () => boolean };
  readFileSync(path: string, encoding: BufferEncoding): string;
}

const OUTPUT_DIR = "output/taobao-captures";
const DEFAULT_ORDER_MAX_PAGES = 3;
const DEFAULT_LOGIN_WAIT_SECONDS = 60;

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

export function readLatestTaobaoCapture(outputDir = OUTPUT_DIR, fileSystem: CaptureFileSystem = fs): TaobaoLatestCaptureResult {
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
