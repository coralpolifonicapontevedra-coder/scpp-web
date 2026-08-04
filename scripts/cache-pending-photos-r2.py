#!/usr/bin/env python3
"""Prepara en R2 a revisión fotográfica fóra do fluxo de navegación.

Le a folla Fotos, copia a R2 os orixinais pendentes que falten, xera miniaturas
WebP e publica un índice privado atómico. A páxina de revisión só le este índice.
"""

from __future__ import annotations

import io
import json
import mimetypes
import os
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from PIL import Image, ImageOps, UnidentifiedImageError

SPREADSHEET_ID = "1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w"
RANGE = "Fotos!A1:AC5000"
FOLDER_ID = "1FySxDvTHVNC20-a3I0wDU1v0s82VRiix"
BUCKET = "scpp-privado"
INDEX_KEY = "indices/revision-fotos-v1.json"
ORIGINAL_PREFIX = "fotos/traballo/"
THUMB_PREFIX = "fotos/traballo-miniaturas/"
VALID_MIMES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
THUMB_SIZE = (720, 540)


def text(value: Any = "") -> str:
    return str(value or "").strip()


def truthy(value: Any) -> bool:
    return text(value).lower() in {"true", "verdadero", "verdadeiro", "si", "sí", "yes", "1"}


def head(r2: Any, key: str) -> dict[str, Any] | None:
    try:
        return r2.head_object(Bucket=BUCKET, Key=key)
    except ClientError as exc:
        code = text(exc.response.get("Error", {}).get("Code"))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def thumbnail(source: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(source)) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGB")
            if image.mode == "RGBA":
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                image = background
            image.thumbnail(THUMB_SIZE, Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=78, method=6)
            return output.getvalue()
    except (UnidentifiedImageError, OSError) as exc:
        raise RuntimeError(f"Formato de imaxe non compatible: {exc}") from exc


def main() -> None:
    required = [
        "GOOGLE_SERVICE_ACCOUNT_JSON",
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
    ]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit("Faltan secretos: " + ", ".join(missing))

    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
        ],
    )
    sheets = build("sheets", "v4", credentials=credentials, cache_discovery=False)
    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)

    values = sheets.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID, range=RANGE
    ).execute().get("values", [])
    if not values:
        raise SystemExit("A folla Fotos está baleira")

    headers = [text(v) for v in values[0]]
    positions = {name: i for i, name in enumerate(headers)}
    needed = ["Id_Foto", "Foto", "EstadoRevision"]
    absent = [name for name in needed if name not in positions]
    if absent:
        raise SystemExit("Faltan columnas: " + ", ".join(absent))

    def cell(row: list[Any], *names: str) -> str:
        for name in names:
            pos = positions.get(name)
            if pos is not None:
                value = text(row[pos] if pos < len(row) else "")
                if value:
                    return value
        return ""

    pending: list[dict[str, Any]] = []
    for row in values[1:]:
        if cell(row, "EstadoRevision").lower() not in {"pendente", "pendiente"}:
            continue
        photo_id = cell(row, "Id_Foto", "Id")
        route = cell(row, "Foto")
        filename = route.replace("\\", "/").split("/")[-1]
        if not photo_id or not filename:
            continue
        pending.append({
            "idFoto": photo_id,
            "rowId": photo_id,
            "filename": filename,
            "nomeFicheiro": filename,
            "titulo": cell(row, "Titulo", "Título") or filename,
            "peFoto": cell(row, "PeFoto", "PéFoto", "Pe_Foto"),
            "observacions": cell(row, "Observacións", "Observacions", "ObservaciónsPrivadas"),
            "dataFoto": cell(row, "Data", "DataFoto"),
            "anoAproximado": cell(row, "AnoAproximado", "Ano"),
            "lugar": cell(row, "Lugar"),
            "autoria": cell(row, "Autor", "Autoria"),
            "procedencia": cell(row, "Procedencia"),
            "concerto": cell(row, "Concerto"),
            "evento": cell(row, "Evento"),
            "publicarPublica": truthy(cell(row, "Publicar_Publica")),
            "publicarPrivada": truthy(cell(row, "Publicar_Privada")),
            "destacadaPublica": truthy(cell(row, "Destacada_Publica", "Destacadas")),
            "destacadaPrivada": truthy(cell(row, "Destacada_Privada")),
            "estado": cell(row, "EstadoRevision"),
        })

    response = drive.files().list(
        q=f"'{FOLDER_ID}' in parents and trashed = false",
        fields="nextPageToken,files(id,name,mimeType,size,modifiedTime)",
        pageSize=1000,
    ).execute()
    files = {item["name"]: item for item in response.get("files", [])}
    while response.get("nextPageToken"):
        response = drive.files().list(
            q=f"'{FOLDER_ID}' in parents and trashed = false",
            fields="nextPageToken,files(id,name,mimeType,size,modifiedTime)",
            pageSize=1000,
            pageToken=response["nextPageToken"],
        ).execute()
        files.update({item["name"]: item for item in response.get("files", [])})

    endpoint = f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    r2 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

    valid: list[dict[str, Any]] = []
    uploaded = 0
    thumbs_created = 0
    missing_files: list[str] = []

    for photo in pending:
        item = files.get(photo["filename"])
        if not item:
            missing_files.append(photo["filename"])
            continue
        mime = text(item.get("mimeType") or mimetypes.guess_type(item["name"])[0]).lower()
        if mime not in VALID_MIMES:
            print(f"Formato omitido: {item['name']} ({mime})")
            continue

        ext = VALID_MIMES[mime]
        original_key = f"{ORIGINAL_PREFIX}{photo['idFoto']}.{ext}"
        marker_key = f"{ORIGINAL_PREFIX}{photo['idFoto']}.json"
        thumb_key = f"{THUMB_PREFIX}{photo['idFoto']}.webp"
        source: bytes | None = None

        original_head = head(r2, original_key)
        if not original_head:
            buffer = io.BytesIO()
            request = drive.files().get_media(fileId=item["id"])
            downloader = MediaIoBaseDownload(buffer, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            source = buffer.getvalue()
            r2.put_object(
                Bucket=BUCKET,
                Key=original_key,
                Body=source,
                ContentType=mime,
                CacheControl="private, max-age=31536000, immutable",
                Metadata={"idfoto": photo["idFoto"], "tipo": "orixinal-traballo"},
            )
            original_head = head(r2, original_key)
            uploaded += 1

        etag = text((original_head or {}).get("ETag")).strip('"')
        thumb_head = head(r2, thumb_key)
        thumb_meta = thumb_head.get("Metadata", {}) if thumb_head else {}
        if not thumb_head or text(thumb_meta.get("source-etag")) != etag:
            if source is None:
                source = r2.get_object(Bucket=BUCKET, Key=original_key)["Body"].read()
            thumb = thumbnail(source)
            r2.put_object(
                Bucket=BUCKET,
                Key=thumb_key,
                Body=thumb,
                ContentType="image/webp",
                CacheControl="private, max-age=31536000, immutable",
                Metadata={"source-etag": etag, "idfoto": photo["idFoto"]},
            )
            thumbs_created += 1

        marker = {
            "idFoto": photo["idFoto"],
            "ruta": original_key,
            "rutaMiniatura": thumb_key,
            "mimeType": mime,
            "publicarPublica": photo["publicarPublica"],
            "publicarPrivada": photo["publicarPrivada"],
            "creadoEn": datetime.now(timezone.utc).isoformat(),
            "orixe": "github-actions",
        }
        r2.put_object(
            Bucket=BUCKET,
            Key=marker_key,
            Body=json.dumps(marker, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
            CacheControl="private, max-age=31536000",
        )
        valid.append({
            **photo,
            "rutaR2Traballo": original_key,
            "rutaMiniaturaRevision": thumb_key,
            "mimeType": mime,
            "orixinalPreparado": True,
        })

    now = datetime.now(timezone.utc)
    index_payload = {
        "ok": True,
        "fotos": valid,
        "total": len(valid),
        "recibidas": len(pending),
        "xeradoEn": now.isoformat(),
        "xeradoEnMs": int(now.timestamp() * 1000),
        "orixe": "GITHUB_ACTIONS_R2_REVIEW",
        "faltantes": missing_files,
        "version": "1",
    }
    r2.put_object(
        Bucket=BUCKET,
        Key=INDEX_KEY,
        Body=json.dumps(index_payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
        CacheControl="private, max-age=300",
    )

    print(f"Índice publicado: s3://{BUCKET}/{INDEX_KEY}")
    print(f"Pendentes: {len(valid)}/{len(pending)}")
    print(f"Orixinais novos: {uploaded}")
    print(f"Miniaturas novas: {thumbs_created}")
    if missing_files:
        print("Non atopadas en Drive:")
        for name in missing_files:
            print(f"- {name}")


if __name__ == "__main__":
    main()
