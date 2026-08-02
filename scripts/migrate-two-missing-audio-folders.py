#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import io
import json
import mimetypes
import os
import pathlib
import tempfile
import unicodedata

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
FOLDERS = {
    "1vDumZ8_xkFMvltbFu6zJH-VDOtwn84s6": {
        "24": {
            "Adios ríos, soprano.m4a": ("404", "Soprano", 1),
            "Adios ríos contraltos.m4a": ("405", "Contralto", 2),
            "Adios ríos, tenor.m4a": ("406", "Tenor", 3),
            "Adios ríos bajo.mp4": ("407", "Baixo", 4),
        }
    },
    "1MlnXEvER_eFiTsvv62EftvwvZ9P6JrOI": {
        "12": {
            "Agnus dei Potterfield soprano.mp4": ("408", "Soprano", 1),
            "Agnus dei Potterfield contralto.mp4": ("409", "Contralto", 2),
            "Agnus dei Potterfield tenor.mp4": ("410", "Tenor", 3),
            "Agnus dei Potterfield bajo.mp4": ("411", "Baixo", 4),
        }
    },
}


def credentials():
    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)


def slug_filename(filename: str) -> str:
    path = pathlib.PurePosixPath(filename)
    stem = unicodedata.normalize("NFD", path.stem)
    stem = "".join(ch for ch in stem if unicodedata.category(ch) != "Mn").lower()
    chars = []
    dashed = False
    for ch in stem:
        if ch.isalnum():
            chars.append(ch)
            dashed = False
        elif not dashed:
            chars.append("-")
            dashed = True
    return f"{''.join(chars).strip('-')}{path.suffix.lower()}"


def download(drive, file_id: str, destination: pathlib.Path) -> tuple[int, str]:
    request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=8 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    data = buffer.getvalue()
    destination.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def main() -> None:
    mode = os.getenv("MIGRATION_MODE", "plan").strip().lower()
    if mode not in {"plan", "upload"}:
        raise RuntimeError("MIGRATION_MODE debe ser plan o upload")

    drive = build("drive", "v3", credentials=credentials(), cache_discovery=False)
    account_id = os.environ["R2_ACCOUNT_ID"]
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = os.environ["R2_BUCKET"]

    total = uploaded = existing = 0
    for folder_id, works in FOLDERS.items():
        response = drive.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            fields="files(id,name,mimeType,size)",
            pageSize=1000,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        by_name = {item["name"]: item for item in response.get("files", [])}

        for work_id, files in works.items():
            for filename, (record_id, voice, order) in files.items():
                total += 1
                source = by_name.get(filename)
                if not source:
                    raise RuntimeError(f"No aparece en Drive: {filename}")
                key = f"repertorio/audios/{work_id}/{slug_filename(filename)}"
                try:
                    head = client.head_object(Bucket=bucket, Key=key)
                except Exception:
                    head = None
                if head is not None:
                    existing += 1
                    print(f"EXISTE {record_id} {voice} {key}")
                    continue
                if mode == "plan":
                    print(f"PLAN {record_id} {voice} orde={order} {filename} -> {key}")
                    continue
                with tempfile.TemporaryDirectory(prefix="scpp-r2-extra-") as tmp:
                    local = pathlib.Path(tmp) / pathlib.Path(filename).name
                    size, sha256 = download(drive, source["id"], local)
                    mime = mimetypes.guess_type(filename)[0] or source.get("mimeType") or "application/octet-stream"
                    with local.open("rb") as body:
                        client.put_object(
                            Bucket=bucket,
                            Key=key,
                            Body=body,
                            ContentLength=size,
                            ContentType=mime,
                            Metadata={"sha256": sha256, "source-drive-id": source["id"], "record-id": record_id},
                        )
                    check = client.head_object(Bucket=bucket, Key=key)
                    if int(check.get("ContentLength", -1)) != size:
                        raise RuntimeError(f"Verificación de tamaño fallida para {key}")
                    uploaded += 1
                    print(f"SUBIDO {record_id} {voice} {size} bytes {key}")

    print(f"Audios especiais: total={total}, existentes={existing}, subidos={uploaded}, modo={mode}")


if __name__ == "__main__":
    main()
