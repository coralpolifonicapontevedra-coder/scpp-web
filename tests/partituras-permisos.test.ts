import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('permisos do módulo Partituras', () => {
  const api = read('functions/api/partituras.js');

  it('permite listar e abrir partituras cunha sesión Firebase válida sen esixir permiso específico', () => {
    expect(api).toContain("const accionsLectura = new Set(['listarPartiturasPortal', 'obterFicheiroPartitura']);");
    expect(api).not.toContain('podeLerPartituras');
    expect(api).not.toContain("if (accionsLectura.has(accion) && !podeLerPartituras(nivelPermiso))");
  });

  it('consulta o permiso efectivo do propio usuario só para accións de escritura', () => {
    expect(api).toContain("if (accionsEscritura.has(accion)) {");
    expect(api).toContain("accion: 'obterPermisosUsuarioPortal'");
    expect(api).toContain('usuarioEmail: clave');
    expect(api).toContain('resultado?.efectivos?.partituras');
  });

  it('limita altas e baixas a escritura ou administración', () => {
    expect(api).toContain("return ['escritura', 'administracion'].includes(nivel);");
    expect(api).toContain("const accionsEscritura = new Set(['altaPartituraPortal', 'eliminarPartituraPortal']);");
    expect(api).toContain('if (!podeEscribirPartituras(nivelPermiso))');

    const control = api.indexOf('if (accionsEscritura.has(accion))');
    const alta = api.indexOf("if (accion === 'altaPartituraPortal')");
    const baixa = api.indexOf("if (accion === 'eliminarPartituraPortal')");

    expect(control).toBeGreaterThan(-1);
    expect(control).toBeLessThan(alta);
    expect(control).toBeLessThan(baixa);
  });
});
