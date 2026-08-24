#!/usr/bin/env python3
"""Importación única e idempotente das fotografías históricas do Museo.

Le as copias marcadas con ``MUSEO-2026 - `` na carpeta Fotos_Images de Drive,
xera versións web e miniaturas, publícaas no R2 público, engade as filas que
falten na folla Fotos e incorpora as fotografías ao índice público.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from PIL import Image, ImageOps

SPREADSHEET_ID = "1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w"
SHEET_RANGE = "Fotos!A1:AB5000"
FOLDER_ID = "1FySxDvTHVNC20-a3I0wDU1v0s82VRiix"
PREFIX = "MUSEO-2026 - "
EXCLUDED_FRAGMENT = "Home a bordo dun buque"
BUCKET = "scpp-publico"
INDEX_KEY = "indices/galeria-publica-v1.json"
NAMESPACE = uuid.UUID("a4714804-6df7-4cc6-9c6b-a0be55ccfb82")
MAX_IMAGE = (2400, 2400)
THUMB_IMAGE = (720, 540)


def text(value: Any = "") -> str:
    return str(value or "").strip()


def required(name: str) -> str:
    value = text(os.environ.get(name))
    if not value:
        raise RuntimeError(f"Falta a variable obrigatoria {name}")
    return value


def download(drive: Any, file_id: str) -> bytes:
    target = io.BytesIO()
    request = drive.files().get_media(fileId=file_id)
    downloader = MediaIoBaseDownload(target, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return target.getvalue()


def jpeg(source: bytes, size: tuple[int, int], quality: int) -> bytes:
    with Image.open(io.BytesIO(source)) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode == "RGBA":
            background = Image.new("RGB", image.size, "white")
            background.paste(image, mask=image.getchannel("A"))
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail(size, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, "JPEG", quality=quality, optimize=True, progressive=True)
        return output.getvalue()


def title_data(filename: str) -> tuple[str, str, str]:
    title = filename.removeprefix(PREFIX).rsplit(".", 1)[0].strip()
    exact = re.search(r"(?<!\d)(\d{2})-(\d{2})-(19\d{2}|20\d{2})(?!\d)", title)
    if exact:
        day, month, year = exact.groups()
        return title, f"{day}/{month}/{year}", year
    years = re.findall(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", title)
    return title, "", years[-1] if years else ""


def main() -> None:
    info = json.loads(required("GOOGLE_SERVICE_ACCOUNT_JSON"))
    credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=[
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/spreadsheets",
        ],
    )
    sheets = build("sheets", "v4", credentials=credentials, cache_discovery=False)
    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
    r2 = boto3.client(
        "s3",
        endpoint_url=f"https://{required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=required("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )

    values = sheets.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID, range=SHEET_RANGE
    ).execute().get("values", [])
    if not values:
        raise RuntimeError("A folla Fotos está baleira")
    headers = [text(value) for value in values[0]]
    required_headers = {
        "Id_Foto", "Foto", "Titulo", "Data", "AnoAproximado", "PeFoto",
        "Procedencia", "DereitosUso", "EstadoRevision", "Publicar_Publica",
        "Destacada_Publica", "Publicar_Privada", "Destacada_Privada",
        "Calidade", "Observacions", "DataSubida", "SubidaPor",
        "Data_Revision", "Revisada_Por", "Data_Publicacion_Publica",
        "RutaR2_Publica", "CategoriaPublica",
    }
    missing_headers = sorted(required_headers - set(headers))
    if missing_headers:
        raise RuntimeError("Faltan columnas en Fotos: " + ", ".join(missing_headers))
    existing_ids = {text(row[0]) for row in values[1:] if row and text(row[0])}

    response = drive.files().list(
        q=f"'{FOLDER_ID}' in parents and trashed = false",
        fields="nextPageToken,files(id,name,mimeType)",
        pageSize=1000,
    ).execute()
    files = list(response.get("files", []))
    while response.get("nextPageToken"):
        response = drive.files().list(
            q=f"'{FOLDER_ID}' in parents and trashed = false",
            fields="nextPageToken,files(id,name,mimeType)",
            pageSize=1000,
            pageToken=response["nextPageToken"],
        ).execute()
        files.extend(response.get("files", []))
    selected = sorted(
        (
            item for item in files
            if text(item.get("name")).startswith(PREFIX)
            and EXCLUDED_FRAGMENT.lower() not in text(item.get("name")).lower()
        ),
        key=lambda item: text(item.get("name")),
    )
    if len(selected) != 33:
        raise RuntimeError(f"Esperábanse 33 fotografías e atopáronse {len(selected)}")

    try:
        current_index = json.loads(r2.get_object(Bucket=BUCKET, Key=INDEX_KEY)["Body"].read())
    except r2.exceptions.NoSuchKey:
        current_index = {"ok": True, "fotos": []}
    photos_by_id = {
        text(photo.get("idFoto") or photo.get("Id_Foto")): photo
        for photo in current_index.get("fotos", [])
        if text(photo.get("idFoto") or photo.get("Id_Foto"))
    }

    rows: list[list[Any]] = []
    uploaded = 0
    for item in selected:
        drive_id = text(item["id"])
        photo_id = str(uuid.uuid5(NAMESPACE, drive_id))
        title, date, year = title_data(text(item["name"]))
        original_key = f"fotos/orixinais/{photo_id}.jpg"
        thumb_key = f"miniaturas/galeria/{photo_id}.webp"

        source = download(drive, drive_id)
        original = jpeg(source, MAX_IMAGE, 88)
        thumb_jpeg = jpeg(source, THUMB_IMAGE, 80)
        with Image.open(io.BytesIO(thumb_jpeg)) as image:
            thumb_buffer = io.BytesIO()
            image.save(thumb_buffer, "WEBP", quality=78, method=6)
            thumb = thumb_buffer.getvalue()

        source_etag = hashlib.sha256(original).hexdigest()
        r2.put_object(
            Bucket=BUCKET, Key=original_key, Body=original, ContentType="image/jpeg",
            CacheControl="public, max-age=31536000, immutable",
            Metadata={"idfoto": photo_id, "orixe": "museo-pontevedra"},
        )
        r2.put_object(
            Bucket=BUCKET, Key=thumb_key, Body=thumb, ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
            Metadata={"idfoto": photo_id, "source-etag": source_etag},
        )
        uploaded += 1

        now = datetime.now(timezone.utc)
        photo = {
            "idFoto": photo_id,
            "rowId": photo_id,
            "titulo": title,
            "peFoto": title,
            "dataFoto": date,
            "anoAproximado": year,
            "procedencia": "Museo de Pontevedra / Arquivo da SCPP",
            "estadoRevision": "aprobada",
            "publicarPublica": True,
            "publicarPrivada": False,
            "rutaR2Publica": original_key,
            "rutaMiniaturaPublica": thumb_key,
            "urlPublica": f"/arquivos/publico/{original_key}?v={source_etag[:16]}",
            "urlMiniaturaPublica": f"/arquivos/publico/{thumb_key}?v={source_etag[:16]}",
            "orixinalVerificado": True,
            "tamanoOrixinal": len(original),
        }
        photos_by_id[photo_id] = photo

        if photo_id not in existing_ids:
            context = {
                "Id_Foto": photo_id,
                "Foto": f"Fotos_Images/{item['name']}",
                "Titulo": title,
                "Data": date,
                "AnoAproximado": year,
                "PeFoto": title,
                "Procedencia": "Museo de Pontevedra / Arquivo da SCPP",
                "DereitosUso": "Autorizada para a web",
                "EstadoRevision": "Aprobada",
                "Publicar_Publica": True,
                "Destacada_Publica": False,
                "Publicar_Privada": False,
                "Destacada_Privada": False,
                "Calidade": "Alta",
                "Observacions": f"Importación histórica. Referencia e descrición contrastadas. Drive ID: {drive_id}",
                "DataSubida": now.isoformat(),
                "SubidaPor": "importacion-museo-2026",
                "Data_Revision": now.isoformat(),
                "Revisada_Por": "importacion-museo-2026",
                "Data_Publicacion_Publica": now.isoformat(),
                "RutaR2_Publica": original_key,
                "CategoriaPublica": "Historia",
            }
            rows.append([context.get(header, "") for header in headers])

    if rows:
        sheets.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range="Fotos!A:AB",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": rows},
        ).execute()

    now = datetime.now(timezone.utc)
    index = {
        **current_index,
        "ok": True,
        "fotos": list(photos_by_id.values()),
        "total": len(photos_by_id),
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "IMPORTACION-MUSEO-2026",
        "version": "7",
    }
    r2.put_object(
        Bucket=BUCKET,
        Key=INDEX_KEY,
        Body=json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode(),
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=0, no-cache, must-revalidate",
    )
    print(f"Fotografías procesadas: {uploaded}; filas novas: {len(rows)}; total índice: {len(photos_by_id)}")


if __name__ == "__main__":
    main()
