#!/usr/bin/env python3
"""Repara exclusivamente a miniatura da foto 402e6f34-... en R2 privado.

Non modifica a Sheet nin a imaxe orixinal. Só crea unha miniatura WEBP e
actualiza o rexistro dese Id_Foto no catálogo privado, verificando que ningún
outro rexistro cambia semanticamente.
"""
from __future__ import annotations

import copy
import io
import json
import os
from datetime import datetime, timezone

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from PIL import Image, ImageOps

PHOTO_ID = "402e6f34-d150-4dc8-a3c0-3e6f7c4c7308"
DRIVE_ID = "1ge5vrgaVWs3351RiKZ05T3aBS2R8cQjf"
EXPECTED_NAME = "402e6f34-d150-4dc8-a3c0-3e6f7c4c7308-Escaneado_20260802-1743.jpg"
EXPECTED_PARENT = "1FySxDvTHVNC20-a3I0wDU1v0s82VRiix"
BUCKET = "scpp-privado"
CATALOG_KEY = "indices/catalogo-fotos.json"
THUMB_KEY = f"fotos/editadas-miniaturas/{PHOTO_ID}-reparada.webp"
THUMB_SIZE = (720, 540)


def required(name: str) -> str:
    value = str(os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def photo_id(photo: dict) -> str:
    for key in ("idFoto", "Id_Foto", "id", "Id", "ID", "rowId", "Row ID"):
        value = str(photo.get(key) or "").strip()
        if value:
            return value
    return ""


def download(drive, file_id: str) -> bytes:
    target = io.BytesIO()
    downloader = MediaIoBaseDownload(target, drive.files().get_media(fileId=file_id))
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return target.getvalue()


def make_thumb(source: bytes) -> bytes:
    with Image.open(io.BytesIO(source)) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode == "RGBA":
            bg = Image.new("RGB", image.size, "white")
            bg.paste(image, mask=image.getchannel("A"))
            image = bg
        elif image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail(THUMB_SIZE, Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, "WEBP", quality=80, method=6)
        return out.getvalue()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main() -> None:
    info = json.loads(required("GOOGLE_SERVICE_ACCOUNT_JSON"))
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive.readonly"]
    )
    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
    meta = drive.files().get(fileId=DRIVE_ID, fields="id,name,mimeType,parents,trashed").execute()
    if meta.get("trashed"):
        raise RuntimeError("O ficheiro de Drive está na papeleira")
    if meta.get("name") != EXPECTED_NAME:
        raise RuntimeError(f"Nome de Drive inesperado: {meta.get('name')}")
    if EXPECTED_PARENT not in (meta.get("parents") or []):
        raise RuntimeError("O ficheiro non pertence á carpeta Fotos_Images de Produción")
    if not str(meta.get("mimeType") or "").startswith("image/"):
        raise RuntimeError("O ficheiro de Drive non é unha imaxe")

    r2 = boto3.client(
        "s3",
        endpoint_url=f"https://{required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=required("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )

    raw_index = r2.get_object(Bucket=BUCKET, Key=CATALOG_KEY)["Body"].read()
    index = json.loads(raw_index)
    photos = index.get("fotos")
    if not isinstance(photos, list):
        raise RuntimeError("O catálogo R2 non contén unha lista fotos válida")

    matches = [i for i, photo in enumerate(photos) if photo_id(photo) == PHOTO_ID]
    if len(matches) != 1:
        raise RuntimeError(f"Esperábase exactamente 1 rexistro {PHOTO_ID}; atopáronse {len(matches)}")
    target_pos = matches[0]

    before_other = {
        photo_id(photo): canonical(photo)
        for i, photo in enumerate(photos)
        if i != target_pos and photo_id(photo)
    }
    before_len = len(photos)

    source = download(drive, DRIVE_ID)
    thumb = make_thumb(source)
    if not thumb or len(thumb) > 1_500_000:
        raise RuntimeError(f"Miniatura inválida ou demasiado grande: {len(thumb)} bytes")

    r2.put_object(
        Bucket=BUCKET,
        Key=THUMB_KEY,
        Body=thumb,
        ContentType="image/webp",
        CacheControl="private, max-age=31536000, immutable",
        Metadata={"idfoto": PHOTO_ID, "tipo": "miniatura-reparada", "scope": "single-photo"},
    )

    new_index = copy.deepcopy(index)
    target = dict(new_index["fotos"][target_pos])
    target["rutaMiniaturaPrivada"] = THUMB_KEY
    target["miniaturaReparadaEn"] = datetime.now(timezone.utc).isoformat()
    target["miniaturaReparacion"] = "402e-only"
    new_index["fotos"][target_pos] = target

    if len(new_index["fotos"]) != before_len:
        raise RuntimeError("A reparación alteraría o número de fotografías")
    after_other = {
        photo_id(photo): canonical(photo)
        for i, photo in enumerate(new_index["fotos"])
        if i != target_pos and photo_id(photo)
    }
    if before_other != after_other:
        raise RuntimeError("Detectouse un cambio noutro rexistro; abortando")

    r2.put_object(
        Bucket=BUCKET,
        Key=CATALOG_KEY,
        Body=json.dumps(new_index, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
        CacheControl="private, max-age=0, no-cache, must-revalidate",
    )

    verify = json.loads(r2.get_object(Bucket=BUCKET, Key=CATALOG_KEY)["Body"].read())
    vmatches = [p for p in verify.get("fotos", []) if photo_id(p) == PHOTO_ID]
    if len(vmatches) != 1 or vmatches[0].get("rutaMiniaturaPrivada") != THUMB_KEY:
        raise RuntimeError("A verificación posterior do catálogo fallou")
    r2.head_object(Bucket=BUCKET, Key=THUMB_KEY)
    print(f"OK: reparada só {PHOTO_ID}; miniatura={THUMB_KEY}; outros_rexistros={before_len - 1} intactos")


if __name__ == "__main__":
    main()
