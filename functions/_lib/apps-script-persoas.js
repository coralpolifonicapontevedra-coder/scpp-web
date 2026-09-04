import { obterJsonAppsScript } from './apps-script.js';

const URL_PRODUCTION = 'https://script.google.com/macros/s/AKfycbyFrlkJW9Ur1gRVRtIXOucfdr7zFzVGiL_V3KCHbot8IkNvoAXylP7-Dta2X-ki7bEh/exec';
const URL_PREVIEW = 'https://script.google.com/macros/s/AKfycbyUsvfiFEUpEgbLhov02EeXIgW6d-wjpTFQcZXOEMHEpXpQzbYnqSH_5L0N8wTwSGU/exec';

export function urlAppsScriptPersoas(env = {}) {
  return String(env.CF_PAGES_BRANCH || '').trim() === 'main' ? URL_PRODUCTION : URL_PREVIEW;
}

export async function obterJsonAppsScriptPersoas(env, corpo, options = {}) {
  return obterJsonAppsScript(env, corpo, {
    ...options,
    urlOverride: urlAppsScriptPersoas(env)
  });
}
