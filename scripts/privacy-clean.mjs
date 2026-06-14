import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_TARGETS = [
  {
    relativePath: "output/chrome-taobao-profile",
    description: "Selenium Chrome 淘宝登录态",
    sensitive: true,
    requiresExtraConfirmation: true,
    kind: "directory"
  },
  {
    relativePath: "output/taobao-captures",
    description: "淘宝采集 JSON 产物",
    sensitive: true,
    requiresExtraConfirmation: false,
    kind: "directory"
  },
  {
    relativePath: "output/garment-thumbnails",
    description: "本地衣物缩略图缓存",
    sensitive: false,
    requiresExtraConfirmation: false,
    kind: "directory"
  },
  {
    relativePath: "logs",
    description: "本地运行日志",
    sensitive: true,
    requiresExtraConfirmation: false,
    kind: "directory"
  },
  {
    relativePath: "data/outfit.sqlite*",
    description: "SQLite 本地衣橱、订单、推荐和穿着数据",
    sensitive: true,
    requiresExtraConfirmation: false,
    kind: "glob"
  }
];

export function parsePrivacyCleanArgs(args) {
  return {
    confirm: args.includes("--confirm"),
    includeLoginState: args.includes("--include-login-state")
  };
}

export function buildPrivacyCleanPlan(root = process.cwd()) {
  return DEFAULT_TARGETS.map((target) => ({
    ...target,
    absolutePath: path.resolve(root, target.relativePath)
  }));
}

export function shouldCleanTarget(target, args) {
  if (!args.confirm) return false;
  if (target.requiresExtraConfirmation && !args.includeLoginState) return false;
  return true;
}

export function formatPrivacyCleanPlan(plan, args) {
  const lines = [
    "Outfit 隐私清理计划：",
    ""
  ];
  for (const target of plan) {
    const action = shouldCleanTarget(target, args) ? "将删除" : "仅提示";
    const extra = target.requiresExtraConfirmation ? "；需要 --include-login-state" : "";
    lines.push(`- ${action}: ${target.absolutePath} (${target.description}${extra})`);
  }
  lines.push("");
  if (!args.confirm) {
    lines.push("未提供 --confirm，不会删除任何文件。");
    lines.push("如需清理采集产物、缩略图、日志和数据库，运行：npm run privacy:clean -- --confirm");
    lines.push("如需同时清除淘宝登录态，再额外加：--include-login-state");
  } else if (!args.includeLoginState) {
    lines.push("已提供 --confirm，但未提供 --include-login-state；将保留 Selenium 淘宝登录态。");
  }
  return `${lines.join("\n")}\n`;
}

export function runPrivacyClean(root = process.cwd(), rawArgs = process.argv.slice(2)) {
  const args = parsePrivacyCleanArgs(rawArgs);
  const plan = buildPrivacyCleanPlan(root);
  process.stdout.write(formatPrivacyCleanPlan(plan, args));
  if (!args.confirm) return { deleted: [] };

  const deleted = [];
  for (const target of plan) {
    if (!shouldCleanTarget(target, args)) continue;
    for (const resolvedPath of expandTarget(target)) {
      if (!isInsideRoot(root, resolvedPath)) {
        throw new Error(`拒绝清理项目目录外路径：${resolvedPath}`);
      }
      if (!fs.existsSync(resolvedPath)) continue;
      fs.rmSync(resolvedPath, { recursive: true, force: true });
      deleted.push(resolvedPath);
    }
  }
  return { deleted };
}

function expandTarget(target) {
  if (target.kind !== "glob") return [target.absolutePath];
  const directory = path.dirname(target.absolutePath);
  const prefix = path.basename(target.absolutePath).replace(/\*.*$/, "");
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => path.join(directory, entry));
}

function isInsideRoot(root, targetPath) {
  const relative = path.relative(path.resolve(root), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runPrivacyClean(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
}
