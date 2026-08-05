import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(resolve(root, '.github/workflows/migrate-concert-media-to-r2.yml'), 'utf8');
const script = readFileSync(resolve(root, 'scripts/migrate-concert-media-to-r2.py'), 'utf8');

describe('migración de medios de conciertos', () => {
  it('empieza en plan y exige confirmación explícita', () => {
    expect(workflow).toContain('default: plan');
    expect(workflow).toContain('MIGRAR_CONCERTOS');
    expect(workflow).toContain('set -o pipefail');
  });

  it('no borra Drive ni sobrescribe conflictos R2', () => {
    expect(script).not.toContain('delete_object(');
    expect(script).not.toContain('files().delete(');
    expect(script).toContain('ERROR_REMOTE_CONFLICT');
  });

  it('clasifica como públicos carteles, programas y prensa referenciados', () => {
    expect(script).toContain('if "Cartel" in roles:');
    expect(script).toContain('"public", "concertos/imaxes"');
    expect(script).toContain('"public", "concertos/documentos"');
  });

  it('mantiene los huérfanos privados y pendientes de revisión', () => {
    expect(script).toContain('"private-pending-review", "concertos/pendentes"');
    expect(script).toContain('pending_review');
  });

  it('tolera una carpeta mal indicada cuando el nombre del archivo coincide', () => {
    expect(script).toContain('@basename/');
    expect(script).toContain("references.get(logical_path) or references.get(basename_key, {})");
  });

  it('reconoce como públicos los carteles compartidos identificados por nombre', () => {
    expect(script).toContain('infer_roles_from_name');
    expect(script).toContain('"cartel": "Cartel"');
    expect(script).toContain('reference = {"roles": inferred_roles, "concert_ids": set()}');
  });

  it('deduplica por contenido y conserva originales no enlazados', () => {
    expect(script).toContain('concertos/orixinais');
    expect(script).toContain('identity = source_md5 or slug(relative_path)');
    expect(script).toContain('OK_R2_DUPLICATE_CONTENT');
    expect(script).toContain('metadata.get("source-md5") == asset.source_md5');
  });

  it('verifica tamaño, identidad de Drive y SHA-256', () => {
    expect(script).toContain('source-drive-id');
    expect(script).toContain('sha256');
    expect(script).toContain('UPLOADED_VERIFIED');
    expect(script).toContain('md5Checksum');
    expect(script).toContain('ERROR_DOWNLOAD_MD5');
    expect(script).toContain('PDF_DEMASIADO_GRANDE_REVISAR_ANTES_DE_PUBLICAR');
  });
});

