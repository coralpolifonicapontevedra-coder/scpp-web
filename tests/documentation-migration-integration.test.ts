import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(resolve(root, '.github/workflows/migrate-documentation-to-r2.yml'), 'utf8');
const script = readFileSync(resolve(root, 'scripts/migrate-documentation-to-r2.py'), 'utf8');

describe('migración de Documentación y Actas', () => {
  it('empieza en plan y exige confirmación para subir', () => {
    expect(workflow).toContain('default: plan');
    expect(workflow).toContain('MIGRAR_DOCUMENTACION');
  });

  it('no contiene borrado ni sobrescritura de conflictos', () => {
    expect(script).not.toContain('delete_object(');
    expect(script).not.toContain('trashed=true');
    expect(script).toContain('ERROR_REMOTE_CONFLICT');
  });

  it('usa claves privadas separadas para documentos y actas', () => {
    expect(script).toContain('documentacion/documentos');
    expect(script).toContain('documentacion/actas');
  });
});
