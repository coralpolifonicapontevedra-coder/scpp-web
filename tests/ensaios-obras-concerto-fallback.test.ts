import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'functions/api/ensaios-obras.js'), 'utf8');

describe('portal ensaios obras fallback', () => {
  it('usa o programa do concerto se non hai borrador nin EnsaiosRepertorio', () => {
    expect(source).toContain("const CONCERTOS_PRIVATE_INDEX_KEY='indices/concertos-privado-v1.json'");
    expect(source).toContain('async function worksFromConcert');
    expect(source).toContain("concertRepertorio=await worksFromConcert(env,source,id)");
    expect(source).toContain("'R2-CONCERT-PROGRAM'");
  });
});
