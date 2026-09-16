import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8');

const eliminacion = read('apps-script-production/repertorio-eliminar.js');
const administracion = read('apps-script-production/repertorio-administracion.js');
const dispatcher = read('apps-script-production/repertorio-dispatcher-integracion.js');
const partiturasPortal = read('apps-script-production/partituras-portal.js');
const altas = read('functions/api/repertorio-admin-altas.js');
const cache = read('functions/api/repertorio-cache-v2.js');

describe('integridade transversal do repertorio', () => {
  it('impide eliminar unha obra utilizada en ensaios ou concertos, mesmo con cascada', () => {
    expect(eliminacion).toContain("'EnsaiosRepertorio'");
    expect(eliminacion).toContain("'ConcertosRepertorio'");
    expect(eliminacion).toContain("codigo:'REFERENCIAS_HISTORICAS'");
    expect(eliminacion.indexOf('if (deps.ensaios || deps.concertos)')).toBeLessThan(
      eliminacion.indexOf('if ((deps.partituras || deps.audios) && !cascada)')
    );
  });

  it('fai idempotentes as altas de audio e permite concilialas por R2Key', () => {
    expect(administracion).toContain('function buscarAudioRepertorioAdministracion_(d)');
    expect(administracion).toContain('xaExistia:true');
    expect(dispatcher).toContain("'buscarAudioRepertorioAdministracion'");
    expect(dispatcher).toContain("return buscarAudioRepertorioAdministracion_(datos)");
  });

  it('non borra o audio cando a resposta de Apps Script é incerta', () => {
    expect(altas).toContain('async function conciliarAudioPorR2Key');
    expect(altas).toContain("codigo: 'ALTA_PENDENTE_CONCILIACION'");
    expect(altas).toContain('preservado: true');
    expect(altas).toContain('if (!resultado?.ok)');
  });

  it('fai idempotente a alta de partituras por R2Key', () => {
    expect(partiturasPortal).toContain('function atoparPartituraPorR2Key_');
    expect(partiturasPortal).toContain('xaExistia: true');
  });

  it('limita a 24 horas a antigüidade do catálogo usado como respaldo', () => {
    expect(cache).toContain('const CACHE_STALE_MAX_MS = 24 * 60 * 60 * 1000;');
    expect(cache).toContain('function catalogoRespaldoValido(catalogo)');
    expect(cache).toContain("codigo: 'REPERTORIO_CACHE_EXPIRED'");
    expect(cache).toContain("estado: 'respaldo'");
  });
});
