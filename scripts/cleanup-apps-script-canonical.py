from pathlib import Path
import re, subprocess

EXPECTED = {
    'apps-script/Código.gs': '5b8ea56bb9e6d0205e0a0c22abb94d0efc97bc66',
    'apps-script/fotos-portal.gs': '221851bcd82086d89ad457fa355af797cf36b678',
    'apps-script/r2-fotos-portal.gs': '214ade527bfe582d2d99fe793b257aae1b5a4031',
    'apps-script/asistencias-concertos-portal.gs': '234a8d377150fba0460842409fa78820a7f94bc8',
    'apps-script/aceptacion-portal.gs': '5d5937c6dc4061ae96207d45b59eadf53ac45338',
    'apps-script/aceptacion-textos-legais.gs': 'e9168f09b9659dbf218d70648801f1a45fd9dee1',
    'apps-script/ensaios-alta.gs': '084aeec37c98a37ae3d45c9e2629475b463fbb52',
    'apps-script/ensaios-portal.gs': '62a6e9c5fb59bda494a06c661523c80e443f045f',
}

for path, expected in EXPECTED.items():
    actual = subprocess.check_output(['git', 'hash-object', path], text=True).strip()
    if actual != expected:
        raise SystemExit(f'ABORTADO: {path} mudou. Esperado {expected}, actual {actual}')


def remove_function(text: str, name: str) -> str:
    m = re.search(r'^function\s+' + re.escape(name) + r'\s*\(', text, re.M)
    if not m:
        raise SystemExit(f'Non se atopou function {name}')
    brace = text.find('{', m.start())
    if brace < 0:
        raise SystemExit(f'Non se atopou apertura de {name}')
    depth = 0
    quote = None
    escaped = False
    line_comment = False
    block_comment = False
    i = brace
    while i < len(text):
        c = text[i]
        n = text[i+1] if i + 1 < len(text) else ''
        if line_comment:
            if c == '\n':
                line_comment = False
            i += 1
            continue
        if block_comment:
            if c == '*' and n == '/':
                block_comment = False
                i += 2
                continue
            i += 1
            continue
        if quote:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == quote:
                quote = None
            i += 1
            continue
        if c == '/' and n == '/':
            line_comment = True
            i += 2
            continue
        if c == '/' and n == '*':
            block_comment = True
            i += 2
            continue
        if c in "'\"`":
            quote = c
            i += 1
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                while end < len(text) and text[end] in ' \t':
                    end += 1
                if end < len(text) and text[end] == '\r':
                    end += 1
                if end < len(text) and text[end] == '\n':
                    end += 1
                return text[:m.start()] + text[end:]
        i += 1
    raise SystemExit(f'Función sen peche: {name}')

# Fotos: conservar as versións transaccionais especializadas de r2-fotos-portal.gs.
p = Path('apps-script/fotos-portal.gs')
t = p.read_text(encoding='utf-8')
for fn in ['obterFotoParaR2Portal_', 'listarFotosPendentesR2Portal_', 'gardarRutasFotoR2Portal_']:
    t = remove_function(t, fn)
p.write_text(t, encoding='utf-8')

# Módulos redundantes: a implementación canónica xa permanece noutro ficheiro cargado.
for path in [
    'apps-script/asistencias-concertos-portal.gs',
    'apps-script/aceptacion-portal.gs',
    'apps-script/aceptacion-textos-legais.gs',
    'apps-script/ensaios-alta.gs',
]:
    subprocess.check_call(['git', 'rm', path])

# O histórico segue conservado no repo, pero fóra da fonte despregable.
src = Path('apps-script/canonical-2026-08-03')
dst = Path('docs/archive/apps-script/canonical-2026-08-03')
if not src.exists():
    raise SystemExit('Non existe o histórico canonical-2026-08-03')
if dst.exists():
    raise SystemExit('Xa existe o destino histórico; abortado para non sobrescribir')
dst.parent.mkdir(parents=True, exist_ok=True)
subprocess.check_call(['git', 'mv', str(src), str(dst)])

# Garantía explícita: Ensaios funcional non se modifica.
actual_ensaios = subprocess.check_output(['git', 'hash-object', 'apps-script/ensaios-portal.gs'], text=True).strip()
if actual_ensaios != EXPECTED['apps-script/ensaios-portal.gs']:
    raise SystemExit('ABORTADO: ensaios-portal.gs foi modificado')

print('Limpeza aplicada. ensaios-portal.gs permanece idéntico ao snapshot de Produción.')
