import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicIndex = readFileSync(resolve(root, 'functions/api/concertos-indice.js'), 'utf8');
const previewAttendance = readFileSync(resolve(root, 'functions/api/asistencias-concertos-preview.js'), 'utf8');
const portalRoute = readFileSync(resolve(root, 'functions/portal/concertos/index.js'), 'utf8');
const agendaRoute = readFileSync(resolve(root, 'functions/axenda/index.js'), 'utf8');
const sections = readFileSync(resolve(root, 'public/js/concertos-seccions.js'), 'utf8');

 describe('concertos actuais en Preview', () => {
  it('publica na Axenda os previstos, confirmados e realizados con Mostrar_Web', () => {
    expect(publicIndex).toContain("['previsto', 'confirmado', 'realizado']");
    expect(publicIndex).toContain('concerto?.mostrarWeb === true');
    expect(agendaRoute).toContain("estado === 'previsto'");
    expect(agendaRoute).toContain("estado: 'confirmado'");
  });

  it('refresca as asistencias desde o Apps Script de probas e illa a caché de Preview', () => {
    expect(previewAttendance).toContain("CHAVE_PREVIEW = 'indices/preview/asistencias-concertos.json'");
    expect(previewAttendance).toContain("accion: 'listarAsistenciasConcertosPortal'");
    expect(previewAttendance).toContain("rama(env) === 'main'");
    expect(portalRoute).toContain("url.pathname = '/api/asistencias-concertos-preview'");
    expect(portalRoute).toContain("branch !== 'main'");
  });

  it('separa visualmente próximos e concertos finalizados desde abril de 2026', () => {
    expect(sections).toContain("crearCabeceira('Próximos concertos'");
    expect(sections).toContain("crearCabeceira('Concertos finalizados', 'Desde abril de 2026')");
    expect(sections).toContain("classList.contains('is-past')");
  });
});
