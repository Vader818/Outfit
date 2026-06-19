import argparse
import base64
import ctypes
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
PROVIDER_PRESETS = {
    "cpu": ["CPUExecutionProvider"],
    "cuda": ["CUDAExecutionProvider", "CPUExecutionProvider"],
    "dml": ["DmlExecutionProvider", "CPUExecutionProvider"],
}
WINDOWS_CUDA_RUNTIME_DLLS = ("cublasLt64_13.dll",)
_CUDA_DLLS_PRELOADED = False
_CUDA_DLL_DIRECTORY_HANDLES = []


def main() -> int:
    parser = argparse.ArgumentParser(description="Outfit local rembg wrapper")
    parser.add_argument("--status", action="store_true", help="print dependency and model status as JSON")
    parser.add_argument("--warmup", action="store_true", help="run a tiny background removal to trigger model download")
    parser.add_argument("--input", help="input local image path")
    parser.add_argument("--output", help="output PNG path")
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--model-dir", default=str(Path.cwd() / "output" / "models" / "rembg"))
    parser.add_argument(
        "--provider",
        default=default_provider(),
        choices=("auto", "cpu", "cuda", "dml"),
        help="ONNX Runtime provider preference: auto, cpu, cuda, or dml",
    )
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    if args.status:
        print(json.dumps(status(args.model, model_dir, args.provider), ensure_ascii=False))
        return 0

    os.environ["U2NET_HOME"] = str(model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)

    if args.warmup:
        rembg = load_rembg()
        providers = resolve_providers(args.provider)
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.png"
            output_path = Path(tmp) / "output.png"
            input_path.write_bytes(base64.b64decode(TINY_PNG))
            remove_background(rembg, input_path, output_path, args.model, providers)
        return 0

    if not args.input or not args.output:
        print("--input and --output are required unless --status or --warmup is used", file=sys.stderr)
        return 2

    resolved_model = resolve_existing_model(args.model, model_dir)
    rembg = load_rembg()
    providers = resolve_providers(args.provider)
    remove_background(rembg, Path(args.input), Path(args.output), resolved_model, providers)
    return 0


def status(model: str, model_dir: Path, provider: str) -> dict:
    models = {name: (model_dir / f"{name}.onnx").exists() for name in SUPPORTED_MODELS}
    provider_error = None
    try:
        ort = load_onnxruntime()
        onnxruntime_installed = True
        onnxruntime_device = ort.get_device()
        available_providers = ort.get_available_providers()
    except SystemExit as error:
        onnxruntime_installed = False
        onnxruntime_device = None
        available_providers = []
        selected_providers = []
        provider_error = str(error)
    else:
        try:
            selected_providers = resolve_providers(provider)
        except SystemExit as error:
            selected_providers = []
            provider_error = str(error)
    return {
        "model": model,
        "modelDir": str(model_dir),
        "rembgInstalled": importlib.util.find_spec("rembg") is not None,
        "modelExists": (model_dir / f"{model}.onnx").exists(),
        "models": models,
        "onnxruntimeInstalled": onnxruntime_installed,
        "onnxruntimeDevice": onnxruntime_device,
        "availableProviders": available_providers,
        "provider": provider,
        "selectedProviders": selected_providers,
        "providerError": provider_error,
    }


def load_onnxruntime():
    try:
        import onnxruntime as ort
    except (ImportError, OSError) as error:
        raise SystemExit(
            "onnxruntime is not available. Install CPU support with: "
            'python -m pip install "rembg[cpu]==2.0.76"'
        ) from error
    return ort


def load_rembg():
    try:
        from rembg import new_session, remove
    except ImportError as error:
        raise SystemExit(
            "rembg is not installed. Install it with: python -m pip install \"rembg[cpu]\""
        ) from error
    return {"new_session": new_session, "remove": remove}


def remove_background(rembg, input_path: Path, output_path: Path, model: str, providers: list[str]) -> None:
    if not input_path.exists():
        raise SystemExit(f"input image not found: {input_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    session = rembg["new_session"](model, providers=providers)
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


def default_provider() -> str:
    configured = os.getenv("OUTFIT_REMBG_PROVIDER") or os.getenv("OUTFIT_VISION_DEVICE") or "auto"
    normalized = configured.strip().lower()
    if normalized in ("gpu", "webgpu"):
        return "auto"
    if normalized in ("auto", "cpu", "cuda", "dml"):
        return normalized
    return "auto"


def resolve_providers(provider: str) -> list[str]:
    ort = load_onnxruntime()
    available = ort.get_available_providers()
    if provider == "auto":
        for candidate in ("CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider"):
            if candidate in available:
                if candidate == "CUDAExecutionProvider" and missing_cuda_runtime_dlls():
                    continue
                return [candidate, "CPUExecutionProvider"] if candidate != "CPUExecutionProvider" else ["CPUExecutionProvider"]
        return ["CPUExecutionProvider"]

    providers = PROVIDER_PRESETS[provider]
    preferred = providers[0]
    if preferred not in available:
        install_hint = (
            'Install GPU support with: python -m pip install "rembg[gpu]==2.0.76"'
            if provider == "cuda"
            else "Install a compatible ONNX Runtime provider or use --provider cpu."
        )
        raise SystemExit(
            f"ONNX Runtime provider not available: {preferred}. "
            f"Available providers: {', '.join(available) or 'none'}. {install_hint}"
        )
    if preferred == "CUDAExecutionProvider":
        missing = missing_cuda_runtime_dlls()
        if missing:
            raise SystemExit(
                "ONNX Runtime CUDA provider is installed, but CUDA runtime DLLs are missing: "
                f"{', '.join(missing)}. Install the matching NVIDIA CUDA 13 runtime/cuBLAS, "
                "or use --provider cpu."
            )
    return providers


def missing_cuda_runtime_dlls() -> list[str]:
    if os.name != "nt":
        return []
    preload_cuda_runtime_dlls()
    missing = []
    for dll in WINDOWS_CUDA_RUNTIME_DLLS:
        try:
            ctypes.WinDLL(dll)
        except OSError:
            missing.append(dll)
    return missing


def preload_cuda_runtime_dlls() -> None:
    global _CUDA_DLLS_PRELOADED
    if _CUDA_DLLS_PRELOADED:
        return
    add_nvidia_dll_directories()
    ort = load_onnxruntime()
    preload = getattr(ort, "preload_dlls", None)
    if callable(preload):
        preload(cuda=True, cudnn=True, msvc=True)
    _CUDA_DLLS_PRELOADED = True


def add_nvidia_dll_directories() -> None:
    if os.name != "nt" or not hasattr(os, "add_dll_directory"):
        return
    spec = importlib.util.find_spec("nvidia")
    if not spec or not spec.submodule_search_locations:
        return
    roots = [Path(location) for location in spec.submodule_search_locations]
    relative_dirs = [
        Path("cu13") / "bin" / "x86_64",
        Path("cu13") / "bin",
        Path("cudnn") / "bin",
    ]
    for root in roots:
        for relative_dir in relative_dirs:
            dll_dir = root / relative_dir
            if not dll_dir.exists():
                continue
            handle = os.add_dll_directory(str(dll_dir))
            _CUDA_DLL_DIRECTORY_HANDLES.append(handle)


if __name__ == "__main__":
    raise SystemExit(main())
