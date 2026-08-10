import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PORTAL_NAVIGATION_MODULES,
  getPortalNavigationLabel,
  getPortalNavigationModules,
} from '../src/data/portal-navigation';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portalPagesDir = resolve(root, 'src/pages/portal');
const sidebar = readFileSync(resolve(root, 'src/components/PortalSidebar.astro'), 'utf8');
const portalHome = readFileSync(resolve(root, 'src/pages/portal.astro'), 'utf8');
const layout = readFileSync(resolve(root, 'src/layouts/Layout.astro'), 'utf8');

function walkAstroFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const target = resolve(dir, entry);
    const stats = statSync(target);
    if (stats.isDirectory()) return walkAstroFiles(target);
    return entry.endsWith('.astro') ? [target] : [];
  });
}

function pageActiveKeys(): string[] {
  return walkAstroFiles(portalPagesDir)
    .flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      return [...source.matchAll(/<PortalSidebar active="([^"]+)"/g)].map((match) => match[1]);
    });
}

describe('coherencia da navegación privada', () => {
  it('mantén ids únicos e orde estable por superficie', () => {
    const sidebarModules = getPortalNavigationModules('sidebar');
    const homeModules = getPortalNavigationModules('home');

    expect(new Set(PORTAL_NAVIGATION_MODULES.map((module) => module.id)).size).toBe(
      PORTAL_NAVIGATION_MODULES.length
    );
    expect(sidebarModules.map((module) => module.order)).toEqual([
      ...sidebarModules.map((module) => module.order),
    ].sort((a, b) => a - b));
    expect(homeModules.map((module) => module.order)).toEqual([
      ...homeModules.map((module) => module.order),
    ].sort((a, b) => a - b));
  });

  it('cobre todas as claves active usadas polas páxinas privadas', () => {
    const validIds = new Set(PORTAL_NAVIGATION_MODULES.map((module) => module.id));

    for (const active of pageActiveKeys()) {
      expect(validIds.has(active)).toBe(true);
      expect(getPortalNavigationLabel(active)).not.toBe('Menú do portal');
    }
  });

  it('renderiza sidebar e portada desde o mapa compartido', () => {
    expect(sidebar).toContain("getPortalNavigationModules('sidebar')");
    expect(portalHome).toContain("getPortalNavigationModules('home')");
    expect(sidebar).toContain("data-review-admin={module.id === 'revisar' ? 'true' : undefined}");
    expect(sidebar).toContain("data-board-role={module.id === 'administracion' ? 'true' : undefined}");

    const revisar = PORTAL_NAVIGATION_MODULES.find((module) => module.id === 'revisar');
    const administracion = PORTAL_NAVIGATION_MODULES.find((module) => module.id === 'administracion');
    expect(revisar?.adminOnly).toBe(true);
    expect(administracion?.adminOnly).not.toBe(true);
  });

  it('non depende xa do parche por texto visible para o perfil', () => {
    expect(layout).not.toContain("textContent?.trim() !== 'O meu perfil'");
    expect(layout).not.toContain("dashboardGrid.querySelector('[data-profile-module]')");
  });
});