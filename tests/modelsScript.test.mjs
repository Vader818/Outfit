import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
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

  it("does not report empty model files as installed and redownloads empty rembg files", async () => {
    const modelRoot = makeModelRoot();
    const rembgDir = path.join(modelRoot, "rembg");
    mkdirSync(rembgDir, { recursive: true });
    const rembgPath = path.join(rembgDir, "isnet-general-use.onnx");
    writeFileSync(rembgPath, Buffer.alloc(0));
    installClipModel(modelRoot);
    const clipDir = path.join(modelRoot, "huggingface", "Xenova", "clip-vit-base-patch32");
    writeFileSync(path.join(clipDir, "config.json"), Buffer.alloc(0));
    writeFileSync(path.join(clipDir, "onnx", "model_quantized.onnx"), Buffer.alloc(0));

    const before = await status({ modelRoot });
    expect(before.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "rembg-isnet", installed: false }),
      expect.objectContaining({ id: "clip-vit-base-patch32", installed: false })
    ]));

    const fetchImpl = vi.fn(async () => new Response("replacement-onnx", { status: 200 }));
    await download("rembg", {
      modelRoot,
      runCommand: vi.fn(async () => ""),
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readFileSync(rembgPath, "utf8")).toBe("replacement-onnx");
  });

  it("cleans partial temporary files without exposing a final model file", async () => {
    const modelRoot = makeModelRoot();
    const clipDir = path.join(modelRoot, "clip");
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes("/api/models/")) {
        return new Response(JSON.stringify({ siblings: [{ rfilename: "config.json" }] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    const writeFileImpl = vi.fn(async (temporaryPath) => {
      writeFileSync(temporaryPath, "partial", "utf8");
      throw new Error("simulated interrupted write");
    });

    await expect(downloadHuggingFaceModel("Xenova/clip-vit-base-patch32", clipDir, {
      fetchImpl,
      writeFileImpl
    })).rejects.toThrow("simulated interrupted write");

    expect(existsSync(path.join(clipDir, "config.json"))).toBe(false);
    expect(readdirSync(clipDir).filter((entry) => entry.includes(".part-"))).toEqual([]);
  });

  it("rejects CLIP downloads whose subdirectory escapes through a link", async (context) => {
    const modelRoot = makeModelRoot();
    const clipDir = path.join(modelRoot, "clip");
    const outsideDir = makeModelRoot();
    mkdirSync(clipDir, { recursive: true });
    try {
      symlinkSync(outsideDir, path.join(clipDir, "onnx"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code || "")) {
        context.skip();
        return;
      }
      throw error;
    }
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes("/api/models/")) {
        return new Response(JSON.stringify({ siblings: [{ rfilename: "onnx/model_quantized.onnx" }] }), { status: 200 });
      }
      return new Response("escaped-onnx", { status: 200 });
    });

    await expect(downloadHuggingFaceModel("Xenova/clip-vit-base-patch32", clipDir, { fetchImpl }))
      .rejects.toThrow("model directory");
    expect(existsSync(path.join(outsideDir, "model_quantized.onnx"))).toBe(false);
  });

  it("does not create CLIP directories through an intermediate model-root link", async (context) => {
    const modelRoot = makeModelRoot();
    const outsideDir = makeModelRoot();
    const linkedHuggingFaceDir = path.join(modelRoot, "huggingface");
    try {
      symlinkSync(
        outsideDir,
        linkedHuggingFaceDir,
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code || "")) {
        context.skip();
        return;
      }
      throw error;
    }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ siblings: [] }), { status: 200 }));

    await expect(download("clip", { modelRoot, fetchImpl }))
      .rejects.toThrow("model directory");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(existsSync(path.join(outsideDir, "Xenova"))).toBe(false);
  });

  it.each(["metadata", "model body"])("times out a hanging %s request", async (stage) => {
    const modelRoot = makeModelRoot();
    const clipDir = path.join(modelRoot, "clip");
    const never = () => new Promise(() => undefined);
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes("/api/models/")) {
        if (stage === "metadata") {
          return { ok: true, status: 200, json: never };
        }
        return new Response(JSON.stringify({ siblings: [{ rfilename: "config.json" }] }), { status: 200 });
      }
      return { ok: true, status: 200, arrayBuffer: never };
    });

    const outcome = await Promise.race([
      downloadHuggingFaceModel("Xenova/clip-vit-base-patch32", clipDir, {
        fetchImpl,
        requestTimeoutMs: 20
      }).then(
        () => ({ status: "resolved" }),
        (error) => ({ status: "rejected", message: error instanceof Error ? error.message : String(error) })
      ),
      new Promise((resolve) => setTimeout(() => resolve({ status: "still-pending" }), 100))
    ]);

    expect(outcome).toMatchObject({
      status: "rejected",
      message: expect.stringContaining("timed out")
    });
  });

  it("fails a CLIP download when metadata leaves required runtime files missing", async () => {
    const modelRoot = makeModelRoot();
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes("/api/models/")) {
        return new Response(JSON.stringify({ siblings: [{ rfilename: "config.json" }] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    await expect(download("clip", { modelRoot, fetchImpl }))
      .rejects.toThrow("CLIP model download incomplete");
    const result = await status({ modelRoot });
    expect(result.models.find((model) => model.id === "clip-vit-base-patch32")?.installed).toBe(false);
  });

  it("rejects malformed Hugging Face siblings metadata with a stable error", async () => {
    const modelRoot = makeModelRoot();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      siblings: { rfilename: "config.json" }
    }), { status: 200 }));

    await expect(download("clip", { modelRoot, fetchImpl }))
      .rejects.toThrow("Hugging Face model metadata siblings must be an array");
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
