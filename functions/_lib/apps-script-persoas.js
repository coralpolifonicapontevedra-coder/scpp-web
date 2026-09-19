import { obterJsonAppsScript } from './apps-script.js';

const URL_PRODUCTION = 'https://script.google.com/macros/s/AKfycbwxlH1BRoKrmUxSSk_KmtLrhsgToO1OHhw3IBtg8ceqigKxErvkzlS2mHWutv9Wb0OsXA/exec';
export function urlAppsScriptPersoas(env = {}) {
  const url = String(env.APPS_SCRIPT_WEBAPP_URL || '').trim();
  if (!url) throw new Error('A implementación institucional de Apps Script non está configurada.');
  return url;
}

export async function obterJsonAppsScriptPersoas(env, corpo, options = {}) {
  return obterJsonAppsScript(env, corpo, {
    ...options,
    urlOverride: urlAppsScriptPersoas(env)
  });
}
