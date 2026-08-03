const INXECCION = `
<style>
  .review-mode-tabs{display:flex;gap:.5rem;margin:0 0 1rem;padding:.35rem;border:1px solid #ddd7d2;background:#fff}
  .review-mode-tabs button{min-height:2.55rem;padding:.55rem 1rem;border:0;background:transparent;color:#625d59;font:600 .82rem/1 Aptos,'Segoe UI',Arial,sans-serif;cursor:pointer}
  .review-mode-tabs button[aria-selected="true"]{background:#6d2032;color:#fff}
  .review-quick-nav{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap}
  .review-quick-nav button{min-height:2.6rem;padding:.6rem .8rem;border:1px solid #cfc7c1;background:#fff;color:#4b4642;font:inherit;cursor:pointer}
  .review-quick-nav button:disabled{opacity:.45;cursor:not-allowed}
  .review-quick-nav .reject-photo{border-color:#b98f94;color:#842323;background:#fffafa}
  .review-position{min-width:5rem;text-align:center;color:#6b6561;font:600 .76rem/1.2 Aptos,'Segoe UI',Arial,sans-serif}
  .published-manager{display:grid;gap:1rem;font-family:Aptos,'Segoe UI',Arial,sans-serif}
  .published-toolbar,.published-editor{border:1px solid #ddd7d2;background:#fff}
  .published-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 190px auto;gap:.7rem;padding:1rem;align-items:end}
  .published-toolbar label,.published-field{display:grid;gap:.35rem}
  .published-toolbar span,.published-field>span,.published-status span{font-size:.67rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#625d59}
  .published-toolbar input,.published-toolbar select,.published-toolbar button,.published-field input,.published-field textarea,.published-actions button{min-height:2.6rem;padding:.6rem .75rem;border:1px solid #cfc7c1;background:#fff;color:#4b4642;font:inherit}
  .published-editor{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:1rem;padding:1rem}
  .published-image{display:grid;place-items:center;min-height:520px;background:#ebe7e2;overflow:hidden}
  .published-image img{display:block;max-width:100%;max-height:72vh;object-fit:contain;box-shadow:0 8px 28px rgba(30,24,20,.12)}
  .published-image p{padding:1rem;color:#6b6561;text-align:center}
  .published-form{display:grid;align-content:start;gap:.85rem}
  .published-field textarea{resize:vertical}
  .published-check{display:grid;grid-template-columns:auto 1fr;gap:.6rem;align-items:start;padding:.45rem 0}
  .published-check span{display:grid;gap:.12rem}
  .published-check strong{font-weight:600}.published-check small{color:#6b6561}
  .published-check.secondary{padding-left:1.6rem}
  .published-actions{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;padding-top:.4rem}
  .published-actions .save{background:#6d2032;color:#fff;border-color:#6d2032}
  .published-actions .withdraw{color:#842323;border-color:#b98f94;background:#fffafa}
  .published-status{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}
  .published-status div{display:grid;gap:.2rem;padding:.65rem;border:1px solid #e1dcd7;background:#faf8f6}
  .published-message{min-height:2.6rem;margin:0;padding:.7rem;border-left:3px solid #b79a55;background:#faf8f6;font-size:.82rem}
  .published-message[data-error="true"]{border-left-color:#a12b2b;color:#842323}
  .published-empty{padding:2rem;border:1px solid #ddd7d2;background:#fff;text-align:center;color:#6b6561}
  @media(max-width:1050px){.published-editor{grid-template-columns:1fr}.published-form{width:100%}}
  @media(max-width:700px){.published-toolbar{grid-template-columns:1fr}.published-actions,.published-status{grid-template-columns:1fr}.review-quick-nav{display:grid;grid-template-columns:1fr 1fr}.review-quick-nav .reject-photo,.review-position{grid-column:1/-1}.review-position{padding:.35rem}}
</style>
<script>
(function(){
  let tokenEditor='';
  let publicadas=[];
  let publicadaActual=null;
  let urlImaxe='';
  const fetchOriginal=window.fetch.bind(window);
  window.fetch=async function(input,init){
    try{
      const url=typeof input==='string'?input:String(input&&input.url||'');
      if((url.includes('/api/fotos')||url.includes('/api/editor-fotos')||url.includes('/api/gestion-fotos-publicadas'))&&init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body&&body.idToken) tokenEditor=String(body.idToken);
      }
    }catch(_){ }
    return fetchOriginal(input,init);
  };

  function elementos(){return{select:document.querySelector('#photo-select'),cargar:document.querySelector('#load-photo'),mensaxe:document.querySelector('#message')}}
  function actualizarEstado(){
    const {select}=elementos();const anterior=document.querySelector('#quick-previous');const seguinte=document.querySelector('#quick-next');const posicion=document.querySelector('#quick-position');
    if(!(select instanceof HTMLSelectElement))return;const total=select.options.length;const indice=Math.max(0,select.selectedIndex);
    if(anterior instanceof HTMLButtonElement)anterior.disabled=total===0||indice<=0;
    if(seguinte instanceof HTMLButtonElement)seguinte.disabled=total===0||indice>=total-1;
    if(posicion instanceof HTMLElement)posicion.textContent=total?String(indice+1)+' de '+String(total):'0 de 0';
  }
  function cargarIndice(indice){const {select,cargar}=elementos();if(!(select instanceof HTMLSelectElement)||!(cargar instanceof HTMLButtonElement))return;if(indice<0||indice>=select.options.length)return;select.selectedIndex=indice;select.dispatchEvent(new Event('change',{bubbles:true}));cargar.click();actualizarEstado()}
  async function rexeitarActual(){
    const {select,cargar,mensaxe}=elementos();if(!(select instanceof HTMLSelectElement)||!select.value)return;
    if(!window.confirm('Queres rexeitar esta fotografía? Sairá da cola de revisión, pero conservarase o ficheiro orixinal.'))return;
    if(!tokenEditor){if(mensaxe instanceof HTMLElement){mensaxe.textContent='A sesión aínda non está preparada. Agarda un instante e téntao de novo.';mensaxe.dataset.error='true'}return}
    const boton=document.querySelector('#quick-reject');if(boton instanceof HTMLButtonElement)boton.disabled=true;
    if(mensaxe instanceof HTMLElement){mensaxe.textContent='Marcando a fotografía como rexeitada…';mensaxe.dataset.error='false'}
    try{
      const resposta=await fetchOriginal('/api/fotos',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({idToken:tokenEditor,accion:'actualizarRevisionFoto',rowId:select.value,idFoto:select.value,estado:'Rexeitada',publicarPublica:false,publicarPrivada:false,titulo:'',peFoto:'',observacions:''})});
      const resultado=await resposta.json().catch(()=>null);if(!resposta.ok||!resultado?.ok)throw new Error(resultado?.erro||'Non se puido rexeitar a fotografía.');
      const indice=select.selectedIndex;select.remove(indice);if(select.options.length){select.selectedIndex=Math.min(indice,select.options.length-1);if(cargar instanceof HTMLButtonElement)cargar.click()}
      if(mensaxe instanceof HTMLElement){mensaxe.textContent='Fotografía rexeitada e retirada da cola. O orixinal consérvase.';mensaxe.dataset.error='false'}actualizarEstado();
    }catch(erro){if(mensaxe instanceof HTMLElement){mensaxe.textContent=erro instanceof Error?erro.message:'Non se puido rexeitar a fotografía.';mensaxe.dataset.error='true'}}finally{if(boton instanceof HTMLButtonElement)boton.disabled=false}
  }

  function escapar(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function mensaxePublicadas(texto,erro){const p=document.querySelector('#published-message');if(p instanceof HTMLElement){p.textContent=texto||'';p.dataset.error=erro?'true':'false'}}
  async function apiPublicadas(corpo,blob){
    if(!tokenEditor)throw new Error('A sesión aínda non está preparada.');
    const resposta=await fetchOriginal('/api/gestion-fotos-publicadas',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({idToken:tokenEditor,...corpo})});
    if(blob){if(!resposta.ok){const r=await resposta.json().catch(()=>null);throw new Error(r?.erro||'Non se puido cargar a imaxe.')}return resposta.blob()}
    const resultado=await resposta.json().catch(()=>null);if(!resposta.ok||!resultado?.ok)throw new Error(resultado?.erro||'Non se puido completar a operación.');return resultado;
  }
  function filtradas(){
    const busca=String(document.querySelector('#published-search')?.value||'').trim().toLowerCase();
    const tipo=String(document.querySelector('#published-filter')?.value||'todas');
    return publicadas.filter(function(f){
      const coincideTipo=tipo==='todas'||(tipo==='publica'&&f.publicarPublica)||(tipo==='privada'&&f.publicarPrivada)||(tipo==='ambas'&&f.publicarPublica&&f.publicarPrivada);
      const texto=[f.titulo,f.peFoto,f.evento,f.concerto,f.lugar,f.data,f.anoAproximado].join(' ').toLowerCase();return coincideTipo&&(!busca||texto.includes(busca));
    });
  }
  function reconstruirSelect(){
    const select=document.querySelector('#published-select');if(!(select instanceof HTMLSelectElement))return;
    const lista=filtradas();select.innerHTML=lista.map(function(f){return '<option value="'+escapar(f.idFoto)+'">'+escapar(f.titulo||f.peFoto||'Fotografía sen título')+'</option>'}).join('');
    document.querySelector('#published-empty')?.toggleAttribute('hidden',lista.length!==0);
    document.querySelector('#published-editor')?.toggleAttribute('hidden',lista.length===0);
    if(lista.length)cargarPublicada(select.value);else limparPublicada();
  }
  function limparPublicada(){if(urlImaxe){URL.revokeObjectURL(urlImaxe);urlImaxe=''}const img=document.querySelector('#published-image');if(img instanceof HTMLImageElement){img.removeAttribute('src');img.alt=''}publicadaActual=null}
  function actualizarChecksPublicadas(){
    const pub=document.querySelector('#published-public');const pri=document.querySelector('#published-private');const dpub=document.querySelector('#published-featured-public');const dpri=document.querySelector('#published-featured-private');
    if(pub instanceof HTMLInputElement&&dpub instanceof HTMLInputElement){dpub.disabled=!pub.checked;if(!pub.checked)dpub.checked=false}
    if(pri instanceof HTMLInputElement&&dpri instanceof HTMLInputElement){dpri.disabled=!pri.checked;if(!pri.checked)dpri.checked=false}
  }
  async function cargarPublicada(id){
    publicadaActual=publicadas.find(function(f){return f.idFoto===id})||null;if(!publicadaActual)return;
    const set=function(sel,val){const e=document.querySelector(sel);if(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement)e.value=String(val||'')};
    set('#published-title',publicadaActual.titulo);set('#published-caption',publicadaActual.peFoto);set('#published-notes',publicadaActual.observacions);
    const pub=document.querySelector('#published-public');const pri=document.querySelector('#published-private');const dpub=document.querySelector('#published-featured-public');const dpri=document.querySelector('#published-featured-private');
    if(pub instanceof HTMLInputElement)pub.checked=publicadaActual.publicarPublica===true;if(pri instanceof HTMLInputElement)pri.checked=publicadaActual.publicarPrivada===true;
    if(dpub instanceof HTMLInputElement)dpub.checked=publicadaActual.destacadaPublica===true;if(dpri instanceof HTMLInputElement)dpri.checked=publicadaActual.destacadaPrivada===true;actualizarChecksPublicadas();
    mensaxePublicadas('Cargando a fotografía desde R2…',false);
    try{
      const usarPrivada=Boolean(publicadaActual.rutaR2Privada);const blob=await apiPublicadas({accion:'imaxe',idFoto:id,publica:!usarPrivada,rutaR2Publica:publicadaActual.rutaR2Publica,rutaR2Privada:publicadaActual.rutaR2Privada},true);
      if(urlImaxe)URL.revokeObjectURL(urlImaxe);urlImaxe=URL.createObjectURL(blob);const img=document.querySelector('#published-image');if(img instanceof HTMLImageElement){img.src=urlImaxe;img.alt=publicadaActual.titulo||'Fotografía publicada'}mensaxePublicadas('Fotografía cargada desde R2.',false);
    }catch(erro){mensaxePublicadas(erro instanceof Error?erro.message:'Non se puido cargar a fotografía.',true)}
  }
  async function gardarPublicada(retirar){
    if(!publicadaActual)return;const pub=document.querySelector('#published-public');const pri=document.querySelector('#published-private');const dpub=document.querySelector('#published-featured-public');const dpri=document.querySelector('#published-featured-private');
    const publicarPublica=!retirar&&pub instanceof HTMLInputElement&&pub.checked;const publicarPrivada=!retirar&&pri instanceof HTMLInputElement&&pri.checked;
    if(!retirar&&!publicarPublica&&!publicarPrivada){mensaxePublicadas('Selecciona polo menos unha galería ou utiliza «Retirar publicación».',true);return}
    if(retirar&&!window.confirm('Queres retirar esta fotografía de todas as galerías? O arquivo conservarase en R2.'))return;
    const estadoSheet=document.querySelector('#published-sheet-status');const estadoIndices=document.querySelector('#published-index-status');if(estadoSheet instanceof HTMLElement)estadoSheet.textContent='Gardando';if(estadoIndices instanceof HTMLElement)estadoIndices.textContent='En espera';
    try{
      const resultado=await apiPublicadas({accion:'actualizar',idFoto:publicadaActual.idFoto,titulo:String(document.querySelector('#published-title')?.value||''),peFoto:String(document.querySelector('#published-caption')?.value||''),observacions:String(document.querySelector('#published-notes')?.value||''),publicarPublica,publicarPrivada,destacadaPublica:publicarPublica&&dpub instanceof HTMLInputElement&&dpub.checked,destacadaPrivada:publicarPrivada&&dpri instanceof HTMLInputElement&&dpri.checked});
      if(estadoSheet instanceof HTMLElement)estadoSheet.textContent='Actualizada';if(estadoIndices instanceof HTMLElement)estadoIndices.textContent='Sincronizando';mensaxePublicadas(resultado.mensaxe||'Cambios gardados.',false);
      try{await fetchOriginal('/api/galeria-privada',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({idToken:tokenEditor,accion:'refrescar'})});if(estadoIndices instanceof HTMLElement)estadoIndices.textContent='Actualizados'}catch(_){if(estadoIndices instanceof HTMLElement)estadoIndices.textContent='Pendentes'}
      publicadaActual.titulo=String(document.querySelector('#published-title')?.value||'');publicadaActual.peFoto=String(document.querySelector('#published-caption')?.value||'');publicadaActual.observacions=String(document.querySelector('#published-notes')?.value||'');publicadaActual.publicarPublica=publicarPublica;publicadaActual.publicarPrivada=publicarPrivada;
      if(retirar){publicadas=publicadas.filter(function(f){return f.idFoto!==publicadaActual.idFoto});reconstruirSelect()}
    }catch(erro){if(estadoSheet instanceof HTMLElement)estadoSheet.textContent='Erro';mensaxePublicadas(erro instanceof Error?erro.message:'Non se puideron gardar os cambios.',true)}
  }
  async function cargarPublicadas(){
    const estado=document.querySelector('#published-loading');if(estado instanceof HTMLElement){estado.hidden=false;estado.textContent='Cargando fotografías publicadas…'}
    try{const resultado=await apiPublicadas({accion:'listar'});publicadas=Array.isArray(resultado.fotos)?resultado.fotos:[];if(estado instanceof HTMLElement)estado.hidden=true;reconstruirSelect()}catch(erro){if(estado instanceof HTMLElement){estado.hidden=false;estado.textContent=erro instanceof Error?erro.message:'Non se puideron cargar as fotografías publicadas.'}}
  }
  function cambiarModo(modo){
    const shell=document.querySelector('#shell');const pub=document.querySelector('#published-manager');const pestPend=document.querySelector('#mode-pending');const pestPub=document.querySelector('#mode-published');
    const publicadasModo=modo==='publicadas';if(shell instanceof HTMLElement)shell.hidden=publicadasModo;if(pub instanceof HTMLElement)pub.hidden=!publicadasModo;
    pestPend?.setAttribute('aria-selected',publicadasModo?'false':'true');pestPub?.setAttribute('aria-selected',publicadasModo?'true':'false');if(publicadasModo&&!publicadas.length)cargarPublicadas();
  }
  function instalarPublicadas(){
    const main=document.querySelector('.page-main');const header=document.querySelector('.page-header');if(!(main instanceof HTMLElement)||!(header instanceof HTMLElement)||document.querySelector('#review-mode-tabs'))return false;
    const tabs=document.createElement('div');tabs.id='review-mode-tabs';tabs.className='review-mode-tabs';tabs.setAttribute('role','tablist');tabs.innerHTML='<button id="mode-pending" type="button" role="tab" aria-selected="true">Pendentes de revisión</button><button id="mode-published" type="button" role="tab" aria-selected="false">Fotografías publicadas</button>';header.insertAdjacentElement('afterend',tabs);
    const panel=document.createElement('section');panel.id='published-manager';panel.className='published-manager';panel.hidden=true;panel.innerHTML='<div id="published-loading" class="published-empty">Cargando fotografías publicadas…</div><div class="published-toolbar"><label><span>Buscar</span><input id="published-search" type="search" placeholder="Título, evento, data ou lugar" /></label><label><span>Galería</span><select id="published-filter"><option value="todas">Todas</option><option value="publica">Pública</option><option value="privada">Privada</option><option value="ambas">Ambas</option></select></label><label><span>Fotografía</span><select id="published-select"></select></label></div><p id="published-empty" class="published-empty" hidden>Non hai fotografías que coincidan cos filtros.</p><div id="published-editor" class="published-editor" hidden><div class="published-image"><img id="published-image" alt="" /></div><div class="published-form"><label class="published-field"><span>Título mostrado na galería</span><input id="published-title" maxlength="120" /></label><label class="published-field"><span>Pé de foto</span><textarea id="published-caption" rows="3" maxlength="600"></textarea></label><label class="published-field"><span>Observacións privadas</span><textarea id="published-notes" rows="3" maxlength="500"></textarea></label><label class="published-check"><input id="published-public" type="checkbox" /><span><strong>Galería pública</strong><small>Visible para calquera visitante</small></span></label><label class="published-check secondary"><input id="published-featured-public" type="checkbox" /><span>Destacar na galería pública</span></label><label class="published-check"><input id="published-private" type="checkbox" /><span><strong>Galería privada</strong><small>Visible para persoas autorizadas</small></span></label><label class="published-check secondary"><input id="published-featured-private" type="checkbox" /><span>Destacar na galería privada</span></label><div class="published-actions"><button id="published-save" class="save" type="button">Guardar cambios</button><button id="published-withdraw" class="withdraw" type="button">Retirar publicación</button></div><div class="published-status"><div><span>Sheet Fotos</span><strong id="published-sheet-status">Sen cambios</strong></div><div><span>Índices R2</span><strong id="published-index-status">Sincronizados</strong></div></div><p id="published-message" class="published-message" role="status" aria-live="polite"></p></div></div>';
    tabs.insertAdjacentElement('afterend',panel);
    document.querySelector('#mode-pending')?.addEventListener('click',function(){cambiarModo('pendentes')});document.querySelector('#mode-published')?.addEventListener('click',function(){cambiarModo('publicadas')});
    document.querySelector('#published-search')?.addEventListener('input',reconstruirSelect);document.querySelector('#published-filter')?.addEventListener('change',reconstruirSelect);document.querySelector('#published-select')?.addEventListener('change',function(e){cargarPublicada(e.target.value)});
    document.querySelector('#published-public')?.addEventListener('change',actualizarChecksPublicadas);document.querySelector('#published-private')?.addEventListener('change',actualizarChecksPublicadas);document.querySelector('#published-save')?.addEventListener('click',function(){gardarPublicada(false)});document.querySelector('#published-withdraw')?.addEventListener('click',function(){gardarPublicada(true)});return true;
  }
  function instalarNav(){
    const fila=document.querySelector('.selector-row');const select=document.querySelector('#photo-select');if(!(fila instanceof HTMLElement)||!(select instanceof HTMLSelectElement)||document.querySelector('#quick-next'))return false;
    const nav=document.createElement('div');nav.className='review-quick-nav';nav.innerHTML='<button id="quick-previous" type="button">← Anterior</button><span id="quick-position" class="review-position">0 de 0</span><button id="quick-next" type="button">Seguinte →</button><button id="quick-reject" class="reject-photo" type="button">Rexeitar fotografía</button>';fila.appendChild(nav);
    nav.querySelector('#quick-previous')?.addEventListener('click',function(){cargarIndice(select.selectedIndex-1)});nav.querySelector('#quick-next')?.addEventListener('click',function(){cargarIndice(select.selectedIndex+1)});nav.querySelector('#quick-reject')?.addEventListener('click',rexeitarActual);select.addEventListener('change',actualizarEstado);actualizarEstado();return true;
  }
  function instalar(){const a=instalarNav();const b=instalarPublicadas();return a||b}
  const observador=new MutationObserver(instalar);observador.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar,{once:true});else instalar();
})();
</script>`;

export async function onRequestGet({ request, env }) {
  const resposta = await env.ASSETS.fetch(request);
  const tipo = String(resposta.headers.get('Content-Type') || '');
  if (!resposta.ok || !tipo.includes('text/html')) return resposta;
  let html = await resposta.text();
  if (!html.includes('review-mode-tabs')) {
    html = html.includes('</head>') ? html.replace('</head>', `${INXECCION}</head>`) : `${INXECCION}${html}`;
  }
  const headers = new Headers(resposta.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');headers.delete('ETag');headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  return new Response(html,{status:resposta.status,statusText:resposta.statusText,headers});
}

export async function onRequest(context){
  if(context.request.method==='GET'||context.request.method==='HEAD') return onRequestGet(context);
  return new Response('Método non permitido',{status:405,headers:{Allow:'GET, HEAD'}});
}
