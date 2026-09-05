import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const page = read('src/pages/portal/administracion/persoas.astro');
const controller = read('src/lib/persoas-admin-v4.js');
const api = read('functions/api/persoas-v2.js');
const photoApi = read('functions/api/persoas-foto-admin.js');
const profilePhotoApi = read('functions/api/perfil-foto-r2.js');
const cacheSync = read('functions/api/persoas-cache-sync.js');
const reviewSync = read('functions/api/persoas-review-cache-sync.js');
const reviewLink = read('functions/api/persoas-revision-link-v4.js');
const appsScript = read('apps-script-production/persoas-administracion-v2.js');
const legacy = read('apps-script-production/persoas-legacy-compat-v2.js');
const dispatcher = read('apps-script-production/xestion-permisos-dispatcher-integracion.js');
const syncPerfil = read('apps-script-production/persoas-sync-perfil-v2.js');
const feeApi = read('functions/api/persoas-exencion-cota.js');
const feeReview = read('public/js/persoas-exencion-revision.js');
const reviewHelper = read('public/js/persoas-envio-individual.js');

describe('Administración → Persoas v4 · Producción', () => {
  it('mantén unha única alta e un formulario común con fotografía e textos legais', () => {
    expect(page).toContain('id="new-person-button"');
    expect(page).not.toContain('invite-person-button');
    expect(page).not.toContain('Alta por invitación');
    expect(page).toContain('id="person-form"');
    expect(page).toContain('id="form-photo"');
    expect(page).toContain('id="legal-data-card"');
    expect(page).toContain('id="legal-fee-card"');
    expect(page).toContain('id="open-acceptance"');
    expect(page).toContain('style is:global');
    expect(page).toContain('initPersoasAdminV4');
  });

  it('constrúe o formulario desde o schema da Sheet e converte Enum en select', () => {
    expect(appsScript).toContain("{ key:'voz', header:'Voz', label:'Voz', type:'enum'");
    expect(appsScript).toContain("{ key:'tipoSocio', header:'Tipo de socio', label:'Tipo de socio', type:'enum'");
    expect(appsScript).toContain('DataValidationCriteria.VALUE_IN_LIST');
    expect(appsScript).toContain('persoasV2OpcionsValores_');
    expect(controller).toContain("if (field?.type === 'enum')");
    expect(controller).toContain("input = document.createElement('select')");
  });

  it('ordena e etiqueta as persoas por apelidos e nome, incluídas as baixas', () => {
    expect(appsScript).toContain('[a.primeiroApelido, a.segundoApelido, a.nome]');
    expect(appsScript).toContain("[primeiro, segundo].filter(Boolean).join(' ') + (nome ? ', ' + nome : '')");
    expect(controller).toContain("' · BAIXA'");
    expect(controller).toContain("selected?.activo === true ? 'Rexistrar baixa' : 'Reactivar persoa'");
    expect(api).not.toContain('persoa?.activo !== true');
    expect(api).toContain('return servirFicha(env, persoa)');
  });

  it('separa baixa de eliminación física e protexe rexistros vinculados', () => {
    expect(controller).toContain('Rexistrar baixa');
    expect(page).toContain('Eliminar rexistro');
    expect(appsScript).toContain("persoasV2Autorizar_(datos, 'administracion')");
    expect(appsScript).toContain('persoasV2TenUsuarioWeb_');
    expect(appsScript).toContain('persoasV2TenAceptacion_');
    expect(appsScript).toContain('sheet.deleteRow(rowIndex + 1)');
    expect(api).toContain('limparR2Eliminacion');
  });

  it('usa permisos do módulo Persoas para lectura, escritura e administración', () => {
    expect(api).toContain("const MODULO = 'persoas'");
    expect(api).toContain('permission.podeLer');
    expect(api).toContain('permission.podeEscribir');
    expect(api).toContain('permission.podeAdministrar');
    expect(appsScript).toContain("fonte:'PermisosPortal'");
  });

  it('rexenera Sheet → R2 e mantén R2 como fonte canónica da fotografía', () => {
    expect(api).toContain('aplicarEscrituraEnR2(context.env, user, permission, action, result)');
    expect(api).toContain('consultarListado(context.env, user, permission)');
    expect(api).toContain('context.waitUntil(');
    expect(cacheSync).toContain("accion: 'persoasV2SyncListar'");
    expect(cacheSync).toContain("'persoas/cache/snapshot-v4.json'");
    expect(appsScript).toContain('persoasV2OnEdit_');
    expect(appsScript).toContain('UrlFetchApp.fetch(PERSOAS_V2_CONFIG_.syncUrl');
    expect(photoApi).toContain('refreshCaches');
    expect(photoApi).toContain("source: 'r2'");
    expect(profilePhotoApi).toContain("source: 'r2'");
    expect(cacheSync).toContain("fotoCanonica: 'R2'");
    expect(syncPerfil).toContain("fonte:'admin-persoas-cache-r2'");
    expect(reviewSync).toContain("revision?.estado !== 'COMPLETADA'");
    expect(feeReview).toContain('/api/persoas-review-cache-sync');
  });

  it('serve os dous textos legais e conserva a aceptación electrónica', () => {
    expect(appsScript).toContain("PERSOAS_V2_TEXTO_DATOS_ = 'DATOS_PERSOA_SCPP'");
    expect(appsScript).toContain("PERSOAS_V2_TEXTO_COTA_ = 'EXENCION_COTA_SCPP'");
    expect(feeApi).toContain("const LEGAL_ID = 'EXENCION_COTA_SCPP'");
    expect(feeReview).toContain('fee-exemption-card');
    expect(feeReview).toContain('/api/persoas-exencion-cota');
    expect(reviewLink).toContain("const LEGAL_DATOS_ID = 'DATOS_PERSOA_SCPP'");
    expect(reviewLink).toContain("const LEGAL_COTA_ID = 'EXENCION_COTA_SCPP'");
    expect(reviewLink).toContain('validarTextoLegal(listado?.textosLegais?.datosPersoa, LEGAL_DATOS_ID)');
    expect(reviewLink).toContain('validarTextoLegal(listado?.textosLegais?.exencionCota, LEGAL_COTA_ID)');
    expect(reviewLink).toContain('combinarTextos(textoLegalBase, textoCota)');
    expect(legacy).toContain('persoasLegacyRexistrarAceptacion_');
    expect(legacy).toContain("put('Documento', aceptacion.documento)");
    expect(reviewHelper).toContain('/api/persoas-revision-link-v4');
  });

  it('toma o correo do dd correspondente e non o teléfono da sección', () => {
    expect(reviewHelper).toContain('const valueNode = term.nextElementSibling');
    expect(reviewHelper).toContain("valueNode?.tagName === 'DD'");
    expect(reviewHelper).toContain("return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value) ? value : ''");
  });

  it('despacha só as novas accións de Persoas sen crear outro doPost', () => {
    expect(dispatcher).toContain("'persoasV2Listar'");
    expect(dispatcher).toContain("'persoasV2Crear'");
    expect(dispatcher).toContain("'persoasV2Eliminar'");
    expect(dispatcher).toContain('return persoasV2InstalarTriggerESincronizarPerfil_(datos)');
    expect(dispatcher).not.toContain('function doPost');
  });
});
