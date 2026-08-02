#!/usr/bin/env python3
"""Audita fotografías públicas de la Sheet contra Cloudflare R2.

Modos:
- plan: comprueba y genera informe sin modificar R2.
- upload: sube únicamente objetos ausentes, nunca sobrescribe.

La Sheet continúa siendo el catálogo; Drive, la copia maestra; R2, el origen web.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import mimetypes
import os
import pathlib
import sys
import tempfile
from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

FOTOS_SPREADSHEET_ID = os.getenv(
    "FOTOS_SPREADSHEET_ID", "1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w"
)
FOTOS_TAB = os.getenv("FOTOS_TAB", "Fotos")
FOTOS_FOLDER_ID = os.getenv(
    "FOTOS_FOLDER_ID", "1FySxDvTHVNC20-a3I0wDU1v0s82VRiix"
)


@dataclass(frozen=True)
class Foto:
    id_foto: str
    titulo: str
    source_name: str
    r2_key: str


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable obligatoria {name}")
    return value


def credentials():
    return service_account.Credentials.from_service_account_info(
        json.loads(required_env("GOOGLE_SERVICE_ACCOUNT_JSON")), scopes=SCOPES
    )


def truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {
        "true", "verdadero", "verdadeiro", "si", "sí", "yes", "y", "1"
    }


def basename(value: str) -> str:
    return pathlib.PurePosixPath(str(value or "").replace("\\", "/")).name


def sheet_rows(sheets) -> list[dict[str, str]]:
    values = (
        sheets.spreadsheets()
        .values()
        .get(
            spreadsheetId=FOTOS_SPREADSHEET_ID,
            range=f"'{FOTOS_TAB}'!A:AB",
            valueRenderOption="FORMATTED_VALUE",
        )
        .execute()
        .get("values", [])
    )
    if not values:
        return []
    headers = [str(value).strip() for value in values[0]]
    rows: list[dict[str, str]] = []
    for raw in values[1:]:
        padded = list(raw) + [""] * (len(headers) - len(raw))
        rows.append(dict(zip(headers, (str(value).strip() for value in padded))))
    return rows


def public_photos(rows: list[dict[str, str]]) -> list[Foto]:
    result: list[Foto] = []
    for row in rows:
        if str(row.get("EstadoRevision", "")).strip().lower() != "aprobada":
            continue
        if not truthy(row.get("Publicar_Publica", "")):
            continue
        id_foto = str(row.get("Id_Foto", "")).strip()
        source_name = basename(row.get("Foto", ""))
        r2_key = str(row.get("RutaR2_Publica", "")).strip().lstrip("/")
        titulo = str(row.get("Titulo", "")).strip()
        if id_foto and source_name and r2_key:
            result.append(Foto(id_foto, titulo, source_name, r2_key))
    return result


def list_folder_files(drive, folder_id: str) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = {}
    pending = [folder_id]
    while pending:
        current = pending.pop()
        token = None
        while True:
            response = (
                drive.files()
                .list(
                    q=f"'{current}' in parents and trashed = false",
                    fields="nextPageToken,files(id,name,mimeType,size)",
                    pageSize=1000,
                    pageToken=token,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                )
                .execute()
            )
            for entry in response.get("files", []):
                if entry.get("mimeType") == "application/vnd.google-apps.folder":
                    pending.append(entry["id"])
                else:
                    index.setdefault(entry["name"], []).append(entry)
            token = response.get("nextPageToken")
            if not token:
                break
    return index


def r2_client():
    account_id = required_env("R2_ACCOUNT_ID")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def head_object(client, bucket: str, key: str):
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def download_file(drive, file_id: str, destination: pathlib.Path) -> tuple[int, str]:
    request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=8 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    data = buffer.getvalue()
    destination.write_bytes(data)
    return len(data), hashlib.sha256(data).hexdigest()


def main() -> int:
    mode = os.getenv("FOTOS_R2_MODE", "plan").strip().lower()
    if mode not in {"plan", "upload"}:
        raise RuntimeError("FOTOS_R2_MODE debe ser plan o upload")

    creds = credentials()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    client = r2_client()
    bucket = required_env("R2_BUCKET")
    report_path = pathlib.Path(os.getenv("REPORT_PATH", "fotos-r2-audit.csv"))

    fotos = public_photos(sheet_rows(sheets))
    drive_index = list_folder_files(drive, FOTOS_FOLDER_ID)

    verified = planned = uploaded = errors = 0
    fields = [
        "id_foto", "titulo", "source_name", "r2_key", "status",
        "size", "sha256", "detail"
    ]

    with report_path.open("w", newline="", encoding="utf-8-sig") as report:
        writer = csv.DictWriter(report, fieldnames=fields)
        writer.writeheader()

        for foto in fotos:
            base = {
                "id_foto": foto.id_foto,
                "titulo": foto.titulo,
                "source_name": foto.source_name,
                "r2_key": foto.r2_key,
                "size": "",
                "sha256": "",
                "detail": "",
            }

            remote = head_object(client, bucket, foto.r2_key)
            if remote is not None:
                writer.writerow({
                    **base,
                    "status": "VERIFIED_EXISTING",
                    "size": int(remote.get("ContentLength", 0)),
                    "sha256": (remote.get("Metadata") or {}).get("sha256", ""),
                })
                verified += 1
                continue

            matches = drive_index.get(foto.source_name, [])
            if not matches:
                writer.writerow({
                    **base,
                    "status": "ERROR_SOURCE_NOT_FOUND",
                    "detail": "La ruta está en la Sheet, pero el archivo no aparece en Fotos_Images",
                })
                errors += 1
                continue
            if len(matches) > 1:
                writer.writerow({
                    **base,
                    "status": "ERROR_SOURCE_AMBIGUOUS",
                    "detail": f"Hay {len(matches)} archivos de Drive con el mismo nombre",
                })
                errors += 1
                continue

            source = matches[0]
            source_size = int(source.get("size", 0) or 0)
            if mode == "plan":
                writer.writerow({
                    **base,
                    "status": "MISSING_PLANNED",
                    "size": source_size,
                    "detail": "Falta en R2 y se puede recuperar desde Drive",
                })
                planned += 1
                continue

            suffix = pathlib.Path(foto.source_name).suffix or ".bin"
            with tempfile.TemporaryDirectory(prefix="scpp-fotos-r2-") as tmp:
                local = pathlib.Path(tmp) / f"source{suffix}"
                actual_size, sha256 = download_file(drive, source["id"], local)
                if source_size and actual_size != source_size:
                    writer.writerow({
                        **base,
                        "status": "ERROR_DOWNLOAD_SIZE",
                        "size": actual_size,
                        "sha256": sha256,
                        "detail": f"Drive indicó {source_size} bytes",
                    })
                    errors += 1
                    continue

                mime = mimetypes.guess_type(foto.source_name)[0] or "application/octet-stream"
                with local.open("rb") as body:
                    client.put_object(
                        Bucket=bucket,
                        Key=foto.r2_key,
                        Body=body,
                        ContentLength=actual_size,
                        ContentType=mime,
                        CacheControl="public, max-age=31536000, immutable",
                        Metadata={
                            "sha256": sha256,
                            "source-drive-id": source["id"],
                            "id-foto": foto.id_foto,
                        },
                    )

                check = head_object(client, bucket, foto.r2_key)
                if check is None or int(check.get("ContentLength", -1)) != actual_size:
                    writer.writerow({
                        **base,
                        "status": "ERROR_VERIFY",
                        "detail": "La verificación posterior a la subida no coincide",
                    })
                    errors += 1
                    continue

                writer.writerow({
                    **base,
                    "status": "UPLOADED_VERIFIED",
                    "size": actual_size,
                    "sha256": sha256,
                })
                uploaded += 1

    print(
        f"Modo={mode} | públicas={len(fotos)} | existentes={verified} | "
        f"faltantes_planificados={planned} | subidas={uploaded} | errores={errors}"
    )
    print(f"Informe: {report_path}")
    return 1 if errors else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
