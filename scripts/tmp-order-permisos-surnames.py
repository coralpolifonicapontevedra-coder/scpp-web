from pathlib import Path

path = Path('src/pages/portal/administracion/permisos.astro')
text = path.read_text(encoding='utf-8')

old = "  const nome = (u) => u?.nome || u?.persoa || u?.email || '—';\n  const permisosUsuario = (email) => data.permisos.filter((p) => p.email === email && p.activo !== false);"
new = """  const nome = (u) => u?.nome || u?.persoa || u?.email || '—';
  const claveOrdenApelidos = (u) => {
    const completo = String(nome(u) || '').trim();
    const partes = completo.split(/\\s+/).filter(Boolean);
    if (partes.length <= 1) return completo;
    const nApelidos = partes.length >= 3 ? 2 : 1;
    return `${partes.slice(-nApelidos).join(' ')} ${partes.slice(0, -nApelidos).join(' ')}`.trim();
  };
  const compararPorApelidos = (a, b) =>
    claveOrdenApelidos(a).localeCompare(claveOrdenApelidos(b), 'gl', { sensitivity:'base' }) ||
    nome(a).localeCompare(nome(b), 'gl', { sensitivity:'base' });
  const permisosUsuario = (email) => data.permisos.filter((p) => p.email === email && p.activo !== false);"""

if text.count(old) != 1:
    raise SystemExit('BLOQUEADO: punto de inserción inesperado')
text = text.replace(old, new, 1)

old_list = """    const usuarios = data.usuarios.filter((u) => {
      const coincideTexto = !query || (`${nome(u)} ${u.email}`).toLowerCase().includes(query);
      const coincideModulo = !modulo || permisosConcedidosUsuario(u.email).some((p) => p.modulo === modulo);
      return coincideTexto && coincideModulo;
    });"""
new_list = """    const usuarios = data.usuarios.filter((u) => {
      const coincideTexto = !query || (`${nome(u)} ${u.email}`).toLowerCase().includes(query);
      const coincideModulo = !modulo || permisosConcedidosUsuario(u.email).some((p) => p.modulo === modulo);
      return coincideTexto && coincideModulo;
    }).sort(compararPorApelidos);"""

if text.count(old_list) != 1:
    raise SystemExit('BLOQUEADO: lista visual inesperada')
text = text.replace(old_list, new_list, 1)
path.write_text(text, encoding='utf-8')
