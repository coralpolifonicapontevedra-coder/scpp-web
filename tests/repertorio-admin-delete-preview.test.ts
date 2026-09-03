import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const front = readFileSync('src/lib/repertorio-admin-eliminar.js', 'utf8');
const api = readFileSync('functions/api/repertorio-admin-eliminar.js', 'utf8');
const dispatcher = readFileSync('apps-script-preview/concertos-dispatcher-integracion.js', 'utf8');
const apps = readFileSync('apps-script-preview/repertorio-eliminar.js', 'utf8');

describe('Eliminación de Repertorio en Preview', () => {
  it('ofrece eliminación nos tres tipos con confirmación', () => {
    expect(front).toContain("tab === 'partituras' ? 'partitura' : tab === 'audios' ? 'audio' : 'obra'");
    expect(front).toContain('window.confirm');
    expect(front).toContain('Eliminar ${etiquetaTipo(tipo)}');
  });

  it('impide eliminar obras con recursos vinculados', () => {
    expect(apps).toContain("codigo:'DEPENDENCIAS'");
    expect(apps).toContain("filasRepertorioAdmin_('Partituras_App')");
    expect(apps).toContain("filasRepertorioAdmin_('AudiosRepertorio')");
  });

  it('elimina o ficheiro R2 só para claves seguras', () => {
    expect(api).toContain("key.startsWith('partituras/')");
    expect(api).toContain("key.startsWith('repertorio/audios/')");
    expect(api).toContain('R2_PRIVADO.delete(key)');
  });

  it('despacha a acción como escritura administrativa', () => {
    expect(dispatcher).toContain("'eliminarRecursoRepertorioAdministracion'");
    expect(dispatcher).toContain('eliminarRecursoRepertorioAdministracion_(datos)');
  });
});
