import json
import os
from pathlib import Path
import subprocess
import sys


def test_vision_rembg_status_reports_optional_dependency(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            "scripts/vision_rembg.py",
            "--status",
            "--model-dir",
            str(tmp_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    status = json.loads(result.stdout)
    assert status["modelDir"] == str(tmp_path)
    assert "rembgInstalled" in status
    assert "modelExists" in status
    assert "models" in status
    assert status["model"] == "isnet-general-use"


def test_vision_rembg_fails_before_session_when_model_is_missing(tmp_path):
    env = fake_rembg_env(tmp_path)
    input_path = tmp_path / "input.png"
    output_path = tmp_path / "output.png"
    input_path.write_bytes(b"fake-png")

    result = subprocess.run(
        [
            sys.executable,
            "scripts/vision_rembg.py",
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
            "scripts/vision_rembg.py",
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
    )

    assert result.stderr == ""
    assert output_path.read_bytes() == b"removed:u2netp"


def test_vision_rembg_warmup_runs_with_temporary_input(tmp_path):
    env = fake_rembg_env(tmp_path)

    subprocess.run(
        [
            sys.executable,
            "scripts/vision_rembg.py",
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
    )


def fake_rembg_env(tmp_path: Path) -> dict[str, str]:
    package_dir = tmp_path / "fake_rembg" / "rembg"
    package_dir.mkdir(parents=True)
    (package_dir / "__init__.py").write_text(
        """
def new_session(model):
    if model == "missing":
        raise RuntimeError("new_session should not run without a model file")
    return model

def remove(data, session=None):
    return ("removed:" + str(session)).encode("utf-8")
""".strip(),
        encoding="utf-8",
    )
    env = os.environ.copy()
    env["PYTHONPATH"] = str(tmp_path / "fake_rembg")
    return env
