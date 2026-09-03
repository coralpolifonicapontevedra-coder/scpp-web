import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const front = readFileSync('src/lib/repertorio-admin-eliminar.js', 'utf8');
const api = readFileSync('functions/api/repertorio-admin-eliminar.js', 'utf8');
const dispatcher = readFileSync('apps-script-preview/concertos-dispatcher-integracion.js', 'utf8');
const apps = readFileSync('apps-script-preview/repertorio-eliminar.js', 'utf8');
const ids = readFileSync('apps-script-preview/repertorio-id-seguro.js', 'utf8');

describe('Eliminación de Repertorio en Preview', () => {
  it('ofrece eliminación nos tres tipos con confirmación', () => {
    expect(front).toContain("tab === 'partituras' ? 'partitura' : tab === 'audios' ? 'audio' : 'obra'");
    expect(front).toContain('window.confirm');
    expect(front).toContain('Eliminar ${etiquetaTipo(tipo)}');
  });

  it('pide unha segunda confirmación antes da cascada', () => {
    expect(apps).toContain("codigo:'DEPENDENCIAS'");
    expect(api).toContain('requireCascade:true');
    expect(front).toContain('Queres eliminar todo en cascada?');
    expect(front).toContain('pedirEliminacion(tipo, id, true)');
  });

  it('elimina recursos vinculados antes da obra e devolve claves R2', () => {
    expect(apps).toContain("localizarDependenciasObraRepertorioEliminar_('Partituras_App', 'Id_Repertorio', id)");
    expect(apps).toContain("localizarDependenciasObraRepertorioEliminar_('AudiosRepertorio', 'NomeObra', id)");
    expect(apps).toContain('eliminarFilasDescRepertorio_(deps.filasPartituras)');
    expect(apps).toContain('eliminarFilasDescRepertorio_(deps.filasAudios)');
    expect(apps).toContain('r2Keys:r2Keys');
  });

  it('limpa R2 só con claves seguras e invalida o caché', () => {
    expect(api).toContain("key.startsWith('partituras/')");
    expect(api).toContain("key.startsWith('repertorio/audios/')");
    expect(api).toContain('env.R2_PRIVADO.delete(item.key)');
    expect(api).toContain('env.R2_PRIVADO.delete(cacheKey(env))');
  });

  it('non reutiliza IDs que sigan presentes en recursos históricos', () => {
    expect(ids).toContain("filasRepertorioAdmin_('Repertorio')");
    expect(ids).toContain("filasRepertorioAdmin_('Partituras_App')");
    expect(ids).toContain("filasRepertorioAdmin_('AudiosRepertorio')");
    expect(dispatcher).toContain('altaObraRepertorioAdministracionSegura_(datos)');
  });

  it('despacha a eliminación como escritura administrativa', () => {
    expect(dispatcher).toContain("'eliminarRecursoRepertorioAdministracion'");
    expect(dispatcher).toContain('eliminarRecursoRepertorioAdministracion_(datos)');
  });
});
