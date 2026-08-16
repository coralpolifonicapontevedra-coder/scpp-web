#!/usr/bin/env python3
"""Auditoría global, de solo lectura, de los archivos usados por la web SCPP."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import pathlib
import re
import sys
import traceback
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build


ROOT = pathlib.Path(__file__).resolve().parents[1]
REPORT_CSV = pathlib.Path(os.getenv("FILES_AUDIT_CSV", "files-audit.csv"))
REPORT_JSON = pathlib.Path(os.getenv("FILES_AUDIT_JSON", "files-audit.json"))
REPORT_MD = pathlib.Path(os.getenv("FILES_AUDIT_MD", "files-audit.md"))
SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]
DOCUMENTACION_SPREADSHEET_ID = os.getenv(
    "DOCUMENTACION_SPREADSHEET_ID",
    "1sAMi9TWZ7YwjOxu1a-KliO_7LtYlo4Zf2AowmPKDQX8",
)
FILE_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg",
    ".mp3", ".m4a", ".wav", ".aac", ".ogg", ".webm", ".mp4", ".mov",
}


@dataclass(frozen=True)
class DriveScope:
    code: str
    label: str
    folder_id: str
    target: str
    decision: str
    privacy: str


@dataclass
class Finding:
    severity: str
    code: str
    scope: str
    detail: str
    count: int = 0
    size: int = 0


DRIVE_SCOPES = [
    DriveScope("documentacion", "Documentación", os.getenv("DOCUMENTACION_FOLDER_ID", "1T8izGJMWiWH0cSNHyKIDvSQZXtB2LgyQ"), "documentacion/documentos/", "CATALOG_VERIFY", "private"),
    DriveScope("actas", "Actas", os.getenv("ACTAS_FOLDER_ID", "1dJpIGV-i6kvu6gTkeTphpz9uopvHO2MR"), "documentacion/actas/", "CATALOG_VERIFY", "private"),
    DriveScope("concertos_documentos", "Programas de conciertos", os.getenv("CONCERTOS_FILES_FOLDER_ID", "1H12S32zJzncJoXdUvbZx82CLFXvlhtd6"), "concertos/documentos/", "MIGRATE_PRIVATE", "private"),
    DriveScope("concertos_imaxes", "Carteles e imágenes de conciertos", os.getenv("CONCERTOS_IMAGES_FOLDER_ID", "1yvEWIatZIa3UnE71VQUb4LCvBZ6HLs6t"), "concertos/imaxes/", "REVIEW_PUBLIC_R2", "public"),
    DriveScope("perfil_fotos", "Fotos de perfil", os.getenv("PERFIL_FOTOS_FOLDER_ID", "1qXPUplggCFbFTTLRtm2j16af717o-bQs"), "persoas/perfis/", "MIGRATE_PRIVATE", "private"),
    DriveScope("persoas_fichas", "Fichas de personas", os.getenv("FICHAS_FOLDER_ID", "1UmEo1fP5jyxxo90dQbXG6SM2SrmdysbN"), "persoas/fichas/", "VERIFY_MANAGED", "private"),
    DriveScope("repertorio", "Audios de repertorio", os.getenv("AUDIO_FOLDER_ID", "1QAt_iu_C2m7jfoTfC9dh5SePWNf0iULU"), "repertorio/audios/", "VERIFY_MANAGED", "private"),
    DriveScope("partituras", "Partituras", os.getenv("PARTITURA_FOLDER_ID", "1ZbqnD4Gda7gkJrQOLE-eNhiLboz7iqJm"), "partituras/", "VERIFY_MANAGED", "private"),
    DriveScope("fotos", "Fotografías", os.getenv("FOTOS_FOLDER_ID", "1FySxDvTHVNC20-a3I0wDU1v0s82VRiix"), "fotos/", "VERIFY_MANAGED", "private"),
]

CATALOG_SCOPES = {
    "documentacion": {
        "tab": "Documentación",
        "source_column": "Ficheiro",
        "id_columns": ["Id_Documento", "Row ID"],
        "category": "documento",
    },
    "actas": {
        "tab": "Actas XD e AX",
        "source_column": "Acta",
        "id_columns": ["Id_Actas", "Row ID"],
        "category": "acta",
    },
}

LEGACY_PATTERNS = {
    "DRIVE_BINARY": re.compile(r"DriveApp\.(?:getFolderById|getFileById)|getBlob\(\)", re.I),
    "BASE64_BINARY": re.compile(r"base64Encode|resultado\.base64|fotoDataUrl|fotoBase64", re.I),
    "GITHUB_MEDIA_SYNC": re.compile(r"sincronizarMediosConcertos|subirOuActualizarGitHub", re.I),
}


def credentials():
    return service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]), scopes=SCOPES
    )


def r2_client():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def slug(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"[^a-z0-9._-]+", "-", text).strip("-.") or "arquivo"


def basename(value: str) -> str:
    return pathlib.PurePosixPath(str(value or "").replace("\\", "/")).name


def canon_id(value: str) -> str:
    text = str(value or "").strip()
    try:
        return str(int(float(text.replace(",", "."))))
    except (TypeError, ValueError):
        return text


def key_for(category: str, record_id: str, source_name: str) -> str:
    prefix = "documentacion/actas" if category == "acta" else "documentacion/documentos"
    return f"{prefix}/{slug(record_id)}-{slug(source_name)}"


def sheet_rows(sheets, tab: str):
    values = sheets.spreadsheets().values().get(
        spreadsheetId=DOCUMENTACION_SPREADSHEET_ID,
        range=f"'{tab}'!A:AZ",
        valueRenderOption="FORMATTED_VALUE",
    ).execute().get("values", [])
    if not values:
        return []
    headers = [str(value).strip() for value in values[0]]
    result = []
    for row_number, raw in enumerate(values[1:], start=2):
        padded = list(raw) + [""] * (len(headers) - len(raw))
        row = dict(zip(headers, (str(value).strip() for value in padded)))
        row["__row__"] = row_number
        result.append(row)
    return result


def catalog_for_scope(sheets, scope_code: str):
    config = CATALOG_SCOPES.get(scope_code)
    if not config:
        return []
    rows = sheet_rows(sheets, config["tab"])
    catalog = []
    for row in rows:
        source_name = basename(row.get(config["source_column"], ""))
        if not source_name:
            continue
        record_id = ""
        for column in config["id_columns"]:
            record_id = canon_id(row.get(column, ""))
            if record_id:
                break
        catalog.append({
            "row": row["__row__"],
            "record_id": record_id,
            "source_name": source_name,
            "r2_key": key_for(config["category"], record_id, source_name) if record_id else "",
        })
    return catalog


def list_drive_files(drive, folder_id: str):
    files, pending = [], [folder_id]
    while pending:
        parent = pending.pop()
        token = None
        while True:
            response = drive.files().list(
                q=f"'{parent}' in parents and trashed = false",
                fields="nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,parents)",
                pageSize=1000,
                pageToken=token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            for item in response.get("files", []):
                if item.get("mimeType") == "application/vnd.google-apps.folder":
                    pending.append(item["id"])
                else:
                    files.append(item)
            token = response.get("nextPageToken")
            if not token:
                break
    return files


def list_r2(client, bucket: str):
    objects = []
    token = None
    while True:
        args = {"Bucket": bucket, "MaxKeys": 1000}
        if token:
            args["ContinuationToken"] = token
        page = client.list_objects_v2(**args)
        objects.extend(page.get("Contents", []))
        if not page.get("IsTruncated"):
            return objects
        token = page.get("NextContinuationToken")


def scan_legacy_code():
    rows = defaultdict(list)
    roots = [ROOT / "functions", ROOT / "scripts", ROOT / "apps-script", ROOT / "public" / "js"]
    for base in roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix.lower() not in {".js", ".gs", ".py"}:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            for code, pattern in LEGACY_PATTERNS.items():
                if pattern.search(text):
                    rows[code].append(path.relative_to(ROOT).as_posix())
    return rows


def text_references():
    references = Counter()
    for base in [ROOT / "src", ROOT / "public", ROOT / "functions"]:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix.lower() not in {".astro", ".js", ".ts", ".css", ".html", ".json"}:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            for match in re.findall(r"/(?:img|docs|documentos)/[^\s'\"?#)]+", text):
                references[match] += 1
    return references


def static_assets():
    refs = text_references()
    assets = []
    public = ROOT / "public"
    if not public.exists():
        return assets
    for path in public.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in FILE_EXTENSIONS:
            continue
        rel = path.relative_to(public).as_posix()
        url = "/" + rel
        category = "stable-pages"
        recommendation = "KEEP_PAGES_STATIC"
        if rel.startswith("img/concertos/"):
            category, recommendation = "concertos-repo", "REVIEW_PUBLIC_R2"
        elif rel.startswith("documentos/publicacions/"):
            category, recommendation = "publicacions-repo", "REVIEW_PUBLIC_R2"
        assets.append({
            "path": rel,
            "size": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "references": refs[url],
            "category": category,
            "recommendation": recommendation,
        })
    return assets


def prefix_objects(objects, prefix: str):
    return [item for item in objects if str(item.get("Key", "")).startswith(prefix)]


def prefix_stats(objects, prefix: str):
    selected = prefix_objects(objects, prefix)
    return len(selected), sum(int(item.get("Size", 0)) for item in selected)


def audit_catalog_scope(scope, files, r2_objects, sheets, findings):
    catalog = catalog_for_scope(sheets, scope.code)
    drive_by_name = defaultdict(list)
    for item in files:
        drive_by_name[str(item.get("name", ""))].append(item)
    r2_selected = prefix_objects(r2_objects, scope.target)
    r2_keys = {str(item.get("Key", "")) for item in r2_selected}
    expected_keys = {item["r2_key"] for item in catalog if item["r2_key"]}
    catalog_names = {item["source_name"] for item in catalog}

    missing_id = [item for item in catalog if not item["record_id"]]
    missing_drive = [item for item in catalog if len(drive_by_name.get(item["source_name"], [])) == 0]
    ambiguous_drive = [item for item in catalog if len(drive_by_name.get(item["source_name"], [])) > 1]
    missing_r2 = [item for item in catalog if item["r2_key"] and item["r2_key"] not in r2_keys]
    extra_drive = [item for item in files if str(item.get("name", "")) not in catalog_names]
    extra_r2 = [item for item in r2_selected if str(item.get("Key", "")) not in expected_keys]
    correct = [
        item for item in catalog
        if item["record_id"]
        and len(drive_by_name.get(item["source_name"], [])) == 1
        and item["r2_key"] in r2_keys
    ]

    if missing_id:
        findings.append(Finding("ERROR", "CATALOG_WITHOUT_ID", scope.code, ", ".join(f"fila {x['row']}" for x in missing_id), len(missing_id)))
    if missing_drive:
        findings.append(Finding("ERROR", "CATALOG_MISSING_DRIVE", scope.code, ", ".join(x["source_name"] for x in missing_drive), len(missing_drive)))
    if ambiguous_drive:
        findings.append(Finding("WARNING", "CATALOG_AMBIGUOUS_DRIVE", scope.code, ", ".join(x["source_name"] for x in ambiguous_drive), len(ambiguous_drive)))
    if missing_r2:
        findings.append(Finding("ERROR", "CATALOG_MISSING_R2", scope.code, ", ".join(x["r2_key"] for x in missing_r2), len(missing_r2)))
    if extra_drive:
        findings.append(Finding("INFO", "DRIVE_BACKUP_EXTRA", scope.code, ", ".join(str(x.get("name", "")) for x in extra_drive), len(extra_drive), sum(int(x.get("size", 0) or 0) for x in extra_drive)))
    if extra_r2:
        findings.append(Finding("WARNING", "R2_WITHOUT_CATALOG", scope.code, ", ".join(str(x.get("Key", "")) for x in extra_r2), len(extra_r2), sum(int(x.get("Size", 0) or 0) for x in extra_r2)))

    return {
        "cataloged": len(catalog),
        "correct": len(correct),
        "missing_id": len(missing_id),
        "missing_drive": len(missing_drive),
        "ambiguous_drive": len(ambiguous_drive),
        "missing_r2": len(missing_r2),
        "extra_drive": len(extra_drive),
        "extra_r2": len(extra_r2),
    }


def write_reports(payload, findings):
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with REPORT_CSV.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(["severity", "code", "scope", "count", "size", "detail"])
        for item in findings:
            writer.writerow([item.severity, item.code, item.scope, item.count, item.size, item.detail])

    drive = payload.get("drive", [])
    static = payload.get("static", [])
    legacy = payload.get("legacy", {})
    lines = [
        "# Auditoría global de archivos",
        "",
        "Auditoría de solo lectura. No se subió, movió ni eliminó ningún archivo.",
        "",
        "## Orígenes Drive",
        "",
        "| Ámbito | Drive | Catálogo | Correctos | Falta R2 | Extras Drive | Extras R2 | R2 actual | Decisión |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for item in drive:
        catalog = item.get("catalog") or {}
        def value(name):
            return catalog.get(name, "—")
        lines.append(
            f"| {item['label']} | {item['count']} | {value('cataloged')} | {value('correct')} | "
            f"{value('missing_r2')} | {value('extra_drive')} | {value('extra_r2')} | {item['r2_count']} | {item['decision']} |"
        )
    lines.extend([
        "",
        "### Criterio de catálogo",
        "",
        "- **Extras Drive** son copias o archivos auxiliares no registrados en la Sheet; no se consideran automáticamente pendientes de migración.",
        "- **Falta R2** solo se marca cuando un registro oficial del catálogo tiene una clave R2 esperada y esa clave no existe.",
        "- **Extras R2** son objetos bajo el prefijo gestionado que no corresponden a ninguna clave esperada del catálogo y requieren revisión, no borrado automático.",
        "",
        "## Archivos incluidos en Pages",
        "",
        f"- Recursos estáticos totales: **{len(static)}**.",
        f"- Tamaño total: **{sum(x['size'] for x in static)} bytes**.",
        f"- Medios de conciertos que requieren revisión: **{sum(1 for x in static if x['category'] == 'concertos-repo')}**.",
        f"- PDFs de publicaciones que requieren revisión: **{sum(1 for x in static if x['category'] == 'publicacions-repo')}**.",
        "",
        "## Código heredado",
        "",
    ])
    for code, paths in legacy.items():
        lines.append(f"- **{code}**: {len(paths)} archivos de código.")
    lines.extend([
        "",
        "## Recomendación",
        "",
        "1. Usar el catálogo oficial para validar Documentación y Actas; conservar extras de Drive como respaldo hasta revisión manual.",
        "2. Aplicar el mismo modelo de identidad a programas de mano de conciertos cuando exista un catálogo estable.",
        "3. Diseñar el cambio de fotos de perfil manteniendo Drive como entrada y respaldo.",
        "4. Decidir si carteles e imágenes de conciertos pasan a R2 público antes de retirar la sincronización a GitHub.",
        "5. Mantener en Pages los recursos editoriales históricos y estables.",
    ])
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def audit():
    creds = credentials()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    r2 = r2_client()
    bucket = os.environ["R2_BUCKET"]
    r2_objects = list_r2(r2, bucket)
    drive_results, findings = [], []

    for scope in DRIVE_SCOPES:
        try:
            files = list_drive_files(drive, scope.folder_id)
            total_size = sum(int(item.get("size", 0) or 0) for item in files)
            r2_count, r2_size = prefix_stats(r2_objects, scope.target)
            catalog_result = None
            if scope.code in CATALOG_SCOPES:
                catalog_result = audit_catalog_scope(scope, files, r2_objects, sheets, findings)
            drive_results.append({
                "code": scope.code,
                "label": scope.label,
                "count": len(files),
                "size": total_size,
                "r2_prefix": scope.target,
                "r2_count": r2_count,
                "r2_size": r2_size,
                "decision": scope.decision,
                "privacy": scope.privacy,
                "catalog": catalog_result,
            })
            if scope.decision.startswith("MIGRATE") and files:
                findings.append(Finding("ACTION", scope.decision, scope.code, "Ámbito pendiente de catálogo estable antes de interpretar diferencias Drive/R2", len(files), total_size))
            if scope.decision == "VERIFY_MANAGED" and files and not r2_count:
                findings.append(Finding("WARNING", "R2_PREFIX_EMPTY", scope.code, scope.target, len(files), total_size))
        except Exception as exc:
            drive_results.append({
                "code": scope.code,
                "label": scope.label,
                "count": 0,
                "size": 0,
                "r2_prefix": scope.target,
                "r2_count": 0,
                "r2_size": 0,
                "decision": scope.decision,
                "privacy": scope.privacy,
                "catalog": None,
                "error": str(exc),
            })
            findings.append(Finding("WARNING", "DRIVE_SCOPE_UNAVAILABLE", scope.code, str(exc)))

    legacy = scan_legacy_code()
    assets = static_assets()
    for code, paths in legacy.items():
        findings.append(Finding("ACTION", code, "code", ", ".join(paths), len(paths)))
    for category in ("concertos-repo", "publicacions-repo"):
        selected = [item for item in assets if item["category"] == category]
        if selected:
            findings.append(Finding("REVIEW", "REPO_DYNAMIC_ASSETS", category, "Evaluar R2 público", len(selected), sum(x["size"] for x in selected)))

    payload = {
        "version": 2,
        "read_only": True,
        "drive": drive_results,
        "r2": {
            "objects": len(r2_objects),
            "size": sum(int(item.get("Size", 0)) for item in r2_objects),
            "top_prefixes": Counter(str(item.get("Key", "")).split("/", 1)[0] for item in r2_objects),
        },
        "static": assets,
        "legacy": legacy,
    }
    payload["r2"]["top_prefixes"] = dict(payload["r2"]["top_prefixes"])
    write_reports(payload, findings)
    print(f"Auditoría completada: {len(drive_results)} ámbitos Drive, {len(r2_objects)} objetos R2, {len(assets)} recursos Pages")
    print(f"Informes: {REPORT_MD}, {REPORT_CSV}, {REPORT_JSON}")
    return 0


def main():
    try:
        return audit()
    except Exception as exc:
        traceback.print_exc()
        finding = Finding("ERROR", "AUDIT_EXECUTION_FAILED", "global", f"{type(exc).__name__}: {exc}")
        write_reports({"version": 2, "read_only": True, "drive": [], "r2": {}, "static": [], "legacy": {}}, [finding])
        return 2


if __name__ == "__main__":
    sys.exit(main())
