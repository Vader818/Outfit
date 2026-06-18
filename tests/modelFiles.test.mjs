import { describe, expect, it } from "vitest";
import path from "node:path";
import { isClipRuntimeFile, safeModelOutputPath } from "../scripts/model-files.mjs";

describe("model file helpers", () => {
  it("keeps only CLIP runtime files from a Hugging Face repository", () => {
    expect(isClipRuntimeFile("config.json")).toBe(true);
    expect(isClipRuntimeFile("preprocessor_config.json")).toBe(true);
    expect(isClipRuntimeFile("special_tokens_map.json")).toBe(true);
    expect(isClipRuntimeFile("tokenizer.json")).toBe(true);
    expect(isClipRuntimeFile("onnx/model_quantized.onnx")).toBe(true);
    expect(isClipRuntimeFile("onnx/model.onnx")).toBe(true);
    expect(isClipRuntimeFile("README.md")).toBe(false);
    expect(isClipRuntimeFile("pytorch_model.bin")).toBe(false);
  });

  it("rejects absolute and escaping model output paths", () => {
    const root = path.join("C:", "outfit", "models");

    expect(safeModelOutputPath(root, "onnx/model_quantized.onnx")).toBe(path.resolve(root, "onnx", "model_quantized.onnx"));
    expect(() => safeModelOutputPath(root, path.resolve("C:", "outside.onnx"))).toThrow("model file path must stay inside");
    expect(() => safeModelOutputPath(root, "onnx/../../outside.onnx")).toThrow("model file path must stay inside");
  });
});
