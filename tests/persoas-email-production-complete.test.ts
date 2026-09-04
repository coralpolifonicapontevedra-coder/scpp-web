import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const helper = read('public/js/persoas-envio-individual.js');
const endpoint = read('functions/api/persoas-revision-envio.js');
const link = read('functions/api/persoas-revision-link-v4.js');
const dispatcher = read('apps-script-production/xestion-permisos-dispatcher-integracion.js');
const mail = read('apps-script-production/persoas-envio-revisions-v1.js');

describe('Administración → Persoas · revisión e envío en Producción', () => {
  it('resolve o correo desde o DD asociado e non desde o primeiro valor da sección', () => {
    expect(helper).toContain('term.nextElementSibling');
    expect(helper).toContain("valueNode?.tagName === 'DD'");
    expect(helper).not.toContain("term.parentElement?.querySelector('dd')");
  });

  it('evita o dobre envío accidental desde a interface', () => {
    expect(helper).toContain('let envioCompletado = false');
    expect(helper).toContain("button.textContent = envioCompletado ? 'Enviado'");
    expect(helper).toContain('if (envioEnCurso || envioCompletado) return');
  });

  it('non oculta un fallo ao gardar unha fotografía nova en R2', () => {
    expect(helper).toContain('Os datos gardáronse, pero non foi posible actualizar a fotografía en R2');
    expect(helper).toContain("'X-SCPP-Photo-Source': 'R2-ERROR'");
    expect(helper).not.toContain('profileHint(');
  });

  it('xera a revisión contra a Sheet actual e gárdaa en R2', () => {
    expect(link).toContain("accion: 'persoasV2Listar'");
    expect(link).toContain("estado: 'PENDENTE'");
    expect(link).toContain('R2_PRIVADO.put');
  });

  it('o endpoint só envía en Producción e valida revisións pendentes', () => {
    expect(endpoint).toContain("'coralpolifonicapontevedra.org'");
    expect(endpoint).toContain("String(invitation.estado || '') !== 'PENDENTE'");
    expect(endpoint).toContain('Date.parse(invitation.caducaEn || \'\') <= agora');
    expect(endpoint).toContain("accion: 'enviarRevisionsPersoasAdministracion'");
  });

  it('o dispatcher e a función de Apps Script coinciden', () => {
    expect(dispatcher).toContain("accion === 'enviarRevisionsPersoasAdministracion'");
    expect(dispatcher).toContain('return enviarRevisionsPersoasAdministracion_(datos)');
    expect(mail).toContain('function enviarRevisionsPersoasAdministracion_(datos)');
  });

  it('Apps Script revalida persoa, correo, caducidade e duplicados antes de MailApp', () => {
    expect(mail).toContain('obterAdministradorPersoasAdmin_');
    expect(mail).toContain('atoparIndiceFilaPersoaAdmin_');
    expect(mail).toContain('correoActual !== correo');
    expect(mail).toContain('new Date(caducaEn).getTime() <= Date.now()');
    expect(mail).toContain("PERSOAS_EMAIL_SENT_");
    expect(mail).toContain('MailApp.getRemainingDailyQuota()');
    expect(mail).toContain('MailApp.sendEmail');
  });

  it('o interruptor de correo só bloquea cando está explicitamente desactivado', () => {
    expect(mail).toContain("['false', '0', 'no', 'off']");
    expect(mail).not.toContain("getProperty('PERSOAS_ALLOW_EMAIL_SEND') || ''\n    ).toLowerCase() === 'true'");
  });
});
