#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import pathlib
import sys
import unicodedata


BASE_SCRIPT = pathlib.Path(__file__).with_name("audit-repertorio.py")


def canon(value) -> str:
    text = str(value or "").strip()
    try:
        return str(int(float(text.replace(",", "."))))
    except (TypeError, ValueError):
        return text


def basename(value) -> str:
    return pathlib.PurePosixPath(str(value or "").replace("\\", "/")).name


def slug_filename(filename: str) -> str:
    path = pathlib.PurePosixPath(filename)
    stem = unicodedata.normalize("NFD", path.stem)
    stem = "".join(ch for ch in stem if unicodedata.category(ch) != "Mn").lower()
    chars = []
    previous_dash = False
    for ch in stem:
        if ch.isalnum():
            chars.append(ch)
            previous_dash = False
        elif not previous_dash:
            chars.append("-")
            previous_dash = True
    slug = "".join(chars).strip("-")
    return f"{slug}{path.suffix.lower()}"


def derive_audio_key(row) -> str:
    explicit = str(row.get("R2Key") or "").strip().lstrip("/")
    if explicit:
        return explicit

    work_id = canon(row.get("NomeObra"))
    source_name = basename(row.get("AudioFile"))
    if not work_id or not source_name:
        return ""

    return f"repertorio/audios/{work_id}/{slug_filename(source_name)}"


def load_base_module():
    spec = importlib.util.spec_from_file_location("audit_repertorio_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Non se puido cargar {BASE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> int:
    module = load_base_module()
    # Mesma regra empregada na migración e na xeración do índice R2:
    # R2Key explícita ten prioridade; en caso contrario, ID de obra canonizado.
    module.derive_audio_key = derive_audio_key
    return module.main()


if __name__ == "__main__":
    sys.exit(main())
