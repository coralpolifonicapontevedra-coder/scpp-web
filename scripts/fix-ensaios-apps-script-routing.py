from pathlib import Path

path = Path('functions/_lib/apps-script.js')
text = path.read_text(encoding='utf-8')

anchor = """const ACCIONS_ARQUIVO_ADMIN_PROTEXIDAS = new Set([\n  'listarArquivoAdministracion',\n  'gardarFondoAdministracion',\n  'gardarElementoFondoAdministracion',\n  'gardarMovementoArquivoAdministracion',\n  'gardarElementoMovementoAdministracion',\n  'rexistrarDevolucionArquivoAdministracion'\n]);\n"""
insert = anchor + """\nconst ACCIONS_ENSAIOS_PROTEXIDAS = new Set([\n  'listarEnsaiosPortal',\n  'gardarEnsaioPortal',\n  'gardarAsistenciaEnsaioPortal',\n  'eliminarAsistenciaEnsaioPortal',\n  'gardarEnsaioRepertorioPortal',\n  'actualizarEnsaioAdministracionPortal',\n  'eliminarEnsaioPortal',\n  'obterSeguimentoEnsaiosPortal'\n]);\n"""

if 'const ACCIONS_ENSAIOS_PROTEXIDAS' not in text:
    if anchor not in text:
        raise SystemExit('Non se atopou o bloque de accións de Arquivo para inserir Ensaios')
    text = text.replace(anchor, insert, 1)

old = """    || ACCIONS_PERMISOS_PROTEXIDAS.has(accion)\n    || ACCIONS_ACEPTACION_PROTEXIDAS.has(accion)\n    || ACCIONS_ARQUIVO_ADMIN_PROTEXIDAS.has(accion);\n"""
new = """    || ACCIONS_PERMISOS_PROTEXIDAS.has(accion)\n    || ACCIONS_ACEPTACION_PROTEXIDAS.has(accion)\n    || ACCIONS_ARQUIVO_ADMIN_PROTEXIDAS.has(accion)\n    || ACCIONS_ENSAIOS_PROTEXIDAS.has(accion);\n"""

if new not in text:
    if old not in text:
        raise SystemExit('Non se atopou a condición de accións protexidas')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('OK | functions/_lib/apps-script.js | Ensaios fixado ao despregue da rama')
