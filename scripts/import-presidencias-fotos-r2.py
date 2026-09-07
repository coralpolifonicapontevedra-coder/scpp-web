#!/usr/bin/env python3
"""Importa as tres fotografías institucionais de Presidencias.

Le as copias PRESIDENCIA-2026 da carpeta Fotos_Images de produción, xera un
orixinal web en R2 e crea a fila correspondente na folla Fotos. As fotografías
NON se incorporan ao índice da galería pública nin se marcan para publicar.
"""

from __future__ import annotations

import io
import json
import os
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
BUCKET = "scpp-publico"
MAX_IMAGE = (2400, 2400)

PHOTOS = {
    "PRESIDENCIA-2026 - Augusto García Sánchez.jpg": {
        "id": "presidencia-augusto-garcia-sanchez",
        "title": "Augusto García Sánchez",
    },
    "PRESIDENCIA-2026 - Xosé Carlos Valle Pérez.png": {
        "id": "presidencia-xose-carlos-valle-perez",
        "title": "Xosé Carlos Valle Pérez",
    },
    "PRESIDENCIA-2026 - José Raposeiras Correa.png": {
        "id": "presidencia-jose-raposeiras-correa",
        "title": "José Raposeiras Correa",
    },
}


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


def jpeg(source: bytes) -> bytes:
    with Image.open(io.BytesIO(source)) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode == "RGBA":
            background = Image.new("RGB", image.size, "white")
            background.paste(image, mask=image.getchannel("A"))
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail(MAX_IMAGE, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, "JPEG", quality=90, optimize=True, progressive=True)
        return output.getvalue()


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
        "Id_Foto", "Foto", "Titulo", "PeFoto", "Procedencia", "DereitosUso",
        "EstadoRevision", "Publicar_Publica", "Destacada_Publica",
        "Publicar_Privada", "Destacada_Privada", "Calidade", "Observacions",
        "DataSubida", "SubidaPor", "Data_Revision", "Revisada_Por",
        "RutaR2_Publica",
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

    by_name = {text(item.get("name")): item for item in files}
    missing = [name for name in PHOTOS if name not in by_name]
    if missing:
        raise RuntimeError("Faltan fotografías en Fotos_Images: " + ", ".join(missing))

    now = datetime.now(timezone.utc)
    rows: list[list[Any]] = []
    uploaded = 0

    for filename, data in PHOTOS.items():
        item = by_name[filename]
        photo_id = data["id"]
        title = data["title"]
        original_key = f"fotos/orixinais/{photo_id}.jpg"

        source = download(drive, text(item["id"]))
        original = jpeg(source)
        r2.put_object(
            Bucket=BUCKET,
            Key=original_key,
            Body=original,
            ContentType="image/jpeg",
            CacheControl="public, max-age=31536000, immutable",
            Metadata={"idfoto": photo_id, "uso": "presidencias"},
        )
        uploaded += 1

        if photo_id in existing_ids:
            continue

        context = {
            "Id_Foto": photo_id,
            "Foto": f"Fotos_Images/{filename}",
            "Titulo": title,
            "PeFoto": title,
            "Procedencia": "Arquivo documental da SCPP · Presidencias",
            "DereitosUso": "Uso institucional na web; non publicar na galería",
            "EstadoRevision": "Aprobada",
            "Publicar_Publica": False,
            "Destacada_Publica": False,
            "Publicar_Privada": False,
            "Destacada_Privada": False,
            "Calidade": "Alta",
            "Observacions": "Uso exclusivo na páxina Historia · Presidencias. Non publicar nas galerías.",
            "DataSubida": now.isoformat(),
            "SubidaPor": "importacion-presidencias-2026",
            "Data_Revision": now.isoformat(),
            "Revisada_Por": "importacion-presidencias-2026",
            "RutaR2_Publica": original_key,
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

    print(
        f"Fotografías de presidencias procesadas: {uploaded}; "
        f"filas novas en Fotos: {len(rows)}; galería pública: non modificada"
    )


if __name__ == "__main__":
    main()
