import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const imagePath = args.image;
const modelDir = args["model-dir"];

if (!imagePath || !modelDir) {
  console.error("Usage: node scripts/vision_tags.mjs --image <path> --model-dir <path>");
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
  const classifier = await pipeline("zero-shot-image-classification", path.resolve(modelDir));
  const image = await RawImage.read(path.resolve(imagePath));
  const output = await classifier(image, labels);
  await classifier.dispose();
  console.log(JSON.stringify(toSuggestion(output), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
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
