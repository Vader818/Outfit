import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { download, downloadHuggingFaceModel, status, verify } from "../scripts/models.mjs";

function makeModelRoot() {
  return mkdtempSync(path.join(tmpdir(), "outfit-models-script-test-"));
}

function installRembgModel(root, model = "isnet-general-use") {
  const rembgDir = path.join(root, "rembg");
  mkdirSync(rembgDir, { recursive: true });
  writeFileSync(path.join(rembgDir, `${model}.onnx`), "fake-rembg", "utf8");
}

function installClipModel(root) {
  const clipDir = path.join(root, "huggingface", "Xenova", "clip-vit-base-patch32");
  mkdirSync(path.join(clipDir, "onnx"), { recursive: true });
  writeFileSync(path.join(clipDir, "config.json"), "{}", "utf8");
  writeFileSync(path.join(clipDir, "preprocessor_config.json"), "{}", "utf8");
  writeFileSync(path.join(clipDir, "special_tokens_map.json"), "{}", "utf8");
  writeFileSync(path.join(clipDir, "tokenizer.json"), "{}", "utf8");
  writeFileSync(path.join(clipDir, "tokenizer_config.json"), "{}", "utf8");
  writeFileSync(path.join(clipDir, "vocab.json"), "{}", "utf8");
  writeFileSync(path.join(clipDir, "merges.txt"), "", "utf8");
  writeFileSync(path.join(clipDir, "onnx", "model_quantized.onnx"), "fake-clip", "utf8");
}

describe("models script", () => {
  it("reports installed fallback rembg and CLIP runtime files", async () => {
    const modelRoot = makeModelRoot();
    installRembgModel(modelRoot, "u2netp");
    installClipModel(modelRoot);

    const result = await status({ modelRoot });

    expect(result.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "rembg-isnet", installed: true, installedModel: "u2netp" }),
      expect.objectContaining({ id: "clip-vit-base-patch32", installed: true })
    ]));
  });

  it("verifies rembg and CLIP by running tiny local inference commands", async () => {
    const modelRoot = makeModelRoot();
    installRembgModel(modelRoot);
    installClipModel(modelRoot);
    const calls = [];
    const runCommand = vi.fn(async (_command, args) => {
      calls.push(args.join(" "));
      const outputIndex = args.indexOf("--output");
      if (outputIndex >= 0) {
        writeFileSync(args[outputIndex + 1], Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      }
      return "{}";
    });

    await verify("all", { modelRoot, runCommand, logger: { log: vi.fn() } });

    expect(calls.some((value) => value.includes("scripts/vision_rembg.py") && value.includes("--input"))).toBe(true);
    expect(calls.some((value) => value.includes("scripts/vision_tags.mjs") && value.includes("--image"))).toBe(true);
  });

  it("passes requested GPU backends to rembg and CLIP verification commands", async () => {
    const modelRoot = makeModelRoot();
    installRembgModel(modelRoot);
    installClipModel(modelRoot);
    const calls = [];
    const runCommand = vi.fn(async (_command, args) => {
      calls.push(args.join(" "));
      const outputIndex = args.indexOf("--output");
      if (outputIndex >= 0) {
        writeFileSync(args[outputIndex + 1], Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      }
      return "{}";
    });

    await verify("all", {
      modelRoot,
      runCommand,
      logger: { log: vi.fn() },
      rembgProvider: "cuda",
      visionDevice: "dml"
    });

    expect(calls.some((value) => value.includes("scripts/vision_rembg.py") && value.includes("--provider cuda"))).toBe(true);
    expect(calls.some((value) => value.includes("scripts/vision_tags.mjs") && value.includes("--device dml"))).toBe(true);
  });

  it("downloads the requested rembg fallback model during warmup", async () => {
    const modelRoot = makeModelRoot();
    const runCommand = vi.fn(async () => "");
    const fetchImpl = vi.fn(async () => new Response("fake-onnx", { status: 200 }));

    await download("rembg", { modelRoot, rembgModel: "silueta", rembgProvider: "cuda", runCommand, fetchImpl });

    expect(readFileSync(path.join(modelRoot, "rembg", "silueta.onnx"), "utf8")).toBe("fake-onnx");
    expect(runCommand).toHaveBeenCalledWith(
      expect.stringMatching(/python/),
      expect.arrayContaining(["--warmup", "--model", "silueta"]),
      expect.objectContaining({ U2NET_HOME: path.join(modelRoot, "rembg") }),
      expect.objectContaining({ stdio: "inherit" })
    );
    expect(runCommand.mock.calls[0][1]).toEqual(expect.arrayContaining(["--provider", "cuda"]));
  });

  it("rejects unknown model targets for download and verify", async () => {
    const modelRoot = makeModelRoot();
    const runCommand = vi.fn(async () => "");
    const fetchImpl = vi.fn(async () => new Response("unused", { status: 200 }));

    await expect(download("not-a-model", { modelRoot, runCommand, fetchImpl }))
      .rejects.toThrow("unknown model target");
    await expect(verify("not-a-model", { modelRoot, runCommand, logger: { log: vi.fn() } }))
      .rejects.toThrow("unknown model target");
    expect(runCommand).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("downloads only CLIP runtime files and fails clearly on Hugging Face errors", async () => {
    const modelRoot = makeModelRoot();
    const clipDir = path.join(modelRoot, "clip");
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes("/api/models/")) {
        return new Response(JSON.stringify({
          siblings: [
            { rfilename: "config.json" },
            { rfilename: "onnx/model_quantized.onnx" },
            { rfilename: "README.md" }
          ]
        }), { status: 200 });
      }
      return new Response(value.includes("config.json") ? "{}" : "onnx", { status: 200 });
    });

    await downloadHuggingFaceModel("Xenova/clip-vit-base-patch32", clipDir, { fetchImpl });

    expect(existsSync(path.join(clipDir, "config.json"))).toBe(true);
    expect(readFileSync(path.join(clipDir, "onnx", "model_quantized.onnx"), "utf8")).toBe("onnx");
    expect(existsSync(path.join(clipDir, "README.md"))).toBe(false);

    const failingFetch = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes("/api/models/")) {
        return new Response(JSON.stringify({ siblings: [{ rfilename: "config.json" }] }), { status: 200 });
      }
      return new Response("unavailable", { status: 503 });
    });

    await expect(downloadHuggingFaceModel("Xenova/clip-vit-base-patch32", path.join(modelRoot, "failed"), { fetchImpl: failingFetch }))
      .rejects.toThrow("failed to download config.json: 503");
  });
});
