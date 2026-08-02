#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import os
import pathlib
from collections import defaultdict

from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
AUDIO_SHEET_ID = "16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0"
PARTITURA_SHEET_ID = "18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0"
OUTPUT = pathlib.Path("functions/_data/repertorio-r2.js")


def credentials():
    raw = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    return service_account.Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)


def rows(sheets, spreadsheet_id: str, tab: str):
    values = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{tab}!A:Z",
        valueRenderOption="FORMATTED_VALUE",
    ).execute().get("values", [])
    headers = [str(v).strip() for v in values[0]]
    result = []
    for raw in values[1:]:
        raw = list(raw) + [""] * (len(headers) - len(raw))
        result.append(dict(zip(headers, (str(v).strip() for v in raw))))
    return result


def canon(value: str) -> str:
    value = str(value or "").strip()
    return str(int(value)) if value.isdigit() else value


def truthy(value: str) -> bool:
    return str(value or "").strip().upper() in {"Y", "SI", "SÍ", "TRUE"}


def number(value: str, default=0):
    try:
        return int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return default


def main():
    report = {}
    with open("r2-migration-report.csv", newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["status"] not in {"UPLOADED_VERIFIED", "VERIFIED_EXISTING"}:
                continue
            report[(row["category"], canon(row["record_id"]))] = row

    sheets = build("sheets", "v4", credentials=credentials(), cache_discovery=False)
    audio_rows = rows(sheets, AUDIO_SHEET_ID, "AudiosRepertorio")
    score_rows = rows(sheets, PARTITURA_SHEET_ID, "Partituras_App")

    index = defaultdict(lambda: {"partituras": [], "audios": []})

    for row in audio_rows:
        record_id = canon(row.get("Id_Audio"))
        item = report.get(("audio", record_id))
        if not item or not truthy(row.get("Activo")):
            continue
        work_id = canon(row.get("NomeObra"))
        index[work_id]["audios"].append({
            "id": record_id,
            "nome": item["source_name"],
            "voz": row.get("Voz") or "Audio",
            "tipo": row.get("TipoAudio") or "",
            "orde": number(row.get("Orde"), 999),
            "ruta": item["r2_key"],
            "r2Key": item["r2_key"],
            "mimeType": row.get("MimeType") or "",
            "tamano": number(item.get("size")),
        })

    for row in score_rows:
        record_id = canon(row.get("Id_Partitura"))
        item = report.get(("partitura", record_id))
        if not item or not truthy(row.get("Activa")):
            continue
        work_id = canon(row.get("Id_Repertorio"))
        index[work_id]["partituras"].append({
            "id": record_id,
            "nome": row.get("Nomepartitura") or item["source_name"],
            "voz": row.get("Voz") or "General",
            "tipo": row.get("TipoPartitura") or "",
            "principal": truthy(row.get("Principal")),
            "ruta": item["r2_key"],
            "r2Key": item["r2_key"],
            "mimeType": "application/pdf",
            "tamano": number(item.get("size")),
        })

    for work in index.values():
        work["audios"].sort(key=lambda x: (x["orde"], x["voz"], x["nome"]))
        work["partituras"].sort(key=lambda x: (not x["principal"], x["nome"]))

    total_audios = sum(len(x["audios"]) for x in index.values())
    total_scores = sum(len(x["partituras"]) for x in index.values())
    if total_audios != 231 or total_scores != 99:
        raise RuntimeError(f"Índice incompleto: audios={total_audios}/231, partituras={total_scores}/99")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "// Xerado automaticamente. Non editar a man.\n"
        "export const REPERTORIO_R2 = "
        + json.dumps(dict(index), ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Índice completo: {total_audios} audios, {total_scores} partituras, {len(index)} obras con recursos")


if __name__ == "__main__":
    main()
