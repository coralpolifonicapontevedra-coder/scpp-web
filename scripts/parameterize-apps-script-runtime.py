from pathlib import Path
import subprocess

EXPECTED = {
    'apps-script/Código.gs': '07649105c685750c1ef923634b3527771a78aa27',
    'apps-script/fotos-portal.gs': '6920826adc6e3871cf38908a31f5a4b5ed599ce1',
    'apps-script/configuracion-entorno.gs': '806fc032655d831fe7598de6102b24847f160440',
}

for path, expected in EXPECTED.items():
    actual = subprocess.check_output(['git', 'hash-object', path], text=True).strip()
    if actual != expected:
        raise SystemExit(f'ABORTADO: {path} cambiou desde a auditoría. Esperado {expected}, actual {actual}')

codigo_path = Path('apps-script/Código.gs')
codigo = codigo_path.read_text(encoding='utf-8')

replacements = {
    "'1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw'": "obterPropiedadeObrigatoria_('REPERTORIO_SPREADSHEET_ID')",
    "'16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0'": "obterPropiedadeObrigatoria_('AUDIOS_REPERTORIO_SPREADSHEET_ID')",
    "'18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0'": "obterPropiedadeObrigatoria_('PARTITURAS_SPREADSHEET_ID')",
    "'1NyOt3A8EQ-HFBguDlsqaBQ0TpdlslI0GkRQzGXZkOig'": "obterPropiedadeObrigatoria_('CONCERTOS_REPERTORIO_SPREADSHEET_ID')",
    "'1vYlC1VO1hql8jJVkt1OBXnbH7GvUVe4XXe5TSIJk2dU'": "obterPropiedadeObrigatoria_('CONCERTOS_SPREADSHEET_ID')",
    "'1pObayoj3uoPLtqUqQG9S5GZ0afRz9ErBeJbTgJlaiH0'": "obterPropiedadeObrigatoria_('ASISTENCIAS_CONCERTOS_SPREADSHEET_ID')",
    "'1QAt_iu_C2m7jfoTfC9dh5SePWNf0iULU'": "obterPropiedadeObrigatoria_('OBRAS_FILES_FOLDER_ID')",
    "'1ZbqnD4Gda7gkJrQOLE-eNhiLboz7iqJm'": "obterPropiedadeObrigatoria_('PARTITURAS_FILES_FOLDER_ID')",
    "'1lDDdv0iUTqY70rVN0NjIe7XE5ovI5T-V'": "obterPropiedadeObrigatoria_('AUDIOS_REPERTORIO_FILES_FOLDER_ID')",
    "'1nhoP8ea1RyZiZ9SaTyFjnHG9MBOk-TMe15eHvvkXcdU'": "obterPropiedadeObrigatoria_('REXISTRO_ACCESOS_SPREADSHEET_ID')",
    "'1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k'": "obterPropiedadeObrigatoria_('ACEPTACION_SPREADSHEET_ID')",
}

for old, new in replacements.items():
    count = codigo.count(old)
    if count == 0:
        raise SystemExit(f'ABORTADO: non se atopou o literal esperado {old}')
    codigo = codigo.replace(old, new)

codigo = codigo.replace(
    'libroRexistro.getSheetById(1291817000)',
    "libroRexistro.getSheetById(Number(obterPropiedadeObrigatoria_('REXISTRO_ACCESOS_SHEET_ID')))"
)
codigo = codigo.replace(
    'libroAceptacion.getSheetById(974695665)',
    "libroAceptacion.getSheetById(Number(obterPropiedadeObrigatoria_('ACEPTACION_SHEET_ID')))"
)
old_textos = 'const TEXTOS_LEGAIS_SHEET_ID_ = 2025412208;'
if codigo.count(old_textos) != 1:
    raise SystemExit('ABORTADO: TEXTOS_LEGAIS_SHEET_ID_ non coincide coa base esperada')
codigo = codigo.replace(
    old_textos,
    "const TEXTOS_LEGAIS_SHEET_ID_ = Number(obterPropiedadeObrigatoria_('TEXTOS_LEGAIS_SHEET_ID'));"
)

codigo_path.write_text(codigo, encoding='utf-8')

fotos_path = Path('apps-script/fotos-portal.gs')
fotos = fotos_path.read_text(encoding='utf-8')
old_fotos = """  const spreadsheetId = String(
    propiedades.getProperty('FOTOS_SPREADSHEET_ID') ||
    '1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w'
  ).trim();

  const sheetId = Number(
    propiedades.getProperty('FOTOS_SHEET_ID') ||
    '1291817000'
  );

  const folderId = String(
    propiedades.getProperty('FOTOS_FOLDER_ID') ||
    '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix'
  ).trim();"""
new_fotos = """  const spreadsheetId = obterPropiedadeObrigatoria_('FOTOS_SPREADSHEET_ID');
  const sheetId = Number(obterPropiedadeObrigatoria_('FOTOS_SHEET_ID'));
  const folderId = obterPropiedadeObrigatoria_('FOTOS_FOLDER_ID');"""
if fotos.count(old_fotos) != 1:
    raise SystemExit('ABORTADO: o bloque de configuración de Fotos non coincide coa base auditada')
fotos = fotos.replace(old_fotos, new_fotos)
fotos_path.write_text(fotos, encoding='utf-8')

config_path = Path('apps-script/configuracion-entorno.gs')
config = config_path.read_text(encoding='utf-8')
anchor = "  'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID',"
extra = """  'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID',
  'OBRAS_FILES_FOLDER_ID',
  'PARTITURAS_FILES_FOLDER_ID',
  'AUDIOS_REPERTORIO_FILES_FOLDER_ID',"""
if config.count(anchor) != 1:
    raise SystemExit('ABORTADO: non se atopou a áncora de configuración de Repertorio')
config = config.replace(anchor, extra, 1)
config_path.write_text(config, encoding='utf-8')

print('Parametrización do runtime aplicada sen modificar Ensaios.')
