const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

async function comprobarBucket(bucket) {
  if (!bucket || typeof bucket.list !== 'function') {
    return { configurado: false, accesible: false };
  }

  try {
    await bucket.list({ limit: 1 });
    return { configurado: true, accesible: true };
  } catch (erro) {
    console.error('Erro ao comprobar un bucket R2:', erro);
    return { configurado: true, accesible: false };
  }
}

export async function onRequestGet({ env }) {
  const [publico, privado] = await Promise.all([
    comprobarBucket(env.R2_PUBLICO),
    comprobarBucket(env.R2_PRIVADO)
  ]);

  const ok = publico.accesible && privado.accesible;

  return json(ok ? 200 : 503, {
    ok,
    r2: {
      publico,
      privado
    }
  });
}

export function onRequest() {
  return json(405, {
    ok: false,
    erro: 'Método non permitido'
  });
}
