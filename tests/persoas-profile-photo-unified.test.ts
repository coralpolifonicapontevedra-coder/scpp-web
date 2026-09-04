import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Perfil e Persoas comparten unha única fotografía en R2', () => {
  const adminPhotoApi = read('functions/api/persoas-foto-admin.js');
  const selfPhotoApi = read('functions/api/perfil-foto-r2.js');
  const cacheSync = read('functions/api/persoas-cache-sync.js');
  const portalHelper = read('public/js/persoas-envio-individual.js');

  it('garda o binario real da fotografía en R2', () => {
    expect(adminPhotoApi).toContain('R2_PRIVADO.put(key, bytes');
    expect(adminPhotoApi).toContain("source: 'r2'");
    expect(adminPhotoApi).toContain('canonical: true');
    expect(adminPhotoApi).toContain("'X-SCPP-Photo-Source', 'R2'");
  });

  it('migra a fotografía histórica de FotoPerfil sen obrigar a subila de novo', () => {
    expect(adminPhotoApi).toContain("'persoasV2FotoPerfilObter'");
    expect(adminPhotoApi).toContain("migradaDesde: 'FotoPerfil'");
    expect(adminPhotoApi).toContain('migrateLegacyPhoto');
  });

  it('o Perfil le e escribe esa mesma fotografía de R2', () => {
    expect(selfPhotoApi).toContain("const PHOTO_INDEX_MAIN = 'persoas/fotos/index.json'");
    expect(selfPhotoApi).toContain('resolveOwnPerson');
    expect(selfPhotoApi).toContain('storePhoto');
    expect(selfPhotoApi).toContain("fonte: 'R2'");
    expect(portalHelper).toContain("'/api/perfil-foto-r2'");
    expect(portalHelper).toContain('delete forwarded.fotoBase64');
    expect(portalHelper).toContain('delete forwarded.fotoTipo');
    expect(portalHelper).toContain("profile.fotoFonte = 'R2'");
  });

  it('FotoPerfil queda só como pista de migración e nunca pisa unha foto real de R2', () => {
    expect(cacheSync).toContain('validStoredPhoto(existing)');
    expect(cacheSync).toContain("source: 'legacy-profile'");
    expect(cacheSync).toContain('canonical: false');
    expect(cacheSync).toContain("fotoCanonica: 'R2'");
  });
});
