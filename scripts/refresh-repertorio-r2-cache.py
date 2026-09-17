#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import pathlib
import time
import unicodedata
from collections import defaultdict

import boto3
from botocore.exceptions import ClientError
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
REPERTORIO_SHEET_ID = "1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw"
AUDIO_SHEET_ID = "16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0"
PARTITURA_SHEET_ID = "18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0"

CATALOGO_KEY = "repertorio/cache/catalogo.json"
ADMIN_KEY = "repertorio/cache/administracion/main/listado-v2.json"
CONCERTOS_KEY = "indices/concertos-privado-v1.json"
DRAFT_PREFIX = "concertos/borradores-v1/main/"
CATALOG_VERSION = "repertorio-cache-v3-sheet-authority"


def credentials():
    raw = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    return service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=SCOPES
    )


def rows(sheets, spreadsheet_id: str, tab: str):
    values = (
        sheets.spreadsheets()
        .values()
        .get(
            spreadsheetId=spreadsheet_id,
            range=f"{tab}!A:Z",
            valueRenderOption="FORMATTED_VALUE",
        )
        .execute()
        .get("values", [])
    )
    if not values:
        return []
    headers = [str(v).strip() for v in values[0]]
    out = []
    for raw in values[1:]:
        raw = list(raw) + [""] * (len(headers) - len(raw))
        out.append(dict(zip(headers, (str(v).strip() for v in raw))))
    return out


def clean(value) -> str:
    return str(value or "").strip()


def canon(value) -> str:
    raw = clean(value)
    if not raw:
        return ""
    try:
        return str(int(float(raw.replace(",", "."))))
    except (TypeError, ValueError):
        return raw


def truthy(value) -> bool:
    return clean(value).upper() in {"Y", "SI", "SÍ", "TRUE", "1", "YES"}


def integer(value, default=0):
    try:
        return int(float(clean(value).replace(",", ".")))
    except (TypeError, ValueError):
        return default


def basename(value) -> str:
    return pathlib.PurePosixPath(clean(value).replace("\\", "/")).name


def slug_filename(filename: str) -> str:
    path = pathlib.PurePosixPath(filename)
    stem = unicodedata.normalize("NFD", path.stem)
    stem = "".join(ch for ch in stem if unicodedata.category(ch) != "Mn").lower()
    chars = []
    previous_dash = False
    for ch in stem:
        if ch.isalnum():
            chars.append(ch)
            previous_dash = False
        elif not previous_dash:
            chars.append("-")
            previous_dash = True
    slug = "".join(chars).strip("-") or "ficheiro"
    return f"{slug}{path.suffix.lower()}"


def r2_client():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def get_json(client, bucket: str, key: str):
    try:
        response = client.get_object(Bucket=bucket, Key=key)
        return json.loads(response["Body"].read().decode("utf-8"))
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def head(client, bucket: str, key: str):
    try:
        return client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def put_json(client, bucket: str, key: str, value, metadata=None):
    extra = {}
    if metadata:
        extra["Metadata"] = {str(k): str(v) for k, v in metadata.items()}
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
        CacheControl="private, no-store",
        **extra,
    )


def program_work_id(item: dict) -> str:
    for key in (
        "idRepertorio",
        "obraId",
        "Id_Obras",
        "Id_Obra",
        "Id_Repertorio",
        "IdRepertorio",
        "id_repertorio",
        "repertorioId",
        "id",
    ):
        value = canon(item.get(key))
        if value:
            return value
    return ""


def concerts_by_work(index, previous_catalog):
    result = defaultdict(list)
    concertos = index.get("concertos", []) if isinstance(index, dict) else []
    if isinstance(concertos, list) and concertos:
        for concerto in concertos:
            if not isinstance(concerto, dict):
                continue
            for item in concerto.get("programa", []) or []:
                if not isinstance(item, dict):
                    continue
                work_id = program_work_id(item)
                if not work_id:
                    continue
                result[work_id].append(
                    {
                        "id": clean(concerto.get("id")),
                        "data": clean(concerto.get("data")),
                        "nome": clean(concerto.get("nome")) or "Concerto",
                        "cidade": clean(concerto.get("cidade")),
                        "lugar": clean(concerto.get("lugar")),
                        "orde": item.get("orde", item.get("Orde", "")),
                        "solista": clean(item.get("solista", item.get("Solista"))),
                    }
                )
        for values in result.values():
            values.sort(key=lambda item: clean(item.get("data")), reverse=True)
        return result

    if isinstance(previous_catalog, dict):
        for obra in previous_catalog.get("obras", []) or []:
            if not isinstance(obra, dict):
                continue
            work_id = canon(obra.get("id", obra.get("Id")))
            if work_id and isinstance(obra.get("concertos"), list):
                result[work_id] = obra["concertos"]
    return result


def list_keys(client, bucket: str, prefix: str):
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        page = client.list_objects_v2(**kwargs)
        for item in page.get("Contents", []) or []:
            key = clean(item.get("Key"))
            if key:
                yield key
        if not page.get("IsTruncated"):
            break
        token = page.get("NextContinuationToken")


def main():
    sheets = build("sheets", "v4", credentials=credentials(), cache_discovery=False)
    obras_rows = rows(sheets, REPERTORIO_SHEET_ID, "Repertorio")
    audio_rows = rows(sheets, AUDIO_SHEET_ID, "AudiosRepertorio")
    score_rows = rows(sheets, PARTITURA_SHEET_ID, "Partituras_App")

    if not obras_rows:
        raise RuntimeError("A Sheet Repertorio non devolveu obras.")

    client = r2_client()
    bucket = os.environ["R2_BUCKET"]
    previous_catalog = get_json(client, bucket, CATALOGO_KEY) or {}
    concert_index = get_json(client, bucket, CONCERTOS_KEY) or {}

    scores_by_work = defaultdict(list)
    audios_by_work = defaultdict(list)
    missing_objects = []
    fingerprints = set()

    for row in score_rows:
        if not truthy(row.get("Activa")):
            continue
        work_id = canon(row.get("Id_Repertorio"))
        record_id = canon(row.get("Id_Partitura"))
        source_name = basename(row.get("PDF"))
        key = clean(row.get("R2Key")).lstrip("/") or (
            f"partituras/{source_name}" if source_name else ""
        )
        if not work_id or not key:
            continue
        obj = head(client, bucket, key)
        if obj is None:
            missing_objects.append(f"partitura {record_id}: {key}")
            continue
        scores_by_work[work_id].append(
            {
                "id": record_id,
                "nome": clean(row.get("Nomepartitura")) or source_name or "Partitura",
                "voz": clean(row.get("Voz")) or "General",
                "tipo": clean(row.get("TipoPartitura")),
                "principal": truthy(row.get("Principal")),
                "ruta": key,
                "r2Key": key,
                "mimeType": clean(row.get("MimeType")) or obj.get("ContentType") or "application/pdf",
                "tamano": integer(row.get("TamanoR2"), integer(obj.get("ContentLength"), 0)),
                "orixe": "r2",
            }
        )

    for values in scores_by_work.values():
        values.sort(key=lambda item: (not item["principal"], item["nome"].casefold()))

    for row in audio_rows:
        if not truthy(row.get("Activo")):
            continue
        work_id = canon(row.get("NomeObra"))
        record_id = canon(row.get("Id_Audio"))
        source_name = basename(row.get("AudioFile"))
        key = clean(row.get("R2Key")).lstrip("/")
        if not key and work_id and source_name:
            key = f"repertorio/audios/{work_id}/{slug_filename(source_name)}"
        if not work_id or not key:
            continue

        sha = clean(row.get("R2SHA256"))
        if sha:
            fingerprint = "|".join(
                [
                    work_id,
                    clean(row.get("Voz")).casefold(),
                    clean(row.get("TipoAudio")).casefold(),
                    sha,
                ]
            )
            if fingerprint in fingerprints:
                continue
            fingerprints.add(fingerprint)

        obj = head(client, bucket, key)
        if obj is None:
            missing_objects.append(f"audio {record_id}: {key}")
            continue

        audios_by_work[work_id].append(
            {
                "id": record_id,
                "nome": source_name or clean(row.get("NomeAudio")) or "Audio",
                "voz": clean(row.get("Voz")) or "Audio",
                "tipo": clean(row.get("TipoAudio")),
                "orde": integer(row.get("Orde"), 999),
                "grupo": clean(row.get("Observacións")),
                "ruta": key,
                "r2Key": key,
                "mimeType": clean(row.get("MimeType")) or obj.get("ContentType") or "",
                "tamano": integer(row.get("TamanoR2"), integer(obj.get("ContentLength"), 0)),
                "sha256": sha,
                "orixe": "r2",
            }
        )

    for values in audios_by_work.values():
        values.sort(key=lambda item: (item["orde"], item["voz"].casefold(), item["nome"].casefold()))

    concerts = concerts_by_work(concert_index, previous_catalog)
    mapped = []
    works_for_drafts = []

    for row in obras_rows:
        work_id = canon(row.get("Id"))
        name = clean(row.get("NomeObra"))
        if not work_id or not name:
            continue
        scores = scores_by_work.get(work_id, [])
        audios = audios_by_work.get(work_id, [])
        mapped.append(
            {
                "id": work_id,
                "nomeObra": name,
                "autorLetra": clean(row.get("AutorLetra")),
                "compositor": clean(row.get("Compositor")),
                "datas": clean(row.get("Nac/fall")),
                "comentarios": clean(row.get("Comentarios")),
                "categoria": clean(row.get("Categoria")),
                "coleccion": clean(row.get("Coleccion")),
                "estadoObra": clean(row.get("EstadoObra")),
                "partituras": scores,
                "audios": audios,
                "concertos": concerts.get(work_id, []),
                "partiturasR2": scores,
                "audiosR2": audios,
                "tenRecursosR2": bool(scores or audios),
            }
        )
        works_for_drafts.append(
            {
                "id": work_id,
                "nome": name,
                "autor": clean(row.get("Compositor")),
            }
        )

    mapped.sort(key=lambda item: item["nomeObra"].casefold())
    works_for_drafts.sort(key=lambda item: item["nome"].casefold())

    ids = {item["id"] for item in mapped}
    if "90" not in ids:
        raise RuntimeError("O catálogo xerado non contén a obra 90 (Abrem’a portiña).")

    canta_names = [item["nomeObra"] for item in mapped if "canta" in item["nomeObra"].casefold()]
    print("Obras con 'canta' no catálogo:", ", ".join(canta_names) or "ningunha")

    now_ms = int(time.time() * 1000)
    admin_cache = {
        "gardadoEn": now_ms,
        "payload": {
            "ok": True,
            "obras": obras_rows,
            "partituras": score_rows,
            "audios": audio_rows,
        },
    }
    catalog = {
        "ok": True,
        "obras": mapped,
        "indiceR2": {
            "obras": sum(1 for item in mapped if item["tenRecursosR2"]),
            "audios": sum(len(item["audios"]) for item in mapped),
            "partituras": sum(len(item["partituras"]) for item in mapped),
            "completo": True,
        },
        "cacheMeta": {
            "savedAt": now_ms,
            "source": "GitHub Action Sheets→R2",
            "branch": "main",
            "version": CATALOG_VERSION,
        },
    }

    put_json(client, bucket, ADMIN_KEY, admin_cache, {"tipo": "repertorio-admin-cache"})
    put_json(client, bucket, CATALOGO_KEY, catalog, {"tipo": "repertorio-catalogo"})

    drafts_updated = 0
    for key in list_keys(client, bucket, DRAFT_PREFIX):
        draft = get_json(client, bucket, key)
        if not isinstance(draft, dict):
            continue
        if not isinstance(draft.get("programa"), list) or not isinstance(draft.get("persoas"), list):
            continue
        draft["obras"] = works_for_drafts
        draft["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        draft["catalogoRepertorio"] = "R2-REFRESH-ACTION"
        put_json(client, bucket, key, draft, {"tipo": "borrador-concerto", "version": "1"})
        drafts_updated += 1

    print(f"Obras: {len(mapped)}")
    print(f"Audios activos publicados no catálogo: {catalog['indiceR2']['audios']}")
    print(f"Partituras activas publicadas no catálogo: {catalog['indiceR2']['partituras']}")
    print(f"Borradores de Concertos actualizados sen tocar programa/persoas: {drafts_updated}")
    if missing_objects:
        print("Referencias da Sheet sen obxecto R2 atopado (excluídas do catálogo):")
        for item in missing_objects[:50]:
            print(" -", item)


if __name__ == "__main__":
    main()
