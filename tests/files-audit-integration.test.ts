import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(resolve(root, '.github/workflows/audit-file-systems.yml'), 'utf8');
const script = readFileSync(resolve(root, 'scripts/audit-file-systems.py'), 'utf8');

describe('auditoría global de archivos', () => {
  it('mantén permisos de GitHub de só lectura', () => {
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('contents: write');
  });

  it('publica os tres informes e conserva o rexistro', () => {
    for (const name of ['files-audit.csv', 'files-audit.json', 'files-audit.md', 'files-audit.log']) {
      expect(workflow).toContain(name);
    }
  });

  it('inclúe os ámbitos prioritarios sen operacións de subida', () => {
    for (const scope of ['documentacion', 'actas', 'concertos_documentos', 'perfil_fotos']) {
      expect(script).toContain(`DriveScope("${scope}"`);
    }
    expect(script).not.toContain('put_object(');
    expect(script).not.toContain('delete_object(');
    expect(existsSync(resolve(root, 'scripts/audit-file-systems.py'))).toBe(true);
  });
});
