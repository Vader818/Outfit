import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isClipRuntimeFile, safeModelOutputPath } from "./model-files.mjs";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==",
  "base64"
);
export const REMBG_MODEL_FALLBACKS = ["isnet-general-use", "u2netp", "silueta"];
const CLIP_REQUIRED_FILES = [
  "config.json",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "vocab.json",
  "merges.txt"
];
const REMBG_MODEL_URLS = {
  "isnet-general-use": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
  u2netp: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx",
  silueta: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx"
};
const MODEL_TARGETS = new Set(["all", "rembg", "clip"]);
const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 30 * 60_000;

export function defaultModelRoot() {
  return process.env.OUTFIT_MODEL_ROOT || path.join(process.cwd(), "output", "models");
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  const command = parsed.positionals[0] || "status";
  const target = parsed.positionals[1] || "all";
  const commandOptions = {
    ...options,
    rembgModel: parsed.flags.model || options.rembgModel,
    rembgProvider: parsed.flags.provider || process.env.OUTFIT_REMBG_PROVIDER || options.rembgProvider || "auto",
    visionDevice: parsed.flags.device || process.env.OUTFIT_VISION_DEVICE || options.visionDevice || "auto"
  };

  if (command === "status") {
    const result = await status(commandOptions);
    (options.logger || console).log(JSON.stringify(result, null, 2));
    return result;
  }
  if (command === "download") {
    await download(target, commandOptions);
    return undefined;
  }
  if (command === "verify") {
    return verify(target, commandOptions);
  }
  throw new Error(`Unknown command: ${command}`);
}

export async function status(options = {}) {
  const modelRoot = resolveModelRoot(options);
  const models = modelDefinitions(modelRoot);
  const installedModel = await installedRembgModel(models.rembg.path, modelRoot);
  return {
    modelRoot,
    models: [
      {
        id: models.rembg.id,
        installed: Boolean(installedModel),
        installedModel,
        path: models.rembg.path
      },
      {
        id: models.clip.id,
        installed: await models.clip.installed(),
        path: models.clip.path
      }
    ]
  };
}

export async function download(name = "all", options = {}) {
  assertModelTarget(name);
  const modelRoot = resolveModelRoot(options);
  const models = modelDefinitions(modelRoot);
  const runCommand = options.runCommand || run;
  mkdirSync(modelRoot, { recursive: true });
  await assertSafeModelDirectory(modelRoot, modelRoot);

  if (name === "rembg" || name === "all") {
    const rembgModel = normalizeRembgModel(options.rembgModel || "isnet-general-use");
    await ensureSafeModelDirectory(models.rembg.path, modelRoot);
    const outputPath = path.join(models.rembg.path, `${rembgModel}.onnx`);
    if (!await isRegularNonEmptyFile(outputPath, modelRoot)) {
      await downloadFile(REMBG_MODEL_URLS[rembgModel], outputPath, options, modelRoot);
    }
    await runCommand(process.env.PYTHON || "python", [
      "scripts/vision_rembg.py",
      "--warmup",
      "--model",
      rembgModel,
      "--model-dir",
      models.rembg.path,
      "--provider",
      options.rembgProvider || "auto"
    ], { U2NET_HOME: models.rembg.path }, { stdio: "inherit" });
  }
  if (name === "clip" || name === "all") {
    await ensureSafeModelDirectory(models.clip.path, modelRoot);
    await downloadHuggingFaceModel("Xenova/clip-vit-base-patch32", models.clip.path, {
      ...options,
      trustedModelRoot: modelRoot
    });
    if (!await clipModelReady(models.clip.path, modelRoot)) {
      throw new Error(`CLIP model download incomplete: ${models.clip.path}`);
    }
  }
}

async function downloadFile(url, outputPath, options = {}, trustedRoot = path.dirname(outputPath)) {
  if (!options.fetchImpl) {
    await writeModelFile(outputPath, await readUrlWithRetries(url, options), options, trustedRoot);
    return;
  }
  const fetchImpl = options.fetchImpl;
  const buffer = await readBufferWithFetch(url, fetchImpl, options, (response) => (
    `failed to download ${path.basename(outputPath)}: ${response.status}`
  ));
  await writeModelFile(outputPath, buffer, options, trustedRoot);
}

async function readUrl(url, options = {}) {
  return withModelRequestTimeout(url, options, async (signal) => {
    const response = await fetch(url, {
      headers: { "user-agent": "Outfit local model downloader" },
      signal
    });
    if (!response.ok) {
      throw new Error(`failed to download ${url}: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  });
}

async function readUrlWithRetries(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await readUrl(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw lastError;
}

export async function verify(name = "all", options = {}) {
  assertModelTarget(name);
  const modelRoot = resolveModelRoot(options);
  const models = modelDefinitions(modelRoot);

  if (name === "rembg" || name === "all") {
    await verifyRembg(models.rembg.path, options, modelRoot);
  }
  if (name === "clip" || name === "all") {
    await verifyClip(models.clip.path, options, modelRoot);
  }
  const result = await status({ modelRoot });
  (options.logger || console).log(JSON.stringify(result, null, 2));
  return result;
}

export async function downloadHuggingFaceModel(repoId, localDir, options = {}) {
  const metadata = options.fetchImpl
    ? await readJsonWithFetch(`https://huggingface.co/api/models/${repoId}`, options.fetchImpl, options)
    : JSON.parse((await readUrlWithRetries(`https://huggingface.co/api/models/${repoId}`, options)).toString("utf8"));
  const files = normalizeHuggingFaceRuntimeFiles(metadata);
  const trustedRoot = options.trustedModelRoot || localDir;
  mkdirSync(trustedRoot, { recursive: true });
  await assertSafeModelDirectory(trustedRoot, trustedRoot);
  await ensureSafeModelDirectory(localDir, trustedRoot);
  const hasLocalOnnx = await hasOnnxFile(localDir, trustedRoot);

  for (const file of files) {
    const url = `https://huggingface.co/${repoId}/resolve/main/${file}`;
    const outputPath = safeModelOutputPath(localDir, file);
    if (await isRegularModelFile(outputPath, file === "merges.txt", trustedRoot) || (hasLocalOnnx && file.toLowerCase().endsWith(".onnx"))) {
      continue;
    }
    await ensureSafeModelDirectory(path.dirname(outputPath), trustedRoot);
    if (options.fetchImpl) {
      const buffer = await readBufferWithFetch(url, options.fetchImpl, options, (response) => (
        `failed to download ${file}: ${response.status}`
      ));
      await writeModelFile(outputPath, buffer, options, trustedRoot);
    } else {
      await writeModelFile(outputPath, await readUrlWithRetries(url, options), options, trustedRoot);
    }
  }
}

function normalizeHuggingFaceRuntimeFiles(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Hugging Face model metadata must be an object");
  }
  if (!Array.isArray(metadata.siblings)) {
    throw new Error("Hugging Face model metadata siblings must be an array");
  }
  const files = metadata.siblings.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.rfilename !== "string") {
      throw new Error("Hugging Face model metadata rfilename must be a string");
    }
    return item.rfilename;
  });
  return Array.from(new Set(files.filter((file) => isClipRuntimeFile(file))));
}

async function writeModelFile(outputPath, data, options = {}, trustedRoot = path.dirname(outputPath)) {
  await assertSafeModelDirectory(path.dirname(outputPath), trustedRoot);
  const temporaryPath = `${outputPath}.part-${process.pid}-${randomUUID()}`;
  const writeFileImpl = options.writeFileImpl || writeFile;
  const renameImpl = options.renameImpl || rename;
  try {
    await writeFileImpl(temporaryPath, data, { flag: "wx" });
    await renameImpl(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readJsonWithFetch(url, fetchImpl, options) {
  return withModelRequestTimeout(url, options, async (signal) => {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) {
      throw new Error(`failed to read Hugging Face model metadata: ${response.status}`);
    }
    return response.json();
  });
}

async function readBufferWithFetch(url, fetchImpl, options, errorMessage) {
  return withModelRequestTimeout(url, options, async (signal) => {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) {
      throw new Error(errorMessage(response));
    }
    return Buffer.from(await response.arrayBuffer());
  });
}

async function withModelRequestTimeout(url, options, operation) {
  const timeoutMs = configuredModelRequestTimeout(options.requestTimeoutMs);
  const controller = new AbortController();
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`model download request timed out after ${timeoutMs} ms: ${url}`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      timeoutPromise
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function configuredModelRequestTimeout(value) {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.floor(Number(value))
    : DEFAULT_MODEL_REQUEST_TIMEOUT_MS;
}

export async function run(commandName, args, extraEnv = {}, options = {}) {
  const stdio = options.stdio === "pipe" ? ["ignore", "pipe", "pipe"] : "inherit";
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      stdio
    });
    let stdout = "";
    let stderr = "";
    if (options.stdio === "pipe") {
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `${commandName} exited with ${code}`));
    });
  });
}

function modelDefinitions(modelRoot) {
  return {
    rembg: {
      id: "rembg-isnet",
      path: path.join(modelRoot, "rembg")
    },
    clip: {
      id: "clip-vit-base-patch32",
      path: path.join(modelRoot, "huggingface", "Xenova", "clip-vit-base-patch32"),
      installed: async () => clipModelReady(
        path.join(modelRoot, "huggingface", "Xenova", "clip-vit-base-patch32"),
        modelRoot
      )
    }
  };
}

async function verifyRembg(modelDir, options, trustedRoot) {
  const model = await installedRembgModel(modelDir, trustedRoot);
  if (!model) {
    throw new Error(`rembg model missing: ${modelDir}`);
  }
  const tempDir = await mkdtemp(path.join(tmpdir(), "outfit-rembg-verify-"));
  const inputPath = path.join(tempDir, "input.png");
  const outputPath = path.join(tempDir, "output.png");
  const runCommand = options.runCommand || run;
  try {
    await writeFile(inputPath, TINY_PNG);
    await runCommand(process.env.PYTHON || "python", [
      "scripts/vision_rembg.py",
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--model",
      model,
      "--model-dir",
      modelDir,
      "--provider",
      options.rembgProvider || "auto"
    ], { U2NET_HOME: modelDir }, { stdio: "pipe" });
    if (!existsSync(outputPath)) {
      throw new Error("rembg verify did not create an output PNG");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function verifyClip(modelDir, options, trustedRoot) {
  const clipReady = await clipModelReady(modelDir, trustedRoot);
  if (!clipReady) {
    throw new Error(`clip model missing: ${modelDir}`);
  }
  const tempDir = await mkdtemp(path.join(tmpdir(), "outfit-clip-verify-"));
  const inputPath = path.join(tempDir, "input.png");
  const runCommand = options.runCommand || run;
  try {
    await writeFile(inputPath, TINY_PNG);
    await runCommand(process.execPath, [
      "scripts/vision_tags.mjs",
      "--image",
      inputPath,
      "--model-dir",
      modelDir,
      "--device",
      options.visionDevice || "auto"
    ], {}, { stdio: "pipe" });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function hasOnnxFile(root, trustedRoot = root) {
  try {
    if (!await isSafeModelDirectory(root, trustedRoot)) return false;
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory() && await hasOnnxFile(fullPath, trustedRoot)) return true;
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".onnx") && await isRegularNonEmptyFile(fullPath, trustedRoot)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function clipModelReady(root, trustedRoot = root) {
  const requiredFilesReady = await Promise.all(
    CLIP_REQUIRED_FILES.map((file) => isRegularModelFile(path.join(root, file), file === "merges.txt", trustedRoot))
  );
  return requiredFilesReady.every(Boolean) && await hasOnnxFile(root, trustedRoot);
}

async function installedRembgModel(modelDir, trustedRoot = modelDir) {
  for (const model of REMBG_MODEL_FALLBACKS) {
    if (await isRegularNonEmptyFile(path.join(modelDir, `${model}.onnx`), trustedRoot)) return model;
  }
  return undefined;
}

async function isRegularNonEmptyFile(filePath, trustedRoot = path.dirname(filePath)) {
  return isRegularModelFile(filePath, false, trustedRoot);
}

async function isRegularModelFile(filePath, allowEmpty, trustedRoot = path.dirname(filePath)) {
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

async function assertSafeModelDirectory(directoryPath, trustedRoot) {
  if (!await isSafeModelDirectory(directoryPath, trustedRoot)) {
    throw new Error("model directory must stay inside a regular local model root");
  }
}

async function ensureSafeModelDirectory(directoryPath, trustedRoot) {
  const resolvedRoot = path.resolve(trustedRoot);
  const resolvedDirectory = path.resolve(directoryPath);
  if (!isInsideRealRoot(resolvedRoot, resolvedDirectory)) {
    throw new Error("model directory must stay inside a regular local model root");
  }
  const trustedRealRoot = await trustedModelRealRoot(resolvedRoot);
  if (!trustedRealRoot) {
    throw new Error("model directory must stay inside a regular local model root");
  }
  const relativeDirectory = path.relative(resolvedRoot, resolvedDirectory);
  let currentPath = resolvedRoot;
  for (const segment of relativeDirectory.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, segment);
    let directory;
    try {
      directory = await lstat(currentPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      try {
        await mkdir(currentPath);
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
      }
      directory = await lstat(currentPath);
    }
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      !isInsideRealRoot(trustedRealRoot, await realpath(currentPath))
    ) {
      throw new Error("model directory must stay inside a regular local model root");
    }
  }
}

async function isSafeModelDirectory(directoryPath, trustedRoot) {
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

async function trustedModelRealRoot(root) {
  try {
    const resolvedRoot = path.resolve(root);
    const rootStat = await lstat(resolvedRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return undefined;
    return realpath(resolvedRoot);
  } catch {
    return undefined;
  }
}

function isInsideRealRoot(realRoot, candidate) {
  const relativePath = path.relative(realRoot, candidate);
  return relativePath === "" || (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function normalizeRembgModel(model) {
  if (REMBG_MODEL_FALLBACKS.includes(model)) {
    return model;
  }
  throw new Error(`unsupported rembg model: ${model}`);
}

function resolveModelRoot(options) {
  return options.modelRoot || defaultModelRoot();
}

function assertModelTarget(name) {
  if (!MODEL_TARGETS.has(name)) {
    throw new Error(`unknown model target: ${name}`);
  }
}

function parseArgs(values) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const name = value.slice(2);
    flags[name] = values[index + 1];
    index += 1;
  }
  return { positionals, flags };
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "")) {
  if (shouldRelaunchWithEnvProxy()) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
      stdio: "inherit"
    });
    child.on("close", (code) => {
      process.exitCode = code ?? 1;
    });
    child.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  } else {
    main().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}

function shouldRelaunchWithEnvProxy() {
  return process.env.NODE_USE_ENV_PROXY !== "1" && Boolean(
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy
  );
}
