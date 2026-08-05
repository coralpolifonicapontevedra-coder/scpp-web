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

  it('propaga los fallos del script aunque la salida pase por tee', () => {
    expect(workflow).toContain('set -o pipefail');
  });

  it('comprueba escritura en Sheets antes de tocar R2', () => {
    const preflight = script.indexOf('verify_sheet_write_access(sheets, tab');
    const upload = script.indexOf('client.put_object(');
    expect(preflight).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(preflight);
  });

  it('amplía la cuadrícula antes de escribir columnas fuera del límite', () => {
    expect(script).toContain('def ensure_grid_columns(');
    expect(script).toContain('"appendDimension"');
    expect(script).toContain('"dimension": "COLUMNS"');
    const expand = script.indexOf('ensure_grid_columns(sheets, tab');
    const headers = script.indexOf('range=f"\'{tab}\'!{column_name(start)}1"');
    expect(expand).toBeGreaterThan(-1);
    expect(headers).toBeGreaterThan(expand);
  });

  it('reanuda objetos propios verificados y completa la hoja', () => {
    expect(script).toContain('metadata_from_existing(item, source, remote)');
    expect(script).toContain('R2_EXISTS_SHEET_UPDATED');
    expect(script).toContain('source-drive-id');
    expect(script).toContain('record-id');
  });

  it('registra la cuenta de servicio sin mostrar su clave', () => {
    expect(script).toContain('Cuenta de servicio de Google:');
    expect(script).not.toContain('private_key]');
  });
});
