(()=>{
  let gardarComoBorrador=false;
  const fetchBase=window.fetch.bind(window);

  document.addEventListener('click',event=>{
    const boton=event.target instanceof Element?event.target.closest('#save-draft'):null;
    if(boton) gardarComoBorrador=true;
  },true);

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    if(gardarComoBorrador&&url.includes('/api/editor-fotos')&&init&&typeof init.body==='string'){
      try{
        const body=JSON.parse(init.body);
        if(body?.accion==='gardarEdicion'){
          gardarComoBorrador=false;
          body.estado='Pendente';
          body.publicarPublica=false;
          body.publicarPrivada=false;
          body.destacadaPublica=false;
          body.destacadaPrivada=false;
          return fetchBase('/api/gardar-borrador-foto',{
            ...init,
            cache:'no-store',
            body:JSON.stringify(body)
          });
        }
      }catch{}
    }
    return fetchBase(input,init);
  };
})();
