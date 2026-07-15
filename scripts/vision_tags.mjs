import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const imagePath = args.image;
const modelDir = args["model-dir"];
const device = normalizeDevice(args.device || process.env.OUTFIT_VISION_DEVICE || "auto");

if (!imagePath || !modelDir) {
  console.error("Usage: node scripts/vision_tags.mjs --image <path> --model-dir <path> [--device auto|gpu|cpu|wasm|webgpu|cuda|dml]");
  process.exit(2);
}

const labels = [
  "top", "bottom", "dress", "outerwear", "shoes", "accessory",
  "casual", "smart-casual", "formal", "sport",
  "solid", "striped", "printed", "leather", "cotton", "wool", "denim"
];

try {
  const { env, pipeline, RawImage } = await import("@huggingface/transformers");
  env.cacheDir = path.resolve(modelDir, "..", "..");
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  const classifier = await pipeline("zero-shot-image-classification", path.resolve(modelDir), { device });
  try {
    const image = await RawImage.read(path.resolve(imagePath));
    const analysis = await analyzeLocally(classifier, image, labels);
    console.log(JSON.stringify({
      ...toSuggestion(analysis.scores),
      embedding: analysis.embedding
    }, null, 2));
  } finally {
    await classifier.dispose();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function analyzeLocally(classifier, image, candidateLabels) {
  const texts = candidateLabels.map((label) => `This is a photo of ${label}`);
  const textInputs = classifier.tokenizer(texts, {
    padding: true,
    truncation: true
  });
  const { pixel_values: pixelValues } = await classifier.processor([image]);
  const output = await classifier.model({ ...textInputs, pixel_values: pixelValues });
  const logits = Array.from(output.logits_per_image)[0];
  if (!logits?.data || !output.image_embeds?.data) {
    throw new Error("CLIP 本地模型没有返回预期的图片向量");
  }
  const probabilities = softmax(Array.from(logits.data));
  return {
    scores: probabilities
      .map((score, index) => ({ label: candidateLabels[index], score }))
      .sort((left, right) => right.score - left.score),
    embedding: Array.from(output.image_embeds.data, Number)
  };
}

function softmax(values) {
  if (values.length === 0) return [];
  const maximum = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

function toSuggestion(results) {
  const scores = Array.isArray(results)
    ? results.map((item) => ({ label: String(item.label), score: Number(item.score) || 0 }))
    : [];
  return {
    category: firstMatching(scores, ["top", "bottom", "dress", "outerwear", "shoes", "accessory"]),
    styles: topMatches(scores, ["casual", "smart-casual", "formal", "sport"], 2),
    patterns: topMatches(scores, ["solid", "striped", "printed"], 2),
    tags: topMatches(scores, ["leather", "cotton", "wool", "denim"], 4),
    scores: scores.slice(0, 12)
  };
}

function firstMatching(scores, allowed) {
  const match = scores.find((item) => allowed.includes(item.label));
  return match?.score >= 0.12 ? match.label : undefined;
}

function topMatches(scores, allowed, limit) {
  return scores
    .filter((item) => allowed.includes(item.label) && item.score >= 0.12)
    .slice(0, limit)
    .map((item) => item.label);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return result;
}

function normalizeDevice(value) {
  const normalized = String(value || "auto").trim().toLowerCase();
  const allowed = new Set(["auto", "gpu", "cpu", "wasm", "webgpu", "cuda", "dml"]);
  return allowed.has(normalized) ? normalized : "auto";
}
