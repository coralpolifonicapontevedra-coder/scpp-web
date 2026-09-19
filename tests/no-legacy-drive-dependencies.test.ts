import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [
  'functions',
  'src',
  'apps-script',
  'apps-script-preview',
  'apps-script-production',
  'scripts',
  '.github'
];

const FORBIDDEN = [
  // Legacy personal-drive Sheets.
  '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
  '1vYlC1VO1hql8jJVkt1OBXnbH7GvUVe4XXe5TSIJk2dU',
  '1NyOt3A8EQ-HFBguDlsqaBQ0TpdlslI0GkRQzGXZkOig',
  '1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw',
  '18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0',
  '16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0',
  '1YJkIH4DpuOQShAP8fcSq_TrLPDn08zv_tfKNjq297wc',
  '155FLEl07h8LwlrSVLEhFsbkgJMqIf4E6k6lCXf8x_JE',
  '1yp0Gc_GaewODS6IaPB9p2cdKqeOCbnyehL_-HzpdUQI',
  '1pObayoj3uoPLtqUqQG9S5GZ0afRz9ErBeJbTgJlaiH0',
  '1NhWEnrlOk285ECxUQMB3Pedd28TNkiMmN-K25vzd_2w',
  '1nhoP8ea1RyZiZ9SaTyFjnHG9MBOk-TMe15eHvvkXcdU',
  '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k',
  '1UjEvc2x6n2zmpXp6bgATTwAORbKPmI2zePdMTB5kmVU',
  '1qWzgh84n6yI3mNt1OSWQiytOy1qt3NrLYb3cjQmYuDE',
  '1mqlMESC6ZkE4t1zfA0q1dK3PRFHtKLO71ifdbT2CtHw',
  '1sAMi9TWZ7YwjOxu1a-KliO_7LtYlo4Zf2AowmPKDQX8',

  // Legacy personal-drive folders.
  '1FySxDvTHVNC20-a3I0wDU1v0s82VRiix',
  '1dlNy6ht2AZcSRJF_CkWH-XbGIsTijMiO',
  '1H12S32zJzncJoXdUvbZx82CLFXvlhtd6',
  '1yvEWIatZIa3UnE71VQUb4LCvBZ6HLs6t',
  '1qXPUplggCFbFTTLRtm2j16af717o-bQs',

  // Legacy Apps Script deployments / fallback path.
  'AKfycbwxlH1BRoKrmUxSSk_KmtLrhsgToO1OHhw3IBtg8ceqigKxErvkzlS2mHWutv9Wb0OsXA',
  'AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh',
  'APPS_SCRIPT_FALLBACK_URL'
];

const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.astro', '.gs', '.py', '.yml', '.yaml', '.json', '.md'
]);

function extension(path: string) {
  const match = path.match(/(\.[^.\/]+)$/);
  return match?.[1]?.toLowerCase() || '';
}

function walk(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return TEXT_EXTENSIONS.has(extension(path)) ? [path] : [];
  return readdirSync(path).flatMap((name) => {
    if (['node_modules', 'dist', '.git', '.wrangler'].includes(name)) return [];
    return walk(join(path, name));
  });
}

describe('corporate Drive isolation', () => {
  it('does not reference legacy personal-drive Sheets or Apps Script fallbacks', () => {
    const violations: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const text = readFileSync(file, 'utf8');
        for (const forbidden of FORBIDDEN) {
          if (text.includes(forbidden)) violations.push(`${file}: ${forbidden}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
