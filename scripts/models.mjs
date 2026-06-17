import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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

export function defaultModelRoot() {
  return process.env.OUTFIT_MODEL_ROOT || path.join(process.cwd(), "output", "models");
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  const command = parsed.positionals[0] || "status";
  const target = parsed.positionals[1] || "all";
  const commandOptions = {
    ...options,
    rembgModel: parsed.flags.model || options.rembgModel
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
  const installedModel = installedRembgModel(models.rembg.path);
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
  const modelRoot = resolveModelRoot(options);
  const models = modelDefinitions(modelRoot);
  const runCommand = options.runCommand || run;

  if (name === "rembg" || name === "all") {
    const rembgModel = normalizeRembgModel(options.rembgModel || "isnet-general-use");
    mkdirSync(models.rembg.path, { recursive: true });
    const outputPath = path.join(models.rembg.path, `${rembgModel}.onnx`);
    if (!existsSync(outputPath)) {
      await downloadFile(REMBG_MODEL_URLS[rembgModel], outputPath, options);
    }
    await runCommand(process.env.PYTHON || "python", [
      "scripts/vision_rembg.py",
      "--warmup",
      "--model",
      rembgModel,
      "--model-dir",
      models.rembg.path
    ], { U2NET_HOME: models.rembg.path }, { stdio: "inherit" });
  }
  if (name === "clip" || name === "all") {
    mkdirSync(models.clip.path, { recursive: true });
    await downloadHuggingFaceModel("Xenova/clip-vit-base-patch32", models.clip.path, options);
  }
}

async function downloadFile(url, outputPath, options = {}) {
  if (!options.fetchImpl) {
    await writeFile(outputPath, await readUrlWithRetries(url));
    return;
  }
  const fetchImpl = options.fetchImpl;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`failed to download ${path.basename(outputPath)}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

async function readUrl(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Outfit local model downloader" }
  });
  if (!response.ok) {
    throw new Error(`failed to download ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function readUrlWithRetries(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await readUrl(url);
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
  const modelRoot = resolveModelRoot(options);
  const models = modelDefinitions(modelRoot);

  if (name === "rembg" || name === "all") {
    await verifyRembg(models.rembg.path, options);
  }
  if (name === "clip" || name === "all") {
    await verifyClip(models.clip.path, options);
  }
  const result = await status({ modelRoot });
  (options.logger || console).log(JSON.stringify(result, null, 2));
  return result;
}

export async function downloadHuggingFaceModel(repoId, localDir, options = {}) {
  const metadata = options.fetchImpl
    ? await readJsonWithFetch(`https://huggingface.co/api/models/${repoId}`, options.fetchImpl)
    : JSON.parse((await readUrlWithRetries(`https://huggingface.co/api/models/${repoId}`)).toString("utf8"));
  const files = (metadata.siblings || [])
    .map((item) => item.rfilename)
    .filter((file) => isClipRuntimeFile(file));
  const hasLocalOnnx = await hasOnnxFile(localDir);

  for (const file of files) {
    const url = `https://huggingface.co/${repoId}/resolve/main/${file}`;
    const outputPath = safeModelOutputPath(localDir, file);
    if (existsSync(outputPath) || (hasLocalOnnx && file.toLowerCase().endsWith(".onnx"))) {
      continue;
    }
    mkdirSync(path.dirname(outputPath), { recursive: true });
    if (options.fetchImpl) {
      const response = await options.fetchImpl(url);
      if (!response.ok) {
        throw new Error(`failed to download ${file}: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(outputPath, buffer);
    } else {
      await writeFile(outputPath, await readUrlWithRetries(url));
    }
  }
}

async function readJsonWithFetch(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`failed to read Hugging Face model metadata: ${response.status}`);
  }
  return response.json();
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
      installed: async () => clipModelReady(path.join(modelRoot, "huggingface", "Xenova", "clip-vit-base-patch32"))
    }
  };
}

async function verifyRembg(modelDir, options) {
  const model = installedRembgModel(modelDir);
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
      modelDir
    ], { U2NET_HOME: modelDir }, { stdio: "pipe" });
    if (!existsSync(outputPath)) {
      throw new Error("rembg verify did not create an output PNG");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function verifyClip(modelDir, options) {
  const clipReady = await clipModelReady(modelDir);
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
      modelDir
    ], {}, { stdio: "pipe" });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function hasOnnxFile(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory() && await hasOnnxFile(fullPath)) return true;
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".onnx")) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function clipModelReady(root) {
  return CLIP_REQUIRED_FILES.every((file) => existsSync(path.join(root, file))) && await hasOnnxFile(root);
}

function installedRembgModel(modelDir) {
  return REMBG_MODEL_FALLBACKS.find((model) => existsSync(path.join(modelDir, `${model}.onnx`)));
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
