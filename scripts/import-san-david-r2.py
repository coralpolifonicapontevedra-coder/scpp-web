#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import io
import json
import os
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
DRIVE_FILE_ID = "1eFX4RgrgWbbmk7nsqiVIYn0xqsediyZ6"
BUCKET = "scpp-publico"
INDEX_KEY = "indices/galeria-publica-v1.json"
NAMESPACE = uuid.UUID("a4714804-6df7-4cc6-9c6b-a0be55ccfb82")
PHOTO_ID = str(uuid.uuid5(NAMESPACE, DRIVE_FILE_ID))
ORIGINAL_KEY = f"fotos/orixinais/{PHOTO_ID}.jpg"
THUMB_KEY = f"miniaturas/galeria/{PHOTO_ID}.webp"


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


def render(source: bytes, size: tuple[int, int], quality: int, fmt: str) -> bytes:
    with Image.open(io.BytesIO(source)) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode == "RGBA":
            bg = Image.new("RGB", image.size, "white")
            bg.paste(image, mask=image.getchannel("A"))
            image = bg
        elif image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail(size, Image.Resampling.LANCZOS)
        out = io.BytesIO()
        if fmt == "JPEG":
            image.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
        else:
            image.save(out, "WEBP", quality=quality, method=6)
        return out.getvalue()


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
    headers = [text(v) for v in values[0]]
    existing_ids = {text(row[0]) for row in values[1:] if row and text(row[0])}

    source = download(drive, DRIVE_FILE_ID)
    original = render(source, (2400, 2400), 90, "JPEG")
    thumb = render(source, (900, 680), 82, "WEBP")
    etag = hashlib.sha256(original).hexdigest()

    r2.put_object(
        Bucket=BUCKET, Key=ORIGINAL_KEY, Body=original,
        ContentType="image/jpeg", CacheControl="public, max-age=31536000, immutable",
        Metadata={"idfoto": PHOTO_ID, "orixe": "arquivo-scpp-castelao"},
    )
    r2.put_object(
        Bucket=BUCKET, Key=THUMB_KEY, Body=thumb,
        ContentType="image/webp", CacheControl="public, max-age=31536000, immutable",
        Metadata={"idfoto": PHOTO_ID, "source-etag": etag},
    )

    now = datetime.now(timezone.utc)
    if PHOTO_ID not in existing_ids:
        context = {
            "Id_Foto": PHOTO_ID,
            "Foto": "Panos Castelao/San David",
            "Titulo": "Pano de San David de Castelao",
            "Data": "",
            "AnoAproximado": "1926",
            "Lugar": "Pontevedra",
            "Concerto": "",
            "Evento": "Patrimonio histórico da SCPP",
            "PeFoto": "Pano de San David deseñado por Castelao para a Sociedade Coral Polifónica de Pontevedra.",
            "Autor": "Alfonso Daniel Rodríguez Castelao",
            "Procedencia": "Arquivo SCPP",
            "DereitosUso": "Autorizada para a web",
            "EstadoRevision": "Aprobada",
            "Publicar_Publica": True,
            "Destacada_Publica": False,
            "Publicar_Privada": False,
            "Destacada_Privada": False,
            "Calidade": "Alta",
            "Observacions": f"Importado do arquivo de Panos Castelao. Drive ID: {DRIVE_FILE_ID}",
            "DataSubida": now.isoformat(),
            "SubidaPor": "arquivo-scpp-castelao",
            "Data_Revision": now.isoformat(),
            "Revisada_Por": "arquivo-scpp-castelao",
            "Data_Publicacion_Publica": now.isoformat(),
            "RutaR2_Publica": ORIGINAL_KEY,
            "CategoriaPublica": "Historia",
        }
        row = [context.get(header, "") for header in headers]
        sheets.spreadsheets().values().append(
            spreadsheetId=SPREADSHEET_ID,
            range="Fotos!A:AB",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": [row]},
        ).execute()

    try:
        current = json.loads(r2.get_object(Bucket=BUCKET, Key=INDEX_KEY)["Body"].read())
    except r2.exceptions.NoSuchKey:
        current = {"ok": True, "fotos": []}
    fotos = list(current.get("fotos", []))
    foto = {
        "idFoto": PHOTO_ID,
        "rowId": PHOTO_ID,
        "titulo": "Pano de San David de Castelao",
        "peFoto": "Pano de San David deseñado por Castelao para a Sociedade Coral Polifónica de Pontevedra.",
        "anoAproximado": "1926",
        "procedencia": "Arquivo SCPP",
        "estadoRevision": "aprobada",
        "publicarPublica": True,
        "publicarPrivada": False,
        "rutaR2Publica": ORIGINAL_KEY,
        "rutaMiniaturaPublica": THUMB_KEY,
        "urlPublica": f"/arquivos/publico/{ORIGINAL_KEY}?v={etag[:16]}",
        "urlMiniaturaPublica": f"/arquivos/publico/{THUMB_KEY}?v={etag[:16]}",
        "orixinalVerificado": True,
    }
    replaced = False
    for i, item in enumerate(fotos):
        if text(item.get("idFoto") or item.get("Id_Foto")) == PHOTO_ID:
            fotos[i] = {**item, **foto}
            replaced = True
            break
    if not replaced:
        fotos.append(foto)
    current.update({
        "ok": True,
        "fotos": fotos,
        "total": len(fotos),
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "ARQUIVO-SCPP-CASTELAO",
    })
    r2.put_object(
        Bucket=BUCKET, Key=INDEX_KEY,
        Body=json.dumps(current, ensure_ascii=False, separators=(",", ":")).encode(),
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=0, no-cache, must-revalidate",
    )
    print(json.dumps({"ok": True, "idFoto": PHOTO_ID, "rutaR2": ORIGINAL_KEY, "novaFila": PHOTO_ID not in existing_ids}))


if __name__ == "__main__":
    main()
