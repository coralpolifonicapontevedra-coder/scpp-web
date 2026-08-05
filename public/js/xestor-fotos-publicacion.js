(()=>{
  let token='';
  let fotos=[];
  let actual='';
  let primeiraCargada=false;
  const fetchBase=window.fetch.bind(window);

  window.fetch=async(input,init)=>{
    try{
      if(init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body?.idToken) token=String(body.idToken);
      }
    }catch{}
    return fetchBase(input,init);
  };

  const texto=v=>String(v??'').trim();
  const esc=v=>texto(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const estado=f=>f?.estadoPublicacion==='ambas'?'Pública e privada':f?.estadoPublicacion==='publica'?'Só pública':f?.estadoPublicacion==='privada'?'Só privada':'Non publicada';
  const clase=f=>'estado-'+(f?.estadoPublicacion||'ningunha');

  async function agardarToken(maxMs=12000){
    const inicio=Date.now();
    while(!token&&Date.now()-inicio<maxMs) await new Promise(resolve=>setTimeout(resolve,120));
    if(!token) throw new Error('Non se puido preparar a sesión. Recarga a páxina e téntao de novo.');
    return token;
  }

  async function api(body){
    await agardarToken();
    const resposta=await fetchBase('/api/xestion-publicacion-foto',{
      method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
      body:JSON.stringify({idToken:token,...body})
    });
    const resultado=await resposta.json().catch(()=>null);
    if(!resposta.ok||!resultado?.ok) throw new Error(resultado?.erro||'Non se puido completar a operación');
    return resultado;
  }

  function fotoActual(){return fotos.find(f=>texto(f.idFoto)===actual)}

  function listaFiltrada(){
    const busca=texto(document.querySelector('#xestor-filtro')?.value).toLowerCase();
    const filtro=texto(document.querySelector('#xestor-estado')?.value);
    return fotos.filter(f=>(!filtro||f.estadoPublicacion===filtro)&&(!busca||texto(f.titulo||f.peFoto||f.idFoto).toLowerCase().includes(busca)));
  }

  function pintarResumo(){
    const resumo=document.querySelector('#xestor-resumo');
    if(!(resumo instanceof HTMLElement)) return;
    const ambas=fotos.filter(f=>f.estadoPublicacion==='ambas').length;
    const publica=fotos.filter(f=>f.estadoPublicacion==='publica').length;
    const privada=fotos.filter(f=>f.estadoPublicacion==='privada').length;
    const ningunha=fotos.filter(f=>f.estadoPublicacion==='ningunha').length;
    resumo.innerHTML=`<span><strong>${fotos.length}</strong> Total</span><span><strong>${ambas}</strong> Ambas</span><span><strong>${publica}</strong> Só pública</span><span><strong>${privada}</strong> Só privada</span><span><strong>${ningunha}</strong> Non publicadas</span>`;
  }

  function pintarLista(){
    const corpo=document.querySelector('#xestor-lista');
    if(!(corpo instanceof HTMLElement)) return;
    const lista=listaFiltrada();
    if(!lista.some(f=>texto(f.idFoto)===actual)) actual=texto(lista[0]?.idFoto);
    corpo.innerHTML=lista.length?lista.map(f=>`<button type="button" class="xestor-fila" data-id="${esc(f.idFoto)}" aria-current="${texto(f.idFoto)===actual?'true':'false'}"><span class="xestor-nome">${esc(f.titulo||f.peFoto||f.idFoto)}</span><span class="xestor-badge ${clase(f)}">${esc(estado(f))}</span></button>`).join(''):'<p class="xestor-baleiro">Non hai fotografías que coincidan co filtro.</p>';
    corpo.querySelectorAll('.xestor-fila').forEach(btn=>btn.addEventListener('click',()=>{actual=texto(btn.dataset.id);pintarLista();pintarDetalle()}));
    pintarDetalle();
  }

  function pintarDetalle(){
    const f=fotoActual();
    const pub=document.querySelector('#xestor-publica');
    const pri=document.querySelector('#xestor-privada');
    const titulo=document.querySelector('#xestor-seleccion');
    const badge=document.querySelector('#xestor-badge');
    if(pub instanceof HTMLInputElement) pub.checked=f?.publicarPublica===true;
    if(pri instanceof HTMLInputElement) pri.checked=f?.publicarPrivada===true;
    if(titulo instanceof HTMLElement) titulo.textContent=f?texto(f.titulo||f.peFoto||f.idFoto):'Sen selección';
    if(badge instanceof HTMLElement){badge.textContent=f?estado(f):'Sen selección';badge.className='xestor-badge '+(f?clase(f):'')}
  }

  async function cargar(){
    const msg=document.querySelector('#xestor-msg');
    try{
      if(msg instanceof HTMLElement){msg.textContent='Preparando catálogo…';msg.dataset.error='false'}
      const resultado=await api({accion:'listar'});
      fotos=Array.isArray(resultado.fotos)?resultado.fotos:[];
      actual=texto(fotos[0]?.idFoto);
      pintarResumo();pintarLista();
      if(msg instanceof HTMLElement) msg.textContent=`Catálogo preparado: ${resultado.total||0} fotografías, ${resultado.nonPublicadas||0} non publicadas.`;
    }catch(error){
      if(msg instanceof HTMLElement){msg.textContent=error instanceof Error?error.message:'Non se puido cargar o catálogo.';msg.dataset.error='true'}
    }
  }

  async function gardar(){
    const f=fotoActual();if(!f)return;
    const pub=document.querySelector('#xestor-publica');
    const pri=document.querySelector('#xestor-privada');
    const btn=document.querySelector('#xestor-gardar');
    const msg=document.querySelector('#xestor-msg');
    if(!(pub instanceof HTMLInputElement)||!(pri instanceof HTMLInputElement))return;
    if(btn instanceof HTMLButtonElement)btn.disabled=true;
    if(msg instanceof HTMLElement){msg.textContent='Actualizando Sheet, índices R2 e caché…';msg.dataset.error='false'}
    try{
      const resultado=await api({accion:'gardar',idFoto:f.idFoto,publicarPublica:pub.checked,publicarPrivada:pri.checked});
      Object.assign(f,resultado);
      f.estadoPublicacion=resultado.estadoPublicacion;
      pintarResumo();pintarLista();
      if(msg instanceof HTMLElement)msg.textContent=resultado.mensaxe||'Estado actualizado e verificado.';
    }catch(error){
      pintarDetalle();
      if(msg instanceof HTMLElement){msg.textContent=error instanceof Error?error.message:'Non se puido gardar';msg.dataset.error='true'}
    }finally{if(btn instanceof HTMLButtonElement)btn.disabled=false}
  }

  function activarPestana(nome){
    const shell=document.querySelector('#shell');
    const panel=document.querySelector('#xestor-publicacion-fotos');
    const contido=document.querySelector('#xestor-contido-revision');
    document.querySelectorAll('.xestor-tab').forEach(btn=>btn.setAttribute('aria-selected',btn.dataset.tab===nome?'true':'false'));
    if(panel instanceof HTMLElement)panel.hidden=nome!=='publicacion';
    if(contido instanceof HTMLElement)contido.hidden=nome!=='revision';
    if(shell instanceof HTMLElement)shell.dataset.vista=nome;
    if(nome==='publicacion'&&!fotos.length)cargar();
  }

  function envolverRevision(shell){
    if(document.querySelector('#xestor-contido-revision'))return;
    const contido=document.createElement('div');contido.id='xestor-contido-revision';
    const nodos=[...shell.children].filter(n=>!n.classList?.contains('xestor-tabs')&&n.id!=='xestor-publicacion-fotos');
    nodos.forEach(n=>contido.appendChild(n));shell.appendChild(contido);
  }

  function instalar(){
    const shell=document.querySelector('#shell');
    if(!(shell instanceof HTMLElement)||document.querySelector('#xestor-publicacion-fotos'))return false;
    envolverRevision(shell);

    const tabs=document.createElement('nav');tabs.className='xestor-tabs';tabs.setAttribute('aria-label','Seccións do arquivo fotográfico');
    tabs.innerHTML='<button type="button" class="xestor-tab" data-tab="revision" aria-selected="true">Revisión e edición</button><button type="button" class="xestor-tab" data-tab="publicacion" aria-selected="false">Estado de publicación</button>';
    shell.insertBefore(tabs,shell.firstChild);

    const panel=document.createElement('section');panel.id='xestor-publicacion-fotos';panel.className='xestor-publicacion';panel.hidden=true;
    panel.innerHTML=`<header class="xestor-head"><div><span>Arquivo fotográfico</span><h2>Estado de publicación</h2><p>Consulta todo o catálogo, filtra por galería e recupera fotografías retiradas sen editar a Sheet.</p></div><strong id="xestor-badge" class="xestor-badge">Sen selección</strong></header><div id="xestor-resumo" class="xestor-resumo"></div><div class="xestor-filtros"><input id="xestor-filtro" type="search" placeholder="Buscar por título ou descrición"><select id="xestor-estado"><option value="">Todas as fotografías</option><option value="ambas">Pública e privada</option><option value="publica">Só pública</option><option value="privada">Só privada</option><option value="ningunha">Non publicadas</option></select></div><div class="xestor-grid"><div id="xestor-lista" class="xestor-lista"><p class="xestor-baleiro">Preparando catálogo…</p></div><aside class="xestor-detalle"><span>Fotografía seleccionada</span><h3 id="xestor-seleccion">Sen selección</h3><label><input id="xestor-publica" type="checkbox"><span><strong>Galería pública</strong><small>Visible para calquera visitante</small></span></label><label><input id="xestor-privada" type="checkbox"><span><strong>Galería privada</strong><small>Visible para persoas autorizadas</small></span></label><button id="xestor-gardar" type="button">Gardar estado</button><p id="xestor-msg" role="status">Abre esta pestana para cargar o catálogo.</p></aside></div>`;
    shell.appendChild(panel);

    tabs.querySelectorAll('.xestor-tab').forEach(btn=>btn.addEventListener('click',()=>activarPestana(texto(btn.dataset.tab))));
    panel.querySelector('#xestor-filtro')?.addEventListener('input',pintarLista);
    panel.querySelector('#xestor-estado')?.addEventListener('change',pintarLista);
    panel.querySelector('#xestor-gardar')?.addEventListener('click',gardar);
    return true;
  }

  function cargarPrimeiraFoto(){
    if(primeiraCargada)return;
    const select=document.querySelector('#photo-select');
    const boton=document.querySelector('#load-photo');
    if(!(select instanceof HTMLSelectElement)||!select.options.length||!(boton instanceof HTMLButtonElement))return;
    primeiraCargada=true;
    select.selectedIndex=0;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    window.setTimeout(()=>boton.click(),80);
  }

  const css=document.createElement('style');
  css.textContent=`#xestor-publicacion-fotos,.xestor-tabs{font-family:Aptos,'Segoe UI',Arial,sans-serif}.xestor-tabs{display:flex;gap:.25rem;margin:0 0 .8rem;border-bottom:1px solid #d9d2cc}.xestor-tab{padding:.55rem .8rem;border:0;border-bottom:2px solid transparent;background:transparent;color:#665f59;font:inherit;font-size:.78rem;cursor:pointer}.xestor-tab[aria-selected=true]{border-bottom-color:#6d2032;color:#6d2032;font-weight:700}.xestor-publicacion{padding:.9rem;border:1px solid #ddd7d2;background:#fff}.xestor-head{display:flex;justify-content:space-between;gap:1rem;align-items:start;margin-bottom:.75rem}.xestor-head span,.xestor-detalle>span{display:block;color:#8b7440;font-size:.62rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.xestor-head h2{margin:.12rem 0;color:#6d2032;font-size:1.05rem}.xestor-head p{margin:.2rem 0 0;color:#6d6660;font-size:.76rem}.xestor-badge{padding:.27rem .5rem;border-radius:999px;background:#f0ece8;color:#5c5651;font-size:.66rem;white-space:nowrap}.estado-ambas{background:#edf4ed;color:#315d37}.estado-publica{background:#eef2f6;color:#36546e}.estado-privada{background:#f3eef5;color:#62436b}.estado-ningunha{background:#f1efed;color:#706963}.xestor-resumo{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.6rem}.xestor-resumo span{padding:.35rem .48rem;background:#f7f5f2;color:#6d6660;font-size:.68rem}.xestor-resumo strong{color:#403b37}.xestor-filtros{display:grid;grid-template-columns:1fr 190px;gap:.45rem;margin-bottom:.55rem}.xestor-filtros input,.xestor-filtros select{min-height:2.15rem;padding:.42rem .55rem;border:1px solid #d5cec8;background:#fff;font:inherit;font-size:.78rem}.xestor-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:.65rem}.xestor-lista{max-height:52vh;overflow:auto;border:1px solid #e1dbd6}.xestor-fila{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem;align-items:center;width:100%;padding:.55rem .65rem;border:0;border-bottom:1px solid #eee9e5;background:#fff;text-align:left;font:inherit;cursor:pointer}.xestor-fila:hover,.xestor-fila[aria-current=true]{background:#faf7f5}.xestor-fila[aria-current=true]{box-shadow:inset 3px 0 #6d2032}.xestor-nome{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.76rem;color:#403b37}.xestor-detalle{padding:.75rem;border:1px solid #e1dbd6;background:#faf9f7}.xestor-detalle h3{margin:.25rem 0 .7rem;font-size:.88rem;color:#403b37}.xestor-detalle label{display:grid;grid-template-columns:auto 1fr;gap:.5rem;padding:.55rem 0;border-top:1px solid #e8e2dd}.xestor-detalle label span{display:grid;gap:.08rem}.xestor-detalle strong{font-size:.76rem}.xestor-detalle small{color:#756e68;font-size:.68rem}.xestor-detalle button{width:100%;min-height:2.2rem;margin-top:.6rem;border:1px solid #6d2032;background:#6d2032;color:#fff;font:inherit;font-size:.76rem;cursor:pointer}.xestor-detalle button:disabled{opacity:.55}.xestor-detalle p{margin:.6rem 0 0;color:#6c655f;font-size:.7rem}.xestor-detalle p[data-error=true]{color:#8b2525}.xestor-baleiro{margin:0;padding:1rem;color:#756e68;font-size:.76rem}@media(max-width:780px){.xestor-grid,.xestor-filtros{grid-template-columns:1fr}.xestor-head{display:grid}.xestor-lista{max-height:38vh}}`;
  document.head.appendChild(css);

  const observer=new MutationObserver(()=>{instalar();cargarPrimeiraFoto()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{instalar();cargarPrimeiraFoto()},{once:true});else{instalar();cargarPrimeiraFoto()}
})();