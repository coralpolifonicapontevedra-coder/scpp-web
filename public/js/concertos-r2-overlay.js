const API_CONCERTOS_R2='/api/concertos-privado-indice';
const API_ASISTENCIAS='/api/asistencias-concertos';
let concertosR2=[];
let asistenciasR2={};
let filtroR2='todos';
let renderizandoR2=false;

const normR2=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const escR2=(v='')=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const isoR2=(v='')=>{const s=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const p=s.split(/[\/-]/).map(Number);if(p.length!==3||p.some(Number.isNaN))return s;return p[0]>31?`${p[0]}-${String(p[1]).padStart(2,'0')}-${String(p[2]).padStart(2,'0')}`:`${p[2]}-${String(p[1]).padStart(2,'0')}-${String(p[0]).padStart(2,'0')}`};
const partesR2=(v='')=>{const d=new Date(`${isoR2(v)}T12:00:00`);if(Number.isNaN(d.getTime()))return{dia:String(v),mes:'',ano:''};const meses=['XAN','FEB','MAR','ABR','MAI','XUÑ','XUL','AGO','SET','OUT','NOV','DEC'];return{dia:String(d.getDate()).padStart(2,'0'),mes:meses[d.getMonth()],ano:String(d.getFullYear())}};
const longaR2=(v='')=>{const d=new Date(`${isoR2(v)}T12:00:00`);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('gl-ES',{day:'numeric',month:'long',year:'numeric'}).format(d)};
const estadoR2=(c)=>normR2(c?.estado)||'confirmado';
const etiquetaR2=(c)=>estadoR2(c)==='realizado'?'Arquivo':estadoR2(c)==='aprazado'?'Aprazado':estadoR2(c)==='cancelado'?'Cancelado':'Próximo concerto';
const asistentesConcertoR2=(id)=>Array.isArray(asistenciasR2?.[id])?asistenciasR2[id]:[];

async function usuarioR2(){
  const [authMod,appMod]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js')]);
  const config={apiKey:'AIzaSyDrQY7NsaKpBfrSc8GqV3lUQDOIkecPZbs',authDomain:'scpp-portal-privado.firebaseapp.com',projectId:'scpp-portal-privado',storageBucket:'scpp-portal-privado.firebasestorage.app',messagingSenderId:'506857659587',appId:'1:506857659587:web:a7ed36b22f044f5f639676'};
  const app=appMod.getApps()[0]||appMod.initializeApp(config);
  const auth=authMod.getAuth(app);
  if(auth.currentUser)return auth.currentUser;
  return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('A sesión non está dispoñible'));},8000);const off=authMod.onAuthStateChanged(auth,(u)=>{if(!u)return;clearTimeout(timer);off();resolve(u);});});
}

async function cargarR2(){
  const user=await usuarioR2();
  const idToken=await user.getIdToken(true);
  const [rc,ra]=await Promise.all([
    fetch(API_CONCERTOS_R2,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken}),cache:'no-store'}),
    fetch(`${API_ASISTENCIAS}?t=${Date.now()}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken}),cache:'no-store'})
  ]);
  const [dc,da]=await Promise.all([rc.json().catch(()=>null),ra.json().catch(()=>null)]);
  if(!rc.ok||!dc?.ok||!Array.isArray(dc.concertos))throw new Error(dc?.erro||'Non foi posible cargar os concertos desde R2.');
  concertosR2=dc.concertos.map(c=>({...c,id:String(c?.id||''),data:String(c?.data||''),nome:String(c?.nome||''),cidade:String(c?.cidade||''),lugar:String(c?.lugar||''),programa:Array.isArray(c?.programa)?c.programa:[]})).filter(c=>c.id&&(c.nome||c.numeroConcerto));
  asistenciasR2=ra.ok&&da?.ok&&da.asistenciasPorConcerto&&typeof da.asistenciasPorConcerto==='object'?da.asistenciasPorConcerto:{};
  const estado=document.querySelector('#estado-asistencias');
  if(estado)estado.textContent=`Asistentes cargados · ${Object.keys(asistenciasR2).length} concertos con rexistros`;
  renderTodoR2();
}

function visiblesR2(){
  const busca=document.querySelector('#busca');
  const q=normR2(busca instanceof HTMLInputElement?busca.value:'');
  return concertosR2.filter(c=>c.nome&&c.data).filter(c=>{
    const e=estadoR2(c);const okFiltro=filtroR2==='todos'||(filtroR2==='proximos'&&e!=='realizado')||(filtroR2==='arquivo'&&e==='realizado');
    return okFiltro&&normR2([c.nome,c.cidade,c.lugar,c.data].join(' ')).includes(q);
  }).sort((a,b)=>isoR2(b.data).localeCompare(isoR2(a.data)));
}

function renderGridR2(){
  const grid=document.querySelector('#grid');if(!(grid instanceof HTMLElement))return;
  const list=visiblesR2();renderizandoR2=true;
  grid.innerHTML=list.map(c=>{const d=partesR2(c.data);const asis=asistentesConcertoR2(c.id);return `<button type="button" class="concert-square ${estadoR2(c)==='realizado'?'is-past':''}" data-id="${escR2(c.id)}"><span class="square-top"><span class="square-state">${escR2(etiquetaR2(c))}</span><span class="square-year">${escR2(d.ano)}</span></span><span class="square-date"><strong>${escR2(d.dia)}</strong><span>${escR2(d.mes)}</span></span><span class="square-copy"><strong>${escR2(c.nome)}</strong><span>${escR2([c.lugar,c.cidade].filter(Boolean).join(' · '))}</span></span><span class="square-bottom"><span>${c.programa.length} obra${c.programa.length===1?'':'s'}</span><span>${asis.length} asistentes</span></span></button>`}).join('');
  const contador=document.querySelector('#concert-count');if(contador)contador.textContent=String(list.length);
  const sen=document.querySelector('#sen-resultados');if(sen instanceof HTMLElement)sen.hidden=list.length>0;
  queueMicrotask(()=>{renderizandoR2=false;});
}

function renderInformeR2(){
  const cont=document.querySelector('#informe');if(!(cont instanceof HTMLElement))return;
  const mapa=new Map();
  concertosR2.forEach(c=>asistentesConcertoR2(c.id).forEach(p=>{const nome=String(p?.nome||'').trim(),voz=String(p?.voz||'Sen voz indicada').trim();if(!nome)return;const k=`${voz}|${nome}`;if(!mapa.has(k))mapa.set(k,{nome,voz,concertos:[]});const x=mapa.get(k);if(!x.concertos.some(z=>z.id===c.id))x.concertos.push({id:c.id,data:c.data,nome:c.nome});}));
  const persoas=[...mapa.values()];persoas.forEach(p=>p.concertos.sort((a,b)=>isoR2(b.data).localeCompare(isoR2(a.data))));
  const totais=[...new Set(persoas.map(p=>p.concertos.length))].sort((a,b)=>b-a);const orde=['Soprano','Contralto','Tenor','Baixo'];
  cont.innerHTML=totais.map(total=>{const grupo=persoas.filter(p=>p.concertos.length===total);const voces=[...new Set(grupo.map(p=>p.voz))].sort((a,b)=>{const ia=orde.indexOf(a),ib=orde.indexOf(b);return(ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b,'gl')});return `<section class="attendance-tier"><header><strong>${total} concerto${total===1?'':'s'}</strong><span>${grupo.length} persoa${grupo.length===1?'':'s'}</span></header><div class="report-voices">${voces.map(voz=>{const pv=grupo.filter(p=>p.voz===voz).sort((a,b)=>a.nome.localeCompare(b.nome,'gl',{sensitivity:'base'}));return `<section class="report-voice"><h3>${escR2(voz)} <span>${pv.length}</span></h3><div>${pv.map(p=>`<article class="person-report"><header><strong>${escR2(p.nome)}</strong><span>${p.concertos.length}</span></header><ul>${p.concertos.map(c=>`<li><button type="button" data-report-id="${escR2(c.id)}"><time>${escR2(c.data)}</time><span>${escR2(c.nome)}</span></button></li>`).join('')}</ul></article>`).join('')}</div></section>`}).join('')}</div></section>`}).join('');
  const resumo=document.querySelector('#resumo-informe');if(resumo)resumo.textContent=`${persoas.length} persoas · ${persoas.reduce((s,p)=>s+p.concertos.length,0)} asistencias`;
  const baleiro=document.querySelector('#informe-baleiro');if(baleiro instanceof HTMLElement)baleiro.hidden=persoas.length>0;
}

function abrirR2(id){
  const c=concertosR2.find(x=>x.id===String(id||''));const dialogo=document.querySelector('#dialogo');if(!c||!(dialogo instanceof HTMLDialogElement))return;
  const set=(s,v)=>{const e=dialogo.querySelector(s);if(e)e.textContent=String(v||'')};set('#estado-concerto',etiquetaR2(c));
  const t=dialogo.querySelector('#data-concerto');if(t instanceof HTMLTimeElement){t.textContent=longaR2(c.data);t.dateTime=isoR2(c.data)}
  set('#titulo',c.nome);set('#detalle',[c.hora&&`${String(c.hora).replace(/:\d{2}$/,'')} h`,c.lugar,c.cidade].filter(Boolean).join(' · '));
  const lista=dialogo.querySelector('#programa');if(lista)lista.innerHTML=c.programa.map((p,i)=>`<li><span class="program-order">${String(i+1).padStart(2,'0')}</span><span><strong>${escR2(p.obra||p.nome||p.idRepertorio||'Obra')}</strong>${p.autor?`<small>${escR2(p.autor)}</small>`:''}${p.solista?`<small>Solista: ${escR2(p.solista)}</small>`:''}</span></li>`).join('');
  set('#contador-programa',c.programa.length?`${c.programa.length} obras`:'');const pb=dialogo.querySelector('#programa-baleiro');if(pb instanceof HTMLElement)pb.hidden=c.programa.length>0;
  const asis=asistentesConcertoR2(c.id);set('#contador-asistentes',`${asis.length} persoas`);const grupos=dialogo.querySelector('#grupos-asistentes');if(grupos){const m=new Map();asis.forEach(p=>{const v=p.voz||'Sen voz indicada';if(!m.has(v))m.set(v,[]);m.get(v).push(p.nome)});const orde=['Soprano','Contralto','Tenor','Baixo'];grupos.innerHTML=[...m.keys()].sort((a,b)=>{const ia=orde.indexOf(a),ib=orde.indexOf(b);return(ia<0?99:ia)-(ib<0?99:ib)||a.localeCompare(b,'gl')}).map(v=>`<section class="voice-group"><h3>${escR2(v)} <span>${m.get(v).length}</span></h3><ul>${m.get(v).sort((a,b)=>a.localeCompare(b,'gl',{sensitivity:'base'})).map(n=>`<li>${escR2(n)}</li>`).join('')}</ul></section>`).join('')}
  const sb=dialogo.querySelector('#sen-asistentes');if(sb instanceof HTMLElement)sb.hidden=asis.length>0;if(!dialogo.open)dialogo.showModal();
}

function renderTodoR2(){renderGridR2();renderInformeR2();}

document.addEventListener('input',e=>{if(e.target?.id==='busca')setTimeout(renderGridR2,0)},true);
document.addEventListener('click',e=>{const t=e.target;if(!(t instanceof Element))return;const f=t.closest('.filters [data-filter]');if(f instanceof HTMLButtonElement){filtroR2=f.dataset.filter||'todos';setTimeout(renderGridR2,0);return}const card=t.closest('#grid .concert-square[data-id]');if(card){e.preventDefault();e.stopImmediatePropagation();abrirR2(card.getAttribute('data-id'));return}const rep=t.closest('#informe [data-report-id]');if(rep){e.preventDefault();e.stopImmediatePropagation();abrirR2(rep.getAttribute('data-report-id'));}},true);

const grid=document.querySelector('#grid');if(grid instanceof HTMLElement)new MutationObserver(()=>{if(!renderizandoR2&&concertosR2.length)setTimeout(renderGridR2,0)}).observe(grid,{childList:true});
const inf=document.querySelector('#informe');if(inf instanceof HTMLElement)new MutationObserver(()=>{if(!renderizandoR2&&concertosR2.length)setTimeout(renderInformeR2,0)}).observe(inf,{childList:true});

cargarR2().catch(err=>{console.error('Concertos R2:',err);const estado=document.querySelector('#estado-asistencias');if(estado)estado.textContent=`Erro ao cargar concertos/asistentes: ${err?.message||err}`;});
