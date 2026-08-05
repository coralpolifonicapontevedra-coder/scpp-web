(()=>{
  let token='';
  let fotos=new Map();
  const fetchBase=window.fetch.bind(window);

  window.fetch=async(input,init)=>{
    try{
      if(init&&typeof init.body==='string'){
        const body=JSON.parse(init.body);
        if(body?.idToken)token=String(body.idToken);
      }
    }catch{}
    return fetchBase(input,init);
  };

  const texto=v=>String(v??'').trim();
  const actualId=()=>texto(document.querySelector('.xestor-fila[aria-current="true"]')?.dataset?.id);
  const campo=id=>document.querySelector(id);

  async function agardarToken(maxMs=12000){
    const inicio=Date.now();
    while(!token&&Date.now()-inicio<maxMs)await new Promise(r=>setTimeout(r,120));
    if(!token)throw new Error('Non se puido preparar a sesión.');
  }

  async function api(body){
    await agardarToken();
    const r=await fetchBase('/api/xestion-publicacion-foto',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({idToken:token,...body})});
    const j=await r.json().catch(()=>null);
    if(!r.ok||!j?.ok)throw new Error(j?.erro||'Non se puido completar a operación');
    return j;
  }

  function cargarCampos(){
    const f=fotos.get(actualId());
    const titulo=campo('#xestor-titulo'),pe=campo('#xestor-pefoto'),obs=campo('#xestor-observacions');
    if(titulo instanceof HTMLInputElement)titulo.value=texto(f?.titulo);
    if(pe instanceof HTMLTextAreaElement)pe.value=texto(f?.peFoto);
    if(obs instanceof HTMLTextAreaElement)obs.value=texto(f?.observacions);
  }

  async function cargarCatalogo(){
    try{
      const r=await api({accion:'listar'});
      fotos=new Map((Array.isArray(r.fotos)?r.fotos:[]).map(f=>[texto(f.idFoto),f]));
      cargarCampos();
    }catch{}
  }

  async function gardarCompleto(){
    const id=actualId();if(!id)return;
    const pub=campo('#xestor-publica'),pri=campo('#xestor-privada'),titulo=campo('#xestor-titulo'),pe=campo('#xestor-pefoto'),obs=campo('#xestor-observacions'),msg=campo('#xestor-msg'),btn=campo('#xestor-gardar');
    if(!(pub instanceof HTMLInputElement)||!(pri instanceof HTMLInputElement)||!(titulo instanceof HTMLInputElement)||!(pe instanceof HTMLTextAreaElement)||!(obs instanceof HTMLTextAreaElement))return;
    if(btn instanceof HTMLButtonElement)btn.disabled=true;
    if(msg instanceof HTMLElement){msg.textContent='Gardando datos, Sheet, índices R2 e caché…';msg.dataset.error='false'}
    try{
      const r=await api({accion:'gardar',idFoto:id,publicarPublica:pub.checked,publicarPrivada:pri.checked,titulo:titulo.value,peFoto:pe.value,observacions:obs.value});
      const f=fotos.get(id)||{};Object.assign(f,r);f.titulo=r.titulo;f.peFoto=r.peFoto;f.observacions=r.observacions;fotos.set(id,f);
      const nome=document.querySelector(`.xestor-fila[data-id="${CSS.escape(id)}"] .xestor-nome`);if(nome instanceof HTMLElement)nome.textContent=r.titulo||r.peFoto||id;
      const seleccion=campo('#xestor-seleccion');if(seleccion instanceof HTMLElement)seleccion.textContent=r.titulo||r.peFoto||id;
      if(msg instanceof HTMLElement)msg.textContent=r.mensaxe||'Cambios gardados e verificados.';
    }catch(e){if(msg instanceof HTMLElement){msg.textContent=e instanceof Error?e.message:'Non se puido gardar';msg.dataset.error='true'}}finally{if(btn instanceof HTMLButtonElement)btn.disabled=false}
  }

  function eliminarModuloAntigo(){
    document.querySelectorAll('button').forEach(btn=>{
      if(texto(btn.textContent).toLowerCase()==='fotografías publicadas')btn.remove();
    });
    document.querySelectorAll('.published-manager,.published-toolbar,.published-editor').forEach(el=>el.remove());
  }

  function instalar(){
    eliminarModuloAntigo();
    const detalle=document.querySelector('.xestor-detalle');
    const boton=campo('#xestor-gardar');
    if(!(detalle instanceof HTMLElement)||detalle.dataset.metadatos==='true'||!(boton instanceof HTMLButtonElement))return false;
    detalle.dataset.metadatos='true';
    const bloque=document.createElement('div');bloque.className='xestor-metadatos';
    bloque.innerHTML='<label><span>Título ou descrición</span><input id="xestor-titulo" maxlength="120"></label><label><span>Pé de foto</span><textarea id="xestor-pefoto" rows="3" maxlength="600"></textarea></label><label><span>Observacións privadas</span><textarea id="xestor-observacions" rows="3" maxlength="500"></textarea></label>';
    const primeira=detalle.querySelector('label');detalle.insertBefore(bloque,primeira||boton);
    const novo=boton.cloneNode(true);boton.replaceWith(novo);novo.addEventListener('click',gardarCompleto);
    document.querySelector('#xestor-lista')?.addEventListener('click',()=>setTimeout(cargarCampos,0));
    cargarCatalogo();
    return true;
  }

  const style=document.createElement('style');
  style.textContent='.xestor-metadatos{display:grid;gap:.55rem;margin:.2rem 0 .65rem}.xestor-metadatos label{display:grid!important;grid-template-columns:1fr!important;gap:.28rem!important;padding:0!important;border:0!important}.xestor-metadatos label>span{color:#625d59;font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase}.xestor-metadatos input,.xestor-metadatos textarea{width:100%;padding:.48rem .55rem;border:1px solid #d5cec8;background:#fff;font:inherit;font-size:.76rem;resize:vertical}.xestor-metadatos textarea{min-height:4.2rem}';
  document.head.appendChild(style);

  const obs=new MutationObserver(()=>instalar());obs.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar,{once:true});else instalar();
})();
