import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('consulta de permisos do usuario autenticado', () => {
  it('non permite que usuarioEmail enviado polo cliente substitúa o correo validado por Firebase', () => {
    const api = read('functions/api/permisos.js');

    expect(api).toContain("if (accion === 'obterPermisosUsuarioPortal')");
    expect(api).toContain('payload.usuarioEmail = user.email;');
  });
});
