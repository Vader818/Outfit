import path from "node:path";

export function isClipRuntimeFile(file) {
  return (
    file === "config.json" ||
    file === "preprocessor_config.json" ||
    file === "special_tokens_map.json" ||
    file === "tokenizer.json" ||
    file === "tokenizer_config.json" ||
    file === "vocab.json" ||
    file === "merges.txt" ||
    file === "onnx/model_quantized.onnx"
  );
}

export function safeModelOutputPath(localDir, file) {
  if (path.isAbsolute(file)) {
    throw new Error("model file path must stay inside the model directory");
  }
  const root = path.resolve(localDir);
  const outputPath = path.resolve(root, file);
  if (outputPath !== root && !outputPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("model file path must stay inside the model directory");
  }
  return outputPath;
}
