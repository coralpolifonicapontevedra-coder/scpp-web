import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const helper = readFileSync('apps-script-preview/persoas-texto-legal-revision.js', 'utf8');
const dispatcher = readFileSync('apps-script-preview/xestion-permisos-dispatcher-integracion.js', 'utf8');
const workflow = readFileSync('.github/workflows/push-apps-script-preview.yml', 'utf8');

describe('ponte legal de revisións de Persoas en Preview', () => {
  it('le exclusivamente o texto DATOS_PERSOA_SCPP', () => {
    expect(helper).toContain("PERSOAS_REVISION_TEXTO_LEGAL_ID_ = 'DATOS_PERSOA_SCPP'");
    expect(helper).toContain("folla.getName() !== 'TextosLegais'");
    expect(helper).toContain('textoLegal: textoLegal');
  });

  it('expón unha acción administrativa específica sen cambiar a listaxe normal', () => {
    expect(dispatcher).toContain("'obterTextoLegalPersoasAdministracion'");
    expect(dispatcher).toContain("if (accion === 'obterTextoLegalPersoasAdministracion') return obterTextoLegalPersoasAdministracion_(datos)");
  });

  it('o deployment engade o texto só cando se solicita explicitamente', () => {
    expect(workflow).toContain("accion === 'listarPersoasAdministracion' && datos.incluirTextoLegalPersoas === true");
    expect(workflow).toContain('resultadoPersoasLegal.textoLegalPersoas = resultadoTextoLegalPersoas.textoLegal');
    expect(workflow).toContain("PREVIEW_ID='1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF'");
    expect(workflow).toContain("PRODUCTION_ID='1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV'");
  });
});
