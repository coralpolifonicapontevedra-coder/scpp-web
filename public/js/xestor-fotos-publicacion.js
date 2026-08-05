(()=>{
  let token='';
  let fotos=[];
  let actual='';
  let primeiraCargada=false;
  let filtroResumo='';
  const urls=new Map();
  const fetchBase=window.fetch.bind(window);

  window.fetch=async(input,init)=>{try{if(init&&typeof init.body==='string'){const body=JSON.parse(init.body);if(body?.idToken)token=String(body.idToken)}}catch{}return fetchBase(input,init)};
  const texto=v=>String(v??'').trim();
  const esc=v=>texto(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const estado=f=>f?.estadoPublicacion==='ambas'?'Pública e privada':f?.estadoPublicacion==='publica'?'Só pública':f?.estadoPublicacion==='privada'?'Só privada':f?.estadoXestion==='pendente'?'Pendente de revisión':f?.estadoXestion==='rexeitada'?'Rexeitada':'Non publicada';
  const clase=f=>'estado-'+(f?.estadoPublicacion!=='ningunha'?f?.estadoPublicacion:(f?.estadoXestion||'nonpublicada'));

  async function agardarToken(maxMs=12000){const inicio=Date.now();while(!token&&Date.now()-inicio<maxMs)await new Promise(r=>setTimeout(r,120));if(!token)throw new Error('Non se puido preparar a sesión. Recarga a páxina e téntao de novo.');return token}
  async function api(body){await agardarToken();const r=await fetchBase('/api/xestion-publicacion-foto',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({idToken:token,...body})});const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw new Error(j?.erro||'Non se puido completar a operación');return j}
  function fotoActual(){return fotos.find(f=>texto(f.idFoto)===actual)}

  function coincideFiltro(f){
    const busca=texto(document.querySelector('#xestor-filtro')?.value).toLowerCase();
    const select=texto(document.querySelector('#xestor-estado')?.value);
    const modo=filtroResumo||select;
    const okModo=!modo||(modo==='publicada'?f.estadoXestion==='publicada':modo==='nonpublicada'?f.estadoXestion==='nonpublicada':modo==='pendente'?f.estadoXestion==='pendente':modo==='rexeitada'?f.estadoXestion==='rexeitada':f.estadoPublicacion===modo);
    return okModo&&(!busca||texto(f.titulo||f.peFoto||f.idFoto).toLowerCase().includes(busca));
  }

  async function miniatura(id,img){
    if(!id||!(img instanceof HTMLImageElement)||img.dataset.loaded==='true')return;
    img.dataset.loaded='true';
    try{
      const r=await fetchBase('/api/editor-fotos-miniatura?idFoto='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'force-cache'});
      if(!r.ok)throw new Error();
      const blob=await r.blob();const url=URL.createObjectURL(blob);urls.set(id,url);img.src=url;img.classList.add('is-ready');
    }catch{img.alt='Miniatura non dispoñible'}
  }

  function abrirVisor(f){
    const url=urls.get(texto(f?.idFoto));if(!url)return;
    let modal=document.querySelector('#xestor-visor');
    if(!(modal instanceof HTMLElement)){
      modal=document.createElement('div');modal.id='xestor-visor';modal.className='xestor-visor';modal.hidden=true;
      modal.innerHTML='<button type="button" class="xestor-visor-pechar" aria-label="Pechar">×</button><figure><img alt="Fotografía ampliada"><figcaption></figcaption></figure>';
      document.body.appendChild(modal);
      modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('.xestor-visor-pechar'))modal.hidden=true});
      document.addEventListener('keydown',e=>{if(e.key==='Escape')modal.hidden=true});
    }
    const img=modal.querySelector('img'),cap=modal.querySelector('figcaption');if(img instanceof HTMLImageElement)img.src=url;if(cap instanceof HTMLElement)cap.textContent=texto(f.titulo||f.peFoto||f.idFoto);modal.hidden=false;
  }

  function pintarResumo(){
    const resumo=document.querySelector('#xestor-resumo');if(!(resumo instanceof HTMLElement))return;
    const datos=[['',fotos.length,'Todas'],['publicada',fotos.filter(f=>f.estadoXestion==='publicada').length,'Publicadas'],['nonpublicada',fotos.filter(f=>f.estadoXestion==='nonpublicada').length,'Non publicadas'],['pendente',fotos.filter(f=>f.estadoXestion==='pendente').length,'Pendentes'],['rexeitada',fotos.filter(f=>f.estadoXestion==='rexeitada').length,'Rexeitadas']];
    resumo.innerHTML=datos.map(([f,n,l])=>`<button type="button" data-filtro="${f}" aria-pressed="${filtroResumo===f?'true':'false'}"><strong>${n}</strong><span>${l}</span></button>`).join('');
    resumo.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{filtroResumo=texto(btn.dataset.filtro);const s=document.querySelector('#xestor-estado');if(s instanceof HTMLSelectElement)s.value='';pintarResumo();pintarLista()}));
  }

  function pintarLista(){
    const corpo=document.querySelector('#xestor-lista');if(!(corpo instanceof HTMLElement))return;
    const lista=fotos.filter(coincideFiltro);if(!lista.some(f=>texto(f.idFoto)===actual))actual=texto(lista[0]?.idFoto);
    corpo.innerHTML=lista.length?lista.map(f=>`<button type="button" class="xestor-fila" data-id="${esc(f.idFoto)}" aria-current="${texto(f.idFoto)===actual?'true':'false'}"><img class="xestor-miniatura" data-id="${esc(f.idFoto)}" alt="Miniatura de ${esc(f.titulo||f.peFoto||'fotografía')}"><span class="xestor-nome">${esc(f.titulo||f.peFoto||f.idFoto)}</span><span class="xestor-badge ${clase(f)}">${esc(estado(f))}</span></button>`).join(''):'<p class="xestor-baleiro">Non hai fotografías que coincidan co filtro.</p>';
    corpo.querySelectorAll('.xestor-fila').forEach(btn=>btn.addEventListener('click',e=>{const id=texto(btn.dataset.id);actual=id;pintarLista();pintarDetalle();if(e.target instanceof HTMLImageElement)abrirVisor(fotoActual())}));
    const obs=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){miniatura(entry.target.dataset.id,entry.target);obs.unobserve(entry.target)}}),{root:corpo,rootMargin:'150px'});
    corpo.querySelectorAll('.xestor-miniatura').forEach(img=>obs.observe(img));pintarDetalle();
  }

  function pintarDetalle(){
    const f=fotoActual(),pub=document.querySelector('#xestor-publica'),pri=document.querySelector('#xestor-privada'),titulo=document.querySelector('#xestor-seleccion'),badge=document.querySelector('#xestor-badge');
    if(pub instanceof HTMLInputElement)pub.checked=f?.publicarPublica===true;if(pri instanceof HTMLInputElement)pri.checked=f?.publicarPrivada===true;
    if(titulo instanceof HTMLElement)titulo.textContent=f?texto(f.titulo||f.peFoto||f.idFoto):'Sen selección';
    if(badge instanceof HTMLElement){badge.textContent=f?estado(f):'Sen selección';badge.className='xestor-badge '+(f?clase(f):'')}
  }

  async function cargar(){const msg=document.querySelector('#xestor-msg');try{if(msg instanceof HTMLElement){msg.textContent='Preparando catálogo…';msg.dataset.error='false'}const r=await api({accion:'listar'});fotos=Array.isArray(r.fotos)?r.fotos:[];actual=texto(fotos[0]?.idFoto);pintarResumo();pintarLista();if(msg instanceof HTMLElement)msg.textContent=`${r.total||0} fotografías: ${r.publicadas||0} publicadas, ${r.nonPublicadas||0} non publicadas, ${r.pendentes||0} pendentes e ${r.rexeitadas||0} rexeitadas.`}catch(e){if(msg instanceof HTMLElement){msg.textContent=e instanceof Error?e.message:'Non se puido cargar o catálogo.';msg.dataset.error='true'}}}
  async function gardar(){const f=fotoActual();if(!f)return;const pub=document.querySelector('#xestor-publica'),pri=document.querySelector('#xestor-privada'),btn=document.querySelector('#xestor-gardar'),msg=document.querySelector('#xestor-msg');if(!(pub instanceof HTMLInputElement)||!(pri instanceof HTMLInputElement))return;if(btn instanceof HTMLButtonElement)btn.disabled=true;if(msg instanceof HTMLElement){msg.textContent='Actualizando Sheet, índices R2 e caché…';msg.dataset.error='false'}try{const r=await api({accion:'gardar',idFoto:f.idFoto,publicarPublica:pub.checked,publicarPrivada:pri.checked});Object.assign(f,r);pintarResumo();pintarLista();if(msg instanceof HTMLElement)msg.textContent=r.mensaxe||'Estado actualizado e verificado.'}catch(e){pintarDetalle();if(msg instanceof HTMLElement){msg.textContent=e instanceof Error?e.message:'Non se puido gardar';msg.dataset.error='true'}}finally{if(btn instanceof HTMLButtonElement)btn.disabled=false}}

  function activarPestana(nome){const shell=document.querySelector('#shell'),panel=document.querySelector('#xestor-publicacion-fotos'),contido=document.querySelector('#xestor-contido-revision');document.querySelectorAll('.xestor-tab').forEach(btn=>btn.setAttribute('aria-selected',btn.dataset.tab===nome?'true':'false'));if(panel instanceof HTMLElement)panel.hidden=nome!=='publicacion';if(contido instanceof HTMLElement)contido.hidden=nome!=='revision';if(shell instanceof HTMLElement)shell.dataset.vista=nome;if(nome==='publicacion'&&!fotos.length)cargar()}
  function envolverRevision(shell){if(document.querySelector('#xestor-contido-revision'))return;const c=document.createElement('div');c.id='xestor-contido-revision';[...shell.children].filter(n=>!n.classList?.contains('xestor-tabs')&&n.id!=='xestor-publicacion-fotos').forEach(n=>c.appendChild(n));shell.appendChild(c)}
  function instalar(){
    const shell=document.querySelector('#shell');if(!(shell instanceof HTMLElement)||document.querySelector('#xestor-publicacion-fotos'))return false;envolverRevision(shell);
    const tabs=document.createElement('nav');tabs.className='xestor-tabs';tabs.innerHTML='<button type="button" class="xestor-tab" data-tab="revision" aria-selected="true">Revisión e edición</button><button type="button" class="xestor-tab" data-tab="publicacion" aria-selected="false">Estado de publicación</button>';shell.insertBefore(tabs,shell.firstChild);
    const panel=document.createElement('section');panel.id='xestor-publicacion-fotos';panel.className='xestor-publicacion';panel.hidden=true;
    panel.innerHTML=`<header class="xestor-head"><div><span>Arquivo fotográfico</span><h2>Estado de publicación</h2><p>Filtra, revisa miniaturas e cambia o destino de publicación sen editar a Sheet.</p></div><strong id="xestor-badge" class="xestor-badge">Sen selección</strong></header><div id="xestor-resumo" class="xestor-resumo"></div><div class="xestor-filtros"><input id="xestor-filtro" type="search" placeholder="Buscar por título ou descrición"><select id="xestor-estado"><option value="">Todas as galerías</option><option value="ambas">Pública e privada</option><option value="publica">Só pública</option><option value="privada">Só privada</option></select></div><div class="xestor-grid"><div id="xestor-lista" class="xestor-lista"><p class="xestor-baleiro">Preparando catálogo…</p></div><aside class="xestor-detalle"><span>Fotografía seleccionada</span><h3 id="xestor-seleccion">Sen selección</h3><label><input id="xestor-publica" type="checkbox"><span><strong>Galería pública</strong><small>Visible para calquera visitante</small></span></label><label><input id="xestor-privada" type="checkbox"><span><strong>Galería privada</strong><small>Visible para persoas autorizadas</small></span></label><button id="xestor-gardar" type="button">Gardar estado</button><p id="xestor-msg" role="status">Abre esta pestana para cargar o catálogo.</p></aside></div>`;shell.appendChild(panel);
    tabs.querySelectorAll('.xestor-tab').forEach(btn=>btn.addEventListener('click',()=>activarPestana(texto(btn.dataset.tab))));panel.querySelector('#xestor-filtro')?.addEventListener('input',pintarLista);panel.querySelector('#xestor-estado')?.addEventListener('change',()=>{filtroResumo='';pintarResumo();pintarLista()});panel.querySelector('#xestor-gardar')?.addEventListener('click',gardar);return true;
  }
  function cargarPrimeiraFoto(){if(primeiraCargada)return;const select=document.querySelector('#photo-select'),boton=document.querySelector('#load-photo');if(!(select instanceof HTMLSelectElement)||!select.options.length||!(boton instanceof HTMLButtonElement))return;primeiraCargada=true;select.selectedIndex=0;select.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(()=>boton.click(),80)}

  const css=document.createElement('style');css.textContent=`#xestor-publicacion-fotos,.xestor-tabs{font-family:Aptos,'Segoe UI',Arial,sans-serif}.xestor-tabs{display:flex;gap:.25rem;margin:0 0 .8rem;border-bottom:1px solid #d9d2cc}.xestor-tab{padding:.55rem .8rem;border:0;border-bottom:2px solid transparent;background:transparent;color:#665f59;font:inherit;font-size:.78rem;cursor:pointer}.xestor-tab[aria-selected=true]{border-bottom-color:#6d2032;color:#6d2032;font-weight:700}.xestor-publicacion{padding:.9rem;border:1px solid #ddd7d2;background:#fff}.xestor-head{display:flex;justify-content:space-between;gap:1rem;align-items:start;margin-bottom:.75rem}.xestor-head span,.xestor-detalle>span{display:block;color:#8b7440;font-size:.62rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.xestor-head h2{margin:.12rem 0;color:#6d2032;font-size:1.05rem}.xestor-head p{margin:.2rem 0 0;color:#6d6660;font-size:.76rem}.xestor-badge{padding:.27rem .5rem;border-radius:999px;background:#f0ece8;color:#5c5651;font-size:.66rem;white-space:nowrap}.estado-ambas{background:#edf4ed;color:#315d37}.estado-publica{background:#eef2f6;color:#36546e}.estado-privada{background:#f3eef5;color:#62436b}.estado-nonpublicada{background:#f1efed;color:#706963}.estado-pendente{background:#fbf2dd;color:#7a5a16}.estado-rexeitada{background:#f8e9e9;color:#873838}.xestor-resumo{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.6rem}.xestor-resumo button{display:grid;grid-template-columns:auto auto;gap:.3rem;align-items:center;padding:.38rem .55rem;border:1px solid #e3ddd8;background:#f7f5f2;color:#6d6660;font:inherit;font-size:.68rem;cursor:pointer}.xestor-resumo button[aria-pressed=true]{border-color:#6d2032;background:#faf4f5;color:#6d2032}.xestor-resumo strong{font-size:.78rem}.xestor-filtros{display:grid;grid-template-columns:1fr 190px;gap:.45rem;margin-bottom:.55rem}.xestor-filtros input,.xestor-filtros select{min-height:2.15rem;padding:.42rem .55rem;border:1px solid #d5cec8;background:#fff;font:inherit;font-size:.78rem}.xestor-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:.65rem}.xestor-lista{max-height:55vh;overflow:auto;border:1px solid #e1dbd6}.xestor-fila{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:.6rem;align-items:center;width:100%;padding:.38rem .55rem;border:0;border-bottom:1px solid #eee9e5;background:#fff;text-align:left;font:inherit;cursor:pointer}.xestor-fila:hover,.xestor-fila[aria-current=true]{background:#faf7f5}.xestor-fila[aria-current=true]{box-shadow:inset 3px 0 #6d2032}.xestor-miniatura{width:54px;height:42px;object-fit:cover;background:#ece8e4;border:1px solid #ded8d3;cursor:zoom-in}.xestor-nome{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.76rem;color:#403b37}.xestor-detalle{padding:.75rem;border:1px solid #e1dbd6;background:#faf9f7}.xestor-detalle h3{margin:.25rem 0 .7rem;font-size:.88rem;color:#403b37}.xestor-detalle label{display:grid;grid-template-columns:auto 1fr;gap:.5rem;padding:.55rem 0;border-top:1px solid #e8e2dd}.xestor-detalle label span{display:grid;gap:.08rem}.xestor-detalle strong{font-size:.76rem}.xestor-detalle small{color:#756e68;font-size:.68rem}.xestor-detalle button{width:100%;min-height:2.2rem;margin-top:.6rem;border:1px solid #6d2032;background:#6d2032;color:#fff;font:inherit;font-size:.76rem;cursor:pointer}.xestor-detalle p{margin:.6rem 0 0;color:#6c655f;font-size:.7rem}.xestor-baleiro{margin:0;padding:1rem;color:#756e68;font-size:.76rem}.xestor-visor{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:2rem;background:rgba(20,17,15,.86)}.xestor-visor[hidden]{display:none}.xestor-visor figure{max-width:min(1100px,94vw);max-height:90vh;margin:0;display:grid;gap:.5rem}.xestor-visor img{max-width:100%;max-height:82vh;object-fit:contain;background:#111}.xestor-visor figcaption{color:#fff;text-align:center;font:14px Aptos,'Segoe UI',sans-serif}.xestor-visor-pechar{position:fixed;top:1rem;right:1rem;width:2.5rem;height:2.5rem;border:1px solid rgba(255,255,255,.5);border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:1.7rem;cursor:pointer}@media(max-width:780px){.xestor-grid,.xestor-filtros{grid-template-columns:1fr}.xestor-head{display:grid}.xestor-lista{max-height:42vh}.xestor-fila{grid-template-columns:48px minmax(0,1fr)}.xestor-fila .xestor-badge{grid-column:2}.xestor-miniatura{width:48px;height:40px}}`;document.head.appendChild(css);
  const observer=new MutationObserver(()=>{instalar();cargarPrimeiraFoto()});observer.observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{instalar();cargarPrimeiraFoto()},{once:true});else{instalar();cargarPrimeiraFoto()}
  window.addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));urls.clear()});
})();
