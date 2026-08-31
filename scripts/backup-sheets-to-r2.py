#!/usr/bin/env python3
"""Copia espejo de Google Sheets de producción en Cloudflare R2.

- Exporta todas las hojas de cálculo accesibles por la cuenta de servicio.
- Excluye PREVIEW, TEST y copias BACKUP.
- Guarda una única copia XLSX por spreadsheet bajo backups/sheets/current/.
- Cada ejecución sobrescribe la copia anterior.
- Si desaparece una hoja de producción, elimina su copia obsoleta del prefijo de backup.
- Nunca modifica ninguna hoja de Google ni objetos fuera del prefijo de backup.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

MIME_SHEET = "application/vnd.google-apps.spreadsheet"
MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PREFIX = os.getenv("BACKUP_PREFIX", "backups/sheets/current/").strip().lstrip("/")
if PREFIX and not PREFIX.endswith("/"):
    PREFIX += "/"

EXCLUDED_PREFIXES = tuple(
    item.strip().casefold()
    for item in os.getenv(
        "BACKUP_EXCLUDED_PREFIXES",
        "SCPP PREVIEW -,TEST -,BACKUP -,SCPP_BACKUP"
    ).split(",")
    if item.strip()
)


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable obligatoria {name}")
    return value


def credentials():
    info = json.loads(required_env("GOOGLE_SERVICE_ACCOUNT_JSON"))
    scopes = ["https://www.googleapis.com/auth/drive.readonly"]
    return service_account.Credentials.from_service_account_info(info, scopes=scopes)


def slug(text: str) -> str:
    value = unicodedata.normalize("NFD", text or "")
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.casefold()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "sheet"


def excluded(name: str) -> bool:
    folded = (name or "").strip().casefold()
    return any(folded.startswith(prefix) for prefix in EXCLUDED_PREFIXES)


def list_spreadsheets(drive) -> list[dict]:
    files: list[dict] = []
    token = None
    while True:
        response = drive.files().list(
            q=f"mimeType = '{MIME_SHEET}' and trashed = false",
            fields="nextPageToken,files(id,name,modifiedTime,createdTime,size,owners(emailAddress),driveId)",
            pageSize=1000,
            pageToken=token,
            spaces="drive",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        files.extend(item for item in response.get("files", []) if not excluded(item.get("name", "")))
        token = response.get("nextPageToken")
        if not token:
            break
    return sorted(files, key=lambda item: (item.get("name", "").casefold(), item.get("id", "")))


def export_xlsx(drive, file_id: str) -> bytes:
    request = drive.files().export_media(fileId=file_id, mimeType=MIME_XLSX)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=8 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buffer.getvalue()


def r2_client():
    account_id = required_env("R2_ACCOUNT_ID")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def list_backup_keys(client, bucket: str) -> set[str]:
    keys: set[str] = set()
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": PREFIX, "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        response = client.list_objects_v2(**kwargs)
        keys.update(obj["Key"] for obj in response.get("Contents", []))
        if not response.get("IsTruncated"):
            break
        token = response.get("NextContinuationToken")
    return keys


def main() -> int:
    creds = credentials()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    client = r2_client()
    bucket = required_env("R2_BUCKET")
    now = datetime.now(timezone.utc).isoformat()

    spreadsheets = list_spreadsheets(drive)
    if not spreadsheets:
        raise RuntimeError("La cuenta de servicio no ve ninguna Sheet de producción; se cancela sin borrar backups.")

    manifest = {
        "generatedAt": now,
        "bucket": bucket,
        "prefix": PREFIX,
        "count": len(spreadsheets),
        "items": [],
        "errors": [],
    }
    desired_keys: set[str] = set()

    for item in spreadsheets:
        file_id = item["id"]
        name = item.get("name") or file_id
        key = f"{PREFIX}{slug(name)}--{file_id}.xlsx"
        try:
            data = export_xlsx(drive, file_id)
            client.put_object(
                Bucket=bucket,
                Key=key,
                Body=data,
                ContentLength=len(data),
                ContentType=MIME_XLSX,
                Metadata={
                    "source-drive-id": file_id,
                    "source-name": name[:900],
                    "backup-generated-at": now,
                },
            )
            desired_keys.add(key)
            manifest["items"].append({
                "id": file_id,
                "name": name,
                "modifiedTime": item.get("modifiedTime"),
                "createdTime": item.get("createdTime"),
                "key": key,
                "bytes": len(data),
            })
            print(f"OK  {name} -> {key} ({len(data)} bytes)")
        except Exception as exc:  # noqa: BLE001
            detail = f"{type(exc).__name__}: {exc}"
            manifest["errors"].append({"id": file_id, "name": name, "error": detail})
            print(f"ERROR {name}: {detail}", file=sys.stderr)

    manifest_key = f"{PREFIX}manifest.json"
    desired_keys.add(manifest_key)
    client.put_object(
        Bucket=bucket,
        Key=manifest_key,
        Body=json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
    )

    if manifest["errors"]:
        print("Hay errores: no se eliminan copias obsoletas para evitar pérdidas accidentales.", file=sys.stderr)
        return 1

    existing = list_backup_keys(client, bucket)
    stale = sorted(existing - desired_keys)
    for key in stale:
        client.delete_object(Bucket=bucket, Key=key)
        print(f"DELETE copia obsoleta: {key}")

    print(f"Backup completado: {len(spreadsheets)} Sheets, {len(stale)} copias obsoletas eliminadas.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR FATAL: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
