const INXECCION = `
<style>
  .review-quick-nav{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap}
  .review-quick-nav button{min-height:2.6rem;padding:.6rem .8rem;border:1px solid #cfc7c1;background:#fff;color:#4b4642;font:inherit;cursor:pointer}
  .review-quick-nav button:disabled{opacity:.45;cursor:not-allowed}
  .review-quick-nav .reject-photo{border-color:#b98f94;color:#842323;background:#fffafa}
  .review-position{min-width:5rem;text-align:center;color:#6b6561;font:600 .76rem/1.2 Aptos,'Segoe UI',Arial,sans-serif}
  @media(max-width:650px){.review-quick-nav{display:grid;grid-template-columns:1fr 1fr}.review-quick-nav .reject-photo,.review-position{grid-column:1/-1}.review-position{padding:.35rem}}
</style>
<script>
(function(){
  let tokenEditor='';
  const fetchOriginal=window.fetch.bind(window);
  window.fetch=async function(input,init){
    try{
      const url=typeof input==='string'?input:String(input&&input.url||'');
      if((url.includes('/api/fotos')||url.includes('/api/editor-fotos'))&&init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body&&body.idToken) tokenEditor=String(body.idToken);
      }
    }catch(_){ }
    return fetchOriginal(input,init);
  };

  function elementos(){
    return {
      select:document.querySelector('#photo-select'),
      cargar:document.querySelector('#load-photo'),
      mensaxe:document.querySelector('#message')
    };
  }

  function actualizarEstado(){
    const {select}=elementos();
    const anterior=document.querySelector('#quick-previous');
    const seguinte=document.querySelector('#quick-next');
    const posicion=document.querySelector('#quick-position');
    if(!(select instanceof HTMLSelectElement)) return;
    const total=select.options.length;
    const indice=Math.max(0,select.selectedIndex);
    if(anterior instanceof HTMLButtonElement) anterior.disabled=total===0||indice<=0;
    if(seguinte instanceof HTMLButtonElement) seguinte.disabled=total===0||indice>=total-1;
    if(posicion instanceof HTMLElement) posicion.textContent=total?String(indice+1)+' de '+String(total):'0 de 0';
  }

  function cargarIndice(indice){
    const {select,cargar}=elementos();
    if(!(select instanceof HTMLSelectElement)||!(cargar instanceof HTMLButtonElement)) return;
    if(indice<0||indice>=select.options.length) return;
    select.selectedIndex=indice;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    cargar.click();
    actualizarEstado();
  }

  async function rexeitarActual(){
    const {select,cargar,mensaxe}=elementos();
    if(!(select instanceof HTMLSelectElement)||!select.value) return;
    if(!window.confirm('Queres rexeitar esta fotografía? Sairá da cola de revisión, pero conservarase o ficheiro orixinal.')) return;
    if(!tokenEditor){
      if(mensaxe instanceof HTMLElement){mensaxe.textContent='A sesión aínda non está preparada. Agarda un instante e téntao de novo.';mensaxe.dataset.error='true';}
      return;
    }
    const boton=document.querySelector('#quick-reject');
    if(boton instanceof HTMLButtonElement) boton.disabled=true;
    if(mensaxe instanceof HTMLElement){mensaxe.textContent='Marcando a fotografía como rexeitada…';mensaxe.dataset.error='false';}
    try{
      const resposta=await fetchOriginal('/api/fotos',{
        method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
        body:JSON.stringify({idToken:tokenEditor,accion:'actualizarRevisionFoto',rowId:select.value,idFoto:select.value,estado:'Rexeitada',publicarPublica:false,publicarPrivada:false,titulo:'',peFoto:'',observacions:''})
      });
      const resultado=await resposta.json().catch(()=>null);
      if(!resposta.ok||!resultado?.ok) throw new Error(resultado?.erro||'Non se puido rexeitar a fotografía.');
      const indice=select.selectedIndex;
      select.remove(indice);
      if(select.options.length){
        select.selectedIndex=Math.min(indice,select.options.length-1);
        if(cargar instanceof HTMLButtonElement) cargar.click();
      }
      if(mensaxe instanceof HTMLElement){mensaxe.textContent='Fotografía rexeitada e retirada da cola. O orixinal consérvase.';mensaxe.dataset.error='false';}
      actualizarEstado();
    }catch(erro){
      if(mensaxe instanceof HTMLElement){mensaxe.textContent=erro instanceof Error?erro.message:'Non se puido rexeitar a fotografía.';mensaxe.dataset.error='true';}
    }finally{
      if(boton instanceof HTMLButtonElement) boton.disabled=false;
    }
  }

  function instalar(){
    const fila=document.querySelector('.selector-row');
    const select=document.querySelector('#photo-select');
    if(!(fila instanceof HTMLElement)||!(select instanceof HTMLSelectElement)||document.querySelector('#quick-next')) return false;
    const nav=document.createElement('div');
    nav.className='review-quick-nav';
    nav.innerHTML='<button id="quick-previous" type="button">← Anterior</button><span id="quick-position" class="review-position">0 de 0</span><button id="quick-next" type="button">Seguinte →</button><button id="quick-reject" class="reject-photo" type="button">Rexeitar fotografía</button>';
    fila.appendChild(nav);
    nav.querySelector('#quick-previous')?.addEventListener('click',()=>cargarIndice(select.selectedIndex-1));
    nav.querySelector('#quick-next')?.addEventListener('click',()=>cargarIndice(select.selectedIndex+1));
    nav.querySelector('#quick-reject')?.addEventListener('click',rexeitarActual);
    select.addEventListener('change',actualizarEstado);
    actualizarEstado();
    return true;
  }

  const observador=new MutationObserver(()=>{if(instalar()) observador.disconnect();});
  observador.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',instalar,{once:true}); else instalar();
})();
</script>`;

export async function onRequestGet({ request, env }) {
  const resposta = await env.ASSETS.fetch(request);
  const tipo = String(resposta.headers.get('Content-Type') || '');
  if (!resposta.ok || !tipo.includes('text/html')) return resposta;
  let html = await resposta.text();
  if (!html.includes('quick-reject')) {
    html = html.includes('</head>') ? html.replace('</head>', `${INXECCION}</head>`) : `${INXECCION}${html}`;
  }
  const headers = new Headers(resposta.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  return new Response(html,{status:resposta.status,statusText:resposta.statusText,headers});
}

export async function onRequest(context){
  if(context.request.method==='GET'||context.request.method==='HEAD') return onRequestGet(context);
  return new Response('Método non permitido',{status:405,headers:{Allow:'GET, HEAD'}});
}
