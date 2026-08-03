#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build

SPREADSHEET_ID = "1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w"
RANGE = "Fotos!A1:AC5000"
INDEX_KEY = "indices/galeria-privada.json"


def truthy(value):
    return str(value or "").strip().lower() in {"true", "verdadero", "verdadeiro", "si", "sí", "yes", "1"}


def main():
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
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    sheets = build("sheets", "v4", credentials=credentials, cache_discovery=False)
    values = sheets.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=RANGE,
    ).execute().get("values", [])

    if not values:
        raise SystemExit("La hoja Fotos está vacía")

    headers = [str(v).strip() for v in values[0]]
    index = {name: i for i, name in enumerate(headers)}
    needed = [
        "Id_Foto", "Titulo", "Data", "AnoAproximado", "Lugar", "Concerto",
        "Evento", "PeFoto", "Autor", "Procedencia", "EstadoRevision",
        "Publicar_Privada", "Destacada_Privada", "RutaR2_Privada",
    ]
    absent = [name for name in needed if name not in index]
    if absent:
        raise SystemExit("Faltan columnas: " + ", ".join(absent))

    def cell(row, name):
        pos = index[name]
        return str(row[pos] if pos < len(row) else "").strip()

    photos = []
    for row in values[1:]:
        if cell(row, "EstadoRevision").lower() != "aprobada":
            continue
        if not truthy(cell(row, "Publicar_Privada")):
            continue
        route = cell(row, "RutaR2_Privada")
        if not route:
            continue
        photo_id = cell(row, "Id_Foto")
        if not photo_id:
            continue
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
        })

    photos.sort(key=lambda p: (p.get("data", ""), p.get("destacada", False), p.get("titulo", "")), reverse=True)
    payload = {
        "version": 1,
        "xeradoEn": datetime.now(timezone.utc).isoformat(),
        "total": len(photos),
        "fotos": photos,
    }

    endpoint = f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    client.put_object(
        Bucket="scpp-privado",
        Key=INDEX_KEY,
        Body=body,
        ContentType="application/json; charset=utf-8",
        CacheControl="private, max-age=600",
    )
    print(f"Índice privado creado: {len(photos)} fotografías")
    for photo in photos[:5]:
        print(f"- {photo['idFoto']} | {photo['titulo']}")


if __name__ == "__main__":
    main()
