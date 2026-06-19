import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest


def test_vision_rembg_status_reports_optional_dependency(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            str(script_path()),
            "--status",
            "--model-dir",
            str(tmp_path),
        ],
        check=True,
        capture_output=True,
        text=True,
        cwd=project_root(),
    )

    status = json.loads(result.stdout)
    assert status["modelDir"] == str(tmp_path)
    assert "rembgInstalled" in status
    assert "modelExists" in status
    assert "models" in status
    assert status["model"] == "isnet-general-use"


def test_vision_rembg_status_reports_missing_onnxruntime(tmp_path):
    blocker_dir = tmp_path / "blocker"
    package_dir = blocker_dir / "onnxruntime"
    package_dir.mkdir(parents=True)
    (package_dir / "__init__.py").write_text(
        'raise ImportError("fake missing onnxruntime")\n',
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["PYTHONPATH"] = extend_pythonpath(blocker_dir, env.get("PYTHONPATH"))

    result = subprocess.run(
        [
            sys.executable,
            str(script_path()),
            "--status",
            "--model-dir",
            str(tmp_path),
        ],
        check=True,
        capture_output=True,
        text=True,
        cwd=project_root(),
        env=env,
    )

    status = json.loads(result.stdout)
    assert status["onnxruntimeInstalled"] is False
    assert status["availableProviders"] == []
    assert "onnxruntime" in status["providerError"]


def test_vision_rembg_fails_before_session_when_model_is_missing(tmp_path):
    env = fake_rembg_env(tmp_path)
    input_path = tmp_path / "input.png"
    output_path = tmp_path / "output.png"
    input_path.write_bytes(b"fake-png")

    result = subprocess.run(
        [
            sys.executable,
            str(script_path()),
            "--input",
            str(input_path),
            "--output",
            str(output_path),
            "--model-dir",
            str(tmp_path / "models"),
        ],
        capture_output=True,
        text=True,
        env=env,
        cwd=project_root(),
    )

    assert result.returncode == 1
    assert "rembg model file not found" in result.stderr
    assert "new_session should not run without a model file" not in result.stderr


def test_vision_rembg_uses_installed_fallback_model(tmp_path):
    env = fake_rembg_env(tmp_path)
    model_dir = tmp_path / "models"
    model_dir.mkdir()
    (model_dir / "u2netp.onnx").write_text("fake-model", encoding="utf-8")
    input_path = tmp_path / "input.png"
    output_path = tmp_path / "output.png"
    input_path.write_bytes(b"fake-png")

    result = subprocess.run(
        [
            sys.executable,
            str(script_path()),
            "--input",
            str(input_path),
            "--output",
            str(output_path),
            "--model",
            "isnet-general-use",
            "--model-dir",
            str(model_dir),
        ],
        check=True,
        capture_output=True,
        text=True,
        env=env,
        cwd=project_root(),
    )

    assert result.stderr == ""
    assert output_path.read_bytes() == b"removed:u2netp:CPUExecutionProvider"


def test_vision_rembg_passes_selected_provider_to_session(tmp_path):
    env = fake_rembg_env(tmp_path)
    model_dir = tmp_path / "models"
    model_dir.mkdir()
    (model_dir / "u2netp.onnx").write_text("fake-model", encoding="utf-8")
    input_path = tmp_path / "input.png"
    output_path = tmp_path / "output.png"
    input_path.write_bytes(b"fake-png")

    result = subprocess.run(
        [
            sys.executable,
            str(script_path()),
            "--input",
            str(input_path),
            "--output",
            str(output_path),
            "--model-dir",
            str(model_dir),
            "--provider",
            "cpu",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=env,
        cwd=project_root(),
    )

    assert result.stderr == ""
    assert output_path.read_bytes() == b"removed:u2netp:CPUExecutionProvider"


def test_vision_rembg_auto_skips_cuda_when_runtime_dlls_are_missing(monkeypatch):
    module = load_vision_rembg_module()
    monkeypatch.setattr(module, "load_onnxruntime", lambda: FakeOnnxRuntime(["CUDAExecutionProvider", "CPUExecutionProvider"]))
    monkeypatch.setattr(module, "missing_cuda_runtime_dlls", lambda: ["cublasLt64_13.dll"])

    assert module.resolve_providers("auto") == ["CPUExecutionProvider"]


def test_vision_rembg_explicit_cuda_fails_when_runtime_dlls_are_missing(monkeypatch):
    module = load_vision_rembg_module()
    monkeypatch.setattr(module, "load_onnxruntime", lambda: FakeOnnxRuntime(["CUDAExecutionProvider", "CPUExecutionProvider"]))
    monkeypatch.setattr(module, "missing_cuda_runtime_dlls", lambda: ["cublasLt64_13.dll"])

    with pytest.raises(SystemExit) as error:
        module.resolve_providers("cuda")

    assert "cublasLt64_13.dll" in str(error.value)


def test_vision_rembg_warmup_runs_with_temporary_input(tmp_path):
    env = fake_rembg_env(tmp_path)

    subprocess.run(
        [
            sys.executable,
            str(script_path()),
            "--warmup",
            "--model",
            "silueta",
            "--model-dir",
            str(tmp_path / "models"),
        ],
        check=True,
        capture_output=True,
        text=True,
        env=env,
        cwd=project_root(),
    )


def fake_rembg_env(tmp_path: Path) -> dict[str, str]:
    fake_root = tmp_path / "fake_pythonpath"
    rembg_dir = fake_root / "rembg"
    rembg_dir.mkdir(parents=True)
    (rembg_dir / "__init__.py").write_text(
        """
def new_session(model, providers=None):
    if model == "missing":
        raise RuntimeError("new_session should not run without a model file")
    if providers:
        return model + ":" + ",".join(providers)
    return model

def remove(data, session=None):
    return ("removed:" + str(session)).encode("utf-8")
""".strip(),
        encoding="utf-8",
    )
    onnxruntime_dir = fake_root / "onnxruntime"
    onnxruntime_dir.mkdir()
    (onnxruntime_dir / "__init__.py").write_text(
        """
def get_device():
    return "CPU"

def get_available_providers():
    return ["CPUExecutionProvider"]

def preload_dlls(**_kwargs):
    return None
""".strip(),
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["PYTHONPATH"] = extend_pythonpath(fake_root, env.get("PYTHONPATH"))
    env["OUTFIT_REMBG_PROVIDER"] = "cpu"
    return env


def load_vision_rembg_module():
    spec = importlib.util.spec_from_file_location("vision_rembg_under_test", script_path())
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def script_path() -> Path:
    return project_root() / "scripts" / "vision_rembg.py"


def extend_pythonpath(path: Path, existing: str | None) -> str:
    entries = [str(path)]
    if existing:
        entries.append(existing)
    return os.pathsep.join(entries)


class FakeOnnxRuntime:
    def __init__(self, providers: list[str]):
        self.providers = providers

    def get_available_providers(self) -> list[str]:
        return self.providers

    def get_device(self) -> str:
        return "CPU"
