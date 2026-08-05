(()=>{
  const fetchBase=window.fetch.bind(window);
  const KEY='scpp-borrador-foto-reabrir';

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    let idFoto='';
    if(url.includes('/api/gardar-borrador-foto')&&init&&typeof init.body==='string'){
      try{idFoto=String(JSON.parse(init.body)?.idFoto||'').trim()}catch{}
    }

    const resposta=await fetchBase(input,init);
    if(url.includes('/api/gardar-borrador-foto')&&resposta.ok&&idFoto){
      try{sessionStorage.setItem(KEY,idFoto)}catch{}
      window.setTimeout(()=>window.location.reload(),650);
    }
    return resposta;
  };

  function restaurarSeleccion(){
    let id='';
    try{id=String(sessionStorage.getItem(KEY)||'').trim()}catch{}
    if(!id)return false;
    const select=document.querySelector('#photo-select');
    const boton=document.querySelector('#load-photo');
    if(!(select instanceof HTMLSelectElement)||!(boton instanceof HTMLButtonElement)||!select.options.length)return false;
    const existe=[...select.options].some(option=>option.value===id);
    if(!existe){try{sessionStorage.removeItem(KEY)}catch{};return true}
    select.value=id;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    try{sessionStorage.removeItem(KEY)}catch{}
    window.setTimeout(()=>boton.click(),100);
    return true;
  }

  const observer=new MutationObserver(()=>{if(restaurarSeleccion())observer.disconnect()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',restaurarSeleccion,{once:true});
  else restaurarSeleccion();
})();
