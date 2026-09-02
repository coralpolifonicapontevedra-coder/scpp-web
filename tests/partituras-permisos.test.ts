import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('permisos do módulo Partituras', () => {
  const api = read('functions/api/partituras.js');

  it('consulta o permiso efectivo do propio usuario para o módulo partituras', () => {
    expect(api).toContain("accion: 'obterPermisosUsuarioPortal'");
    expect(api).toContain('usuarioEmail: clave');
    expect(api).toContain('resultado?.efectivos?.partituras');
  });

  it('permite lectura a lectura, escritura e administración', () => {
    expect(api).toContain("return ['lectura', 'escritura', 'administracion'].includes(nivel);");
    expect(api).toContain("if (accionsLectura.has(accion) && !podeLerPartituras(nivelPermiso))");
  });

  it('limita altas e baixas a escritura ou administración', () => {
    expect(api).toContain("return ['escritura', 'administracion'].includes(nivel);");
    expect(api).toContain("const accionsEscritura = new Set(['altaPartituraPortal', 'eliminarPartituraPortal']);");

    const control = api.indexOf('if (accionsEscritura.has(accion) && !podeEscribirPartituras(nivelPermiso))');
    const alta = api.indexOf("if (accion === 'altaPartituraPortal')");
    const baixa = api.indexOf("if (accion === 'eliminarPartituraPortal')");

    expect(control).toBeGreaterThan(-1);
    expect(control).toBeLessThan(alta);
    expect(control).toBeLessThan(baixa);
  });
});
