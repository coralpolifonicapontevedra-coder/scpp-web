(()=>{
  const fetchBase=window.fetch.bind(window);
  const KEY='scpp-borrador-foto-reabrir';
  let cargaInicialFeita=false;
  let restauracionFeita=false;

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    let idFoto='';
    if(url.includes('/api/gardar-borrador-foto')&&init&&typeof init.body==='string'){
      try{idFoto=String(JSON.parse(init.body)?.idFoto||'').trim()}catch{}
    }

    const resposta=await fetchBase(input,init);
    if(url.includes('/api/gardar-borrador-foto')&&resposta.ok&&idFoto){
      try{sessionStorage.setItem(KEY,idFoto)}catch{}
      window.setTimeout(()=>window.location.reload(),450);
    }
    return resposta;
  };

  function elementosPreparados(){
    const select=document.querySelector('#photo-select');
    const boton=document.querySelector('#load-photo');
    const shell=document.querySelector('#shell');
    return select instanceof HTMLSelectElement &&
      boton instanceof HTMLButtonElement &&
      select.options.length>0 &&
      !(shell instanceof HTMLElement && shell.hidden);
  }

  function cargarId(id){
    const select=document.querySelector('#photo-select');
    const boton=document.querySelector('#load-photo');
    if(!(select instanceof HTMLSelectElement)||!(boton instanceof HTMLButtonElement)||!select.options.length)return false;
    const existe=[...select.options].some(option=>option.value===id);
    if(!existe)return false;
    select.value=id;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    window.setTimeout(()=>boton.click(),180);
    return true;
  }

  function intentarCarga(){
    if(!elementosPreparados())return false;

    if(!restauracionFeita){
      let id='';
      try{id=String(sessionStorage.getItem(KEY)||'').trim()}catch{}
      if(id&&cargarId(id)){
        restauracionFeita=true;
        cargaInicialFeita=true;
        try{sessionStorage.removeItem(KEY)}catch{}
        return true;
      }
      if(id){
        try{sessionStorage.removeItem(KEY)}catch{}
        restauracionFeita=true;
      }
    }

    if(!cargaInicialFeita){
      const select=document.querySelector('#photo-select');
      const boton=document.querySelector('#load-photo');
      if(select instanceof HTMLSelectElement&&boton instanceof HTMLButtonElement){
        cargaInicialFeita=true;
        select.selectedIndex=Math.max(0,select.selectedIndex);
        select.dispatchEvent(new Event('change',{bubbles:true}));
        window.setTimeout(()=>boton.click(),180);
        return true;
      }
    }
    return cargaInicialFeita;
  }

  const observer=new MutationObserver(()=>intentarCarga());
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});

  const intervalo=window.setInterval(()=>{
    if(intentarCarga()){
      window.clearInterval(intervalo);
      window.setTimeout(()=>observer.disconnect(),1200);
    }
  },150);

  window.setTimeout(()=>{
    window.clearInterval(intervalo);
    observer.disconnect();
  },15000);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',intentarCarga,{once:true});
  else intentarCarga();
})();
