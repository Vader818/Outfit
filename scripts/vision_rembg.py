import argparse
import base64
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile


TINY_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)
SUPPORTED_MODELS = ("isnet-general-use", "u2netp", "silueta")


def main() -> int:
    parser = argparse.ArgumentParser(description="Outfit local rembg wrapper")
    parser.add_argument("--status", action="store_true", help="print dependency and model status as JSON")
    parser.add_argument("--warmup", action="store_true", help="run a tiny background removal to trigger model download")
    parser.add_argument("--input", help="input local image path")
    parser.add_argument("--output", help="output PNG path")
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--model-dir", default=str(Path.cwd() / "output" / "models" / "rembg"))
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    if args.status:
        print(json.dumps(status(args.model, model_dir), ensure_ascii=False))
        return 0

    os.environ["U2NET_HOME"] = str(model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)

    if args.warmup:
        rembg = load_rembg()
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.png"
            output_path = Path(tmp) / "output.png"
            input_path.write_bytes(base64.b64decode(TINY_PNG))
            remove_background(rembg, input_path, output_path, args.model)
        return 0

    if not args.input or not args.output:
        print("--input and --output are required unless --status or --warmup is used", file=sys.stderr)
        return 2

    resolved_model = resolve_existing_model(args.model, model_dir)
    rembg = load_rembg()
    remove_background(rembg, Path(args.input), Path(args.output), resolved_model)
    return 0


def status(model: str, model_dir: Path) -> dict:
    models = {name: (model_dir / f"{name}.onnx").exists() for name in SUPPORTED_MODELS}
    return {
        "model": model,
        "modelDir": str(model_dir),
        "rembgInstalled": importlib.util.find_spec("rembg") is not None,
        "modelExists": (model_dir / f"{model}.onnx").exists(),
        "models": models,
    }


def load_rembg():
    try:
        from rembg import new_session, remove
    except ImportError as error:
        raise SystemExit(
            "rembg is not installed. Install it with: python -m pip install \"rembg[cpu]\""
        ) from error
    return {"new_session": new_session, "remove": remove}


def remove_background(rembg, input_path: Path, output_path: Path, model: str) -> None:
    if not input_path.exists():
        raise SystemExit(f"input image not found: {input_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    session = rembg["new_session"](model)
    output = rembg["remove"](input_path.read_bytes(), session=session)
    output_path.write_bytes(output)


def resolve_existing_model(model: str, model_dir: Path) -> str:
    candidates = [model, *[name for name in SUPPORTED_MODELS if name != model]]
    for candidate in candidates:
        if (model_dir / f"{candidate}.onnx").exists():
            return candidate
    expected = ", ".join(str(model_dir / f"{candidate}.onnx") for candidate in candidates)
    raise SystemExit(
        "rembg model file not found. "
        f"Expected one of: {expected}. "
        "Run: npm run models:download:rembg"
    )


if __name__ == "__main__":
    raise SystemExit(main())
