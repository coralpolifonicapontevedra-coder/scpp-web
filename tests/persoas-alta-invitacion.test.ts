import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const script = readFileSync(resolve(process.cwd(), 'public/js/persoas-alta-invitacion.js'), 'utf8');
const footer = readFileSync(resolve(process.cwd(), 'src/components/Footer.astro'), 'utf8');

describe('alta por invitación de Persoas', () => {
  it('pide só nome, correo e teléfono e reutiliza a alta administrativa', () => {
    expect(script).toContain('Alta por invitación');
    expect(script).toContain('invite-name');
    expect(script).toContain('invite-email');
    expect(script).toContain('invite-phone');
    expect(script).toContain("body?.accion === 'crearPersoaAdministracion'");
  });

  it('xera a revisión e envía a ligazón tras crear a ficha provisional', () => {
    expect(script).toContain("accion: 'xerarLigazon'");
    expect(script).toContain("originalFetch('/api/persoas-revision-envio'");
    expect(script).toContain('ligazons: [review.ligazon]');
  });

  it('obriga ao interesado a completar o primeiro apelido', () => {
    expect(script).toContain("const SURNAME_SENTINEL = '__SCPP_PENDENTE_APELIDO__'");
    expect(script).toContain("input.value = ''");
    expect(script).toContain('Completa o teu primeiro apelido');
  });

  it('carga o comportamento desde o pé común sen modificar a páxina de Persoas', () => {
    expect(footer).toContain('/js/persoas-alta-invitacion.js');
  });
});
