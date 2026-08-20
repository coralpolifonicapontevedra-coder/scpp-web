from pathlib import Path
import re
import subprocess

EXPECTED = {
    'apps-script/concertos-administracion.gs':'3c6d4285e9f74295cc43e81381c4d10cd86246bc',
    'apps-script/perfil-portal.gs':'b604e12a40da245fe0a9d9b0bf654f26d7ef7711',
    'apps-script/fotos-portal.gs':'8dfad32ca1ba51c90a3d199d0fde659b810d8e42',
    'apps-script/persoas-administracion.gs':'57ad885c0a66db2c6218b2349cfcf7708b1b3414',
    'apps-script/documentacion-portal.gs':'2f0377df1652b579185bf59e152d82e009d8ca7a',
    'apps-script/partituras-portal.gs':'5686b47120c28d017eee8cd068394c70297a00fc',
    'apps-script/concertos-portal.gs':'036c3ed55dbb019b5d845fecfe3122d7277374a3',
    'apps-script/configuracion-entorno.gs':'d040235e9d9594de6e0ca6ccb780caf02ede5854',
}

for path, expected in EXPECTED.items():
    actual = subprocess.check_output(['git', 'hash-object', path], text=True).strip()
    if actual != expected:
        raise SystemExit(f'ABORTADO: {path} non coincide coa base auditada. Esperado {expected}, actual {actual}')


def replace_function(text, name, replacement):
    match = re.search(r'^function\s+' + re.escape(name) + r'\s*\(', text, re.M)
    if not match:
        raise SystemExit(f'Non se atopou function {name}')
    brace = text.find('{', match.start())
    depth = 0
    quote = None
    escaped = False
    line_comment = False
    block_comment = False
    i = brace
    while i < len(text):
        c = text[i]
        n = text[i + 1] if i + 1 < len(text) else ''
        if line_comment:
            if c == '\n': line_comment = False
            i += 1; continue
        if block_comment:
            if c == '*' and n == '/': block_comment = False; i += 2; continue
            i += 1; continue
        if quote:
            if escaped: escaped = False
            elif c == '\\': escaped = True
            elif c == quote: quote = None
            i += 1; continue
        if c == '/' and n == '/': line_comment = True; i += 2; continue
        if c == '/' and n == '*': block_comment = True; i += 2; continue
        if c in "'\"`": quote = c; i += 1; continue
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return text[:match.start()] + replacement.rstrip() + text[i + 1:]
        i += 1
    raise SystemExit(f'Función sen peche: {name}')

p = Path('apps-script/concertos-administracion.gs')
t = p.read_text(encoding='utf-8').replace('dataEnsaiosAdministracionPortal_', 'dataConcertoAdministracionPortal_')
p.write_text(t, encoding='utf-8')

p = Path('apps-script/perfil-portal.gs')
t = p.read_text(encoding='utf-8')
t = replace_function(t, 'configurarPerfilPortal', """function configurarPerfilPortal() {
  var contexto = obterContextoPerfil_();
  console.log('Perfil configurado mediante Script Properties: ' + contexto.follaPersoas.getName() + ' | ' + contexto.follaUsuarios.getName());
}""")
t = t.replace('PERFIL_PERSOAS_SPREADSHEET_ID', 'PERSOAS_SPREADSHEET_ID')
t = t.replace('PERFIL_PERSOAS_SHEET_ID', 'PERSOAS_SHEET_ID')
t = t.replace('PERFIL_USUARIOS_SPREADSHEET_ID', 'USUARIOS_WEB_SPREADSHEET_ID')
t = t.replace('PERFIL_USUARIOS_SHEET_ID', 'USUARIOS_WEB_SHEET_ID')
p.write_text(t, encoding='utf-8')

p = Path('apps-script/fotos-portal.gs')
t = p.read_text(encoding='utf-8')
t = replace_function(t, 'configurarFotosPortal', """function configurarFotosPortal() {
  var contexto = obterContextoFotos_();
  console.log('Fotos configuradas mediante Script Properties: ' + contexto.folla.getName());
}""")
t = t.replace("getProperty('FOTOS_NOTIFY_EMAIL') ||\n    'coralpolifonicapontevedra@gmail.com'", "getProperty('FOTOS_NOTIFY_EMAIL') ||\n    ''")
p.write_text(t, encoding='utf-8')

p = Path('apps-script/persoas-administracion.gs')
t = p.read_text(encoding='utf-8')
old = re.search(r'const PERSOAS_ADMIN_CONFIG = \{.*?\n\};', t, re.S)
if not old: raise SystemExit('Non se atopou PERSOAS_ADMIN_CONFIG')
new = """const PERSOAS_ADMIN_CONFIG = {
  get persoasSpreadsheetId() { return obterPropiedadeObrigatoria_('PERSOAS_SPREADSHEET_ID'); },
  get persoasSheetId() { return Number(obterPropiedadeObrigatoria_('PERSOAS_SHEET_ID')); },
  get usuariosSpreadsheetId() { return obterPropiedadeObrigatoria_('USUARIOS_WEB_SPREADSHEET_ID'); },
  get usuariosSheetId() { return Number(obterPropiedadeObrigatoria_('USUARIOS_WEB_SHEET_ID')); }
};"""
t = t[:old.start()] + new + t[old.end():]
p.write_text(t, encoding='utf-8')

p = Path('apps-script/documentacion-portal.gs')
t = p.read_text(encoding='utf-8')
old = re.search(r'const DOC_PORTAL_CONFIG = \{.*?\n\};', t, re.S)
if not old: raise SystemExit('Non se atopou DOC_PORTAL_CONFIG')
new = """const DOC_PORTAL_CONFIG = {
  get documentosSpreadsheetId() { return obterPropiedadeObrigatoria_('DOCUMENTACION_SPREADSHEET_ID'); },
  sheetDocumentacion: 'Documentación',
  sheetActas: 'Actas XD e AX',
  get usuariosSpreadsheetId() { return obterPropiedadeObrigatoria_('USUARIOS_WEB_SPREADSHEET_ID'); },
  get usuariosSheetId() { return Number(obterPropiedadeObrigatoria_('USUARIOS_WEB_SHEET_ID')); },
  get persoasSpreadsheetId() { return obterPropiedadeObrigatoria_('PERSOAS_SPREADSHEET_ID'); },
  get persoasSheetId() { return Number(obterPropiedadeObrigatoria_('PERSOAS_SHEET_ID')); },
  get folderDocumentacionId() { return obterPropiedadeObrigatoria_('DOCUMENTACION_FOLDER_ID'); },
  get folderActasId() { return obterPropiedadeObrigatoria_('ACTAS_FOLDER_ID'); }
};"""
t = t[:old.start()] + new + t[old.end():]
p.write_text(t, encoding='utf-8')

p = Path('apps-script/partituras-portal.gs')
t = p.read_text(encoding='utf-8')
old = "var PARTITURAS_PORTAL_SPREADSHEET_ID_ = '18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0';"
if t.count(old) != 1: raise SystemExit('Non se atopou ID fixo de Partituras unha única vez')
t = t.replace(old, "function idSpreadsheetPartiturasPortal_() { return obterPropiedadeObrigatoria_('PARTITURAS_SPREADSHEET_ID'); }")
t = t.replace('SpreadsheetApp.openById(PARTITURAS_PORTAL_SPREADSHEET_ID_)', 'SpreadsheetApp.openById(idSpreadsheetPartiturasPortal_())')
p.write_text(t, encoding='utf-8')

p = Path('apps-script/concertos-portal.gs')
t = p.read_text(encoding='utf-8')
for old, new in {
    'CONCERTOS_PORTAL_SPREADSHEET_ID':'CONCERTOS_SPREADSHEET_ID',
    'CONCERTOS_PORTAL_SHEET_ID':'CONCERTOS_SHEET_ID',
    'CONCERTOS_PORTAL_USUARIOS_SPREADSHEET_ID':'USUARIOS_WEB_SPREADSHEET_ID',
    'CONCERTOS_PORTAL_USUARIOS_SHEET_ID':'USUARIOS_WEB_SHEET_ID',
    'CONCERTOS_PORTAL_FILES_FOLDER_ID':'CONCERTOS_FILES_FOLDER_ID',
    'CONCERTOS_PORTAL_IMAGES_FOLDER_ID':'CONCERTOS_IMAGES_FOLDER_ID',
}.items():
    t = t.replace(old, new)
p.write_text(t, encoding='utf-8')

p = Path('apps-script/configuracion-entorno.gs')
t = p.read_text(encoding='utf-8')
for anchor, new_name in [
    ('USUARIOS_WEB_SPREADSHEET_ID','USUARIOS_WEB_SHEET_ID'),
    ('PERSOAS_SPREADSHEET_ID','PERSOAS_SHEET_ID'),
    ('CONCERTOS_SPREADSHEET_ID','CONCERTOS_SHEET_ID'),
    ('REXISTRO_ACCESOS_SPREADSHEET_ID','REXISTRO_ACCESOS_SHEET_ID'),
    ('ACEPTACION_SPREADSHEET_ID','ACEPTACION_SHEET_ID'),
    ('ACEPTACION_SHEET_ID','TEXTOS_LEGAIS_SHEET_ID'),
    ('FOTOS_SPREADSHEET_ID','FOTOS_SHEET_ID'),
    ('SOLICITUDES_SPREADSHEET_ID','SOLICITUDES_SHEET_ID'),
]:
    if f"'{new_name}'" in t: continue
    needle = f"  '{anchor}',"
    if needle not in t: raise SystemExit(f'Non se atopou áncora {anchor}')
    t = t.replace(needle, needle + f"\n  '{new_name}',", 1)
p.write_text(t, encoding='utf-8')

print('Normalización aplicada con gardas exactas.')
