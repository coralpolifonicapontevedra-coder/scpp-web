import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const editorOriginal = readFileSync(resolve(root, 'functions/api/editor-fotos-original.js'), 'utf8');
const miniatura = readFileSync(resolve(root, 'functions/api/editor-fotos-miniatura.js'), 'utf8');
const fallback = readFileSync(resolve(root, 'public/js/admin-fotografias-fallback.js'), 'utf8');
const middleware = readFileSync(resolve(root, 'functions/portal/_middleware.js'), 'utf8');

describe('Fallback de fotografías aprobadas e miniaturas incompletas', () => {
  it('o editor mantén borradores/traballo como prioridade e recupera tamén os índices estables', () => {
    expect(editorOriginal).toContain('fotos/borradores/${idFoto}');
    expect(editorOriginal).toContain('fotos/traballo/${idFoto}.json');
    expect(editorOriginal).toContain("const CATALOGO = 'indices/catalogo-fotos.json'");
    expect(editorOriginal).toContain("const INDEX_PUBLICO = 'indices/galeria-publica-v1.json'");
    expect(editorOriginal).toContain("const INDEX_PRIVADO = 'indices/galeria-privada.json'");
    expect(editorOriginal).toContain('resolverRutaIndices(env, idFoto)');
    expect(editorOriginal).toContain("'R2-INDEX-PUBLIC'");
    expect(editorOriginal).toContain("'R2-INDEX-PRIVATE'");
  });

  it('usa o endpoint autenticado de miniatura como respaldo visual', () => {
    expect(fallback).toContain('/api/editor-fotos-miniatura?idFoto=');
    expect(fallback).toContain('Authorization: `Bearer ${idToken}`');
    expect(fallback).toContain("node.dataset.fallbackOriginal = 'true'");
    expect(middleware).toContain('/js/admin-fotografias-fallback.js?v=20260827-1');
  });

  it('non reescribe a mesma src do diálogo nin observa src, evitando bucles en móbil', () => {
    expect(fallback).toContain("if (image.getAttribute('src') !== src) image.src = src;");
    expect(fallback).toContain("attributeFilter: ['class', 'href']");
    expect(fallback).not.toContain("attributeFilter: ['class', 'src', 'href']");
  });

  it('o fallback de miniatura acepta a caché central de Administración', () => {
    expect(miniatura).toContain("const ADMIN_AUTH_PREFIX = 'persoas/cache/administracion/'");
    expect(miniatura).toContain('datos?.payload?.perfil?.nivel === \'Administración\'');
    expect(miniatura).toContain('30 * 24 * 60 * 60 * 1000');
  });

  it('non perde rutas por campos baleiros dun índice máis novo ou antigo', () => {
    expect(miniatura).toContain('rutasCandidatasRexistros(rexistros');
    expect(miniatura).toContain('localizarFoto(identificador, catalogo)');
    expect(miniatura).toContain('localizarFoto(identificador, publica)');
    expect(miniatura).toContain("'R2-PRIVADO-COPIA-PUBLICA'");
    expect(miniatura).toContain("'R2-PUBLICO-COPIA-PRIVADA'");
  });
});
