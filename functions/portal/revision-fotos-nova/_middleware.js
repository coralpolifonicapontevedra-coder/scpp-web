const INXECCION = `
<style>
  .review-thumbs-panel{margin:0 0 1rem;padding:.8rem;border:1px solid #ddd7d2;background:#fff;font-family:Aptos,'Segoe UI',Arial,sans-serif}
  .review-thumbs-head{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.65rem}
  .review-thumbs-head strong{font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:#625d59}
  .review-thumbs-head span{font-size:.76rem;color:#756f6b}
  .review-thumbs{display:flex;gap:.6rem;overflow-x:auto;padding:.15rem .05rem .45rem;scrollbar-width:thin}
  .review-thumb{position:relative;flex:0 0 112px;display:grid;grid-template-rows:78px auto;gap:.35rem;padding:.35rem;border:1px solid #d9d3ce;background:#faf8f6;cursor:pointer;text-align:left;font:inherit}
  .review-thumb[aria-current="true"]{border-color:#6d2032;box-shadow:0 0 0 1px #6d2032}
  .review-thumb img{display:block;width:100%;height:78px;object-fit:contain;background:#ebe7e2}
  .review-thumb span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:.72rem;color:#514c48}
  .review-thumb .thumb-loading{display:grid;place-items:center;width:100%;height:78px;background:#ebe7e2;color:#817a75;font-size:.68rem;text-align:center}
  @media(max-width:650px){.review-thumb{flex-basis:96px;grid-template-rows:68px auto}.review-thumb img,.review-thumb .thumb-loading{height:68px}}
</style>
<script>
(function(){
  let token='';
  const urls=new Map();
  const fetchBase=window.fetch.bind(window);

  window.fetch=async function(input,init){
    try{
      const url=typeof input==='string'?input:String(input&&input.url||'');
      if((url.includes('/api/fotos')||url.includes('/api/editor-fotos'))&&init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body&&body.idToken)token=String(body.idToken);
      }
    }catch(_){ }
    return fetchBase(input,init);
  };

  function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

  async function cargarMiniatura(id,contenedor){
    if(!id||!(contenedor instanceof HTMLElement)||contenedor.dataset.loaded==='true')return;
    contenedor.dataset.loaded='true';
    try{
      let resposta=await fetchBase('/api/editor-fotos-miniatura?idFoto='+encodeURIComponent(id),{
        headers:{Authorization:'Bearer '+token},cache:'force-cache'
      });
      if(resposta.status===401){
        const auth=window.firebaseAuthCurrentUser;
        if(auth&&typeof auth.getIdToken==='function')token=await auth.getIdToken(true);
        resposta=await fetchBase('/api/editor-fotos-miniatura?idFoto='+encodeURIComponent(id),{
          headers:{Authorization:'Bearer '+token},cache:'force-cache'
        });
      }
      if(!resposta.ok)throw new Error('Miniatura non dispoñible');
      const blob=await resposta.blob();
      const url=URL.createObjectURL(blob);urls.set(id,url);
      const img=document.createElement('img');img.src=url;img.alt='Miniatura da fotografía';img.loading='lazy';img.decoding='async';
      contenedor.replaceChildren(img);
    }catch(_){contenedor.textContent='Sen miniatura';}
  }

  function marcarActual(){
    const select=document.querySelector('#photo-select');
    if(!(select instanceof HTMLSelectElement))return;
    document.querySelectorAll('.review-thumb').forEach(function(btn){btn.setAttribute('aria-current',btn.dataset.id===select.value?'true':'false')});
    const actual=document.querySelector('.review-thumb[aria-current="true"]');
    if(actual instanceof HTMLElement)actual.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  function instalar(){
    const select=document.querySelector('#photo-select');
    const fila=document.querySelector('.selector-row');
    if(!(select instanceof HTMLSelectElement)||!(fila instanceof HTMLElement)||document.querySelector('.review-thumbs-panel'))return false;
    const panel=document.createElement('section');panel.className='review-thumbs-panel';panel.setAttribute('aria-label','Selección rápida por miniaturas');
    panel.innerHTML='<div class="review-thumbs-head"><strong>Selección rápida</strong><span>'+select.options.length+' fotografías</span></div><div class="review-thumbs"></div>';
    fila.parentElement?.insertBefore(panel,fila);
    const tira=panel.querySelector('.review-thumbs');
    if(!(tira instanceof HTMLElement))return false;
    [...select.options].forEach(function(option){
      const id=String(option.value||'');
      const boton=document.createElement('button');boton.type='button';boton.className='review-thumb';boton.dataset.id=id;
      boton.innerHTML='<span class="thumb-loading">Cargando…</span><span title="'+escapeHtml(option.textContent||'')+'">'+escapeHtml(option.textContent||'Fotografía')+'</span>';
      boton.addEventListener('click',function(){select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#load-photo')?.click();marcarActual()});
      tira.appendChild(boton);
    });
    const observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){const box=entry.target.querySelector('.thumb-loading');cargarMiniatura(entry.target.dataset.id,box);observer.unobserve(entry.target)}})},{root:tira,rootMargin:'160px'});
    tira.querySelectorAll('.review-thumb').forEach(function(btn){observer.observe(btn)});
    select.addEventListener('change',marcarActual);marcarActual();
    return true;
  }

  const observador=new MutationObserver(function(){if(instalar())observador.disconnect()});
  observador.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar,{once:true});else instalar();
  window.addEventListener('pagehide',function(){urls.forEach(function(url){URL.revokeObjectURL(url)});urls.clear()});
})();
</script>`;

export async function onRequest(context){
  const resposta=await context.next();
  const tipo=String(resposta.headers.get('Content-Type')||'');
  if(!resposta.ok||!tipo.includes('text/html'))return resposta;
  let html=await resposta.text();
  if(!html.includes('review-thumbs-panel'))html=html.includes('</head>')?html.replace('</head>',INXECCION+'</head>'):INXECCION+html;
  const headers=new Headers(resposta.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');headers.delete('ETag');
  headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  return new Response(html,{status:resposta.status,statusText:resposta.statusText,headers});
}
