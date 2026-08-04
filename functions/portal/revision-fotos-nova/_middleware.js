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
  .published-actions-v2{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;padding-top:.45rem}
  .published-actions-v2 button{min-height:2.6rem;padding:.6rem .75rem;border:1px solid #cfc7c1;background:#fff;color:#4b4642;font:inherit;cursor:pointer}
  .published-actions-v2 .save{background:#6d2032;color:#fff;border-color:#6d2032}
  .published-actions-v2 .danger{color:#842323;border-color:#b98f94;background:#fffafa}
  .published-actions-v2 .both{grid-column:1/-1}
  @media(max-width:700px){.published-actions-v2{grid-template-columns:1fr}.published-actions-v2 .both{grid-column:auto}}
  @media(max-width:650px){.review-thumb{flex-basis:96px;grid-template-rows:68px auto}.review-thumb img,.review-thumb .thumb-loading{height:68px}}
</style>
<script>
(function(){
  let token='';
  const urls=new Map();
  const fetchBase=window.fetch.bind(window);

  window.fetch=async function(input,init){
    try{
      if(init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body&&body.idToken)token=String(body.idToken);
      }
    }catch(_){ }
    return fetchBase(input,init);
  };

  function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function mensaxe(texto,erro){const p=document.querySelector('#published-message');if(p instanceof HTMLElement){p.textContent=texto||'';p.dataset.error=erro?'true':'false'}}

  async function cargarMiniatura(id,contenedor){
    if(!id||!(contenedor instanceof HTMLElement)||contenedor.dataset.loaded==='true')return;
    contenedor.dataset.loaded='true';
    try{
      const resposta=await fetchBase('/api/editor-fotos-miniatura?idFoto='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'force-cache'});
      if(!resposta.ok)throw new Error('Miniatura non dispoñible');
      const blob=await resposta.blob();const url=URL.createObjectURL(blob);urls.set(id,url);
      const img=document.createElement('img');img.src=url;img.alt='Miniatura da fotografía';img.loading='lazy';img.decoding='async';contenedor.replaceChildren(img);
    }catch(_){contenedor.textContent='Sen miniatura'}
  }

  function marcarActual(){
    const select=document.querySelector('#photo-select');if(!(select instanceof HTMLSelectElement))return;
    document.querySelectorAll('.review-thumb').forEach(btn=>btn.setAttribute('aria-current',btn.dataset.id===select.value?'true':'false'));
    document.querySelector('.review-thumb[aria-current="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }

  function instalarMiniaturas(){
    const select=document.querySelector('#photo-select');const fila=document.querySelector('.selector-row');
    if(!(select instanceof HTMLSelectElement)||!(fila instanceof HTMLElement)||document.querySelector('.review-thumbs-panel'))return false;
    const panel=document.createElement('section');panel.className='review-thumbs-panel';panel.setAttribute('aria-label','Selección rápida por miniaturas');
    panel.innerHTML='<div class="review-thumbs-head"><strong>Selección rápida</strong><span>'+select.options.length+' fotografías</span></div><div class="review-thumbs"></div>';
    fila.parentElement?.insertBefore(panel,fila);const tira=panel.querySelector('.review-thumbs');if(!(tira instanceof HTMLElement))return false;
    [...select.options].forEach(option=>{
      const id=String(option.value||'');const boton=document.createElement('button');boton.type='button';boton.className='review-thumb';boton.dataset.id=id;
      boton.innerHTML='<span class="thumb-loading">Cargando…</span><span title="'+escapeHtml(option.textContent||'')+'">'+escapeHtml(option.textContent||'Fotografía')+'</span>';
      boton.addEventListener('click',()=>{select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#load-photo')?.click();marcarActual()});tira.appendChild(boton);
    });
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){cargarMiniatura(entry.target.dataset.id,entry.target.querySelector('.thumb-loading'));observer.unobserve(entry.target)}}),{root:tira,rootMargin:'160px'});
    tira.querySelectorAll('.review-thumb').forEach(btn=>observer.observe(btn));select.addEventListener('change',marcarActual);marcarActual();return true;
  }

  async function retirar(ambito){
    const select=document.querySelector('#published-select');if(!(select instanceof HTMLSelectElement)||!select.value)return;
    if(!token){mensaxe('A sesión aínda non está preparada. Agarda un instante e téntao de novo.',true);return}
    const nomes={publica:'a galería pública',privada:'a galería privada',ambas:'as dúas galerías'};
    if(!window.confirm('Queres retirar esta fotografía de '+nomes[ambito]+'? O arquivo conservarase en R2.'))return;
    const sheet=document.querySelector('#published-sheet-status');const indices=document.querySelector('#published-index-status');
    if(sheet instanceof HTMLElement)sheet.textContent='Gardando';if(indices instanceof HTMLElement)indices.textContent='Actualizando';mensaxe('Retirando a fotografía de '+nomes[ambito]+'…',false);
    try{
      const resposta=await fetchBase('/api/retirar-foto-galeria',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({idToken:token,idFoto:select.value,ambito})});
      const resultado=await resposta.json().catch(()=>null);if(!resposta.ok||!resultado?.ok)throw new Error(resultado?.erro||'Non se puido retirar a fotografía.');
      if(sheet instanceof HTMLElement)sheet.textContent='Actualizada';if(indices instanceof HTMLElement)indices.textContent='Actualizados';mensaxe(resultado.mensaxe||'Publicación retirada correctamente.',false);
      window.setTimeout(()=>window.location.reload(),900);
    }catch(erro){if(sheet instanceof HTMLElement)sheet.textContent='Erro';if(indices instanceof HTMLElement)indices.textContent='Erro';mensaxe(erro instanceof Error?erro.message:'Non se puido completar a retirada.',true)}
  }

  function instalarAccions(){
    const actions=document.querySelector('.published-actions');if(!(actions instanceof HTMLElement)||document.querySelector('#published-actions-v2'))return false;
    const gardar=document.querySelector('#published-save');const novo=document.createElement('div');novo.id='published-actions-v2';novo.className='published-actions-v2';
    novo.innerHTML='<button id="published-save-v2" class="save" type="button">Gardar cambios</button><button id="withdraw-public" class="danger" type="button">Retirar da pública</button><button id="withdraw-private" class="danger" type="button">Retirar da privada</button><button id="withdraw-both" class="danger both" type="button">Retirar das dúas galerías</button>';
    actions.replaceWith(novo);
    novo.querySelector('#published-save-v2')?.addEventListener('click',()=>{if(gardar instanceof HTMLButtonElement)gardar.click()});
    novo.querySelector('#withdraw-public')?.addEventListener('click',()=>retirar('publica'));
    novo.querySelector('#withdraw-private')?.addEventListener('click',()=>retirar('privada'));
    novo.querySelector('#withdraw-both')?.addEventListener('click',()=>retirar('ambas'));return true;
  }

  function instalar(){instalarMiniaturas();instalarAccions()}
  const observador=new MutationObserver(instalar);observador.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar,{once:true});else instalar();
  window.addEventListener('pagehide',()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls.clear()});
})();
</script>`;

export async function onRequest(context){
  const resposta=await context.next();const tipo=String(resposta.headers.get('Content-Type')||'');
  if(!resposta.ok||!tipo.includes('text/html'))return resposta;
  let html=await resposta.text();if(!html.includes('published-actions-v2'))html=html.includes('</head>')?html.replace('</head>',INXECCION+'</head>'):INXECCION+html;
  const headers=new Headers(resposta.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');headers.delete('ETag');headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  return new Response(html,{status:resposta.status,statusText:resposta.statusText,headers});
}
