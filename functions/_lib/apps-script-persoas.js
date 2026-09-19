import { obterJsonAppsScript } from './apps-script.js';

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
