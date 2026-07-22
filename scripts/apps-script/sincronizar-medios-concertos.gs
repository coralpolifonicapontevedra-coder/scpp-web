/*
 * Sincroniza ficheiros de carpetas de AppSheet/Google Drive con GitHub.
 *
 * Propiedades do script necesarias:
 * - GITHUB_TOKEN
 * - GITHUB_OWNER = coralpolifonicapontevedra-coder
 * - GITHUB_REPO = scpp-web
 * - GITHUB_BRANCH = main
 * - CONCERTOS_IMAGES_FOLDER_ID
 *
 * O token de GitHub debe ter acceso de escritura só ao repositorio scpp-web.
 */

const CONFIG_MEDIOS = [
  {
    propiedadeFolderId: 'CONCERTOS_IMAGES_FOLDER_ID',
    rutaGitHub: 'public/img/concertos',
    extensiones: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
  },
];

function sincronizarMediosConcertos() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const owner = props.getProperty('GITHUB_OWNER') || 'coralpolifonicapontevedra-coder';
  const repo = props.getProperty('GITHUB_REPO') || 'scpp-web';
  const branch = props.getProperty('GITHUB_BRANCH') || 'main';

  if (!token) throw new Error('Falta a propiedade GITHUB_TOKEN.');

  let subidos = 0;
  let senCambios = 0;
  let ignorados = 0;

  CONFIG_MEDIOS.forEach((config) => {
    const folderId = props.getProperty(config.propiedadeFolderId);
    if (!folderId) {
      console.log(`Ignorada ${config.propiedadeFolderId}: non está configurada.`);
      return;
    }

    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFiles();

    while (files.hasNext()) {
      const file = files.next();
      const nome = file.getName();
      const extension = nome.includes('.') ? nome.split('.').pop().toLowerCase() : '';

      if (!config.extensiones.includes(extension)) {
        ignorados++;
        continue;
      }

      const ruta = `${config.rutaGitHub}/${nome}`;
      const resultado = subirOuActualizarGitHub_(file, ruta, { token, owner, repo, branch });

      if (resultado === 'subido') subidos++;
      if (resultado === 'sen_cambios') senCambios++;
    }
  });

  console.log(JSON.stringify({ subidos, senCambios, ignorados }));
  return { subidos, senCambios, ignorados };
}

function subirOuActualizarGitHub_(file, ruta, github) {
  const api = `https://api.github.com/repos/${github.owner}/${github.repo}/contents/${encodePath_(ruta)}`;
  const existente = obterFicheiroGitHub_(api, github);
  const blob = file.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());
  const gitBlobSha = calcularGitBlobSha_(blob.getBytes());

  if (existente && existente.sha === gitBlobSha) {
    return 'sen_cambios';
  }

  const payload = {
    message: `Actualizar medio: ${file.getName()}`,
    content: base64,
    branch: github.branch,
  };

  if (existente && existente.sha) payload.sha = existente.sha;

  const resposta = UrlFetchApp.fetch(api, {
    method: 'put',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${github.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const codigo = resposta.getResponseCode();
  if (codigo !== 200 && codigo !== 201) {
    throw new Error(`GitHub devolveu ${codigo} para ${ruta}: ${resposta.getContentText()}`);
  }

  return 'subido';
}

function obterFicheiroGitHub_(api, github) {
  const resposta = UrlFetchApp.fetch(`${api}?ref=${encodeURIComponent(github.branch)}`, {
    method: 'get',
    headers: {
      Authorization: `Bearer ${github.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    muteHttpExceptions: true,
  });

  const codigo = resposta.getResponseCode();
  if (codigo === 404) return null;
  if (codigo !== 200) {
    throw new Error(`Non se puido consultar GitHub (${codigo}): ${resposta.getContentText()}`);
  }

  return JSON.parse(resposta.getContentText());
}

function calcularGitBlobSha_(bytes) {
  const cabeceira = Utilities.newBlob(`blob ${bytes.length}\0`).getBytes();
  const combinado = cabeceira.concat(bytes);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, combinado);
  return digest.map((b) => (b + 256).toString(16).slice(-2)).join('');
}

function encodePath_(ruta) {
  return ruta.split('/').map(encodeURIComponent).join('/');
}

function crearActivadorSincronizacion() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'sincronizarMediosConcertos')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('sincronizarMediosConcertos')
    .timeBased()
    .everyMinutes(15)
    .create();

  console.log('Activador creado: sincronización cada 15 minutos.');
}

function probarAccesoCarpetaConcertos() {
  const folderId = PropertiesService.getScriptProperties().getProperty('CONCERTOS_IMAGES_FOLDER_ID');
  if (!folderId) throw new Error('Falta CONCERTOS_IMAGES_FOLDER_ID.');

  const folder = DriveApp.getFolderById(folderId);
  console.log(`Carpeta localizada: ${folder.getName()}`);

  const files = folder.getFiles();
  let total = 0;
  while (files.hasNext()) {
    console.log(files.next().getName());
    total++;
  }
  console.log(`Total de ficheiros: ${total}`);
}
