import { AppsScriptError, obterJsonAppsScript } from '../_lib/apps-script.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function verificarTokenFirebase(idToken, apiKey) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
  if (!resposta.ok) return null;
  const usuario = (await resposta.json())?.users?.[0];
  if (!usuario?.email || usuario.emailVerified !== true) return null;
  return {
    uid: String(usuario.localId || ''),
    email: String(usuario.email).trim().toLowerCase()
  };
}

async function eliminarPorPrefix(bucket, prefix) {
  if (!bucket || typeof bucket.list !== 'function') return 0;
  let cursor;
  let total = 0;
  do {
    const page = await bucket.list({ prefix, cursor });
    const keys = (page.objects || []).map((item) => item.key).filter(Boolean);
    if (keys.length) {
      await bucket.delete(keys);
      total += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

async function limparR2(env, idFoto) {
  const resumo = {
    privados: 0,
    publicos: 0,
    indiceTraballo: false,
    estadoEdicion: false,
    cachePendentes: false
  };

  if (env.R2_PRIVADO) {
    const indiceKey = `fotos/traballo/${idFoto}.json`;
    const indice = await env.R2_PRIVADO.get(indiceKey);
    if (indice) {
      const datos = await indice.json().catch(() => null);
      const ruta = String(datos?.ruta || '').trim();
      if (ruta) {
        await env.R2_PRIVADO.delete(ruta);
        resumo.privados += 1;
      }
      await env.R2_PRIVADO.delete(indiceKey);
      resumo.indiceTraballo = true;
    }

    resumo.privados += await eliminarPorPrefix(env.R2_PRIVADO, `fotos/editadas/${idFoto}-`);

    await env.R2_PRIVADO.delete(`fotos/estado-edicion/${idFoto}.json`);
    resumo.estadoEdicion = true;

    await env.R2_PRIVADO.delete('cache/fotos/listar-revision.json');
    resumo.cachePendentes = true;
  }

  if (env.R2_PUBLICO) {
    resumo.publicos += await eliminarPorPrefix(env.R2_PUBLICO, `fotos/editadas/${idFoto}-`);
  }

  return resumo;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, erro: 'Método non permitido' });
  }
  if (!env.FIREBASE_API_KEY || !env.WEB_WRITE_TOKEN || !env.R2_PRIVADO) {
    return json(500, { ok: false, erro: 'O servizo non está configurado correctamente.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, erro: 'Solicitude non válida' });
  }

  const idFoto = String(body.idFoto || body.rowId || '').trim();
  if (!idFoto) return json(400, { ok: false, erro: 'Falta identificar a fotografía.' });

  let usuario;
  try {
    usuario = await verificarTokenFirebase(String(body.idToken || ''), env.FIREBASE_API_KEY);
  } catch (erro) {
    console.error('Erro Firebase ao eliminar fotografía:', erro);
  }
  if (!usuario) {
    return json(401, { ok: false, erro: 'A identificación non é válida ou caducou' });
  }

  try {
    const { resultado } = await obterJsonAppsScript(env, {
      token: env.WEB_WRITE_TOKEN,
      accion: 'eliminarFotoPortal',
      email: usuario.email,
      uidFirebase: usuario.uid,
      idFoto,
      rowId: idFoto
    }, { timeoutMs: 45_000, attemptTimeoutMs: 15_000 });

    if (!resultado?.ok) {
      const forbidden = resultado?.codigo === 'FORBIDDEN' || /non autorizado/i.test(String(resultado?.erro || ''));
      return json(forbidden ? 403 : 400, {
        ok: false,
        erro: resultado?.erro || 'Non se puido eliminar a fotografía.'
      });
    }

    let limpezaR2 = null;
    let aviso = '';
    try {
      limpezaR2 = await limparR2(env, idFoto);
    } catch (erroR2) {
      console.error('A fotografía eliminouse da Sheet/Drive pero fallou parte da limpeza R2:', erroR2);
      aviso = 'A fotografía eliminouse do arquivo, pero parte da limpeza de R2 quedou pendente.';
      try { await env.R2_PRIVADO.delete('cache/fotos/listar-revision.json'); } catch {}
    }

    return json(200, {
      ok: true,
      idFoto,
      resultado: resultado.resultado || null,
      limpezaR2,
      aviso,
      mensaxe: aviso || resultado.mensaxe || 'Fotografía eliminada correctamente.'
    });
  } catch (erro) {
    console.error('Erro ao eliminar fotografía en revisión:', erro);
    const status = erro instanceof AppsScriptError && erro.code === 'APPS_SCRIPT_TIMEOUT' ? 504 : 503;
    return json(status, {
      ok: false,
      erro: erro instanceof Error ? erro.message : 'Non foi posible eliminar a fotografía.'
    });
  }
}
