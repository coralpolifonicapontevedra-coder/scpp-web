import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/PortalSidebar.astro', 'utf8');

describe('PortalSidebar mobile layout', () => {
  it('marks direct private/admin layouts so they stack on narrow screens', () => {
    expect(source).toContain("layout?.matches('.private-layout, .layout')");
    expect(source).toContain("layout.classList.add('private-layout-with-sidebar')");
    expect(source).toContain(':global(.private-layout-with-sidebar) { display: block !important;');
  });

  it('prevents the main content and sidebar from exceeding the mobile viewport', () => {
    expect(source).toContain(':global(.private-layout-with-sidebar > main) { width: 100%; max-width: 100%; min-width: 0; }');
    expect(source).toContain('.private-sidebar { position: relative; width: 100%; max-width: 100%;');
  });
});
