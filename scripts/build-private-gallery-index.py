#!/usr/bin/env python3
import io
import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from PIL import Image, ImageOps

SPREADSHEET_ID = "1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w"
RANGE = "Fotos!A1:AC5000"
INDEX_KEY = "indices/galeria-privada.json"
BUCKET = "scpp-privado"


def truthy(value):
    return str(value or "").strip().lower() in {"true", "verdadero", "verdadeiro", "si", "sí", "yes", "1", "y"}


def main():
    required = ["GOOGLE_SERVICE_ACCOUNT_JSON", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit("Faltan secretos: " + ", ".join(missing))

    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    sheets = build("sheets", "v4", credentials=credentials, cache_discovery=False)
    values = sheets.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=RANGE).execute().get("values", [])
    if not values:
        raise SystemExit("La hoja Fotos está vacía")

    headers = [str(v).strip() for v in values[0]]
    columns = {name: i for i, name in enumerate(headers)}
    needed = ["Id_Foto", "Titulo", "Data", "AnoAproximado", "Lugar", "Concerto", "Evento", "PeFoto", "Autor", "Procedencia", "EstadoRevision", "Publicar_Privada", "Destacada_Privada", "RutaR2_Privada"]
    absent = [name for name in needed if name not in columns]
    if absent:
        raise SystemExit("Faltan columnas: " + ", ".join(absent))

    def cell(row, name):
        pos = columns[name]
        return str(row[pos] if pos < len(row) else "").strip()

    endpoint = f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    client = boto3.client("s3", endpoint_url=endpoint, aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name="auto")

    photos = []
    missing_files = 0
    created_thumbs = 0

    for row in values[1:]:
        if cell(row, "EstadoRevision").lower() != "aprobada" or not truthy(cell(row, "Publicar_Privada")):
            continue
        route = cell(row, "RutaR2_Privada")
        photo_id = cell(row, "Id_Foto")
        if not route or not photo_id:
            continue
        try:
            head = client.head_object(Bucket=BUCKET, Key=route)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                missing_files += 1
                print(f"FALTA: {photo_id} -> {route}")
                continue
            raise

        etag = str(head.get("ETag", "")).strip('"')
        thumb_route = f"miniaturas/galeria/{photo_id}-{etag[:12]}.webp"
        try:
            client.head_object(Bucket=BUCKET, Key=thumb_route)
        except ClientError:
            body = client.get_object(Bucket=BUCKET, Key=route)["Body"].read()
            with Image.open(io.BytesIO(body)) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                image.thumbnail((720, 540), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                image.save(output, format="WEBP", quality=78, method=6)
            client.put_object(Bucket=BUCKET, Key=thumb_route, Body=output.getvalue(), ContentType="image/webp", CacheControl="private, max-age=31536000, immutable")
            created_thumbs += 1

        year = cell(row, "AnoAproximado")
        caption = cell(row, "PeFoto")
        event = cell(row, "Evento")
        concert = cell(row, "Concerto")
        photos.append({
            "idFoto": photo_id,
            "titulo": cell(row, "Titulo") or "Fotografía do arquivo",
            "data": cell(row, "Data"),
            "anoAproximado": year,
            "lugar": cell(row, "Lugar"),
            "concerto": concert,
            "evento": event,
            "peFoto": caption,
            "autor": cell(row, "Autor"),
            "procedencia": cell(row, "Procedencia"),
            "destacada": truthy(cell(row, "Destacada_Privada")),
            "grupo": caption or event or concert or (f"Arquivo {year}" if year else "Arquivo fotográfico"),
            "rutaR2Privada": route,
            "rutaMiniaturaPrivada": thumb_route,
        })

    photos.sort(key=lambda p: (p.get("data", ""), p.get("destacada", False), p.get("titulo", "")), reverse=True)
    payload = {"version": 2, "xeradoEn": datetime.now(timezone.utc).isoformat(), "total": len(photos), "fotos": photos}
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    client.put_object(Bucket=BUCKET, Key=INDEX_KEY, Body=body, ContentType="application/json; charset=utf-8", CacheControl="private, max-age=600")
    print(f"Índice privado creado: {len(photos)} fotografías | miniaturas novas: {created_thumbs} | faltantes: {missing_files}")


if __name__ == "__main__":
    main()
