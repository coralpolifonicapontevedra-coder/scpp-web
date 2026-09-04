import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Accesos e permisos en Producción', () => {
  it('encamiña as accións de permisos antes do rexeitamento final', () => {
    const dispatcher = read('apps-script-production/repertorio-dispatcher-integracion.js');
    expect(dispatcher).toContain("typeof despacharXestionPermisosPortal_ === 'function'");
    expect(dispatcher).toContain('despacharXestionPermisosPortal_(accion, datos, bloqueo)');
  });

  it('integra Accesos e permisos na navegación administrativa común', () => {
    const nav = read('src/components/AdministracionNav.astro');
    const page = read('src/pages/portal/administracion/permisos.astro');
    expect(nav).toContain("id: 'permisos'");
    expect(nav).toContain("/portal/administracion/permisos/");
    expect(page).toContain("import AdministracionNav from '../../../components/AdministracionNav.astro'");
    expect(page).toContain('<AdministracionNav active="permisos" />');
  });
});
