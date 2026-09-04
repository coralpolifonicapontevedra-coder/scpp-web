import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Persoas usa a mesma fotografía que Perfil', () => {
  const photoApi = read('functions/api/persoas-foto-admin.js');
  const cacheSync = read('functions/api/persoas-cache-sync.js');
  const dispatcher = read('apps-script-production/xestion-permisos-dispatcher-integracion.js');
  const appsScript = read('apps-script-production/persoas-foto-perfil-v2.js');

  it('non garda unha segunda fotografía de Persoas en R2', () => {
    expect(photoApi).toContain("fonte: 'Perfil'");
    expect(photoApi).toContain("'persoasV2FotoPerfilGardar'");
    expect(photoApi).not.toContain('R2_PRIVADO.put(key, await file.arrayBuffer()');
    expect(photoApi).not.toContain('actual.${extension}');
  });

  it('serve a fotografía canónica de Perfil tamén en Administración', () => {
    expect(photoApi).toContain("'persoasV2FotoPerfilObter'");
    expect(photoApi).toContain("'X-SCPP-Photo-Source': 'Perfil'");
    expect(appsScript).toContain('obterFotoPerfilBase64_');
    expect(appsScript).toContain("ctx.row[ctx.ix.FotoPerfil]");
  });

  it('a carga desde Administración escribe FotoPerfil usando os helpers de Perfil', () => {
    expect(appsScript).toContain('gardarFotoPerfil_');
    expect(appsScript).toContain('ctx.ix.FotoPerfil + 1');
    expect(appsScript).toContain('persoasV2MarcarVersion_');
  });

  it('mantén un marcador de Perfil para todas as persoas nas caches', () => {
    expect(cacheSync).toContain("const PROFILE_MARKER_KEY = '__perfil__'");
    expect(cacheSync).toContain("source: 'perfil'");
    expect(cacheSync).toContain('buildProfilePhotoIndex');
    expect(cacheSync).toContain('next.persoas[ref] = profileMarker(persona)');
  });

  it('o dispatcher expón as tres operacións de fotografía de Perfil', () => {
    expect(dispatcher).toContain("'persoasV2FotoPerfilObter'");
    expect(dispatcher).toContain("'persoasV2FotoPerfilGardar'");
    expect(dispatcher).toContain("'persoasV2FotoPerfilEliminar'");
    expect(dispatcher).toContain('return persoasV2FotoPerfilObter_(datos)');
    expect(dispatcher).toContain('return persoasV2FotoPerfilGardar_(datos)');
    expect(dispatcher).toContain('return persoasV2FotoPerfilEliminar_(datos)');
  });
});
