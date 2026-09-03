import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const hook = readFileSync('src/lib/portal-session.js', 'utf8');
const altas = readFileSync('src/lib/repertorio-admin-altas.js', 'utf8');
const api = readFileSync('functions/api/repertorio-admin-altas.js', 'utf8');
const page = readFileSync('src/pages/portal/administracion/repertorio.astro', 'utf8');

describe('Altas de Obras e Audios en Administración de Repertorio', () => {
  it('carga a extensión só na ruta de Administración de Repertorio', () => {
    expect(hook).toContain("'/portal/administracion/repertorio/'");
    expect(hook).toContain("import('./repertorio-admin-altas.js')");
  });

  it('mantén intacto o fluxo xa validado de Nova partitura', () => {
    expect(page).toContain('id="new-partitura-dialog"');
    expect(page).toContain("if(tab==='partituras')openNewPartitura()");
    expect(altas).toContain("if (tab === 'partituras') return;");
  });

  it('activa as altas reais de obra e audio sen usar NomeAudio como columna', () => {
    expect(altas).toContain("'altaObraRepertorioAdministracion'");
    expect(altas).toContain("'altaAudioRepertorioAdministracion'");
    expect(api).toContain('AudioFile: `Obras_Files_/${nome}`');
    expect(api).not.toContain('NomeAudio:');
  });

  it('garda o audio en R2 antes de rexistralo e elimina o obxecto se falla a Sheet', () => {
    expect(api).toContain('repertorio/audios/${obra}/');
    expect(api).toContain("EstadoR2: 'Verificado'");
    expect(api).toContain('R2SHA256: sha256');
    expect(api).toContain('await env.R2_PRIVADO.delete(r2Key)');
  });

  it('actualiza o cache administrativo tras cada alta', () => {
    expect(api).toContain("await anexarCache(env, 'obra'");
    expect(api).toContain("await anexarCache(env, 'audio'");
    expect(api).toContain('repertorio/cache/administracion/${ramaActual(env)}/listado-v2.json');
  });
});
