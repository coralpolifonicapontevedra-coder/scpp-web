const INXECCION = `
<style>
  .photos-main,.photos-main button,.photos-main input,.photos-main select,.photos-main textarea,.photos-main dialog{font-family:Aptos,'Segoe UI',Arial,sans-serif}
  .photos-toolbar label,.dialog-fields>label,.account-card span,.dialog-meta span{gap:.42rem}
  .photos-toolbar label>span,.dialog-fields>label>span,.dialog-fields legend,.account-card small,.dialog-meta small{display:block;margin-bottom:.08rem;color:#6c625e;font-size:.68rem;font-weight:700;line-height:1.2;letter-spacing:.045em;text-transform:uppercase}
  .photos-toolbar input,.photos-toolbar select,.dialog-fields input,.dialog-fields textarea{font-family:Aptos,'Segoe UI',Arial,sans-serif;font-size:.92rem;line-height:1.4;color:#332f2d}
  .account-card strong,.dialog-meta strong{display:block;margin-top:.08rem;color:#332f2d;font-size:.88rem;font-weight:600;line-height:1.35}
  .dialog-fields>label{padding:.1rem 0 .35rem}
  .dialog-meta span{padding:.8rem 0}
  .summary-grid button{font-family:Aptos,'Segoe UI',Arial,sans-serif}
  .summary-grid strong{display:block;line-height:1.1}
  .summary-grid span{display:block;margin-top:.2rem;line-height:1.25}
  .photos-refresh-button{min-height:2.55rem;padding:.55rem .8rem;border:1px solid #cfc7c1;background:#fff;color:#4b4642;font-family:Aptos,'Segoe UI',Arial,sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;white-space:nowrap}
  .photos-refresh-button:disabled{opacity:.55;cursor:wait}
  .photos-refresh-status{display:block;margin-top:.28rem;color:#7c726d;font-family:Aptos,'Segoe UI',Arial,sans-serif;font-size:.68rem;line-height:1.35}
  @media(max-width:820px){.photos-refresh-button{width:100%}}
</style>
<script>
(function(){
  const fetchBase=window.fetch.bind(window);
  let token='';
  let refrescoInicial=false;
  let refrescando=false;
  let ultimaActualizacion=0;

  async function refrescarIndice(idToken){
    if(!idToken||refrescando)return null;
    refrescando=true;
    try{
      const response=await fetchBase('/api/refrescar-fotos-revision',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify({idToken})
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result?.ok)throw new Error(result?.erro||'Non se puido actualizar a lista de fotografías.');
      ultimaActualizacion=Date.now();
      return result;
    }finally{
      refrescando=false;
    }
  }

  window.fetch=async function(input,init){
    let body=null;
    try{
      if(init&&typeof init.body==='string'){
        body=JSON.parse(init.body);
        if(body?.idToken)token=String(body.idToken);
      }
    }catch(_){ }

    const url=typeof input==='string'?input:String(input?.url||'');
    if(
      !refrescoInicial&&
      url.includes('/api/administracion-fotografias')&&
      body?.accion==='listar'&&
      token
    ){
      refrescoInicial=true;
      try{await refrescarIndice(token)}catch(error){console.warn('Non se puido refrescar a Sheet antes de abrir Fotografías:',error)}
    }

    return fetchBase(input,init);
  };

  function estado(texto,erro=false){
    const el=document.querySelector('#photos-refresh-status');
    if(el instanceof HTMLElement){el.textContent=texto||'';el.dataset.error=erro?'true':'false'}
  }

  async function actualizarManual(){
    if(!token){estado('A sesión aínda non está preparada.',true);return}
    const boton=document.querySelector('#photos-refresh-button');
    if(boton instanceof HTMLButtonElement){boton.disabled=true;boton.textContent='Actualizando…'}
    estado('Lendo a Sheet e actualizando o índice R2…');
    try{
      const result=await refrescarIndice(token);
      estado('Actualizadas '+String(result?.total??0)+' fotografías pendentes. Recargando…');
      window.setTimeout(()=>window.location.reload(),250);
    }catch(error){
      estado(error instanceof Error?error.message:'Non se puido actualizar.',true);
      if(boton instanceof HTMLButtonElement){boton.disabled=false;boton.textContent='↻ Actualizar fotografías'}
    }
  }

  function instalar(){
    const toolbar=document.querySelector('.photos-toolbar');
    if(!(toolbar instanceof HTMLElement)||document.querySelector('#photos-refresh-button'))return false;
    const wrap=document.createElement('div');
    wrap.className='photos-refresh-wrap';
    wrap.innerHTML='<button id="photos-refresh-button" class="photos-refresh-button" type="button">↻ Actualizar fotografías</button><small id="photos-refresh-status" class="photos-refresh-status" aria-live="polite"></small>';
    const meta=toolbar.querySelector('.toolbar-meta');
    if(meta instanceof HTMLElement)toolbar.insertBefore(wrap,meta);else toolbar.appendChild(wrap);
    wrap.querySelector('#photos-refresh-button')?.addEventListener('click',actualizarManual);
    return true;
  }

  const observador=new MutationObserver(instalar);
  observador.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar,{once:true});else instalar();

  document.addEventListener('visibilitychange',async()=>{
    if(document.visibilityState!=='visible'||!token||Date.now()-ultimaActualizacion<30000)return;
    try{
      const result=await refrescarIndice(token);
      if(result?.ok)window.location.reload();
    }catch(error){console.warn('Non se puido refrescar Fotografías ao volver á pantalla:',error)}
  });
})();
</script>`;

export async function onRequest(context){
  const resposta=await context.next();
  const tipo=String(resposta.headers.get('Content-Type')||'');
  if(!resposta.ok||!tipo.includes('text/html'))return resposta;

  let html=await resposta.text();
  if(!html.includes('photos-refresh-button')){
    html=html.includes('</head>')?html.replace('</head>',INXECCION+'</head>'):INXECCION+html;
  }

  const headers=new Headers(resposta.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  return new Response(html,{status:resposta.status,statusText:resposta.statusText,headers});
}
