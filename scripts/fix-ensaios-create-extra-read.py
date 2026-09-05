from pathlib import Path

path = Path('functions/api/ensaios-admin-v2.js')
text = path.read_text(encoding='utf-8')
old = """      const concerto = clean(body.concerto);\n      const base = (await getIndex(env, user, false)).index;\n      const result = await apps(env, user, 'gardarEnsaioPortal', {\n"""
new = """      const concerto = clean(body.concerto);\n      const base = concerto\n        ? (await getIndex(env, user, false)).index\n        : { concertos: [], repertorio: [] };\n      const result = await apps(env, user, 'gardarEnsaioPortal', {\n"""
if new not in text:
    if old not in text:
        raise SystemExit('Non se atopou o bloque de alta de ensaio esperado')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('OK | functions/api/ensaios-admin-v2.js | evitada lectura previa sen concerto')
