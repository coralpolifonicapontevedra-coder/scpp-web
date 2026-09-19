import { obterJsonAppsScript } from './apps-script.js';

const URL_PRODUCTION = 'https://script.google.com/macros/s/AKfycbwxlH1BRoKrmUxSSk_KmtLrhsgToO1OHhw3IBtg8ceqigKxErvkzlS2mHWutv9Wb0OsXA/exec';
const URL_PREVIEW = URL_PRODUCTION;

export function urlAppsScriptPersoas(env = {}) {
  return String(env.CF_PAGES_BRANCH || '').trim() === 'main' ? URL_PRODUCTION : URL_PREVIEW;
}

export async function obterJsonAppsScriptPersoas(env, corpo, options = {}) {
  return obterJsonAppsScript(env, corpo, {
    ...options,
    urlOverride: urlAppsScriptPersoas(env)
  });
}
