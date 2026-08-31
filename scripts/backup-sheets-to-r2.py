#!/usr/bin/env python3
"""Copia espejo de Google Sheets de producción en R2 y Google Drive.

- Exporta todas las hojas de cálculo accesibles por la cuenta de servicio.
- Excluye PREVIEW, TEST y copias BACKUP.
- Guarda una única copia XLSX por spreadsheet bajo backups/sheets/current/ en R2.
- Guarda una única copia XLSX por spreadsheet en la carpeta ESPELLO de Drive.
- Cada ejecución sobrescribe la copia anterior; no acumula históricos.
- Si desaparece una hoja de producción, elimina su copia obsoleta en ambos destinos.
- Nunca modifica ninguna hoja de Google original ni objetos R2 fuera del prefijo de backup.
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
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

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
    scopes = ["https://www.googleapis.com/auth/drive"]
    creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
    return creds, str(info.get("client_email") or "").strip()


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


def check_drive_folder(drive, folder_id: str) -> dict:
    return drive.files().get(
        fileId=folder_id,
        fields="id,name,mimeType,capabilities(canAddChildren)",
        supportsAllDrives=True,
    ).execute()


def list_drive_mirror_files(drive, folder_id: str) -> list[dict]:
    items: list[dict] = []
    token = None
    while True:
        response = drive.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            fields="nextPageToken,files(id,name,mimeType,appProperties)",
            pageSize=1000,
            pageToken=token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        items.extend(response.get("files", []))
        token = response.get("nextPageToken")
        if not token:
            break
    return items


def upsert_drive_mirror(drive, folder_id: str, existing_by_source: dict[str, dict], source_id: str, source_name: str, data: bytes, now: str) -> str:
    filename = f"BACKUP - {source_name} -- {source_id}.xlsx"
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=MIME_XLSX, resumable=False)
    existing = existing_by_source.get(source_id)
    body = {
        "name": filename,
        "appProperties": {
            "backup-kind": "scpp-sheet-mirror",
            "source-sheet-id": source_id,
            "source-sheet-name": source_name[:120],
            "backup-generated-at": now,
        },
    }
    if existing:
        result = drive.files().update(
            fileId=existing["id"],
            body=body,
            media_body=media,
            fields="id,name",
            supportsAllDrives=True,
        ).execute()
        return result["id"]

    body["parents"] = [folder_id]
    result = drive.files().create(
        body=body,
        media_body=media,
        fields="id,name",
        supportsAllDrives=True,
    ).execute()
    return result["id"]


def main() -> int:
    creds, service_email = credentials()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    client = r2_client()
    bucket = required_env("R2_BUCKET")
    drive_folder_id = required_env("DRIVE_BACKUP_FOLDER_ID")
    now = datetime.now(timezone.utc).isoformat()

    spreadsheets = list_spreadsheets(drive)
    if not spreadsheets:
        raise RuntimeError("La cuenta de servicio no ve ninguna Sheet de producción; se cancela sin borrar backups.")

    drive_ready = True
    drive_error = ""
    existing_drive_files: list[dict] = []
    existing_by_source: dict[str, dict] = {}
    try:
        folder = check_drive_folder(drive, drive_folder_id)
        if folder.get("mimeType") != "application/vnd.google-apps.folder":
            raise RuntimeError("DRIVE_BACKUP_FOLDER_ID no apunta a una carpeta")
        if not (folder.get("capabilities") or {}).get("canAddChildren", False):
            raise PermissionError("La cuenta de servicio no tiene permiso de escritura en la carpeta de backup")
        existing_drive_files = list_drive_mirror_files(drive, drive_folder_id)
        for entry in existing_drive_files:
            props = entry.get("appProperties") or {}
            if props.get("backup-kind") == "scpp-sheet-mirror" and props.get("source-sheet-id"):
                existing_by_source[props["source-sheet-id"]] = entry
    except Exception as exc:  # noqa: BLE001
        drive_ready = False
        drive_error = f"{type(exc).__name__}: {exc}"
        print(f"AVISO: copia en Drive no disponible: {drive_error}", file=sys.stderr)
        if service_email:
            print(f"Cuenta de servicio que necesita acceso de editor a ESPELLO: {service_email}", file=sys.stderr)

    manifest = {
        "generatedAt": now,
        "bucket": bucket,
        "prefix": PREFIX,
        "driveFolderId": drive_folder_id,
        "driveReady": drive_ready,
        "count": len(spreadsheets),
        "items": [],
        "errors": [],
    }
    if drive_error:
        manifest["errors"].append({"destination": "drive", "error": drive_error})

    desired_keys: set[str] = set()
    desired_source_ids: set[str] = set()

    for item in spreadsheets:
        file_id = item["id"]
        name = item.get("name") or file_id
        key = f"{PREFIX}{slug(name)}--{file_id}.xlsx"
        record = {
            "id": file_id,
            "name": name,
            "modifiedTime": item.get("modifiedTime"),
            "createdTime": item.get("createdTime"),
            "r2Key": key,
            "driveBackupId": None,
            "bytes": None,
        }
        try:
            data = export_xlsx(drive, file_id)
            record["bytes"] = len(data)

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
            print(f"R2 OK     {name} -> {key} ({len(data)} bytes)")

            if drive_ready:
                drive_backup_id = upsert_drive_mirror(
                    drive,
                    drive_folder_id,
                    existing_by_source,
                    file_id,
                    name,
                    data,
                    now,
                )
                record["driveBackupId"] = drive_backup_id
                desired_source_ids.add(file_id)
                print(f"DRIVE OK  {name} -> {drive_backup_id}")

            manifest["items"].append(record)
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
    stale_r2 = sorted(existing - desired_keys)
    for key in stale_r2:
        client.delete_object(Bucket=bucket, Key=key)
        print(f"DELETE R2 obsoleto: {key}")

    stale_drive = []
    if drive_ready:
        for entry in existing_drive_files:
            props = entry.get("appProperties") or {}
            source_id = props.get("source-sheet-id")
            if props.get("backup-kind") == "scpp-sheet-mirror" and source_id and source_id not in desired_source_ids:
                drive.files().delete(fileId=entry["id"], supportsAllDrives=True).execute()
                stale_drive.append(entry["id"])
                print(f"DELETE DRIVE obsoleto: {entry.get('name')} ({entry['id']})")

    print(
        f"Backup completado: {len(spreadsheets)} Sheets, "
        f"{len(stale_r2)} copias R2 obsoletas y {len(stale_drive)} copias Drive obsoletas eliminadas."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR FATAL: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
