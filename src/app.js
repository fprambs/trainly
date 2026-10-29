export function startApp(env){

  const $=id=>document.getElementById(id);
  const pad=n=>String(n).padStart(2,"0");
  const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  const parse=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
  const fmtDay=s=>parse(s).toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"short"});
  const fmtShort=s=>parse(s).toLocaleDateString("es-CL",{day:"numeric",month:"short"});
  const fmtMonth=s=>parse(s).toLocaleDateString("es-CL",{month:"long",year:"numeric"});
  let today=iso(new Date());
  setInterval(()=>{const t=iso(new Date());if(t!==today){const wasToday=$("date").value===today;today=t;if(wasToday)$("date").value=t;render()}},30000);
  $("today").textContent=new Date().toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"});
  $("date").value=today;
  function esc(s){const d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML}

  let entries=[],catalog=[],images={},assets=null,store=null,lastNew=null,picked="";
  let shownDays=10;const openDays=new Set();let openInit=false;

  // ---------- pestañas ----------
  const TABS=["anotar","rutinas","historial","progreso","ejercicios"];
  // teclado abierto (campo de texto con foco): se esconden la barra de abajo y el +, y el campo queda a la vista
  const isTextField=el=>el&&((el.tagName==="INPUT"&&!/^(button|checkbox|radio|submit|file|range|color)$/i.test(el.type))||el.tagName==="TEXTAREA");
  document.addEventListener("focusin",ev=>{if(isTextField(ev.target)){document.body.classList.add("kb");setTimeout(()=>{try{ev.target.scrollIntoView({block:"center",behavior:"smooth"})}catch(e){}},280)}});
  document.addEventListener("focusout",()=>setTimeout(()=>{if(!isTextField(document.activeElement))document.body.classList.remove("kb")},60));
  function showTab(t){
    if(!TABS.includes(t))t="anotar";
    document.body.dataset.tab=t;
    TABS.forEach(x=>{$("tab-"+x).hidden=x!==t;$("t-"+x).setAttribute("aria-selected",x===t?"true":"false")});
    // el historial siempre parte con todos los días cerrados
    if(t==="historial"){openDays.clear();document.querySelectorAll("#history details.day[open]").forEach(x=>{x.open=false})}
    try{history.replaceState(null,"","#"+t)}catch(e){}
    window.scrollTo(0,0);
  }
  document.querySelector(".tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(b)showTab(b.dataset.tab)});
  showTab((location.hash||"").slice(1));

  // ---------- almacenamiento (Supabase) ----------
  const sb=env.sb,me=env.userId;
  let restCfg={def:90,by:{}};
  let ath=null;            // alumno que se está viendo {id,name,user_id,rest_cfg}
  let athCoaches=[];       // ids de profesores de ese alumno
  let exRows=[],rutRows=[];
  const uuid=()=>(crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16)}));
  const toEntry=r=>({id:r.id,date:r.date,name:r.name,sets:r.sets,reps:r.reps==null?null:+r.reps,weight:r.weight==null?null:+r.weight,mins:r.mins==null?null:+r.mins,dist:r.dist==null?null:+r.dist,memo:r.memo||"",order:r.ord,createdAt:r.created_ms==null?null:+r.created_ms,done:Array.isArray(r.done)?r.done:[]});
  const ENTRY_COLS={order:"ord",createdAt:"created_ms"};
  const toRowPatch=p=>{const o={};Object.keys(p).forEach(k=>{if(k==="id")return;o[ENTRY_COLS[k]||k]=p[k]});o.updated_at=new Date().toISOString();return o};
  // ---------- cola sin conexión ----------
  const OBK="bit-outbox-"+me;
  let outbox=[],downloads=null,sampler=null,cats={},routines=[];
  try{outbox=JSON.parse(localStorage.getItem(OBK)||"[]")||[]}catch(e){outbox=[]}
  function saveOB(){try{localStorage.setItem(OBK,JSON.stringify(outbox))}catch(e){}renderSync()}
  function applyPending(list){
    let m=list.slice();
    outbox.forEach(op=>{
      if(op.table!=="entries")return;
      if(op.t==="ins"&&op.row.athlete_id===(ath&&ath.id)){m=m.filter(x=>x.id!==op.row.id);m.push(toEntry(op.row))}
      else if(op.t==="upd")m=m.map(x=>x.id===op.id?Object.assign({},x,toEntry(Object.assign(fromEntry(x),op.patch))):x);
      else if(op.t==="del")m=m.filter(x=>x.id!==op.id);
    });
    return m;
  }
  const fromEntry=e=>({id:e.id,athlete_id:ath&&ath.id,date:e.date,name:e.name,sets:e.sets??null,reps:e.reps??null,weight:e.weight??null,mins:e.mins??null,dist:e.dist??null,memo:e.memo||"",ord:e.order??null,created_ms:e.createdAt??null,done:e.done||[]});
  function renderSync(){
    const n=outbox.length,el=$("syncNote");
    el.hidden=!n;
    if(n)el.textContent=(navigator.onLine===false?"Sin conexión · ":"Guardando · ")+n+(n===1?" cambio por subir":" cambios por subir")+". Quedan guardados en tu celular y se suben solos.";
  }
  window.addEventListener("offline",renderSync);
  async function runOp(op){
    let q;
    if(op.t==="ins")q=sb.from(op.table).insert(op.row);
    else if(op.t==="ups")q=sb.from(op.table).upsert(op.row,{onConflict:op.onConflict});
    else if(op.t==="upd")q=sb.from(op.table).update(op.patch).eq("id",op.id);
    else if(op.t==="del")q=sb.from(op.table).delete().eq("id",op.id);
    else if(op.t==="delm"){q=sb.from(op.table).delete();Object.keys(op.match).forEach(k=>{q=q.eq(k,op.match[k])})}
    const {error}=await q;
    if(error){const e=new Error(error.message);e.code=error.code||"net";e.perm=!!error.code&&!/^(PGRST00|08|57)/.test(error.code);throw e}
  }
  const withTimeout=(pr,ms)=>Promise.race([pr,new Promise((_,rej)=>setTimeout(()=>rej({code:"timeout"}),ms))]);
  let flushing=false,flushT=null;
  const schedule=()=>{clearTimeout(flushT);flushT=setTimeout(flush,15000)};
  async function flush(){
    if(flushing)return;flushing=true;renderSync();
    while(outbox.length){
      try{await withTimeout(runOp(outbox[0]),10000);outbox.shift();saveOB()}
      catch(e){if(e&&e.perm){console.warn("descartado",outbox[0],e);outbox.shift();saveOB();toast("Un cambio no se pudo guardar ("+(e.message||"permiso")+").");continue}break}
    }
    flushing=false;renderSync();if(outbox.length)schedule();
  }
  async function exec(op){
    if(outbox.length){outbox.push(op);saveOB();flush();return}
    try{await withTimeout(runOp(op),10000)}
    catch(e){if(e&&e.perm)throw e;outbox.push(op);saveOB();schedule()}
  }
  window.addEventListener("online",flush);
  if(outbox.length)setTimeout(flush,1500);
  // la pantalla se actualiza al tiro; la subida va por detrás (sin esperar la señal)
  const bg=op=>{exec(op).catch(e=>toast("No se pudo guardar un cambio: "+(e&&e.message||"error")))};

  // catálogo visible: el propio, el del alumno y el de sus profesores (prioridad en ese orden)
  const exOwnersRank=()=>{const r=[me];if(ath&&ath.user_id&&ath.user_id!==me)r.push(ath.user_id);athCoaches.forEach(c=>{if(!r.includes(c))r.push(c)});return r};
  // origen de cada ejercicio: "comun" (banco para todos), "mio", "profe" (de un profesor) o "alumno" (del alumno que miro)
  let bankRows=[],exOrigin={};
  function deriveCatalog(){
    const rank=exOwnersRank(),by={};exOrigin={};
    exRows.filter(x=>rank.includes(x.owner_id)).sort((a,b)=>rank.indexOf(a.owner_id)-rank.indexOf(b.owner_id)).forEach(x=>{
      const k=x.key;if(!by[k]){by[k]={name:x.name,img:null,cat:null};exOrigin[k]=x.owner_id===me?"mio":athCoaches.includes(x.owner_id)?"profe":"alumno"}
      if(!by[k].img&&x.image_url)by[k].img={id:x.image_path||x.id,url:x.image_url,type:x.image_type||"image/png"};
      if(!by[k].cat&&x.category)by[k].cat={c:x.category,by:x.category_by||"user"};
    });
    // el banco común completa lo que falte (y marca el origen)
    bankRows.forEach(b=>{
      const k=b.key;if(!by[k])by[k]={name:b.name,img:null,cat:null};else by[k].name=b.name;
      exOrigin[k]="comun";
      if(!by[k].img&&b.image_url)by[k].img={id:"bank:"+k,url:b.image_url,type:b.image_type||"image/png"};
      if(!by[k].cat&&b.category)by[k].cat={c:b.category,by:"bank"};
    });
    const alias={};bankRows.forEach(b=>{const a=imgKey(b.name);if(a!==b.key&&!by[a])alias[a]=b.key});
    catalog=Object.values(by).map(v=>v.name).sort((a,b)=>a.localeCompare(b,"es"));
    images={};cats={};
    Object.keys(by).forEach(k=>{if(by[k].img)images[k]=by[k].img;if(by[k].cat)cats[k]=by[k].cat});
    Object.keys(alias).forEach(a=>{const k=alias[a];if(by[k].img)images[a]=by[k].img;if(by[k].cat)cats[a]=by[k].cat;exOrigin[a]="comun"});
  }
  // ---------- administración del banco común (solo admin) ----------
  const isAdmin=()=>!!(env.isAdmin&&env.isAdmin());
  const bankRowOf=n=>bankRows.find(b=>b.key===imgKey(n)||imgKey(b.name)===imgKey(n))||null;
  async function bankSave(key,patch){
    const {error}=await sb.from("bank_exercises").update(patch).eq("key",key);
    if(error){toast("No se pudo guardar en el banco: "+error.message);return false}
    const b=bankRows.find(x=>x.key===key);if(b)Object.assign(b,patch);
    deriveCatalog();render();return true;
  }
  async function bankPromote(n){
    const k=imgKey(n),own=ownExRow(k),img=imgOf(n),c=cats[k];
    const row={key:k,name:n,image_url:img?img.url:null,image_type:img?img.type:null,category:c?c.c:catOf(n)};
    const {error}=await sb.from("bank_exercises").insert(row);
    if(error){toast("No se pudo pasar al banco: "+error.message);return}
    bankRows.push(row);
    if(own){exRows=exRows.filter(x=>x!==own);bg({t:"delm",table:"exercises",match:{owner_id:me,key:k}})}
    deriveCatalog();exSeg="comun";render();toast("“"+n+"” ahora está en el banco común");
  }
  async function bankDelete(n){
    const b=bankRowOf(n);if(!b)return;
    const {error}=await sb.from("bank_exercises").delete().eq("key",b.key);
    if(error){toast("No se pudo quitar: "+error.message);return}
    bankRows=bankRows.filter(x=>x!==b);deriveCatalog();render();toast("Quitado del banco: "+b.name);
  }
  let pendingBank=null;
  const originOf=n=>exOrigin[imgKey(n)]||null;
  const ORIGIN_TXT={comun:"Común",mio:"Mío",profe:"Profesor",alumno:"Alumno"};
  const originTag=n=>{const o=originOf(n);return o?'<span class="otag o-'+o+'">'+ORIGIN_TXT[o]+'</span>':''};
  function deriveRoutines(){
    const rank=[me].concat(athCoaches);
    routines=rutRows.filter(r=>(ath&&r.athlete_id===ath.id)||(r.athlete_id==null&&rank.includes(r.owner_id)))
      .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))
      .map(r=>({id:r.id,name:r.name,items:Array.isArray(r.items)?r.items:[],own:r.owner_id===me,ownerId:r.owner_id}));
  }
  const ownExRow=key=>exRows.find(x=>x.owner_id===me&&x.key===key);
  function putOwnEx(key,patch){
    const bk=bankRows.find(b=>b.key===key);
    const name=patch.name||catalog.find(n=>imgKey(n)===key)||(bk&&bk.name)||(entries.find(e=>imgKey(e.name)===key)||{}).name||key;
    let row=ownExRow(key);
    if(row)Object.assign(row,patch);else{row=Object.assign({id:uuid(),owner_id:me,key,name,created_at:new Date().toISOString()},patch);exRows.push(row)}
    bg({t:"ups",table:"exercises",onConflict:"owner_id,key",row:{owner_id:me,key,name:row.name,image_url:row.image_url??null,image_type:row.image_type??null,image_path:row.image_path??null,category:row.category??null,category_by:row.category_by??null}});
  }
  store={
    add:async e=>{const row=fromEntry(Object.assign({},e,{id:uuid()}));entries.push(toEntry(row));render();bg({t:"ins",table:"entries",row})},
    remove:async id=>{entries=entries.filter(x=>x.id!==id);render();bg({t:"del",table:"entries",id})},
    update:async(id,patch)=>{const e=entries.find(x=>x.id===id);if(e){Object.assign(e,patch);render()}bg({t:"upd",table:"entries",id,patch:toRowPatch(patch)})},
    setCatalog:async list=>{
      const now=new Set(list.map(imgKey)),before=new Set(catalog.map(imgKey));
      list.forEach(n=>{const k=imgKey(n);if(!before.has(k))putOwnEx(k,{name:n})});
      catalog.forEach(n=>{const k=imgKey(n);if(!now.has(k)){const own=ownExRow(k);
        if(own){exRows=exRows.filter(x=>x!==own);bg({t:"delm",table:"exercises",match:{owner_id:me,key:k}})}
        if(bankRows.some(b=>b.key===k))toast("“"+n+"” es del banco común: no se puede quitar.");
        else if(!own)toast("“"+n+"” es del catálogo de tu profesor: solo él puede quitarlo.")}});
      deriveCatalog();render();
    },
    setImages:async map=>{Object.keys(map).forEach(k=>{if(bankRows.some(b=>b.key===k))return;const v=map[k],cur=images[k];if(!cur||cur.url!==v.url)putOwnEx(k,{image_url:v.url,image_type:v.type,image_path:v.id})});deriveCatalog();render()},
    setCats:async map=>{Object.keys(map).forEach(k=>{if(bankRows.some(b=>b.key===k))return;const v=map[k],c=typeof v==="string"?{c:v,by:"user"}:v,cur=cats[k];if(!cur||cur.c!==c.c||cur.by!==c.by)putOwnEx(k,{category:c.c,category_by:c.by})});deriveCatalog();render()},
    setRoutines:async list=>{
      const prev=new Map(routines.map(r=>[r.id,r]));
      list.forEach(r=>{
        const p=prev.get(r.id);
        if(!p||!rutRows.some(x=>x.id===r.id)){
          const id=/^[0-9a-f-]{36}$/.test(r.id)?r.id:uuid();
          // el profesor guarda en su biblioteca (sirve para todos sus alumnos); el alumno, en su propio historial
          const row={id,owner_id:me,athlete_id:env.isCoach()?null:ath.id,name:r.name,items:r.items};
          rutRows.push(Object.assign({created_at:new Date().toISOString()},row));bg({t:"ins",table:"routines",row});
        }else if(p.name!==r.name||JSON.stringify(p.items)!==JSON.stringify(r.items)){
          if(p.own===false){toast("Esa rutina es de tu profesor: no la puedes modificar.");return}
          const x=rutRows.find(z=>z.id===r.id);Object.assign(x,{name:r.name,items:r.items});bg({t:"upd",table:"routines",id:r.id,patch:{name:r.name,items:r.items}});
        }
      });
      const ids=new Set(list.map(r=>r.id));
      routines.forEach(r=>{if(!ids.has(r.id)){if(r.own===false){toast("Esa rutina es de tu profesor: no la puedes borrar.");return}rutRows=rutRows.filter(x=>x.id!==r.id);bg({t:"del",table:"routines",id:r.id})}});
      deriveRoutines();render();
    },
    setSettings:async s=>{restCfg=s;if(ath){ath.rest_cfg=s;bg({t:"upd",table:"athletes",id:ath.id,patch:{rest_cfg:s}})}}
  };
  // imágenes y videos → Supabase Storage (bucket público "media", carpeta del usuario)
  assets={
    upload:async file=>{
      const ext=(file.name&&file.name.includes(".")?file.name.split(".").pop():(file.type.split("/")[1]||"bin")).toLowerCase().replace(/[^a-z0-9]/g,"");
      const path=me+"/"+uuid()+"."+ext;
      const {error}=await sb.storage.from("media").upload(path,file,{contentType:file.type,cacheControl:"31536000",upsert:false});
      if(error)throw error;
      const url=sb.storage.from("media").getPublicUrl(path).data.publicUrl;
      return {id:path,url,contentType:file.type};
    },
    delete:async id=>{if(String(id).startsWith(me+"/"))await sb.storage.from("media").remove([id])}
  };
  downloads={save:async({filename,data})=>{
    const blob=data instanceof Blob?data:new Blob([data],{type:filename.endsWith(".csv")?"text/csv":"application/octet-stream"});
    const file=new File([blob],filename,{type:blob.type});
    if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:filename});return}catch(e){if(e&&e.name==="AbortError")throw {code:"declined"}}}
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
  }};
  sampler=env.ai||null;

  async function loadAthleteData(){
    const aid=ath.id;
    const since=new Date();since.setDate(since.getDate()-400);
    const [en,ex,ru,co,bk]=await Promise.all([
      sb.from("entries").select("*").eq("athlete_id",aid).gte("date",iso(since)).order("date"),
      sb.from("exercises").select("*"),
      sb.from("routines").select("*"),
      sb.from("coach_athletes").select("coach_id").eq("athlete_id",aid),
      bankRows.length?Promise.resolve({data:bankRows}):sb.from("bank_exercises").select("*")
    ]);
    if(ath.id!==aid)return; // se cambió de alumno mientras cargaba
    if(en.error)throw en.error;
    entries=applyPending((en.data||[]).map(toEntry));
    exRows=ex.data||[];rutRows=ru.data||[];athCoaches=(co.data||[]).map(x=>x.coach_id);bankRows=(bk&&bk.data)||bankRows;
    const rc=ath.rest_cfg;restCfg=rc&&rc.by?{def:+rc.def||90,by:Object.assign({},rc.by)}:{def:90,by:{}};
    deriveCatalog();deriveRoutines();
    catLoaded=entLoaded=true;
  }
  // tiempo real: lo que marca el alumno lo ve el profesor al instante (y al revés)
  let rtChannel=null;
  function subscribeRealtime(){
    if(rtChannel)return;
    rtChannel=sb.channel("bitacora-"+me)
      .on("postgres_changes",{event:"*",schema:"public",table:"entries"},p=>{
        const row=p.new&&p.new.id?p.new:p.old;
        env.onEntryChange&&env.onEntryChange(p);
        if(!ath||!row)return;
        if(outbox.some(o=>o.table==="entries"&&(o.id===row.id||(o.row&&o.row.id===row.id))))return;
        if(p.eventType==="DELETE"){if(entries.some(e=>e.id===row.id)){entries=entries.filter(e=>e.id!==row.id);render()}return}
        if(row.athlete_id!==ath.id)return;
        const ne=toEntry(row),i=entries.findIndex(e=>e.id===ne.id);
        if(i>=0){if(JSON.stringify(entries[i])===JSON.stringify(Object.assign({},entries[i],ne)))return;entries[i]=Object.assign({},entries[i],ne)}else entries.push(ne);
        render();
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"routines"},async()=>{const {data}=await sb.from("routines").select("*");if(data){rutRows=data;deriveRoutines();render()}})
      .on("postgres_changes",{event:"*",schema:"public",table:"coach_athletes"},()=>{env.onLinksChange&&env.onLinksChange()})
      .subscribe();
  }
  // cambiar de alumno (modo profesor) o cargar el propio historial
  const transient={}; // descanso/cronómetro por alumno: cada uno sigue corriendo aunque mires a otro
  async function setAthlete(a){
    if(ath&&ath.id===a.id&&!a._reload)return;
    if(ath)transient[ath.id]={rest,running};
    ath=a;
    const t=transient[a.id]||{};
    rest=t.rest||null;running=t.running||null;editing=null;editEntry=null;expandedSets.clear();
    if(rest){$("rest").hidden=false;document.body.classList.add("resting");$("rLabel").textContent="Descanso · "+rest.name;renderRestPresets()}else{$("rest").hidden=true;$("rest").classList.remove("over");document.body.classList.remove("resting")}
    entries=[];catalog=[];images={};cats={};routines=[];catLoaded=entLoaded=false;autoCatDone=false;FS.key=null;
    $("repeatBox").hidden=true;
    render();
    try{await loadAthleteData()}catch(e){toast("No se pudo cargar: "+(e.message||"revisa tu conexión"))}
    render();
  }
  env.api.setAthlete=setAthlete;
  env.api.currentAthlete=()=>ath;
  env.api.restOf=id=>ath&&id===ath.id?rest:(transient[id]&&transient[id].rest)||null;
  env.api.runningOf=id=>ath&&id===ath.id?running:(transient[id]&&transient[id].running)||null;
  env.api.splitSessions=l=>splitSessions(l);env.api.findNext=l=>findNext(l);env.api.doneArr=e=>doneArr(e);env.api.planText=e=>planText(e);env.api.toEntry=toEntry;env.api.toast=(m,s,a)=>toast(m,s,a);env.api.render=()=>render();env.api.fmtSecs=s=>fmtSecs(s);env.api.today=()=>today;
  async function init(){
    renderSync();subscribeRealtime();
    await setAthlete(env.initialAthlete);
  }

  // ---------- utilidades de ejercicios ----------
  const norm=s=>(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  const inCatalog=n=>catalog.some(c=>norm(c)===norm(n));
  const canonical=n=>catalog.find(c=>norm(c)===norm(n))||entries.find(e=>norm(e.name)===norm(n))?.name||n;
  const sortCat=l=>l.slice().sort((a,b)=>a.localeCompare(b,"es"));
  const imgKey=n=>norm(n).replace(/[^a-z0-9]+/g,"_");
  const imgOf=n=>images[imgKey(n)]||null;
  const srcOf=r=>r.url||("/_blob/"+r.id);
  const isVid=r=>(r.type||"").startsWith("video/");
  function mediaHTML(r,cls,dataN){
    const a=(cls?' class="'+cls+'"':'')+(dataN!=null?' data-n="'+esc(dataN)+'"':'');
    return isVid(r)
      ?'<video'+a+' src="'+esc(srcOf(r))+'" muted loop autoplay playsinline></video>'
      :'<img'+a+' src="'+esc(srcOf(r))+'" alt="">';
  }
  function flash(msg,err){const st=$("status");st.className="status"+(err?" err":"");st.textContent=msg}
  async function addToCatalog(n){
    n=(n||"").trim().replace(/\s+/g," ");
    if(!n||inCatalog(n))return false;
    n=n.charAt(0).toUpperCase()+n.slice(1);
    try{await store.setCatalog(sortCat(catalog.concat(n)));if(!catEntry(n))classifyNames([n]);return true}
    catch(e){flash("No se pudo guardar el ejercicio. Inténtalo de nuevo.",true);return false}
  }

  // ---------- campo Ejercicio + buscador ----------
  const nameIn=$("name"),list=$("sugg");
  function updateAddBtn(){
    const v=nameIn.value.trim();
    $("addCat").hidden=!v||inCatalog(v);
    updateExCard();
  }
  $("addCat").addEventListener("click",async()=>{
    const v=nameIn.value.trim();
    if(await addToCatalog(v)){flash("☆ “"+canonical(v)+"” quedó en tus ejercicios");nameIn.value=canonical(v)}
    updateAddBtn();
  });
  let sugg=[],active=-1;
  function highlight(text,q){
    const w=q.split(" ")[0];if(!w)return esc(text);
    const i=norm(text).indexOf(w);if(i<0)return esc(text);
    return esc(text.slice(0,i))+"<mark>"+esc(text.slice(i,i+w.length))+"</mark>"+esc(text.slice(i+w.length));
  }
  function openSugg(){
    const q=norm(nameIn.value);
    const used=[...new Set(entries.map(e=>e.name))].filter(n=>!inCatalog(n));
    const pool=catalog.map(n=>({n,saved:true})).concat(sortCat(used).map(n=>({n,saved:false})));
    const words=q?q.split(" "):[];
    sugg=pool.filter(o=>words.every(w=>norm(o.n).includes(w))).slice(0,10);
    active=-1;
    if(!sugg.length){
      if(!q){closeSugg();return}
      list.innerHTML='<li class="none">Nuevo ejercicio: se agrega igual, y puedes guardarlo en tu lista con ☆.</li>';
    }else{
      list.innerHTML=sugg.map((o,i)=>{
        const r=imgOf(o.n);
        return '<li role="option" id="op'+i+'" data-i="'+i+'" aria-selected="false">'+(r?mediaHTML(r,"sthumb"):'')+'<span>'+highlight(o.n,q)+'</span><small>'+(o.saved?(originTag(o.n)||'Guardado'):'Usado antes')+'</small></li>';
      }).join("");
    }
    list.hidden=false;nameIn.setAttribute("aria-expanded","true");
  }
  function closeSugg(){list.hidden=true;nameIn.setAttribute("aria-expanded","false");active=-1}
  function setActive(i){
    active=i;
    list.querySelectorAll("li[role=option]").forEach((li,k)=>li.setAttribute("aria-selected",k===i?"true":"false"));
    const el=$("op"+i);if(el)el.scrollIntoView({block:"nearest"});
  }
  function choose(i){if(!sugg[i])return;nameIn.value=sugg[i].n;closeSugg();updateAddBtn();fillFromLast(nameIn.value);$("sets").focus()}
  // autocompletar con la última vez que hiciste el ejercicio (solo campos vacíos)
  // campos visibles del formulario (chips)
  const fields=new Set(["reps","weight"]);
  const FIELD_INPUTS={reps:["reps"],weight:["weight"],dist:["dist"],time:["tMin","tSec"],memo:["memo"]};
  function applyFields(){
    document.querySelectorAll("[data-field]").forEach(el=>{el.hidden=!fields.has(el.dataset.field)});
    document.querySelectorAll("#fchips [data-fk]").forEach(b=>b.setAttribute("aria-pressed",fields.has(b.dataset.fk)?"true":"false"));
  }
  $("fchips").addEventListener("click",e=>{
    const b=e.target.closest("[data-fk]");if(!b)return;
    const k=b.dataset.fk;
    if(fields.has(k)){fields.delete(k);FIELD_INPUTS[k].forEach(id=>$(id).value="")}else fields.add(k);
    applyFields();
    if(fields.has(k))$(FIELD_INPUTS[k][0]).focus();
  });
  const fieldVal=(k,id)=>fields.has(k)?$(id).value:"";
  // formulario plegable
  let addUserClosed=false;
  function setAddOpen(open,focus){
    $("addCard").hidden=!open;$("addBack").hidden=!open;$("addOpen").setAttribute("aria-expanded",open?"true":"false");
    document.body.classList.toggle("add-open",open);
    if(open){flash("");if(focus)setTimeout(()=>nameIn.focus(),60)}else closeSugg();
  }
  $("addBack").addEventListener("click",()=>{addUserClosed=true;setAddOpen(false)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("addCard").hidden&&list.hidden)setAddOpen(false)});
  $("emptyAdd").addEventListener("click",()=>setAddOpen(true,true));
  $("emptyRut").addEventListener("click",()=>$("repeatBtn").click());
  $("addOpen").addEventListener("click",()=>{addUserClosed=false;setAddOpen(true,true)});
  $("addClose").addEventListener("click",()=>{addUserClosed=true;setAddOpen(false);closeSugg()});
  function fillFromLast(n){
    const last=entries.filter(e=>isReal(e)&&norm(e.name)===norm(n)).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0))[0];
    if(!last)return;
    // mostrar los mismos campos que usaste la última vez
    const used={reps:last.reps!=null,weight:last.weight!=null||valOf(last,"weight")!=null,dist:last.dist!=null,time:last.mins!=null};
    if(Object.values(used).some(Boolean)){["reps","weight","dist","time"].forEach(k=>{if(used[k])fields.add(k);else if(!FIELD_INPUTS[k].some(id=>$(id).value!==""))fields.delete(k)});applyFields()}
    const vals={sets:last.sets,reps:last.reps,weight:valOf(last,"weight"),dist:last.dist};
    let filled=false;
    Object.keys(vals).forEach(k=>{if($(k).value===""&&vals[k]!=null){$(k).value=vals[k];filled=true}});
    if(getMins()==null&&last.mins!=null){setMins(last.mins);filled=true}
    if(filled)flash("Relleno con tu última vez ("+fmtShort(last.date)+"). Cambia lo que necesites.");
  }
  nameIn.addEventListener("change",()=>{if(nameIn.value.trim())fillFromLast(nameIn.value.trim())});
  nameIn.addEventListener("input",()=>{openSugg();updateAddBtn()});
  nameIn.addEventListener("focus",openSugg);
  nameIn.addEventListener("blur",()=>setTimeout(closeSugg,150));
  nameIn.addEventListener("keydown",e=>{
    if(list.hidden)return;
    if(e.key==="ArrowDown"){e.preventDefault();setActive(Math.min(active+1,sugg.length-1))}
    else if(e.key==="ArrowUp"){e.preventDefault();setActive(Math.max(active-1,0))}
    else if(e.key==="Enter"&&active>=0){e.preventDefault();choose(active)}
    else if(e.key==="Escape"){closeSugg()}
  });
  list.addEventListener("mousedown",e=>e.preventDefault());
  list.addEventListener("click",e=>{const li=e.target.closest("li[data-i]");if(li)choose(+li.dataset.i)});

  // ---------- imágenes ----------
  const searchURL=n=>"https://www.google.com/search?tbm=isch&q="+encodeURIComponent(n+" ejercicio gif");
  function updateExCard(){
    const v=nameIn.value.trim(),card=$("excard");
    if(!v||!inCatalog(v)){card.hidden=true;return}
    const n=canonical(v),r=imgOf(n);
    card.hidden=false;card.dataset.name=n;
    $("exName").textContent=n;
    $("exSearch").href=searchURL(n);
    const t=$("exThumb");
    const cur=t.dataset.src||"",want=r?srcOf(r):"";
    if(cur!==want){t.innerHTML=r?mediaHTML(r):"Sin imagen";t.dataset.src=want}
    t.disabled=!r;
    $("exUpload").hidden=!assets;
    $("exUpload").textContent=r?"Cambiar imagen":"Subir imagen";
    $("exHint").textContent=!assets?"No se pueden subir imágenes ahora."
      :r?"Toca la imagen para verla en grande."
      :"Busca una imagen, mantén presionada la que te guste para guardarla y luego súbela aquí.";
  }
  let pendingName=null;
  function pickFile(n){if(!assets)return;pendingName=n;$("fileIn").click()}
  $("exUpload").addEventListener("click",()=>pickFile($("excard").dataset.name));
  $("fileIn").addEventListener("change",async e=>{
    const f=e.target.files&&e.target.files[0];e.target.value="";
    if(pendingBank){pendingBank=null;if(!f||!BK)return;
      if(!/^(image|video)\//.test(f.type)){toast("Ese archivo no es una imagen ni un video.");return}
      if(f.size>20*1024*1024){toast("El archivo pesa más de 20 MB. Prueba con uno más liviano.");return}
      if(BK.preview)URL.revokeObjectURL(BK.preview);BK.file=f;BK.preview=URL.createObjectURL(f);BK.ptype=f.type;renderFicha();return}
    if(pendingName)await uploadFor(pendingName,f);
  });
  async function uploadBank(key,file){
    if(!assets||!file)return;
    if(!/^(image|video)\//.test(file.type)){toast("Ese archivo no es una imagen ni un video.");return}
    if(file.size>20*1024*1024){toast("El archivo pesa más de 20 MB. Prueba con uno más liviano.");return}
    toast("Subiendo video…");
    try{const res=await assets.upload(file);if(await bankSave(key,{image_url:res.url,image_type:res.contentType||file.type}))toast("Video actualizado en el banco común")}
    catch(e){toast("No se pudo subir. Revisa tu conexión e inténtalo de nuevo.")}
  }
  async function uploadFor(name,file){
    if(!assets||!file)return;
    if(!/^(image|video)\//.test(file.type)){flash("Ese archivo no es una imagen ni un video.",true);return}
    if(file.size>20*1024*1024){flash("El archivo pesa más de 20 MB. Prueba con uno más liviano.",true);return}
    flash("Subiendo imagen…");
    try{
      const res=await assets.upload(file);
      const key=imgKey(name),old=images[key];
      const map=Object.assign({},images);
      map[key]={id:res.id,url:res.url,type:res.contentType||file.type};
      await store.setImages(map);
      if(old&&old.id&&old.id!==res.id){try{await assets.delete(old.id)}catch(e){}}
      const still=(file.type==="image/jpeg"||file.type==="image/heic")&&/gif/i.test(file.name||"");
      flash("Imagen guardada para “"+name+"”"+(still?". Ojo: llegó como imagen fija, no como GIF.":""));toast("Imagen guardada para “"+name+"”");
    }catch(e){flash("No se pudo subir la imagen. Revisa tu conexión e inténtalo de nuevo.",true)}
  }
  document.addEventListener("paste",async e=>{
    if($("excard").hidden||!assets||$("tab-anotar").hidden)return;
    const f=[...(e.clipboardData?.files||[])].find(x=>/^(image|video)\//.test(x.type));
    if(f){e.preventDefault();await uploadFor($("excard").dataset.name,f)}
  });
  function openLB(n){
    const r=imgOf(n);if(!r)return;
    $("lbName").textContent=n;$("lbBody").innerHTML=mediaHTML(r);$("lb").hidden=false;$("lbClose").focus();
  }
  const closeLB=()=>{$("lb").hidden=true;$("lbBody").innerHTML=""};
  $("lbClose").addEventListener("click",closeLB);
  $("lb").addEventListener("click",e=>{if(e.target.id==="lb")closeLB()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("lb").hidden)closeLB()});
  $("exThumb").addEventListener("click",()=>openLB($("excard").dataset.name));
  document.addEventListener("click",e=>{const m=e.target.closest(".mini");if(m)openLB(m.dataset.n)});

  // ---------- guardar registro ----------
  const numOrNull=v=>v===""?null:Number(v);
  $("form").addEventListener("submit",async ev=>{
    ev.preventDefault();
    const e={
      date:$("date").value||today,
      name:canonical(nameIn.value.trim()),
      sets:numOrNull($("sets").value),reps:numOrNull(fieldVal("reps","reps")),
      weight:numOrNull(fieldVal("weight","weight")),mins:fields.has("time")?getMins():null,dist:numOrNull(fieldVal("dist","dist")),
      memo:fieldVal("memo","memo").trim(),createdAt:Date.now()
    };
    if(!e.name){nameIn.focus();return}
    try{
      lastNew=e.createdAt;
      await store.add(e);
      ["sets","reps","weight","dist","tMin","tSec","memo"].forEach(k=>$(k).value="");
      nameIn.value="";updateAddBtn();
      picked=e.name;
      setAddOpen(false);toast("Agregado: "+e.name);
    }catch(err){
      flash(err&&err.code==="quota_exceeded"?"La bitácora está llena. Borra registros antiguos para seguir anotando.":"No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.",true);
    }
  });

  // ---------- render ----------
  function figs(e){
    const p=[];
    if(e.sets&&e.reps)p.push(e.sets+"×"+e.reps);
    else if(e.sets)p.push(e.sets+(e.sets==1?" serie":" series"));
    else if(e.reps)p.push(e.reps+" reps");
    if(e.weight!=null)p.push("<em>"+fmtN(e.weight)+" kg</em>");
    if(e.dist!=null)p.push(fmtDist(e.dist));
    if(e.mins!=null)p.push(fmtTime(e.mins));
    return p.join(" · ")||"—";
  }
  const TRASH='<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  function entryHTML(e,demo){
    const r=!demo&&imgOf(e.name);
    return '<div class="entry'+(e.createdAt===lastNew?' new':'')+'"'+(demo?'':' data-id="'+esc(e.id)+'"')+'>'+
      '<div class="name">'+(r?mediaHTML(r,"mini",e.name):'')+'<span>'+esc(e.name)+(!demo&&recIds.has(e.id)?' <span class="pr">★ Récord</span>':'')+'</span></div><div class="figs">'+figs(e)+'</div>'+
      (demo?'<span></span>':'<span class="eacts"><button type="button" class="edt iconbtn'+(editEntry===e.id?' on':'')+'" data-eid="'+esc(e.id)+'" aria-label="Editar o borrar ejercicio">'+PENCIL+'</button></span>')+
      (e.memo?'<div class="memo">'+esc(e.memo)+'</div>':'')+
      (!demo&&editEntry===e.id?entryEditHTML(e):'')+
      (!demo&&e.sets>0?setsHTML(e):'')+
      '</div>';
  }
  const GRIP='<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  // ---------- reordenar arrastrando ----------
  let drag=null,lastDragEnd=0;
  // mantener presionado ~0,5 s sobre el ejercicio para tomarlo; si el dedo se mueve antes, es scroll
  let press=null;
  const HOLD=450;
  document.addEventListener("pointerdown",ev=>{
    if(ev.pointerType==="mouse"&&ev.button!==0)return;
    const el=ev.target.closest(".entry[data-id]");if(!el)return;
    if(ev.target.closest("button,input,textarea,a,select,.mini,.sets,.eedit,.seted"))return;
    const box=el.parentElement;
    cancelPress();
    press={el,box,x0:ev.clientX,y0:ev.clientY,pid:ev.pointerId,t:setTimeout(()=>{
      if(!press)return;
      const p=press;press=null;
      try{p.el.setPointerCapture(p.pid)}catch(e){}
      drag={el:p.el,box:p.box,id:p.el.dataset.id,y0:p.y0,target:null,after:false,moved:false};
      p.el.classList.remove("pressing");p.el.classList.add("dragging");document.body.classList.add("is-dragging");
      if(navigator.vibrate)try{navigator.vibrate(15)}catch(e){}
    },HOLD)};
    el.classList.add("pressing");
  });
  function cancelPress(){if(press){clearTimeout(press.t);press.el.classList.remove("pressing");press=null}}
  // mientras se arrastra, que la página no haga scroll
  document.addEventListener("touchmove",ev=>{if(drag)ev.preventDefault()},{passive:false});
  document.addEventListener("contextmenu",ev=>{if(drag||press)ev.preventDefault()});
  document.addEventListener("pointermove",ev=>{
    if(press&&(Math.abs(ev.clientX-press.x0)>8||Math.abs(ev.clientY-press.y0)>8))cancelPress();
    if(!drag)return;
    const dy=ev.clientY-drag.y0;if(Math.abs(dy)>3)drag.moved=true;
    drag.el.style.transform="translateY("+dy+"px)";
    if(ev.clientY<90)window.scrollBy(0,-12);else if(ev.clientY>window.innerHeight-170)window.scrollBy(0,12);
    const items=[...drag.box.querySelectorAll(":scope > .entry[data-id]")].filter(x=>x!==drag.el);
    drag.box.querySelectorAll(".drop-before,.drop-after").forEach(x=>x.classList.remove("drop-before","drop-after"));
    let tgt=null,after=false;
    for(const it of items){const b=it.getBoundingClientRect();if(ev.clientY<b.top+b.height/2){tgt=it;after=false;break}tgt=it;after=true}
    drag.target=tgt;drag.after=after;
    if(tgt)tgt.classList.add(after?"drop-after":"drop-before");
  });
  async function endDrag(){
    cancelPress();
    if(!drag)return;
    const d=drag;drag=null;
    if(deferred){deferred=false;setTimeout(render,0)}
    document.body.classList.remove("is-dragging");
    d.el.classList.remove("dragging");d.el.style.transform="";
    d.box.querySelectorAll(".drop-before,.drop-after").forEach(x=>x.classList.remove("drop-before","drop-after"));
    if(d.moved)lastDragEnd=Date.now();
    if(!d.moved||!d.target||!d.el.isConnected)return;
    // nuevo orden: entre los vecinos del punto donde lo soltaste
    const ids=[...d.box.querySelectorAll(":scope > .entry[data-id]")].map(x=>x.dataset.id).filter(x=>x!==d.id);
    let pos=ids.indexOf(d.target.dataset.id)+(d.after?1:0);
    const list=ids.map(id=>entries.find(x=>x.id===id)).filter(Boolean);
    const prev=list[pos-1],next=list[pos];
    const me=entries.find(x=>x.id===d.id);if(!me)return;
    let o;
    if(prev&&next)o=(ordOf(prev)+ordOf(next))/2;
    else if(prev)o=ordOf(prev)+1000;
    else if(next)o=ordOf(next)-1000;
    else return;
    if(prev&&next&&(o===ordOf(prev)||o===ordOf(next))){
      // sin espacio entre vecinos: renumerar el día completo
      const day=entries.filter(x=>x.date===me.date).sort(byCreated).filter(x=>x.id!==me.id);
      const at=day.indexOf(next);day.splice(at<0?day.length:at,0,me);
      const base=ordOf(day[0]);
      for(let k=0;k<day.length;k++)await store.update(day[k].id,{order:base+k*1000});
    }else await store.update(me.id,{order:o});
    reRenderLists();
  }
  document.addEventListener("pointerup",endDrag);
  document.addEventListener("pointercancel",endDrag);
  const PENCIL='<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
  let editEntry=null,eeDraft={};
  document.addEventListener("input",ev=>{const k=ev.target.dataset&&ev.target.dataset.ef;if(k&&editEntry)eeDraft[k]=ev.target.value});
  function entryEditHTML(e){
    const D=k=>k in eeDraft;
    const ts=e.mins!=null?Math.round(e.mins*60):null;
    const f=(k,label,val0,attrs)=>{const val=D(k)?eeDraft[k]:val0;return '<div class="f"><label for="ee-'+k+'">'+label+'</label><input id="ee-'+k+'" data-ef="'+k+'" '+(attrs||'class="num" type="number" inputmode="decimal" min="0"')+' value="'+(val==null?"":esc(val))+'"></div>'};
    const V=(k,v)=>D(k)?eeDraft[k]:v;
    return '<div class="eedit" data-eid="'+esc(e.id)+'">'+
      '<div class="eegrid">'+
        '<div class="f wide"><label for="ee-name">Ejercicio</label><input id="ee-name" data-ef="name" value="'+esc(V("name",e.name))+'"></div>'+
        f("date","Fecha",e.date,'type="date"')+
        f("sets","Series",e.sets)+f("reps","Reps",e.reps)+f("weight","Peso (kg)",e.weight)+f("dist","Distancia (m)",e.dist)+
        '<div class="f"><label for="ee-tm">Tiempo</label><div class="trow"><input id="ee-tm" data-ef="tm" class="num" type="number" inputmode="numeric" min="0" placeholder="min" value="'+esc(V("tm",ts==null?"":Math.floor(ts/60)))+'"><span>:</span><input id="ee-ts" data-ef="ts" class="num" type="number" inputmode="numeric" min="0" max="59" placeholder="seg" value="'+esc(V("ts",ts==null?"":ts%60))+'"></div></div>'+
        '<div class="f wide"><label for="ee-memo">Nota</label><input id="ee-memo" data-ef="memo" value="'+esc(V("memo",e.memo||""))+'"></div>'+
      '</div>'+
      '<div class="eebar"><button type="button" class="del dangerbtn" data-id="'+esc(e.id)+'">'+TRASH+' Borrar</button><span class="mv"><button type="button" data-mv="-1" aria-label="Mover arriba">↑</button><button type="button" data-mv="1" aria-label="Mover abajo">↓</button><small>Orden en el circuito</small></span>'+
      '<span class="sv"><button type="button" data-ee="cancel">Cancelar</button><button type="button" class="btnlike solid" data-ee="save">Guardar</button></span></div></div>';
  }
  const ordOf=e=>e.order??e.createdAt??0;
  const isReal=e=>e.date<today||(e.date===today&&doneArr(e).some(Boolean));
  document.addEventListener("click",async ev=>{
    const pb=ev.target.closest(".edt");
    if(pb){editEntry=editEntry===pb.dataset.eid?null:pb.dataset.eid;eeDraft={};reRenderLists();if(editEntry){const n=document.querySelector('.eedit [data-ef="name"]');if(n)n.focus()}return}
    const box=ev.target.closest(".eedit");if(!box)return;
    if(ev.target.closest("[data-ee],[data-mv],.del"))releaseFocus();
    const id=box.dataset.eid,e=entries.find(x=>x.id===id);if(!e)return;
    const b=ev.target.closest("[data-ee],[data-mv]");if(!b)return;
    if(b.dataset.ee==="cancel"){editEntry=null;eeDraft={};reRenderLists();return}
    if(b.dataset.mv){
      const list=entries.filter(x=>x.date===e.date).sort(byCreated),i=list.indexOf(e),j=i+Number(b.dataset.mv);
      if(j<0||j>=list.length)return;
      const o=list[j];let a=ordOf(o),c=ordOf(e);if(a===c)c=a+Number(b.dataset.mv);
      try{await store.update(e.id,{order:a});await store.update(o.id,{order:c})}catch(err){toast("No se pudo mover. Inténtalo de nuevo.")}
      reRenderLists();return;
    }
    if(b.dataset.ee==="save"){
      const g=k=>{const el=box.querySelector('[data-ef="'+k+'"]');return el?el.value.trim():""};
      const num=v=>v===""?null:Number(v.replace(",","."));
      const name=canonical(g("name"));if(!name){box.querySelector('[data-ef="name"]').focus();return}
      const tm=g("tm"),tsec=g("ts");
      const patch={name,date:g("date")||e.date,sets:num(g("sets")),reps:num(g("reps")),weight:num(g("weight")),dist:num(g("dist")),
        mins:(tm===""&&tsec==="")?null:((+tm||0)*60+(+tsec||0))/60,memo:g("memo")};
      if(Array.isArray(e.done))patch.done=e.done.slice(0,Math.max(0,+patch.sets||0));
      editEntry=null;eeDraft={};
      try{await store.update(id,patch);toast("Cambios guardados")}catch(err){toast("No se pudieron guardar los cambios.")}
      reRenderLists();
    }
  });

  // ---------- series ----------
  let editing=null; // {id,i,draft:{w,r,t}}
  const doneArr=e=>Array.from({length:Math.min(+e.sets||0,30)},(_,i)=>(Array.isArray(e.done)&&e.done[i])||null);
  const fmtN=v=>String(Math.round(v*100)/100).replace(".",",");
  const fmtTime=min=>{const s=Math.round(min*60);return s<60?s+" s":Math.floor(s/60)+":"+pad(s%60)+" min"};
  const fmtDist=m=>m>=1000?fmtN(m/1000)+" km":fmtN(m)+" m";
  const isTimed=e=>e.mins!=null||e.dist!=null;
  const planText=e=>[e.weight!=null?e.weight+" kg":"",e.reps!=null?e.reps+" reps":"",e.dist!=null?fmtDist(e.dist):"",e.mins!=null?fmtTime(e.mins):""].filter(Boolean).join(" · ");
  function getMins(){const a=$("tMin").value,b=$("tSec").value;if(a===""&&b==="")return null;return ((+a||0)*60+(+b||0))/60}
  function setMins(v){if(v==null){$("tMin").value="";$("tSec").value="";return}const s=Math.round(v*60);$("tMin").value=Math.floor(s/60);$("tSec").value=s%60}
  function parseTime(v){v=(v||"").trim();if(!v)return null;if(v.includes(":")){const [m,s]=v.split(":");return ((+m||0)*60+(+s||0))/60}const n=Number(v.replace(",","."));return isNaN(n)?null:n}
  // valor real logrado: el máximo de las series marcadas; si no hay series marcadas, lo anotado
  function valOf(e,key){
    const dd=(Array.isArray(e.done)?e.done:[]).filter(Boolean);
    if(key==="orm"){const v=dd.filter(d=>d.w!=null&&d.r!=null).map(d=>e1rm(d.w,d.r)).filter(x=>x!=null);return v.length?Math.max(...v):(e.weight!=null&&e.reps!=null?e1rm(e.weight,e.reps):null)}
    if(key==="vol"){const v=dd.filter(d=>d.w!=null&&d.r!=null);return v.length?v.reduce((a,d)=>a+d.w*d.r,0):(e.weight&&e.reps&&e.sets?e.weight*e.reps*e.sets:null)}
    if(key==="best"){const ts=(Array.isArray(e.done)?e.done:[]).filter(d=>d&&d.t!=null).map(d=>d.t);return ts.length?Math.min(...ts):null}
    const k={weight:"w",reps:"r",mins:"t",dist:"m"}[key];
    const vs=(Array.isArray(e.done)?e.done:[]).filter(Boolean).map(d=>d[k]).filter(v=>v!=null);
    return vs.length?Math.max(...vs):(e[key]??null);
  }
  function cmp(e,d){
    const pairs=[[e.weight,d.w],[e.reps,d.r],[e.dist,d.m]];
    for(const [a,b] of pairs){if(a!=null&&b!=null&&a!==b)return b>a?1:-1}
    if(e.mins!=null&&e.dist==null&&d.m!=null)return 0; // por tiempo con metros: el tiempo es el formato, no la marca
    // tiempo: con distancia fija, menos tiempo es mejor; sin distancia (ej. plancha), más tiempo es mejor
    if(e.mins!=null&&d.t!=null&&Math.round(e.mins*60)!==Math.round(d.t*60))return (e.dist!=null?d.t<e.mins:d.t>e.mins)?1:-1;
    if(e.mins==null&&e.dist!=null&&d.t!=null)return 0;
    return 0;
  }
  // cada valor de la serie con su flecha: ↑ mejor que lo pedido, ↓ peor
  // referencia para comparar cada valor: lo pedido; si no se pidió (ej. "3×15" sin peso), la serie anterior
  const PLANK={w:"weight",r:"reps",m:"dist",t:"mins"};
  function refFor(e,d,k){
    const pv=e[PLANK[k]];
    if(pv!=null)return {v:k==="t"?Math.round(pv*60):pv,src:"plan"};
    const ds=Array.isArray(e.done)?e.done:[],i=ds.indexOf(d);
    for(let j=(i<0?ds.length:i)-1;j>=0;j--){const p=ds[j];if(p&&p[k]!=null)return {v:k==="t"?Math.round(p[k]*60):p[k],src:"S"+(j+1)}}
    return null;
  }
  function setParts(e,d){
    const dir=(ref,val,lower)=>!ref||val==null||ref.v===val?0:((lower?val<ref.v:val>ref.v)?1:-1);
    const P=[];
    if(d.w!=null)P.push({k:"w",txt:fmtN(d.w)+"kg",ref:refFor(e,d,"w"),dir:dir(refFor(e,d,"w"),d.w)});
    if(d.r!=null)P.push({k:"r",txt:(d.w!=null?"×":"")+d.r+(d.w!=null?"":" reps"),ref:refFor(e,d,"r"),dir:dir(refFor(e,d,"r"),d.r)});
    if(d.m!=null)P.push({k:"m",txt:fmtDist(d.m).replace(" ",""),ref:refFor(e,d,"m"),dir:dir(refFor(e,d,"m"),d.m)});
    if(d.t!=null){
      const fmtOnly=e.mins!=null&&e.dist==null&&d.m!=null; // por tiempo con metros: el tiempo es el formato
      const ts=Math.round(d.t*60),ref=refFor(e,d,"t");
      P.push({k:"t",txt:fmtDur(d.t),ref,dir:fmtOnly?0:dir(ref,ts,e.dist!=null)});
    }
    return P;
  }
  function setState(P){const up=P.some(p=>p.dir>0),dn=P.some(p=>p.dir<0);return up&&dn?"mixed":up?"up":dn?"down":"done"}
  // 1RM estimado (Epley): peso × (1 + reps/30). Mide fuerza: 30×10 (40) > 20×15 (30) aunque haya menos reps
  const e1rm=(w,r)=>w>0&&r>0?(r===1?w:w*(1+r/30)):null;
  const r1=v=>Math.round(v*10)/10;
  function ormRef(e,d){
    if(e.weight!=null&&e.reps!=null)return {v:e1rm(e.weight,e.reps),src:"plan"};
    const ds=Array.isArray(e.done)?e.done:[],i=ds.indexOf(d);
    for(let j=(i<0?ds.length:i)-1;j>=0;j--){const p=ds[j];if(p&&p.w!=null&&p.r!=null)return {v:e1rm(p.w,p.r),src:"S"+(j+1)}}
    return null;
  }
  // veredicto de la serie: con peso y reps decide la fuerza (1RM est.); si no, cada valor por separado
  function setVerdict(e,d){
    const P=setParts(e,d),orm=d.w!=null&&d.r!=null?e1rm(d.w,d.r):null,ref=orm!=null?ormRef(e,d):null;
    if(orm!=null&&ref&&ref.v){
      const diff=orm-ref.v,rel=Math.abs(diff)/ref.v;
      const state=rel<0.01?(P.some(p=>p.dir)?"same":"done"):diff>0?"up":"down";
      return {P,state,orm,ref,diff,byOrm:true};
    }
    return {P,state:setState(P),orm,ref:null,diff:0,byOrm:false};
  }
  const STSYM={done:"✓",up:"↑",down:"↓",same:"≈",mixed:'<i class="mu">↑</i><i class="md">↓</i>'};
  function pillLabel(e,d,i){
    if(!d)return String(i+1);
    const V=setVerdict(e,d),P=V.P,st=V.state;
    if(V.orm!=null)return (st==="done"?"✓ ":"")+P.map(p=>p.txt+(p.dir>0?"↑":p.dir<0?"↓":"")).join(" ")+" (1RM "+fmtN(r1(V.orm))+(V.ref&&Math.abs(V.diff)>=0.05?(V.diff>0?" +":" −")+fmtN(r1(Math.abs(V.diff))):"")+")";
    return (st==="done"?"✓ ":"")+P.map(p=>p.txt+(p.dir>0?"↑":p.dir<0?"↓":"")).join(" ");
  }
  const ICON={
    w:'<svg viewBox="0 0 24 24"><path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/></svg>',
    r:'<svg viewBox="0 0 24 24"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
    m:'<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M6 7v4M10 7v3M14 7v4M18 7v3"/></svg>',
    t:'<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>'
  };
  function chipsHTML(e,d,V){
    V=V||setVerdict(e,d);
    const fmtRef=(k,v)=>k==="w"?fmtN(v):k==="t"?fmtDur(v/60):k==="m"?fmtDist(v):String(v);
    const NAME={w:"Peso",r:"Reps",m:"Distancia",t:"Tiempo"};
    return V.P.map(p=>{
      const val=p.k==="w"?fmtN(d.w):p.k==="r"?String(d.r):p.k==="m"?fmtDist(d.m).split(" ")[0]:fmtDur(d.t);
      const unit=p.k==="w"?"kg":p.k==="r"?"reps":p.k==="m"?fmtDist(d.m).split(" ")[1]:"";
      const against=V.byOrm&&p.dir&&(V.state==="same"||(V.state==="up"&&p.dir<0)||(V.state==="down"&&p.dir>0));
      const cls=against?" nt":p.dir>0?" up":p.dir<0?" dn":"";
      const refTxt=p.ref?fmtRef(p.k,p.ref.v):"";
      const vs=p.ref&&p.ref.src!=="plan"?p.ref.src+" ":"";
      const title=p.dir?(NAME[p.k]+": "+(p.dir>0?"subiste":"bajaste")+" respecto a "+(p.ref.src==="plan"?"lo pedido":"la serie "+p.ref.src.slice(1))+" ("+refTxt+")"):(p.ref?"Igual que "+(p.ref.src==="plan"?"lo pedido":"la serie "+p.ref.src.slice(1)):NAME[p.k]);
      return '<span class="mchip'+cls+'" title="'+esc(title)+'">'+ICON[p.k]+'<b>'+esc(val)+'</b>'+(unit?'<small>'+unit+'</small>':'')+(p.dir?'<i>'+(p.dir>0?"↑":"↓")+'</i><s>'+esc(vs)+esc(refTxt)+'</s>':'')+'</span>';
    }).join("");
  }
  function pillHTML(e,d,i){
    if(!d)return String(i+1);
    const P=setParts(e,d),st=setState(P);
    return (st==="done"?"✓ ":"")+P.map((p,k)=>(k&&!p.txt.startsWith("×")?'<span class="sep">·</span>':'')+esc(p.txt)+(p.dir>0?'<b class="ar up">↑</b>':p.dir<0?'<b class="ar dn">↓</b>':'')).join("");
  }
  const fmtDur=min=>{const s=Math.round(min*60);return Math.floor(s/60)+":"+pad(s%60)};
  const fmtSecs=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+":"+pad(s%60)};
  const isRunning=(id,i)=>running&&running.id===id&&running.i===i;
  const expandedSets=new Set();
  document.addEventListener("click",ev=>{const b=ev.target.closest("[data-expand]");if(!b)return;expandedSets.add(b.dataset.expand);reRenderLists()});
  function setsHTML(e){
    const ds=doneArr(e),n=ds.filter(Boolean).length;
    // se ven las hechas y la próxima; el resto de pendientes queda en una línea
    const fp=ds.findIndex(x=>!x),hiddenP=[];
    let h='<div class="sets">'+ds.map((d,i)=>{
      const run=!d&&isRunning(e.id,i),timedLive=isTimed(e)&&isLive(e);
      if(!d&&!run&&i!==fp&&!expandedSets.has(e.id)){hiddenP.push(i+1);return ""}
      const V=d?setVerdict(e,d):null,st=V?V.state:"",cls="setpill"+(d?" "+st:"")+(d&&lastDone&&lastDone.id===e.id&&lastDone.i===i&&Date.now()-lastDone.t<1500?" pop":"")+(run?" running":"")+(editing&&editing.id===e.id&&editing.i===i?" editing":"");
      let body;
      if(run)body='<span class="rt">■ '+fmtSecs((Date.now()-running.start)/1000)+'</span><span class="pend">toca para detener</span>';
      else if(!d)body='<span class="pend">'+(timedLive?"▶ Iniciar cronómetro":"Pendiente · toca al terminarla")+'</span>';
      else body='<span class="chips">'+chipsHTML(e,d,V)+(V.orm!=null?'<span class="orm">1RM est. <b>'+fmtN(r1(V.orm))+' kg</b>'+(V.ref&&Math.abs(V.diff)>=0.05?' <em class="'+(V.diff>0?"up":"dn")+'">'+(V.diff>0?"+":"−")+fmtN(r1(Math.abs(V.diff)))+'</em> <small>vs '+(V.ref.src==="plan"?"lo pedido":V.ref.src)+'</small>':'')+(V.state==="up"&&V.P.some(p=>p.dir<0)?' · <span class="up">más fuerza</span>':V.state==="same"?' · <span>misma fuerza</span>':'')+'</span>':'')+'</span><span class="st'+(st==="mixed"?' mx':'')+'">'+STSYM[st]+'</span>';
      return '<button type="button" class="'+cls+'" data-sid="'+esc(e.id)+'" data-si="'+i+'" aria-label="Serie '+(i+1)+(d?' hecha: '+esc(pillLabel(e,d,i)):run?' en curso, toca para detener':timedLive?' pendiente, toca para iniciar el cronómetro':' pendiente')+'"><span class="sn">S'+(i+1)+'</span>'+body+'</button>';
    }).join("")+(hiddenP.length?'<button type="button" class="setmore" data-expand="'+esc(e.id)+'">+ S'+hiddenP.join(", S")+' pendiente'+(hiddenP.length>1?'s':'')+'</button>':'')+'<span class="setcount">'+n+' de '+ds.length+' series hechas</span></div>';
    if(editing&&editing.id===e.id)h+=editorHTML(e);
    return h;
  }
  // atajos de peso: suman al número; el campo se sigue pudiendo escribir (ej. 11 kg)
  const QUICKW='<div class="quickw" role="group" aria-label="Atajos de peso"><button type="button" data-step="w" data-d="-2.5">−2,5</button><button type="button" data-step="w" data-d="2.5">+2,5</button><button type="button" data-step="w" data-d="5">+5</button></div>';
  function stepper(k,label,val,step){
    return '<div class="stepper">'+
      '<button type="button" data-step="'+k+'" data-d="-'+step+'" aria-label="Bajar '+label+'">−</button>'+
      '<input id="ed-'+k+'" data-ed="'+k+'" class="num" type="number" inputmode="decimal" step="any" min="0" value="'+(val==null?"":val)+'">'+
      '<button type="button" data-step="'+k+'" data-d="'+step+'" aria-label="Subir '+label+'">+</button>'+
      '<label for="ed-'+k+'">'+label+'</label></div>';
  }
  function editorHTML(e){
    const d=editing.draft,i=editing.i;
    const showW=e.weight!=null||d.w!=null,showR=e.reps!=null||d.r!=null,showT=e.mins!=null||d.t!=null||e.dist!=null,showM=e.dist!=null||d.m!=null||editing.addM;
    let f="";
    if(showW||(!showR&&!showT&&!showM))f+=stepper("w","kg",d.w,1)+QUICKW;
    if(showR)f+=stepper("r","reps",d.r,1);
    if(showM)f+=stepper("m","m",d.m,50);
    if(showT){const ts=d.t==null?null:Math.round(d.t*60);
      f+='<div class="stepper tstep"><input id="ed-tm" data-ed="tm" class="num" type="number" inputmode="numeric" min="0" placeholder="min" aria-label="Minutos" value="'+(ts==null?"":Math.floor(ts/60))+'"><span>:</span><input id="ed-ts" data-ed="ts" class="num" type="number" inputmode="numeric" min="0" max="59" placeholder="seg" aria-label="Segundos" value="'+(ts==null?"":ts%60)+'"><label for="ed-tm">min : seg</label></div>'}
    if(!showM&&isTimed(e))f+='<button type="button" class="btnlike" data-edact="addm">+ Metros</button>';
    const meta=planText(e);
    return '<div class="seted"><div class="ttl"><b>Serie '+(i+1)+'</b>'+(meta?'pedido: '+esc(meta):'')+'</div>'+
      '<div class="flds">'+f+'</div>'+
      '<div class="acts"><button type="button" class="btnlike solid" data-edact="ok">Listo</button><button type="button" data-edact="undo">Desmarcar</button></div></div>';
  }
  const targetOf=e=>({w:e.weight??null,r:e.reps??null,t:e.mins??null,m:e.dist??null});
  let lastDone=null;
  async function saveSet(e,i,val){
    if(val)lastDone={id:e.id,i,t:Date.now()};
    const ds=doneArr(e);ds[i]=val;
    try{await store.update(e.id,{done:ds})}catch(err){flash("No se pudo guardar la serie. Inténtalo de nuevo.",true)}
  }
  let running=null; // cronómetro de serie por tiempo {id,i,start}
  // solo las sesiones de hoy activan descanso, cronómetro y pantalla encendida
  const isLive=e=>e.date===iso(new Date());
  async function markDone(id,i){
    const e=entries.find(x=>x.id===id);if(!e)return;
    touch();ensureAudio();
    const live=isLive(e);
    if(isTimed(e)&&live){
      if(!isRunning(id,i)){running={id,i,start:Date.now()};editing=null;stopRest();keepAwake();reRenderLists();return}
      const secs=(Date.now()-running.start)/1000;running=null;
      const prev=bestOther(e);
      const t=Object.assign(targetOf(e),{t:Math.round(secs)/60,at:Date.now()});
      editing={id,i,draft:Object.assign({},t)};
      await saveSet(e,i,t);startRest(e);checkPR(e,prev);return;
    }
    if(!live){
      const t=Object.assign(targetOf(e),{at:null});
      editing={id,i,draft:Object.assign({},t)};
      await saveSet(e,i,t);return;
    }
    const prev=bestOther(e);
    const t=Object.assign(targetOf(e),{at:Date.now()});
    editing={id,i,draft:Object.assign({},t)};
    await saveSet(e,i,t);startRest(e);checkPR(e,prev);
  }

  // ---------- récords ----------
  // distancia fija sin tiempo pedido (ej. remo 500 m): el récord es el menor tiempo
  const hasDoneM=e=>(Array.isArray(e.done)?e.done:[]).some(d=>d&&d.m!=null);
  const hasReps=e=>e.reps!=null||(Array.isArray(e.done)?e.done:[]).some(d=>d&&d.r!=null);
  const keyFor=e=>e.weight!=null?(hasReps(e)?"orm":"weight"):(e.mins!=null&&e.dist==null&&hasDoneM(e))?"dist":(e.dist!=null&&e.mins==null)?"best":e.dist!=null?"dist":e.mins!=null?"mins":e.reps!=null?"reps":null;
  const unitFor=k=>({orm:"kg",weight:"kg",mins:"min",reps:"reps",dist:"m",best:"min"}[k]);
  const better=(k,a,b)=>k==="best"?a<b:a>b;
  function bestOther(e){
    const k=keyFor(e);if(!k)return null;
    const vs=entries.filter(x=>x.id!==e.id&&isReal(x)&&norm(x.name)===norm(e.name)).map(x=>valOf(x,k)).filter(v=>v!=null);
    return vs.length?{k,v:k==="best"?Math.min(...vs):Math.max(...vs)}:null;
  }
  function checkPR(e){
    const cur=entries.find(x=>x.id===e.id)||e,prev=bestOther(cur);
    if(!prev)return;
    const v=valOf(cur,prev.k);
    if(v!=null&&prev.k==="orm"&&v>prev.v+0.05){toast("Nuevo récord de fuerza en "+cur.name+": 1RM est. "+fmtN(r1(v))+" kg",true);return}
    if(prev.k==="orm")return;
    if(v!=null&&better(prev.k,v,prev.v))toast("Nuevo récord en "+cur.name+": "+(prev.k==="mins"||prev.k==="best"?fmtTime(v):prev.k==="dist"?fmtDist(v):fmtN(v)+" "+unitFor(prev.k)),true);
  }
  let recIds=new Set();
  function computeRecords(){
    recIds=new Set();const groups={};
    entries.filter(isReal).forEach(e=>(groups[norm(e.name)]=groups[norm(e.name)]||[]).push(e));
    Object.values(groups).forEach(g=>{
      const k=g.map(keyFor).find(Boolean);if(!k)return;
      // solo se compara lo comparable: mismo tipo de marca (y misma distancia si es por tiempo)
      const d0=k==="best"?(g.find(e=>keyFor(e)==="best")||{}).dist:null;
      const vals=g.filter(e=>keyFor(e)===k&&(k!=="best"||e.dist===d0)).map(e=>({e,v:valOf(e,k)})).filter(o=>o.v!=null);
      if(vals.length<2)return;
      const max=k==="best"?Math.min(...vals.map(o=>o.v)):Math.max(...vals.map(o=>o.v));
      const holder=vals.filter(o=>o.v===max).sort((a,b)=>a.e.date.localeCompare(b.e.date)||(a.e.createdAt||0)-(b.e.createdAt||0))[0];
      if(vals.some(o=>o.v!==max))recIds.add(holder.e.id);
    });
  }

  // ---------- aviso flotante ----------
  let toastT=null;
  let toastAct=null;
  function toast(msg,star,action){
    const t=$("toast");toastAct=action||null;
    t.innerHTML='<span class="tmsg">'+(star?'<b>★</b> ':'')+esc(msg)+'</span>'+(action?'<button type="button" id="toastBtn">'+esc(action.label)+'</button>':'');
    t.classList.toggle("gold",!!star);
    t.style.bottom=""; // arriba de la pantalla: no tapa la barra Te toca ni las ventanas
    if(star)burst();
    t.hidden=false;
    clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;toastAct=null},action?7000:4500);
  }
  // destello dorado al hacer un récord
  function burst(){
    try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return}catch(e){}
    const t=$("toast").getBoundingClientRect(),cx=t.left+t.width/2||window.innerWidth/2,cy=t.top+t.height/2||window.innerHeight-120;
    for(let k=0;k<14;k++){const d=document.createElement("i");d.className="burst";const a=Math.PI*2*k/14,r=60+Math.random()*50;
      d.style.left=cx+"px";d.style.top=cy+"px";d.style.setProperty("--dx",Math.cos(a)*r+"px");d.style.setProperty("--dy",Math.sin(a)*r-30+"px");
      document.body.appendChild(d);setTimeout(()=>d.remove(),1000)}
  }
  $("toast").addEventListener("click",async e=>{
    if(!e.target.closest("#toastBtn")||!toastAct)return;
    const a=toastAct;toastAct=null;$("toast").hidden=true;clearTimeout(toastT);
    try{await a.fn()}catch(err){toast("No se pudo deshacer. Inténtalo de nuevo.")}
  });

  // ---------- sonido y pantalla encendida ----------
  let actx=null;
  function ensureAudio(){try{actx=actx||new(window.AudioContext||window.webkitAudioContext)();if(actx.state==="suspended")actx.resume()}catch(e){}}
  function beep(){
    if(!actx)return;
    try{[0,.28,.56].forEach((d,i)=>{
      const o=actx.createOscillator(),g=actx.createGain(),s=actx.currentTime+d;
      o.frequency.value=i===2?1320:880;o.connect(g);g.connect(actx.destination);
      g.gain.setValueAtTime(.0001,s);g.gain.exponentialRampToValueAtTime(.45,s+.02);g.gain.exponentialRampToValueAtTime(.0001,s+.22);
      o.start(s);o.stop(s+.25);
    })}catch(e){}
  }
  let wl=null,lastAct=0;
  const touch=()=>{lastAct=Date.now()};
  async function keepAwake(){
    touch();
    try{if(!wl&&navigator.wakeLock&&document.visibilityState==="visible"){wl=await navigator.wakeLock.request("screen");wl.addEventListener("release",()=>{wl=null;updateAwake()})}}catch(e){wl=null}
    updateAwake();
  }
  function updateAwake(){$("rAwake").hidden=!wl}
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-lastAct<10*60e3)keepAwake()});

  // ---------- descanso ----------
  let rest=null; // {name,key,end,total,beeped}
  const restFor=n=>restCfg.by[imgKey(n)]||restCfg.def||90;
  function startRest(e,secs){
    const total=secs||restFor(e.name);
    rest={name:e.name,key:imgKey(e.name),total,end:Date.now()+total*1000,beeped:false};
    $("rest").hidden=false;document.body.classList.add("resting");$("rPre").hidden=true;$("rTimeBtn").setAttribute("aria-expanded","false");
    $("rLabel").textContent="Descanso · "+e.name;
    renderRestPresets();keepAwake();tick();
  }
  function stopRest(){rest=null;$("rest").hidden=true;$("rest").classList.remove("over");document.body.classList.remove("resting")}
  function renderRestPresets(){
    if(!rest)return;
    const cur=restCfg.by[rest.key]||null;
    $("rPresets").innerHTML=[30,45,60,90,120,180].map(s=>'<button type="button" data-preset="'+s+'"'+((cur||restCfg.def)===s?' aria-pressed="true"':'')+'>'+(s<60?s+"s":fmtSecs(s))+'</button>').join("");
  }
  $("rest").addEventListener("click",async e=>{
    const b=e.target.closest("button");if(!b||!rest)return;
    touch();ensureAudio();
    if(b.id==="rTimeBtn"){const p=$("rPre");p.hidden=!p.hidden;b.setAttribute("aria-expanded",p.hidden?"false":"true");return}
    if(b.dataset.r==="skip"){stopRest();return}
    if(b.dataset.r){const d=+b.dataset.r;rest.end+=d*1000;rest.total=Math.max(1,rest.total+d);rest.beeped=rest.end<=Date.now()&&rest.beeped;$("rest").classList.toggle("over",rest.end<=Date.now());tick();return}
    if(b.dataset.preset){
      const s=+b.dataset.preset,by=Object.assign({},restCfg.by);by[rest.key]=s;
      const name=rest.name;
      try{await store.setSettings({def:restCfg.def||90,by})}catch(err){}
      startRest({name},s);toast("Descanso de "+name+": "+(s<60?s+" s":fmtSecs(s)+" min"));
    }
  });
  function tick(){
    if(rest){
      const left=(rest.end-Date.now())/1000;
      if(left>0){
        $("rTime").textContent=fmtSecs(Math.ceil(left));
        $("rFill").style.width=Math.max(0,Math.min(100,(1-left/rest.total)*100))+"%";
        $("rest").classList.remove("over");
      }else{
        if(!rest.beeped){rest.beeped=true;beep()}
        $("rest").classList.add("over");
        $("rTime").textContent="+"+fmtSecs(-left);
        $("rFill").style.width="100%";
        $("rLabel").textContent="¡A la siguiente serie!";
        if(-left>180)stopRest();
      }
    }
    if(running){
      const txt="■ "+fmtSecs((Date.now()-running.start)/1000);
      document.querySelectorAll('.setpill.running .rt').forEach(p=>p.textContent=txt);
      const nb=$("nextDone");if(nb&&isRunning(nb.dataset.sid,+nb.dataset.si))nb.textContent="Detener "+txt.slice(2);
      document.querySelectorAll(".runtxt").forEach(x=>x.textContent=txt.slice(2));
    }
    if(wl&&!rest&&!running&&!FS.open&&Date.now()-lastAct>10*60e3){try{wl.release()}catch(e){}wl=null;updateAwake()}
    tickFocus();
  }
  setInterval(tick,250);
  function reRenderLists(){renderToday();renderHistory();renderDetail()}
  let deferred=false;
  function releaseFocus(){const a=document.activeElement;if(a&&a.blur&&a.closest&&a.closest(".eedit,.seted"))a.blur();if(deferred){deferred=false;render()}}
  const typingInPanel=()=>{const a=document.activeElement;return !!(a&&a.closest&&a.closest(".eedit,.seted,#focus,#setModal")&&/INPUT|TEXTAREA/.test(a.tagName))};
  document.addEventListener("focusout",()=>setTimeout(()=>{if(deferred&&!typingInPanel()){deferred=false;render()}},50));
  document.addEventListener("click",async ev=>{
    const p=ev.target.closest(".setpill");
    if(p){
      const id=p.dataset.sid,i=+p.dataset.si,e=entries.find(x=>x.id===id);if(!e)return;
      const d=doneArr(e)[i];
      if(!d){await markDone(id,i);return}
      if(editing&&editing.id===id&&editing.i===i)editing=null;
      else editing={id,i,draft:Object.assign({},d)};
      reRenderLists();return;
    }
    const st=ev.target.closest("[data-step]");
    if(st&&editing){
      const k=st.dataset.step,inp=document.querySelector('[data-ed="'+k+'"]');
      if(k==="t"){const secs=Math.max(0,Math.round((editing.draft.t||0)*60)+Number(st.dataset.d));editing.draft.t=secs/60;document.querySelectorAll('[data-ed="t"]').forEach(x=>x.value=fmtDur(secs/60));return}
      const cur=editing.draft[k]??0,nv=Math.max(0,Math.round((cur+Number(st.dataset.d))*100)/100);
      editing.draft[k]=nv;document.querySelectorAll('[data-ed="'+k+'"]').forEach(x=>x.value=nv);return;
    }
    const a=ev.target.closest("[data-edact]");
    if(a)releaseFocus();
    if(a&&editing&&a.dataset.edact==="addm"){editing.addM=true;reRenderLists();const m=document.querySelector('[data-ed="m"]');if(m)m.focus();return}
    if(a&&editing){
      const e=entries.find(x=>x.id===editing.id),i=editing.i,draft=editing.draft;
      editing=null;
      if(!e){reRenderLists();return}
      const ok=a.dataset.edact==="ok",prev=ok?bestOther(e):null;
      if(ok&&!draft.at&&isLive(e))draft.at=Date.now();
      await saveSet(e,i,ok?draft:null);
      if(ok)checkPR(e,prev);
      reRenderLists();
    }
  });
  document.addEventListener("input",ev=>{
    const k=ev.target.dataset&&ev.target.dataset.ed;
    if(k&&editing){
      if(k==="tm"||k==="ts"){const a=$("ed-tm").value,b=$("ed-ts").value;editing.draft.t=(a===""&&b==="")?null:((+a||0)*60+(+b||0))/60;return}
      const v=ev.target.value;editing.draft[k]=v===""?null:Number(v)}
  });

  function findNext(list){
    const withSets=list.filter(e=>e.sets>0);
    if(running){const re=withSets.find(e=>e.id===running.id);if(re&&!doneArr(re)[running.i])return{e:re,r:running.i}}
    const maxS=Math.max(0,...withSets.map(e=>doneArr(e).length));
    for(let r=0;r<maxS;r++)for(const e of withSets){const ds=doneArr(e);if(r<ds.length&&!ds[r])return{e,r}}
    return null;
  }
  function ringSVG(done,total,size,stroke,inner){
    const r=(size-stroke)/2,c=2*Math.PI*r,f=total?Math.min(1,done/total):0;
    return '<span class="ring'+(total&&done>=total?' full':'')+'" style="width:'+size+'px;height:'+size+'px" role="img" aria-label="'+done+' de '+total+' series"><svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'"><circle class="rbg" cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" stroke-width="'+stroke+'"/><circle class="rfg" cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" stroke-width="'+stroke+'" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+(c*(1-f)).toFixed(1)+'"/></svg><b>'+inner+'</b></span>';
  }
  const countSets=list=>{let d=0,t=0;list.forEach(e=>{const ds=doneArr(e);t+=ds.length;d+=ds.filter(Boolean).length});return{d,t}};
  // ---------- Hoy: resumen de la sesión + barra "Te toca" ----------
  function renderNext(list){
    const box=$("nextBox"),withSets=list.filter(e=>e.sets>0);
    $("legend").hidden=true;
    const nx=withSets.length?findNext(list):null;
    renderTeToca(nx);
    if(!withSets.length){box.innerHTML="";return}
    const C=countSets(withSets),pct=C.t?Math.round(C.d/C.t*100):0;
    const st=sessionStart(list),dur=st?Math.max(1,Math.round((Date.now()-st)/60000)):null;
    const focusOk=nx&&isLive(nx.e);
    box.innerHTML='<div class="sesscard'+(!nx?' complete':'')+'"><div class="sc-top"><b>'+(!nx?'¡Sesión completa!':'Sesión')+'</b><span>'+C.d+' de '+C.t+' series'+(dur&&isLive(withSets[0])?' · '+fmtSess(dur):'')+'</span></div>'+
      '<div class="sc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="'+C.t+'" aria-valuenow="'+C.d+'" aria-label="Series hechas"><i style="width:'+pct+'%"></i></div>'+
      (focusOk?'<button type="button" class="sc-focus" id="focusOpen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>Modo entrenamiento</button>':'')+'</div>';
  }
  $("nextBox").addEventListener("click",ev=>{if(ev.target.closest("#focusOpen"))openFocus(true)});
  function goBtnHTML(e,i,cls,label){
    const timed=isTimed(e)&&isLive(e),run=isRunning(e.id,i);
    const ic=run?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>':timed?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
    const txt=run?'Detener <span class="runtxt">'+fmtSecs((Date.now()-running.start)/1000)+'</span>':timed?'Iniciar':(label||'Completar');
    return '<button type="button" class="'+cls+(run?' running':'')+'" data-go="'+esc(e.id)+'" data-gi="'+i+'">'+ic+'<span>'+txt+'</span></button>';
  }
  function renderTeToca(nx){
    const bar=$("teToca");
    const show=!!nx&&!FS.open;
    bar.hidden=!show;document.body.classList.toggle("has-toca",show);
    const rn=$("rNext");
    if(nx){rn.hidden=false;rn.innerHTML='Después: <b>'+esc(nx.e.name)+' · serie '+(nx.r+1)+'</b>'}else{rn.hidden=true}
    if(!show){bar.innerHTML="";return}
    const e=nx.e,t=doneArr(e).length;
    bar.innerHTML='<button type="button" class="tt-info" data-open="'+esc(e.id)+'"><small>Te toca</small><b>'+esc(e.name)+'</b><span>Serie '+(nx.r+1)+' de '+t+(planText(e)?' · '+esc(planText(e)):'')+'</span></button>'+goBtnHTML(e,nx.r,"tt-go");
  }

  // ---------- Hoy: tarjetas ----------
  function cardHTML(e,nx){
    const ds=doneArr(e),n=ds.filter(Boolean).length,t=ds.length,r=imgOf(e.name);
    const full=t>0&&n>=t,cur=nx&&nx.e.id===e.id;
    const dots=t?'<span class="tdots" aria-hidden="true">'+(t<=6?ds.map((d,i)=>'<i class="'+(d?'on':cur&&i===nx.r?'nx':'')+'"></i>').join(""):'<em>'+n+'/'+t+'</em>')+'</span>':'';
    return '<div class="entry tcard'+(full?' done':'')+(cur?' cur':'')+(e.createdAt===lastNew?' new':'')+'" data-id="'+esc(e.id)+'" data-open="'+esc(e.id)+'" role="button" tabindex="0" aria-label="'+esc(e.name)+(t?': '+n+' de '+t+' series':'')+'">'+
      '<span class="tthumb">'+(r?mediaHTML(r):'<i>'+esc((e.name||"?").charAt(0).toUpperCase())+'</i>')+'</span>'+
      '<span class="tinfo"><b>'+esc(e.name)+(recIds.has(e.id)?' <span class="pr">★</span>':'')+'</b><small>'+figs(e)+'</small>'+(e.memo?'<small class="tmemo">'+esc(e.memo)+'</small>':'')+'</span>'+
      (full?'<span class="tdone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>Listo</span>':dots)+'</div>';
  }
  function cardsHTML(groups,nx){
    if(groups.length<2)return groups[0].entries.map(e=>cardHTML(e,nx)).join("");
    return groups.map(g=>'<div class="sesshead">'+esc(sessLabel(g))+(sessDur(g)&&g.end>g.start?' <span>· '+fmtSess(sessDur(g))+'</span>':'')+'</div>'+g.entries.map(e=>cardHTML(e,nx)).join("")).join("");
  }
  document.addEventListener("click",ev=>{
    const g=ev.target.closest("[data-go]");
    if(g){ev.stopPropagation();completeFlow(g.dataset.go,+g.dataset.gi);return}
    const c=ev.target.closest("[data-open]");
    if(c&&!c.closest("#exDet")){if(Date.now()-lastDragEnd<500)return;openDetail(c.dataset.open)}
  });
  document.addEventListener("keydown",ev=>{if((ev.key==="Enter"||ev.key===" ")&&ev.target.matches&&ev.target.matches(".tcard[data-open]")){ev.preventDefault();openDetail(ev.target.dataset.open)}});

  // completar una serie: por tiempo (hoy) primero corre el cronómetro; luego siempre se confirma en la ventana
  function completeFlow(id,i){
    const e=entries.find(x=>x.id===id);if(!e)return;
    touch();ensureAudio();
    if(isTimed(e)&&isLive(e)){
      if(!isRunning(id,i)){running={id,i,start:Date.now()};stopRest();keepAwake();reRenderLists();return}
      const secs=(Date.now()-running.start)/1000;running=null;
      const dr=defaultDraft(e,i);dr.t=Math.round(secs)/60;
      reRenderLists();openSetModal(e,i,dr,false);return;
    }
    openSetModal(e,i,defaultDraft(e,i),false);
  }

  // ---------- detalle del ejercicio ----------
  let DET=null; // {id}
  function dayListOf(e){return entries.filter(x=>x.date===e.date).sort(byCreated)}
  function openDetail(id){DET={id};editEntry=null;$("exDet").hidden=false;document.body.classList.add("det-open");renderDetail();$("exDet").scrollTop=0}
  function closeDetail(){DET=null;editEntry=null;$("exDet").hidden=true;$("exDet").innerHTML="";document.body.classList.remove("det-open");renderToday()}
  function renderDetail(){
    if(!DET)return;
    const e=entries.find(x=>x.id===DET.id);
    if(!e){closeDetail();return}
    if(typingInPanel()){deferred=true;return}
    const day=dayListOf(e),idx=day.indexOf(e),prev=day[idx-1],next=day[idx+1];
    const r=imgOf(e.name),cat=catOf(e.name),ds=doneArr(e),fp=ds.findIndex(x=>!x),lt=lastTimeOf(e);
    const rows=ds.map((d,i)=>{
      if(d){const V=setVerdict(e,d);return '<li><button type="button" class="srow done st-'+V.state+'" data-dset="'+i+'"><span class="sdot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></span><span class="slab">Serie '+(i+1)+'</span><span class="sval">'+esc(d.w!=null&&d.r!=null?fmtN(d.w)+" kg × "+d.r:setLine(e,d))+'</span><span class="stime">'+(d.at?pad(new Date(d.at).getHours())+':'+pad(new Date(d.at).getMinutes()):'')+'</span></button>'+'<button type="button" class="srm" data-drm="'+i+'" aria-label="Eliminar serie '+(i+1)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+'</li>'}
      if(i===fp)return '<li class="scur"><div class="srow cur"><span class="sdot">'+(i+1)+'</span><span class="slab">Serie '+(i+1)+' <em>· te toca</em></span><span class="sval">'+esc(planText(e)||"")+'</span>'+'<button type="button" class="srm" data-drm="'+i+'" aria-label="Eliminar serie '+(i+1)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+'</div>'+goBtnHTML(e,i,"bigbtn","Completar serie "+(i+1))+'</li>';
      return '<li><button type="button" class="srow pend" data-dgo="'+i+'"><span class="sdot">'+(i+1)+'</span><span class="slab">Serie '+(i+1)+'</span><span class="sval">'+esc(planText(e)||"")+'</span></button>'+'<button type="button" class="srm" data-drm="'+i+'" aria-label="Eliminar serie '+(i+1)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+'</li>';
    }).join("");
    $("exDet").innerHTML='<div class="dwrap">'+
      '<div class="dtop"><button type="button" class="iconbtn" data-dact="close" aria-label="Volver"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button><span>Ejercicio '+(idx+1)+' de '+day.length+'</span>'+
        '<button type="button" class="iconbtn edt'+(editEntry===e.id?' on':'')+'" data-eid="'+esc(e.id)+'" aria-label="Editar o borrar ejercicio">'+PENCIL+'</button></div>'+
      '<div class="dmedia">'+(r?mediaHTML(r):'<span class="fletter">'+esc((e.name||"?").charAt(0).toUpperCase())+'</span>')+(cat&&cat!=="otro"&&CATMAP[cat]?'<span class="dcat">'+esc(CATMAP[cat][1])+'</span>':'')+'</div>'+
      '<div class="dhead"><h2 id="detName">'+esc(e.name)+(recIds.has(e.id)?' <span class="pr">★ Récord</span>':'')+'</h2>'+(lt?'<p>La vez pasada ('+esc(fmtShort(lt.date))+'): '+esc(lt.line)+'</p>':'')+(e.memo?'<p class="dmemo">'+esc(e.memo)+'</p>':'')+'</div>'+
      (editEntry===e.id?entryEditHTML(e):'')+
      (ds.length?'<ol class="srows" aria-label="Series">'+rows+'</ol>':'<p class="hint">Este ejercicio no tiene series. Agrega una con “+ Serie”.</p>')+
      '<div class="dacts"><button type="button" class="btnlike" data-dact="addset"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Serie</button>'+
        '<button type="button" class="btnlike edt" data-eid="'+esc(e.id)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>Editar plan</button></div>'+
      '<div class="dnav">'+(prev?'<button type="button" class="btnlike" data-dnav="'+esc(prev.id)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>'+esc(prev.name)+'</span></button>':'<span></span>')+
        (next?'<button type="button" class="btnlike" data-dnav="'+esc(next.id)+'"><span>'+esc(next.name)+'</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>':'<span></span>')+'</div>'+
      '</div>';
  }
  $("exDet").addEventListener("click",async ev=>{
    const b=ev.target.closest("button");if(!b||!DET)return;
    const e=entries.find(x=>x.id===DET.id);if(!e)return;
    if(b.dataset.dact==="close"){closeDetail();return}
    if(b.dataset.dnav){DET={id:b.dataset.dnav};editEntry=null;renderDetail();$("exDet").scrollTop=0;return}
    if(b.dataset.dact==="addset"){await store.update(e.id,{sets:(+e.sets||0)+1});return}
    if(b.dataset.dact==="rmset"){const n=Math.max(0,(+e.sets||0)-1);await store.update(e.id,{sets:n,done:doneArr(e).slice(0,n)});return}
    if(b.dataset.drm!=null){
      const i=+b.dataset.drm,old={sets:e.sets,done:(Array.isArray(e.done)?e.done:[]).slice()};
      const ds=doneArr(e);ds.splice(i,1);
      if(running&&running.id===e.id)running=null;
      await store.update(e.id,{sets:Math.max(0,(+e.sets||0)-1),done:ds});
      toast("Serie "+(i+1)+" eliminada",false,{label:"Deshacer",fn:async()=>{await store.update(e.id,old)}});return;
    }
    if(b.dataset.dset!=null){const i=+b.dataset.dset,d=doneArr(e)[i];if(d)openSetModal(e,i,Object.assign({},d),true);return}
    if(b.dataset.dgo!=null){completeFlow(e.id,+b.dataset.dgo);return}
  });
  document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&DET&&$("smOv").hidden&&$("lb").hidden)closeDetail()});

  // ---------- ventana: confirmar serie ----------
  let SM=null; // {id,i,draft,edit}
  function smFields(e,D){
    const timed=isTimed(e)||D.t!=null;
    return {w:e.weight!=null||D.w!=null||(!timed&&e.reps==null),r:e.reps!=null||D.r!=null||(!timed&&e.weight==null),m:e.dist!=null||D.m!=null||wantsMeters(e),t:timed};
  }
  function smStep(k,label,unit,val,step){
    return '<div class="smf"><label for="sm-'+k+'">'+label+'</label><div class="smstep">'+
      '<button type="button" data-sms="'+k+'" data-d="-'+step+'" aria-label="Bajar '+label+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>'+
      '<span class="smbox"><input id="sm-'+k+'" data-smk="'+k+'" class="num" type="text" inputmode="decimal" autocomplete="off" value="'+(val==null?"":String(val).replace(".",","))+'">'+(unit?'<small>'+unit+'</small>':'')+'</span>'+
      '<button type="button" data-sms="'+k+'" data-d="'+step+'" aria-label="Subir '+label+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>'+
      (k==="w"?'<div class="smquick" role="group" aria-label="Atajos de peso"><button type="button" data-sms="w" data-d="-5">−5</button><button type="button" data-sms="w" data-d="-2.5">−2,5</button><button type="button" data-sms="w" data-d="2.5">+2,5</button><button type="button" data-sms="w" data-d="5">+5</button></div>':'')+'</div>';
  }
  function smDelta(e,D){
    const parts=[],ref=targetOf(e);
    const cmpOne=(k,lbl,unit,lower)=>{if(ref[k]==null||D[k]==null)return;const a=k==="t"?Math.round(ref[k]*60):ref[k],b=k==="t"?Math.round(D[k]*60):D[k];if(a===b)return;
      const up=lower?b<a:b>a,diff=Math.abs(b-a);parts.push({up,txt:(b>a?"+":"−")+(k==="t"?fmtSecs(diff):fmtN(diff)+" "+unit)+" "+lbl})};
    cmpOne("w","de peso","kg");cmpOne("r","reps","");cmpOne("m","metros","m");cmpOne("t","de tiempo","",e.dist!=null);
    if(!parts.length)return '<p class="smdelta same"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>Igual que lo planificado'+(planText(e)?' ('+esc(planText(e))+')':'')+'</p>';
    const up=parts.some(p=>p.up),dn=parts.some(p=>!p.up);
    return '<p class="smdelta '+(up&&!dn?'up':dn&&!up?'dn':'mx')+'">'+(up&&!dn?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>':dn&&!up?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>':'')+esc(parts.map(p=>p.txt).join(" · "))+' respecto a lo planificado'+(planText(e)?' ('+esc(planText(e))+')':'')+'</p>';
  }
  function openSetModal(e,i,draft,edit){
    SM={id:e.id,i,draft:Object.assign({},draft),edit};
    renderSetModal();$("smOv").hidden=false;document.body.classList.add("sm-open");
    setTimeout(()=>{const b=$("smOk");if(b)b.focus({preventScroll:true})},50);
  }
  function closeSetModal(){SM=null;$("smOv").hidden=true;$("setModal").innerHTML="";document.body.classList.remove("sm-open");if(deferred){deferred=false;render()}}
  function renderSetModal(){
    if(!SM)return;
    const e=entries.find(x=>x.id===SM.id);if(!e){closeSetModal();return}
    const D=SM.draft,F=smFields(e,D),r=imgOf(e.name),t=doneArr(e).length;
    let f="";
    if(F.w)f+=smStep("w","Peso","kg",D.w,1);
    if(F.r)f+=smStep("r","Repeticiones","",D.r,1);
    if(F.m)f+=smStep("m","Distancia","m",D.m,50);
    if(F.t){const ts=D.t==null?null:Math.round(D.t*60);
      f+='<div class="smf"><label for="sm-tm">Tiempo</label><div class="smtime"><input id="sm-tm" data-smk="tm" class="num" type="text" inputmode="numeric" placeholder="min" aria-label="Minutos" value="'+(ts==null?"":Math.floor(ts/60))+'"><span>:</span><input id="sm-ts" data-smk="ts" class="num" type="text" inputmode="numeric" placeholder="seg" aria-label="Segundos" value="'+(ts==null?"":pad(ts%60))+'"><small>min : seg</small></div></div>'}
    $("setModal").innerHTML='<div class="grab" aria-hidden="true"></div>'+
      '<div class="smhead">'+(r?'<span class="smthumb">'+mediaHTML(r)+'</span>':'')+'<div><small>Serie '+(SM.i+1)+' de '+t+(SM.edit?' · hecha':'')+'</small><h2 id="smTitle">'+esc(e.name)+'</h2></div></div>'+
      '<div class="smfields">'+f+'</div><div id="smDelta">'+smDelta(e,D)+'</div>'+
      '<div class="smacts"><button type="button" class="btnlike" data-sma="cancel">Cancelar</button>'+(SM.edit?'<button type="button" class="btnlike danger" data-sma="undo">Desmarcar</button>':'')+
      '<button type="button" class="btnlike solid" id="smOk" data-sma="ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>'+(SM.edit?'Guardar':'Confirmar serie')+'</button></div>';
  }
  const smNum=v=>{v=String(v).trim().replace(",",".");if(v==="")return null;const n=Number(v);return isNaN(n)?null:n};
  $("setModal").addEventListener("input",ev=>{
    if(!SM)return;const k=ev.target.dataset.smk;if(!k)return;
    if(k==="tm"||k==="ts"){const a=$("sm-tm").value,b=$("sm-ts").value;SM.draft.t=(a===""&&b==="")?null:((+a||0)*60+(+b||0))/60}
    else SM.draft[k]=smNum(ev.target.value);
    const e=entries.find(x=>x.id===SM.id);if(e)$("smDelta").innerHTML=smDelta(e,SM.draft);
  });
  $("smOv").addEventListener("click",async ev=>{
    if(!SM)return;
    if(ev.target.id==="smOv"){closeSetModal();return}
    const b=ev.target.closest("button");if(!b)return;
    const e=entries.find(x=>x.id===SM.id);if(!e){closeSetModal();return}
    if(b.dataset.sms){
      const k=b.dataset.sms,cur=SM.draft[k]??0,nv=Math.max(0,Math.round((cur+Number(b.dataset.d))*100)/100);
      SM.draft[k]=nv;const inp=$("sm-"+k);if(inp)inp.value=String(nv).replace(".",",");
      $("smDelta").innerHTML=smDelta(e,SM.draft);return;
    }
    const act=b.dataset.sma;if(!act)return;
    if(act==="cancel"){closeSetModal();return}
    const i=SM.i,edit=SM.edit,D=SM.draft;
    if(act==="undo"){closeSetModal();await saveSet(e,i,null);reRenderLists();return}
    const old=doneArr(e)[i];
    const val={w:D.w??null,r:D.r??null,m:D.m??null,t:D.t??null,at:edit&&old?old.at??null:(isLive(e)?Date.now():null)};
    const prev=bestOther(e);
    closeSetModal();
    await saveSet(e,i,val);
    if(!edit&&isLive(e))startRest(e);
    checkPR(e,prev);reRenderLists();
  });
  document.addEventListener("keydown",ev=>{if(ev.key==="Escape"&&SM)closeSetModal();if(ev.key==="Enter"&&SM&&ev.target.dataset&&ev.target.dataset.smk){ev.preventDefault();$("smOk").click()}});
  const byCreated=(a,b)=>ordOf(a)-ordOf(b);

  // ---------- modo entrenamiento ----------
  const FS={open:false,key:null,draft:{},view:null};
  const PLAY='<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  function focusList(){
    const list=entries.filter(e=>e.date===today).sort(byCreated);
    const gs=list.length?splitSessions(list):[];
    return gs.length?gs[gs.length-1].entries:[];
  }
  function prevSetOf(e,i){const ds=doneArr(e);for(let j=i-1;j>=0;j--)if(ds[j])return ds[j];return null}
  function lastTimeOf(e){
    const o=entries.filter(x=>x.id!==e.id&&norm(x.name)===norm(e.name)&&x.date<=e.date&&doneArr(x).some(Boolean)).sort((a,b)=>b.date.localeCompare(a.date)||ordOf(b)-ordOf(a))[0];
    if(!o)return null;const h=doneArr(o).filter(Boolean);return {date:o.date,line:h.map(x=>setLine(o,x)).join(" · ")};
  }
  // metros solo para cardio por tiempo (ej. remo 5 min), no para una plancha
  const wantsMeters=e=>e.mins!=null&&e.dist==null&&(catOf(e.name)==="cardio"||entries.some(x=>norm(x.name)===norm(e.name)&&(x.done||[]).some(d=>d&&d.m!=null)));
  function defaultDraft(e,i){
    const b=targetOf(e),p=prevSetOf(e,i);
    // si en la serie anterior cambiaste peso o reps, la siguiente parte desde ahí
    return {w:p&&p.w!=null?p.w:b.w,r:p&&p.r!=null?p.r:b.r,m:e.dist!=null?b.m:null};
  }
  function fField(k,label,val,step){
    return '<div class="ffield"><span class="fl">'+label+'</span><div class="fstep">'+
      '<button type="button" data-fs="'+k+'" data-d="-'+step+'" aria-label="Bajar '+label+'">−</button>'+
      '<input data-ff="'+k+'" id="ff-'+k+'" class="num" type="number" inputmode="decimal" step="any" min="0" value="'+(val==null?"":val)+'" aria-label="'+label+'">'+
      '<button type="button" data-fs="'+k+'" data-d="'+step+'" aria-label="Subir '+label+'">+</button></div></div>';
  }
  function sessionStart(list){const a=list.flatMap(e=>(e.done||[]).filter(d=>d&&d.at).map(d=>d.at));return a.length?Math.min(...a):null}
  function renderFocus(){
    if(!FS.open)return;
    const list=focusList(),withSets=list.filter(e=>e.sets>0),C=countSets(withSets),nx=findNext(list);
    const st=sessionStart(list);
    const top='<div class="ftop"><button type="button" class="fx" data-fa="close" aria-label="Salir del modo entrenamiento">✕ Salir</button>'+
      '<span class="fclock"><b id="fClock">'+(st?fmtClock(Date.now()-st):"0:00")+'</b><small>Sesión</small></span>'+
      ringSVG(C.d,C.t,48,5,'<span style="font-size:.95rem">'+C.d+'<small>/'+C.t+'</small></span>')+'</div>';
    let body="",view;
    const resting=rest&&rest.end>Date.now();
    if(resting){
      view="rest";
      const left=Math.max(0,(rest.end-Date.now())/1000);
      body='<div class="frest arrive"><span id="fRestRing">'+ringSVG(left,rest.total,230,12,'<span id="fRestT">'+fmtSecs(Math.ceil(left))+'</span><small>Descanso</small>')+'</span>'+
        '<div class="racts"><button type="button" data-fr="-15">−15</button><button type="button" data-fr="15">+15</button><button type="button" data-fr="skip">Saltar</button></div>'+
        (nx?'<div class="fnext">'+(imgOf(nx.e.name)?mediaHTML(imgOf(nx.e.name),"mini",nx.e.name):'')+'<div><small>Siguiente</small><b>'+esc(nx.e.name)+'</b><span class="hint">Serie '+(nx.r+1)+' de '+doneArr(nx.e).length+(planText(nx.e)?' · '+esc(planText(nx.e)):'')+'</span></div></div>':'')+'</div>';
    }else if(!nx){
      view="end";
      let vol=0;withSets.forEach(e=>doneArr(e).forEach(x=>{if(x&&x.w!=null&&x.r!=null)vol+=x.w*x.r}));
      body='<div class="fend arrive">'+ringSVG(C.d,C.t,170,12,'<span style="font-size:2.6rem">✓</span>')+'<h2>¡Sesión completa!</h2><p>'+C.d+' series'+(st?' · '+fmtClock(Date.now()-st):'')+(vol?' · '+Math.round(vol).toLocaleString("es-CL")+' kg de volumen':'')+'</p>'+
        '<button type="button" class="btnlike solid" data-fa="summary">Ver resumen</button><button type="button" class="fskip" data-fa="close">Salir</button></div>';
    }else{
      view="set";
      const e=nx.e,i=nx.r,key=e.id+":"+i,total=doneArr(e).length;
      const fresh=FS.key!==key;
      if(fresh){FS.key=key;FS.draft=defaultDraft(e,i)}
      const D=FS.draft,r=imgOf(e.name),timed=isTimed(e),run=isRunning(e.id,i);
      const p=prevSetOf(e,i),lt=p?null:lastTimeOf(e);
      let fields="";
      if(timed){
        const goal=e.dist!=null?fmtDist(e.dist)+(e.mins!=null?" en "+fmtTime(e.mins):""):fmtTime(e.mins);
        fields='<div class="frun"><span id="fRun">'+(run?fmtSecs((Date.now()-running.start)/1000):"0:00")+'</span><small>Meta: '+esc(goal)+'</small></div>'+
          (wantsMeters(e)?'<div class="fields">'+fField("m","Metros",D.m,50)+'</div>':'');
      }else{
        const showW=e.weight!=null||D.w!=null||e.reps==null,showR=e.reps!=null||D.r!=null||e.weight==null;
        fields='<div class="fields">'+(showW?fField("w","Kg",D.w,1)+'<div class="fquick" role="group" aria-label="Atajos de peso"><button type="button" data-fs="w" data-d="-2.5">−2,5</button><button type="button" data-fs="w" data-d="2.5">+2,5</button><button type="button" data-fs="w" data-d="5">+5</button></div>':'')+(showR?fField("r","Reps",D.r,1):'')+'</div>';
      }
      body='<div class="fset'+(fresh?' arrive':'')+'" style="display:flex;flex-direction:column;gap:14px">'+
        '<div class="fmedia">'+(r?mediaHTML(r):'<span class="fletter">'+esc((e.name||"?").charAt(0).toUpperCase())+'</span>')+'</div>'+
        '<div class="fname"><small>Ronda '+(i+1)+'</small><b>'+esc(e.name)+'</b><span>Serie '+(i+1)+' de '+total+(planText(e)?' · pedido: '+esc(planText(e)):'')+'</span></div>'+
        (p?'<p class="fprev">Serie anterior: <b>'+esc(setLine(e,p))+'</b></p>':lt?'<p class="fprev">Última vez ('+esc(fmtShort(lt.date))+'): <b>'+esc(lt.line)+'</b></p>':'')+
        fields+
        (timed?'<button type="button" class="fdone'+(run?' stop':'')+'" id="fDone">'+(run?'■ Detener':PLAY+' Iniciar')+'</button>':'<button type="button" class="fdone" id="fDone">✓ Hecha</button>')+
        '</div>';
    }
    FS.view=view;
    $("focus").innerHTML='<div class="fwrap">'+top+body+'</div>';
  }
  function openFocus(open){
    FS.open=open;$("focus").hidden=!open;document.body.classList.toggle("focusing",open);
    if(open){FS.key=null;touch();ensureAudio();keepAwake();renderFocus()}
    else{$("focus").innerHTML="";reRenderLists()}
  }
  $("focus").addEventListener("input",ev=>{const k=ev.target.dataset&&ev.target.dataset.ff;if(!k)return;const v=ev.target.value.replace(",",".");FS.draft[k]=v===""?null:Number(v)});
  $("focus").addEventListener("click",async ev=>{
    const b=ev.target.closest("button");if(!b)return;
    touch();ensureAudio();
    if(b.dataset.fa==="close"){openFocus(false);return}
    if(b.dataset.fa==="summary"){openFocus(false);$("date").value=today;renderToday();openSummary(true);return}
    if(b.dataset.fs){
      const k=b.dataset.fs,cur=FS.draft[k]??0,nv=Math.max(0,Math.round((cur+Number(b.dataset.d))*100)/100);
      FS.draft[k]=nv;const inp=$("ff-"+k);if(inp)inp.value=nv;return;
    }
    if(b.dataset.fr){
      if(!rest)return;
      if(b.dataset.fr==="skip"){stopRest();renderFocus();return}
      const d=+b.dataset.fr;rest.end+=d*1000;rest.total=Math.max(1,rest.total+d);tick();
      if(rest.end<=Date.now()){renderFocus()}return;
    }
    if(b.id==="fDone"){
      const list=focusList(),nx=findNext(list);if(!nx)return;
      const e=nx.e,i=nx.r;
      if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
      if(isTimed(e)){
        if(!isRunning(e.id,i)){running={id:e.id,i,start:Date.now()};stopRest();keepAwake();renderFocus();reRenderLists();return}
        const secs=(Date.now()-running.start)/1000;running=null;
        const val=Object.assign(targetOf(e),{t:Math.round(secs)/60,at:Date.now()});
        if(wantsMeters(e)&&FS.draft.m!=null)val.m=FS.draft.m;
        await saveSet(e,i,val);editing=null;startRest(e);checkPR(e);renderFocus();return;
      }
      const val=Object.assign(targetOf(e),{w:FS.draft.w??null,r:FS.draft.r??null,at:Date.now()});
      await saveSet(e,i,val);editing=null;startRest(e);checkPR(e);renderFocus();
    }
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&FS.open&&$("sumOv").hidden)openFocus(false)});
  function tickFocus(){
    if(!FS.open)return;
    const resting=rest&&rest.end>Date.now();
    if((resting?"rest":"other")!==(FS.view==="rest"?"rest":"other")){if(!typingInPanel())renderFocus();return}
    const list=focusList(),st=sessionStart(list),c=$("fClock");if(c&&st)c.textContent=fmtClock(Date.now()-st);
    if(resting){
      const left=Math.max(0,(rest.end-Date.now())/1000),t=$("fRestT");if(t)t.textContent=fmtSecs(Math.ceil(left));
      const fg=document.querySelector("#fRestRing .rfg");if(fg){const c2=+fg.getAttribute("stroke-dasharray");fg.setAttribute("stroke-dashoffset",(c2*(1-left/rest.total)).toFixed(1))}
    }
    if(running){const fr=$("fRun");if(fr)fr.textContent=fmtSecs((Date.now()-running.start)/1000)}
  }

  function render(){
    const days=new Set(entries.map(e=>e.date));
    const now=new Date(),dow=(now.getDay()+6)%7;
    const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow);
    const nDays=[...days].filter(d=>parse(d)>=monday).length;
    $("sWeek").textContent=nDays;$("sWeekL").textContent=nDays===1?"día":"días";
    computeRecords();
    const wk=entries.filter(e=>parse(e.date)>=monday);
    // series hechas; si un registro no tiene series marcadas, cuenta las anotadas
    let nSets=0;
    wk.forEach(e=>{
      const ds=(Array.isArray(e.done)?e.done:[]).filter(Boolean);
      nSets+=ds.length?ds.length:(+e.sets||0);
    });
    $("sKg").textContent=nSets;$("sKgL").textContent=nSets===1?"serie":"series";
    // volumen: peso × reps de cada serie hecha (o lo anotado si no hay series marcadas)
    let vol=0;
    wk.forEach(e=>{
      const ds=(Array.isArray(e.done)?e.done:[]).filter(Boolean);
      if(ds.length)ds.forEach(d=>{if(d.w!=null&&d.r!=null)vol+=d.w*d.r});
      else if(e.sets&&e.reps&&e.weight)vol+=e.sets*e.reps*e.weight;
    });
    $("sVol").textContent=Math.round(vol).toLocaleString("es-CL");
    const prs=wk.filter(e=>recIds.has(e.id)).length;$("sPrL").textContent=prs===1?"récord":"récords";
    $("sPr").textContent=prs;$("sPrBox").hidden=!prs;
    updateAddBtn();
    if(typingInPanel()||drag)deferred=true;else{renderToday();renderHistory();renderDetail()}
    renderProgress();renderGrid();renderCatAI();maybeAutoClassify();
    if(!(document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains("rutname")))renderRoutinesTab();
    if(FS.open&&!typingInPanel())renderFocus();
    $("backupBox").hidden=!downloads||!entries.length;
    $("aiCard").hidden=!sampler||!entries.length;
    $("idRow").hidden=!sampler;$("catIdRow").hidden=!sampler;
  }
  // duración: desde la primera a la última serie marcada del día
  function sessMin(list){
    const ats=list.flatMap(e=>(Array.isArray(e.done)?e.done:[]).filter(d=>d&&d.at).map(d=>d.at));
    if(ats.length<2)return null;
    return Math.max(1,Math.round((Math.max(...ats)-Math.min(...ats))/60000));
  }
  // separa un día en sesiones: si pasan más de 30 min sin marcar series, empieza otra
  const GAP=30*60e3;
  const firstAt=e=>{const a=(Array.isArray(e.done)?e.done:[]).filter(d=>d&&d.at).map(d=>d.at);return a.length?Math.min(...a):null};
  function splitSessions(list){
    const ats=list.flatMap(e=>(Array.isArray(e.done)?e.done:[]).filter(d=>d&&d.at).map(d=>d.at)).sort((a,b)=>a-b);
    const iv=[];
    ats.forEach(t=>{const l=iv[iv.length-1];if(l&&t-l.end<=GAP)l.end=t;else iv.push({start:t,end:t})});
    if(!iv.length)return [{entries:list.slice(),start:null,end:null}];
    const groups=iv.map(x=>({start:x.start,end:x.end,entries:[]}));
    let pending=null;
    list.forEach(e=>{
      const t=firstAt(e)??e.createdAt??0;
      let g=groups.find(x=>t>=x.start-GAP&&t<=x.end+GAP);
      if(!g&&firstAt(e)==null&&t>groups[groups.length-1].end+GAP){pending=pending||{start:null,end:null,entries:[]};g=pending}
      if(!g)g=groups.reduce((best,x)=>Math.abs(t-x.start)<Math.abs(t-best.start)?x:best,groups[0]);
      g.entries.push(e);
    });
    if(pending)groups.push(pending);
    return groups.filter(x=>x.entries.length);
  }
  function sessLabel(g){
    if(g.start==null)return "Nueva sesión";
    const dt=new Date(g.start),h=dt.getHours();
    return (h<12?"Mañana":h<19?"Tarde":"Noche")+" · "+pad(h)+":"+pad(dt.getMinutes());
  }
  const sessDur=g=>g.start==null||g.end==null?null:Math.max(1,Math.round((g.end-g.start)/60000));
  function sessListHTML(groups){
    if(groups.length<2)return groups[0].entries.map(e=>entryHTML(e)).join("");
    return groups.map(g=>'<div class="sesshead">'+esc(sessLabel(g))+(sessDur(g)&&g.end>g.start?' <span>· '+fmtSess(sessDur(g))+'</span>':'')+'</div>'+g.entries.map(e=>entryHTML(e)).join("")).join("");
  }
  const fmtSess=m=>m>=60?Math.floor(m/60)+" h "+pad(m%60)+" min":m+" min";

  function renderToday(){
    const d=$("date").value||today;
    const list=entries.filter(e=>e.date===d).sort(byCreated);
    const groups=list.length?splitSessions(list):[];
    const sm=groups.length===1?sessDur(groups[0]):null;
    $("todayTitle").innerHTML="Ejercicios"+(groups.length>1?' <span class="sess">· '+groups.length+' sesiones</span>':'');void sm;
    renderDay(d);
    const cur=d>today?[]:(groups.length?groups[groups.length-1].entries:[]);
    renderNext(cur);
    const others=[...new Set(entries.map(e=>e.date))].filter(x=>x!==d);
    const canLoad=others.length||routines.length||list.length;
    $("repeatBtn").hidden=!canLoad;
    if(!canLoad)$("repeatBox").hidden=true;
    $("todayList").hidden=!list.length;$("emptyDay").hidden=!!list.length;
    $("sumBtn").hidden=!list.length;
    if(sumState&&!$("sumOv").hidden)renderSummary();
    const nx=findNext(cur);
    $("todayList").innerHTML=list.length?cardsHTML(groups,nx):"";
  }
  $("backToday").addEventListener("click",()=>goDay(today));
  // ---------- navegación de días ----------
  const addDays=(s,n)=>{const x=parse(s);x.setDate(x.getDate()+n);return iso(x)};
  function goDay(d){$("date").value=d;$("repeatBox").hidden=true;editEntry=null;editing=null;renderToday();window.scrollTo(0,0)}
  $("dayPrev").addEventListener("click",()=>goDay(addDays($("date").value||today,-1)));
  // ---------- calendario propio ----------
  let calMonth=null;
  function openCal(open){
    const pop=$("calPop");pop.hidden=!open;$("dayPick").setAttribute("aria-expanded",open?"true":"false");
    if(open){const d=parse($("date").value||today);calMonth=new Date(d.getFullYear(),d.getMonth(),1);renderCal()}
  }
  function renderCal(){
    const sel=$("date").value||today,has=new Set(entries.map(e=>e.date));
    const y=calMonth.getFullYear(),m=calMonth.getMonth();
    const first=new Date(y,m,1),startOff=(first.getDay()+6)%7;
    const start=new Date(y,m,1-startOff);
    let cells="";
    for(let k=0;k<42;k++){
      const dt=new Date(start.getFullYear(),start.getMonth(),start.getDate()+k),ds=iso(dt);
      if(k>=35&&dt.getMonth()!==m)break;
      const cls=[dt.getMonth()!==m?"other":"",has.has(ds)?"has":"",ds===today?"istoday":"",ds===sel?"sel":""].filter(Boolean).join(" ");
      cells+='<button type="button" class="'+cls+'" data-cd="'+ds+'" aria-label="'+esc(dt.toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"}))+(has.has(ds)?", con registros":"")+'"'+(ds===sel?' aria-current="date"':'')+'>'+dt.getDate()+'</button>';
    }
    $("calPop").innerHTML='<div class="calhead"><button type="button" class="iconbtn" data-cm="-1" aria-label="Mes anterior">‹</button><b>'+esc(first.toLocaleDateString("es-CL",{month:"long",year:"numeric"}))+'</b><button type="button" class="iconbtn" data-cm="1" aria-label="Mes siguiente">›</button></div>'+
      '<div class="calgrid">'+["L","M","M","J","V","S","D"].map(x=>'<span class="wd">'+x+'</span>').join("")+cells+'</div>'+
      '<div class="calfoot"><span><i></i>Días con registros</span><button type="button" class="btnlike" data-cd="'+today+'">Ir a hoy</button></div>';
  }
  $("dayPick").addEventListener("click",()=>openCal($("calPop").hidden));
  $("calPop").addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    if(b.dataset.cm){calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+Number(b.dataset.cm),1);renderCal();return}
    if(b.dataset.cd){openCal(false);goDay(b.dataset.cd)}
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("calPop").hidden)openCal(false)});
  $("dayNext").addEventListener("click",()=>goDay(addDays($("date").value||today,1)));
  function renderDay(d){
    const diff=Math.round((parse(d)-parse(today))/864e5);
    const main=diff===0?"Hoy":diff===-1?"Ayer":diff===1?"Mañana":parse(d).toLocaleDateString("es-CL",{weekday:"long"});
    const kind=diff===0?"istoday":diff<0?"past":"future";
    $("dayNav").className="daynav "+kind;
    $("dayMain").textContent=main;
    $("daySub").textContent=parse(d).toLocaleDateString("es-CL",{weekday:diff>=-1&&diff<=1?"long":undefined,day:"numeric",month:"long",year:parse(d).getFullYear()!==new Date().getFullYear()?"numeric":undefined});
    const st=$("dayState");st.hidden=diff===0;st.className="daystate "+(diff<0?"past":"future");
    $("dayStateTxt").textContent=diff<0?"":"Planificando un día futuro";
    const short=parse(d).toLocaleDateString("es-CL",{weekday:"short",day:"numeric",month:"short"});
    $("submitBtn").textContent=diff===0?"Agregar a hoy":"Agregar al "+short;
    $("addFor").innerHTML="Para <b>"+esc(diff===0?"hoy, "+fmtDay(d):fmtDay(d))+"</b>";
  }
  $("date").addEventListener("change",()=>goDay($("date").value||today));

  // ---------- resumen para compartir ----------
  let sumState=null; // {date,gi}
  const LOGO_SVG='<img class="slogo" src="/icons/icon-192.png" alt="" aria-hidden="true">';
  function fmtClock(ms){const t=Math.max(0,Math.round(ms/1000)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),sec=t%60;return h?h+":"+pad(m)+":"+pad(sec):m+":"+pad(sec)}
  function sumGroup(){
    const list=entries.filter(e=>e.date===sumState.date).sort(byCreated);
    const groups=list.length?splitSessions(list):[];
    const gi=Math.min(sumState.gi??groups.length-1,groups.length-1);
    return {groups,gi,g:groups[gi]};
  }
  function setLine(e,d){
    if(d.w!=null&&d.r!=null)return fmtN(d.w)+"×"+d.r;
    const P=setParts(e,d);return P.map(p=>p.txt.replace(/^×/,"")).join(" ");
  }
  function renderSummary(){
    const {groups,gi,g}=sumGroup(),card=$("sumCard");
    const d=sumState.date,isT=d===today;
    const dayTxt=parse(d).toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"});
    if(!g){card.innerHTML='<div class="sh"><div class="shtop">'+LOGO_SVG+'<div><b id="sumTitle">Resumen</b><span>'+esc(dayTxt)+'</span></div></div><button type="button" class="shx" data-sum="close" aria-label="Cerrar">✕</button></div><p class="sempty">Todavía no hay ejercicios en esta sesión.</p>';return}
    const live=isT&&g.start&&g.end&&Date.now()-g.end<GAP;
    const durMs=g.start?((live?Date.now():g.end)-g.start):null;
    let done=0,total=0,vol=0;
    g.entries.forEach(e=>{const ds=doneArr(e);total+=ds.length;ds.forEach(x=>{if(x){done++;if(x.w!=null&&x.r!=null)vol+=x.w*x.r}})});
    const prs=g.entries.filter(e=>recIds.has(e.id)).length;
    const startTxt=g.start?new Date(g.start).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit",hour12:false}):"";
    const rows=g.entries.map(e=>{
      const ds=doneArr(e),hechas=ds.filter(Boolean),r=imgOf(e.name);
      const lines=hechas.map(x=>setLine(e,x));
      const pend=ds.length-hechas.length;
      const orm=valOf(e,"orm"),best=hechas.some(x=>x.w!=null&&x.r!=null)?orm:null;
      const detail=lines.length?lines.join(" · "):(planText(e)?"Plan: "+(e.sets?e.sets+"× ":"")+planText(e):"Sin series");
      return '<div class="srow"><span class="sth">'+(r?mediaHTML(r):esc((e.name||"?").charAt(0).toUpperCase()))+'</span>'+
        '<span class="sinfo"><b>'+esc(e.name)+(recIds.has(e.id)?' <span class="pr">★ Récord</span>':'')+'</b><span>'+esc(detail)+'</span></span>'+
        '<span class="sside">'+(ds.length?'<b class="'+(pend?"pend":"ok")+'">'+hechas.length+'/'+ds.length+(pend?"":" ✓")+'</b>':'')+(best?'<small>1RM '+fmtN(r1(best))+' kg</small>':'')+'</span></div>';
    }).join("");
    card.innerHTML='<div class="sh"><div class="shtop">'+LOGO_SVG+'<div><b id="sumTitle">Trainly</b><span>'+esc(dayTxt)+(groups.length>1?" · "+esc(sessLabel(g).split(" · ")[0]):"")+'</span></div></div>'+
      '<button type="button" class="shx" data-sum="close" aria-label="Cerrar">✕</button>'+
      '<div class="durrow"><div class="dur"><b id="sumDur">'+(durMs!=null?fmtClock(durMs):"—")+'</b><small>'+(live?'<span class="live"><i></i>En curso</span> · desde '+startTxt:durMs!=null?"Duración · desde "+startTxt:"Sin series marcadas")+'</small></div>'+ringSVG(done,total,84,8,'<span style="font-size:1.25rem">'+done+'<small>/'+total+'</small></span>')+'</div></div>'+
      (groups.length>1?'<div class="stabs">'+groups.map((x,k)=>'<button type="button" data-sg="'+k+'" aria-pressed="'+(k===gi)+'">'+esc(sessLabel(x).split(" · ")[0])+'</button>').join("")+'</div>':'')+
      '<div class="sgrid"><div><b>'+g.entries.length+'</b><small>'+(g.entries.length===1?"ejercicio":"ejercicios")+'</small></div><div><b>'+done+'<span style="font-size:.9rem;color:var(--muted)">/'+total+'</span></b><small>series</small></div><div><b>'+Math.round(vol).toLocaleString("es-CL")+'</b><small>kg volumen</small></div><div class="gold"><b>'+prs+'</b><small>★ récords</small></div></div>'+
      '<div class="slist">'+rows+'</div>'+
      '<div class="sfoot"><span>Trainly</span><span>'+esc(parse(d).toLocaleDateString("es-CL",{day:"numeric",month:"short",year:"numeric"}))+'</span></div>';
    card.dataset.live=live?"1":"";card.dataset.start=g.start||"";
  }
  function sumData(){
    const {groups,gi,g}=sumGroup(),d=sumState.date,isT=d===today;
    const out={day:parse(d).toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"}),foot:parse(d).toLocaleDateString("es-CL",{day:"numeric",month:"short",year:"numeric"}),sess:groups.length>1&&g?sessLabel(g).split(" · ")[0]:"",rows:[]};
    if(!g)return out;
    const live=isT&&g.start&&g.end&&Date.now()-g.end<GAP,durMs=g.start?((live?Date.now():g.end)-g.start):null;
    const startTxt=g.start?new Date(g.start).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit",hour12:false}):"";
    let done=0,total=0,vol=0;
    g.entries.forEach(e=>{const ds=doneArr(e);total+=ds.length;ds.forEach(x=>{if(x){done++;if(x.w!=null&&x.r!=null)vol+=x.w*x.r}})});
    Object.assign(out,{live,dur:durMs!=null?fmtClock(durMs):"—",durLabel:live?"En curso · desde "+startTxt:durMs!=null?"Duración · desde "+startTxt:"Sin series marcadas",
      nEx:g.entries.length,done,total,vol:Math.round(vol),prs:g.entries.filter(e=>recIds.has(e.id)).length});
    out.rows=g.entries.map(e=>{
      const ds=doneArr(e),h=ds.filter(Boolean),r=imgOf(e.name);
      const best=h.some(x=>x.w!=null&&x.r!=null)?valOf(e,"orm"):null;
      return {name:e.name,pr:recIds.has(e.id),img:r?srcOf(r):null,vid:!!(r&&isVid(r)),
        detail:h.length?h.map(x=>setLine(e,x)).join(" · "):(planText(e)?"Plan: "+(e.sets?e.sets+"× ":"")+planText(e):"Sin series"),
        side:ds.length?h.length+"/"+ds.length+(h.length===ds.length?" ✓":""):"",complete:ds.length&&h.length===ds.length,orm:best?"1RM "+fmtN(r1(best))+" kg":""};
    });
    return out;
  }
  function sumText(){
    const D=sumData();
    let t="🏋️ Sesión · "+D.day+(D.sess?" ("+D.sess.toLowerCase()+")":"")+"\n";
    if(!D.rows.length)return t+"Sin ejercicios todavía.";
    t+="⏱ "+D.dur+" · "+D.nEx+(D.nEx===1?" ejercicio":" ejercicios")+" · "+D.done+"/"+D.total+" series"+(D.vol?" · "+D.vol.toLocaleString("es-CL")+" kg de volumen":"")+(D.prs?" · ★ "+D.prs+(D.prs===1?" récord":" récords"):"")+"\n\n";
    t+=D.rows.map(r=>"• "+r.name+(r.pr?" ★":"")+": "+r.detail+(r.orm?" ("+r.orm+")":"")+(r.side&&!r.complete?" — "+r.side.replace(" ✓","")+" series":"")).join("\n");
    return t;
  }
  $("sumTxt").addEventListener("click",()=>{
    const t=sumText(),b=$("sumTxt");
    const ok=()=>{b.textContent="¡Copiado!";setTimeout(()=>{b.textContent="Copiar texto"},1800)};
    try{navigator.clipboard.writeText(t).then(ok,()=>fallbackCopy(t)&&ok())}catch(e){if(fallbackCopy(t))ok()}
  });
  function fallbackCopy(t){
    const ta=document.createElement("textarea");ta.value=t;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();
    let ok=false;try{ok=document.execCommand("copy")}catch(e){}
    ta.remove();
    if(!ok)toast("No se pudo copiar. Mantén presionado el texto para copiarlo.");
    return ok;
  }
  // imagen PNG dibujada a mano en canvas (no depende de librerías)
  function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
  function wrapText(ctx,text,maxW){
    const words=String(text).split(" "),lines=[];let cur="";
    words.forEach(w=>{const t=cur?cur+" "+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w}else cur=t});
    if(cur)lines.push(cur);return lines;
  }
  const loadImg=src=>new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=src});
  // primer cuadro de un video, para dibujarlo como miniatura
  const loadFrame=src=>new Promise(res=>{
    const v=document.createElement("video");let done=false;const fin=x=>{if(!done){done=true;res(x)}};
    v.muted=true;v.playsInline=true;v.preload="auto";v.setAttribute("playsinline","");
    v.onloadeddata=()=>{try{v.currentTime=Math.min(.2,(v.duration||1)/2)}catch(e){fin(v)}};
    v.onseeked=()=>fin(v.videoWidth?v:null);v.onerror=()=>fin(null);
    setTimeout(()=>fin(v.videoWidth?v:null),4000);
    v.src=src;try{v.load()}catch(e){}
  });
  function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  async function buildPNG(withImages){
    const D=sumData(),C={accent:cssVar("--accent"),ai:cssVar("--accent-ink"),bg:cssVar("--surface"),bg2:cssVar("--surface2"),ink:cssVar("--ink"),muted:cssVar("--muted"),line:cssVar("--line"),ok:cssVar("--ok"),gold:cssVar("--gold"),goldsoft:cssVar("--goldsoft"),media:cssVar("--media")};
    const DISP='"Barlow Condensed","Arial Narrow",sans-serif',BODY='"Barlow",system-ui,sans-serif';
    try{await Promise.all(['800 160px "Barlow Condensed"','700 48px "Barlow Condensed"','600 38px "Barlow"','400 32px "Barlow"'].map(f=>document.fonts.load(f)))}catch(e){}
    const W=1080,P=64,meas=document.createElement("canvas").getContext("2d");
    meas.font="400 32px "+BODY;
    const rows=D.rows.map(r=>{const lines=wrapText(meas,r.detail,W-P*2-120-200).slice(0,3);return Object.assign({lines,h:Math.max(124,64+lines.length*40)},r)});
    const HEAD=400,STATS=D.rows.length?190:0,LIST=rows.reduce((a,r)=>a+r.h,0)+(rows.length?24:120),FOOT=96;
    const H=HEAD+STATS+LIST+FOOT;
    const cv=document.createElement("canvas");cv.width=W;cv.height=H;const ctx=cv.getContext("2d");
    ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
    // cabecera
    ctx.fillStyle=C.accent;ctx.fillRect(0,0,W,HEAD);
    ctx.fillStyle=C.ai;ctx.globalAlpha=.18;rr(ctx,P,56,84,84,20);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle=C.ai;[[P+14,82,10,32],[P+60,82,10,32],[P+7,89,7,18],[P+70,89,7,18],[P+24,95,36,6]].forEach(a=>{rr(ctx,a[0],a[1],a[2],a[3],3);ctx.fill()});
    ctx.font="800 40px "+DISP;ctx.textBaseline="alphabetic";ctx.fillText("BITÁCORA DE ENTRENO",P+112,92);
    ctx.font="500 32px "+BODY;ctx.globalAlpha=.88;const dayCap=D.day.charAt(0).toUpperCase()+D.day.slice(1);ctx.fillText(dayCap+(D.sess?" · "+D.sess:""),P+112,134);ctx.globalAlpha=1;
    ctx.font="800 176px "+DISP;ctx.fillText(D.rows.length?D.dur:"—",P-4,318);
    if(D.rows.length&&D.total){const cx=W-P-80,cy=258,rad=72;ctx.lineWidth=14;ctx.lineCap="round";
      ctx.strokeStyle=C.ai;ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(cx,cy,rad,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,D.done/D.total));ctx.stroke();
      ctx.textAlign="center";ctx.fillStyle=C.ai;ctx.font="800 56px "+DISP;ctx.fillText(D.done+"/"+D.total,cx,cy+20);ctx.textAlign="left"}
    ctx.font="700 30px "+BODY;ctx.globalAlpha=.9;ctx.fillText((D.durLabel||"Sin ejercicios").toUpperCase(),P,366);ctx.globalAlpha=1;
    let y=HEAD;
    if(D.rows.length){
      const cells=[[String(D.nEx),D.nEx===1?"EJERCICIO":"EJERCICIOS",C.ink],[D.done+"/"+D.total,"SERIES",C.ink],[D.vol.toLocaleString("es-CL"),"KG VOLUMEN",C.ink],[String(D.prs),"★ RÉCORDS",C.gold]];
      const cw=W/4;
      cells.forEach((c,i)=>{const cx=cw*i+cw/2;ctx.textAlign="center";ctx.fillStyle=c[2];ctx.font="700 64px "+DISP;ctx.fillText(c[0],cx,y+100);ctx.fillStyle=C.muted;ctx.font="600 24px "+BODY;ctx.fillText(c[1],cx,y+144);
        if(i){ctx.fillStyle=C.line;ctx.fillRect(cw*i,y+36,2,STATS-72)}});
      ctx.textAlign="left";ctx.fillStyle=C.line;ctx.fillRect(0,y+STATS-2,W,2);y+=STATS;
    }
    y+=12;
    if(!rows.length){ctx.fillStyle=C.muted;ctx.font="400 34px "+BODY;ctx.textAlign="center";ctx.fillText("Todavía no hay ejercicios en esta sesión.",W/2,y+70);ctx.textAlign="left";y+=108}
    const raw=withImages?await Promise.all(rows.map(r=>r.img?(r.vid?loadFrame(r.img):loadImg(r.img)):null)):rows.map(()=>null);
    // cada miniatura pasa por su propio lienzo; si una no se puede usar, se omite solo esa
    const imgs=raw.map(im=>{
      if(!im)return null;
      try{
        const iw=im.videoWidth||im.naturalWidth||im.width,ih=im.videoHeight||im.naturalHeight||im.height;if(!iw||!ih)return null;
        const t=document.createElement("canvas");t.width=192;t.height=192;const tc=t.getContext("2d");
        tc.fillStyle=C.media;tc.fillRect(0,0,192,192);const sc=Math.min(192/iw,192/ih);
        tc.drawImage(im,(192-iw*sc)/2,(192-ih*sc)/2,iw*sc,ih*sc);tc.getImageData(0,0,1,1);return t;
      }catch(e){return null}
    });
    rows.forEach((r,i)=>{
      const ty=y+20;
      ctx.fillStyle=C.bg2;rr(ctx,P,ty,96,96,18);ctx.fill();
      if(imgs[i]){ctx.save();rr(ctx,P,ty,96,96,18);ctx.clip();ctx.fillStyle=C.media;ctx.fillRect(P,ty,96,96);ctx.drawImage(imgs[i],P,ty,96,96);ctx.restore()}
      else{ctx.fillStyle=C.muted;ctx.font="700 48px "+DISP;ctx.textAlign="center";ctx.fillText((r.name||"?").charAt(0).toUpperCase(),P+48,ty+66);ctx.textAlign="left"}
      const tx=P+120,maxW=W-P*2-120-200;
      ctx.fillStyle=C.ink;ctx.font="600 38px "+BODY;
      let nm=r.name;while(ctx.measureText(nm).width>maxW-(r.pr?150:0)&&nm.length>3)nm=nm.slice(0,-2);if(nm!==r.name)nm=nm.trim()+"…";
      ctx.fillText(nm,tx,ty+40);
      if(r.pr){const nw=ctx.measureText(nm).width;ctx.font="700 22px "+BODY;const bw=ctx.measureText("★ RÉCORD").width+28;ctx.fillStyle=C.goldsoft;rr(ctx,tx+nw+14,ty+8,bw,40,8);ctx.fill();ctx.fillStyle=C.gold;ctx.fillText("★ RÉCORD",tx+nw+28,ty+36)}
      ctx.fillStyle=C.muted;ctx.font="400 32px "+BODY;r.lines.forEach((l,k)=>ctx.fillText(l,tx,ty+84+k*40));
      ctx.textAlign="right";
      if(r.side){ctx.fillStyle=r.complete?C.ok:C.muted;ctx.font="700 44px "+DISP;ctx.fillText(r.side,W-P,ty+44)}
      if(r.orm){ctx.fillStyle=C.muted;ctx.font="500 26px "+BODY;ctx.fillText(r.orm,W-P,ty+84)}
      ctx.textAlign="left";
      y+=r.h;
      if(i<rows.length-1){ctx.fillStyle=C.line;ctx.fillRect(P,y,W-P*2,2)}
    });
    y=H-FOOT;ctx.fillStyle=C.bg2;ctx.fillRect(0,y,W,FOOT);ctx.fillStyle=C.line;ctx.fillRect(0,y,W,2);
    ctx.fillStyle=C.muted;ctx.font="500 26px "+BODY;ctx.fillText("Trainly",P,y+58);ctx.textAlign="right";ctx.fillText(D.foot,W-P,y+58);ctx.textAlign="left";
    return await new Promise((res,rej)=>{try{cv.toBlob(b=>b?res(b):rej(new Error("blob")),"image/png")}catch(e){rej(e)}});
  }
  $("sumImg").addEventListener("click",async()=>{
    const b=$("sumImg");b.disabled=true;b.textContent="Generando…";
    try{
      let blob;
      try{blob=await buildPNG(true)}catch(e){blob=await buildPNG(false)} // si alguna miniatura bloquea el lienzo, sale sin miniaturas
      const fname="sesion-"+sumState.date+".png";
      if(downloads){
        try{await downloads.save({filename:fname,data:blob});toast("Imagen guardada");return}
        catch(e){if(e&&e.code==="declined")return;if(e&&e.code==="rate_limited"){toast("Espera un momento e inténtalo de nuevo.");return}}
      }
      // sin descargas: mostrar la imagen para guardarla con presión larga
      const url=URL.createObjectURL(blob);$("sumPrevImg").src=url;$("sumPrev").hidden=false;$("sumPrev").scrollIntoView({block:"nearest",behavior:"smooth"});
    }catch(e){toast("No se pudo generar la imagen. Inténtalo de nuevo.")}
    finally{b.disabled=false;b.textContent="Descargar imagen"}
  });
  function openSummary(open){
    if(open){sumState={date:$("date").value||today,gi:null};renderSummary();$("sumOv").hidden=false;$("sumPrev").hidden=true;const x=$("sumCard").querySelector(".shx");if(x)x.focus()}
    else{$("sumOv").hidden=true;sumState=null}
  }
  $("sumBtn").addEventListener("click",()=>openSummary(true));
  $("sumOv").addEventListener("click",e=>{
    const b=e.target.closest("[data-sum],[data-sg]");
    if(b&&b.dataset.sg!=null){sumState.gi=+b.dataset.sg;$("sumPrev").hidden=true;renderSummary();return}
    if((b&&b.dataset.sum==="close")||e.target.id==="sumOv")openSummary(false);
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("sumOv").hidden)openSummary(false)});
  setInterval(()=>{if(sumState&&$("sumCard").dataset.live==="1"){const st=+$("sumCard").dataset.start;if(st)$("sumDur").textContent=fmtClock(Date.now()-st)}},1000);

  // ---------- rutinas y sesiones anteriores ----------
  const planOf=e=>({name:e.name,sets:e.sets??null,reps:e.reps??null,weight:e.weight??null,mins:e.mins??null,dist:e.dist??null});
  // ---------- pestaña Rutinas ----------
  let rutEdit=null;
  const openRuts=new Set();let rutPick=null;
  // elegir fecha para cargar la rutina: próximos días con un toque, o cualquier fecha
  function rutPickHTML(id){
    let chips="";
    for(let k=1;k<=7;k++){const d=new Date(parse(today));d.setDate(d.getDate()+k);const ds=iso(d),has=entries.some(e=>e.date===ds);
      chips+='<button type="button" data-rtload="'+esc(id)+'" data-rd="'+ds+'"'+(has?' class="has"':'')+'><small>'+d.toLocaleDateString("es-CL",{weekday:"short"}).replace(".","")+'</small><b>'+d.getDate()+'</b></button>'}
    return '<div class="rutpick"><div class="rpchips">'+chips+'</div><label class="rpother">Otra: <input type="date" data-rtdate="'+esc(id)+'" min="'+iso(new Date(parse(today).getFullYear()-1,0,1))+'"></label><p class="hint">Los días con punto ya tienen ejercicios: se suman a lo que hay.</p></div>';
  }
  function renderRoutinesTab(){
    const box=$("rutList"),d=$("date").value||today;
    const tgt=d===today?"hoy":parse(d).toLocaleDateString("es-CL",{weekday:"short",day:"numeric",month:"short"});
    $("rutTarget").textContent=routines.length?"Abre una rutina y cárgala hoy o en la fecha que quieras.":"";void d;
    if(!routines.length){
      box.innerHTML='<div class="empty rutempty">'+SAVEIC+'<p><b>Aún no tienes rutinas guardadas.</b></p><p>Guarda un día de entrenamiento para repetirlo con un toque. Puedes hacerlo desde <b>Historial</b> (abre un día y toca “Guardar este día como rutina”) o desde la sesión con el botón <b>Rutinas</b>.</p></div>';return;
    }
    box.innerHTML=routines.map((r,ri)=>{
      const ed=rutEdit===r.id;
      const rows=r.items.map((it,ii)=>{const im=imgOf(it.name),cat=CATMAP[catOf(it.name)];
        return '<div class="rutex">'+(im?mediaHTML(im,"mini"):'<span class="rletter" style="border-color:'+cat[2]+'">'+esc(it.name.charAt(0).toUpperCase())+'</span>')+
          '<div><b>'+esc(it.name)+'</b><span>'+esc((it.sets?it.sets+(it.sets==1?" serie":" series"):"")+(planText(it)?(it.sets?" · ":"")+planText(it):""))+'</span></div>'+
          (ed?'<button type="button" class="iconbtn" data-rxdel="'+ii+'" data-rid="'+esc(r.id)+'" aria-label="Quitar '+esc(it.name)+' de la rutina">✕</button>':'')+'</div>'}).join("");
      const mus=[...new Set(r.items.map(it=>catOf(it.name)))].filter(c=>c!=="otro").map(c=>'<span class="catchip"><span class="catdot" style="background:'+CATMAP[c][2]+'"></span>'+CATMAP[c][1]+'</span>').join("");
      const names=r.items.map(it=>it.name).join(" · ");
      return '<details class="day rutday" data-rut="'+esc(r.id)+'"'+(ed||openRuts.has(r.id)?' open':'')+'><summary><h3>'+esc(r.name)+'</h3><span class="cnt">'+r.items.length+(r.items.length===1?" ejercicio":" ejercicios")+'</span><span class="names">'+esc(names)+'</span></summary>'+
        '<div class="list rutbody">'+
        '<div class="hbar">'+(ed?'<input class="rutname" data-rname="'+esc(r.id)+'" value="'+esc(r.name)+'" aria-label="Nombre de la rutina">':'<span>'+(mus?'<span class="rutmus">'+mus+'</span>':'')+'</span>')+
        '<button type="button" class="'+(ed?'btnlike solid':'iconbtn hed')+'" data-redit="'+esc(r.id)+'" aria-label="'+(ed?'Terminar de editar':'Editar rutina')+'">'+(ed?"Listo":PENCIL)+'</button></div>'+
        '<div class="rutexs">'+rows+'</div>'+
        (ed?'<div class="rutfoot"><button type="button" class="dangerbtn" data-rtdel="'+esc(r.id)+'">'+TRASH+' Borrar rutina</button></div>':
          '<div class="rutloads"><button type="button" class="primary rutload" data-rtload="'+esc(r.id)+'" data-rd="'+today+'">Cargar hoy</button><button type="button" class="btnlike" data-rtpick="'+esc(r.id)+'" aria-expanded="'+(rutPick===r.id)+'">Otra fecha ▾</button></div>'+(rutPick===r.id?rutPickHTML(r.id):''))+
        '</div></details>';
    }).join("");
  }
  $("rutList").addEventListener("click",async e=>{
    const b=e.target.closest("button");if(!b)return;
    const find=id=>routines.findIndex(r=>r.id===id);
    if(b.dataset.redit){
      const id=b.dataset.redit;
      if(rutEdit===id){const inp=document.querySelector('[data-rname="'+id+'"]'),i=find(id);rutEdit=null;
        if(inp&&i>=0&&inp.value.trim()&&inp.value.trim()!==routines[i].name){const l=routines.slice();l[i]=Object.assign({},l[i],{name:inp.value.trim()});await store.setRoutines(l)}else renderRoutinesTab();return}
      rutEdit=id;renderRoutinesTab();return;
    }
    if(b.dataset.rxdel!=null){const i=find(b.dataset.rid);if(i<0)return;const l=routines.slice(),r=Object.assign({},l[i]);r.items=r.items.filter((_,k)=>k!==+b.dataset.rxdel);l[i]=r;await store.setRoutines(l);return}
    if(b.dataset.rtdel){const i=find(b.dataset.rtdel);if(i<0)return;const r=routines[i];rutEdit=null;await store.setRoutines(routines.filter((_,k)=>k!==i));
      toast("Rutina borrada: "+r.name,false,{label:"Deshacer",fn:async()=>{await store.setRoutines(routines.concat([r]))}});return}
    if(b.dataset.rtpick){rutPick=rutPick===b.dataset.rtpick?null:b.dataset.rtpick;renderRoutinesTab();return}
    if(b.dataset.rtload){const r=routines[find(b.dataset.rtload)];if(!r)return;b.disabled=true;await loadRutOn(r,b.dataset.rd||today)}
  });
  async function loadRutOn(r,d){
    rutPick=null;
    await addPlans(r.items,"“"+r.name+"”"+(d===today?"":" para el "+fmtDay(d)),d);
    showTab("anotar");goDay(d);
  }
  $("rutList").addEventListener("change",e=>{const id=e.target.dataset&&e.target.dataset.rtdate;if(!id||!e.target.value)return;const r=routines.find(x=>x.id===id);if(r)loadRutOn(r,e.target.value)});
  $("rutList").addEventListener("toggle",e=>{const d=e.target.closest&&e.target.closest(".rutday");if(!d)return;d.open?openRuts.add(d.dataset.rut):openRuts.delete(d.dataset.rut)},true);
  $("rutList").addEventListener("keydown",e=>{if(e.target.dataset&&e.target.dataset.rname&&e.key==="Enter"){e.preventDefault();const b=document.querySelector('[data-redit="'+e.target.dataset.rname+'"]');if(b)b.click()}});

  function renderLoadBox(){
    const box=$("repeatBox"),d=$("date").value||today;
    const list=entries.filter(e=>e.date===d).sort(byCreated);
    const days=[...new Set(entries.map(e=>e.date))].filter(x=>x!==d).sort().reverse().slice(0,6);
    const rout=routines.map((r,ri)=>'<div class="reprow"><div><b>'+esc(r.name)+'</b><span>'+esc(r.items.map(x=>x.name).join(" · "))+'</span></div><span class="rbtns"><button type="button" class="btnlike solid" data-rload="'+ri+'">Cargar</button><button type="button" class="iconbtn" data-rdel="'+ri+'" aria-label="Borrar rutina '+esc(r.name)+'">'+TRASH+'</button></span></div>').join("");
    const prev=days.map(x=>{const gs=splitSessions(entries.filter(e=>e.date===x).sort(byCreated));
      return gs.map((g,gi)=>'<div class="reprow"><div><b>'+esc(fmtDay(x))+(gs.length>1?' · '+esc(sessLabel(g).split(" · ")[0]):'')+'</b><span>'+esc([...new Set(g.entries.map(e=>e.name))].join(" · "))+'</span></div><span class="rbtns"><button type="button" class="btnlike" data-copy="'+x+'" data-g="'+gi+'">Copiar</button><button type="button" class="iconbtn rstar" data-rfrom="'+x+'" data-g="'+gi+'" aria-label="Guardar esta sesión como rutina" title="Guardar como rutina">'+SAVEIC+'</button></span></div>').join("")}).join("");
    box.innerHTML=
      '<div class="lbhead"><h3>Mis rutinas</h3>'+(list.length?'<button type="button" class="linkbtn" data-rsave-open="1">+ Guardar '+(d===today?"la de hoy":"este día")+'</button>':'')+'</div>'+
      '<div class="rsavebox" id="rSave"'+(saveSrc?'':' hidden')+'><small id="rSaveFor">'+(saveSrc?esc(saveLabel()):'')+'</small><div class="rsave"><input id="rName" placeholder="Nombre, ej: Día 2 · Piernas" aria-label="Nombre de la rutina" autocomplete="off"><button type="button" class="btnlike solid" data-rsave="1">Guardar</button></div></div>'+
      (rout||'<p class="hint">Guarda una sesión como rutina (por ejemplo “Día A”) para cargarla con un toque cuando el entrenador la repita.</p>')+
      (prev?'<h3 class="lbsub">Sesiones anteriores</h3>'+prev:'')+
      '<p class="hint">Se cargan los ejercicios con series, reps y peso pedidos, sin marcar, en '+esc(d===today?"hoy":fmtDay(d))+'.</p>';
  }
  const SAVEIC='<svg viewBox="0 0 24 24" class="svic" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/><path d="M12 7v6M9 10h6"/></svg>';
  // qué sesión se guarda como rutina: cualquier día (y sesión, si hubo mañana y tarde)
  let saveSrc=null;
  const srcItems=src=>{const l=entries.filter(e=>e.date===src.date).sort(byCreated);if(src.g==null)return l;const gs=splitSessions(l);return (gs[src.g]||{entries:[]}).entries};
  function saveLabel(){if(!saveSrc)return "";const gs=splitSessions(entries.filter(e=>e.date===saveSrc.date).sort(byCreated));return "Guardando: "+fmtDay(saveSrc.date)+(saveSrc.g!=null&&gs.length>1?" · "+sessLabel(gs[saveSrc.g]).split(" · ")[0]:"")+" ("+srcItems(saveSrc).length+(srcItems(saveSrc).length===1?" ejercicio)":" ejercicios)")}
  function nextRoutineName(){let n=routines.length+1;while(routines.some(r=>norm(r.name)===norm("Día "+n)))n++;return "Día "+n}
  function openSaveFor(src){saveSrc=src;renderLoadBox();$("repeatBox").hidden=false;$("rName").value=nextRoutineName();setTimeout(()=>{$("rName").focus();$("rName").select();$("rSave").scrollIntoView({block:"center",behavior:"smooth"})},30)}
  $("repeatBtn").addEventListener("click",()=>{const box=$("repeatBox");if(!box.hidden){box.hidden=true;saveSrc=null;return}saveSrc=null;renderLoadBox();box.hidden=false});
  async function addPlans(items,label,date){
    const d=date||$("date").value||today;let n=0;const base=Date.now();
    try{for(const it of items){await store.add(Object.assign(planOf(it),{date:d,memo:"",createdAt:base+n}));n++}
      $("repeatBox").hidden=true;toast((n===1?"Cargado 1 ejercicio":"Cargados "+n+" ejercicios")+" de "+label);}
    catch(err){toast("Se cargaron "+n+" de "+items.length+". Inténtalo de nuevo para el resto.")}
  }
  $("repeatBox").addEventListener("click",async ev=>{
    const b=ev.target.closest("button");if(!b)return;
    if(b.dataset.rsaveOpen){if(saveSrc&&saveSrc.g==null&&saveSrc.date===($("date").value||today)){saveSrc=null;renderLoadBox();return}openSaveFor({date:$("date").value||today,g:null});return}
    if(b.dataset.rfrom){openSaveFor({date:b.dataset.rfrom,g:+b.dataset.g});return}
    if(b.dataset.rsave){
      const name=$("rName").value.trim();if(!name){$("rName").focus();return}
      const items=srcItems(saveSrc||{date:$("date").value||today,g:null}).map(planOf);
      if(!items.length){toast("Esa sesión no tiene ejercicios.");return}
      saveSrc=null;
      const ex=routines.findIndex(r=>norm(r.name)===norm(name));
      const list=routines.slice();const r={id:"r"+Date.now().toString(36),name,items};
      if(ex>=0)list[ex]=Object.assign(r,{id:routines[ex].id});else list.push(r);
      await store.setRoutines(list);toast((ex>=0?"Rutina actualizada: ":"Rutina guardada: ")+name);renderLoadBox();return;
    }
    if(b.dataset.rload!=null){const r=routines[+b.dataset.rload];if(!r)return;b.disabled=true;await addPlans(r.items,"“"+r.name+"”");return}
    if(b.dataset.rdel!=null){
      const ri=+b.dataset.rdel,r=routines[ri];if(!r)return;
      await store.setRoutines(routines.filter((_,k)=>k!==ri));renderLoadBox();
      toast("Rutina borrada: "+r.name,false,{label:"Deshacer",fn:async()=>{await store.setRoutines(routines.concat([r]));if(!$("repeatBox").hidden)renderLoadBox()}});return;
    }
    if(b.dataset.copy){
      b.disabled=true;
      const src=(splitSessions(entries.filter(e=>e.date===b.dataset.copy).sort(byCreated))[+b.dataset.g||0]||{entries:[]}).entries;
      await addPlans(src,fmtDay(b.dataset.copy));
    }
  });
  $("repeatBox").addEventListener("keydown",e=>{if(e.target.id==="rName"&&e.key==="Enter"){e.preventDefault();const b=$("repeatBox").querySelector("[data-rsave]");if(b)b.click()}});

  // ---------- constancia (12 semanas) ----------
  // calendario del historial: mes a mes, cada día entrenado marcado (más series = más intenso)
  let stkMonth=null;
  function renderStreak(){
    const card=$("streakCard");
    if(!entries.length){card.hidden=true;return}
    card.hidden=false;
    const setsBy={};entries.forEach(e=>{const n=doneArr(e).filter(Boolean).length||(!+e.sets&&e.date<=today?1:0);if(n)setsBy[e.date]=(setsBy[e.date]||0)+n});
    const planned=new Set(entries.filter(e=>e.date>today).map(e=>e.date));
    const now=parse(today),dow=(now.getDay()+6)%7,mon=new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow);
    // racha: semanas seguidas con al menos un día entrenado (si esta semana aún no, cuenta desde la anterior)
    const weekHas=w=>{for(let k=0;k<7;k++){const d=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()-7*w+k);if(setsBy[iso(d)])return true}return false};
    let streak=0,w=weekHas(0)?0:1;while(weekHas(w)&&w<200){streak++;w++}
    if(!stkMonth)stkMonth=new Date(now.getFullYear(),now.getMonth(),1);
    const y=stkMonth.getFullYear(),m=stkMonth.getMonth(),first=new Date(y,m,1),nDays=new Date(y,m+1,0).getDate(),lead=(first.getDay()+6)%7;
    const lv=n=>!n?"":n<6?"l1":n<13?"l2":"l3";
    let cells=["L","M","M","J","V","S","D"].map(L=>'<span class="cdh">'+L+'</span>').join("");
    for(let k=0;k<lead;k++)cells+='<span></span>';
    let mDays=0,mSets=0;
    for(let d=1;d<=nDays;d++){
      const ds=iso(new Date(y,m,d)),n=setsBy[ds]||0;if(n){mDays++;mSets+=n}
      const cls=[lv(n),ds===today?"tdy":"",ds>today?"fut":"",planned.has(ds)?"plan":""].filter(Boolean).join(" ");
      cells+='<button type="button" class="'+cls+'" data-hd="'+ds+'" aria-label="'+esc(fmtDay(ds))+(n?": "+n+(n===1?" serie":" series"):planned.has(ds)?": planificado":": sin entrenar")+'">'+d+'</button>';
    }
    let title=first.toLocaleDateString("es-CL",{month:"long",year:"numeric"});title=title.charAt(0).toUpperCase()+title.slice(1);
    const atNow=y===now.getFullYear()&&m===now.getMonth();
    // músculos trabajados esta semana
    const wk={};entries.filter(e=>parse(e.date)>=mon).forEach(e=>{const n=doneArr(e).filter(Boolean).length;if(n){const c=catOf(e.name);wk[c]=(wk[c]||0)+n}});
    const wkHtml=Object.keys(wk).sort((a,b)=>wk[b]-wk[a]).map(c=>'<span class="catchip"><span class="catdot" style="background:'+CATMAP[c][2]+'"></span>'+CATMAP[c][1]+' · '+wk[c]+'</span>').join("");
    card.innerHTML='<div class="stk-top"><div><b>'+streak+'<small>'+(streak===1?"semana":"semanas")+' seguidas</small></b></div><span>'+mDays+(mDays===1?" día":" días")+' en '+esc(first.toLocaleDateString("es-CL",{month:"long"}))+(mSets?' · '+mSets+' series':'')+'</span></div>'+
      '<div class="calhead"><button type="button" class="iconbtn" data-cm="-1" aria-label="Mes anterior">‹</button><b class="caltitle">'+esc(title)+'</b><button type="button" class="iconbtn" data-cm="1" aria-label="Mes siguiente"'+(atNow?' disabled':'')+'>›</button></div>'+
      '<div class="hcal">'+cells+'</div>'+
      '<div class="hlegend">Menos <i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i> Más series'+(planned.size?' · <i class="plan"></i> Planificado':'')+'</div>'+
      (wkHtml?'<div class="wkcats"><span>Esta semana:</span>'+wkHtml+'</div>':'');
  }
  $("streakCard").addEventListener("click",e=>{const b=e.target.closest("[data-cm]");if(!b)return;e.stopPropagation();stkMonth=new Date(stkMonth.getFullYear(),stkMonth.getMonth()+Number(b.dataset.cm),1);renderStreak()});
  $("history").addEventListener("click",e=>{const b=e.target.closest("[data-hsave]");if(!b)return;showTab("anotar");openSaveFor({date:b.dataset.hsave,g:null})});
  $("streakCard").addEventListener("click",e=>{const b=e.target.closest("[data-hd]");if(!b)return;showTab("anotar");goDay(b.dataset.hd)});

  // historial: vista compacta del día (para mirar al vuelo); el lápiz abre la edición completa
  const editDays=new Set();
  function compactSet(e,d){
    const st=setVerdict(e,d).state;
    let t;
    if(d.w!=null&&d.r!=null)t=fmtN(d.w)+"×"+d.r;
    else{const p=[];if(d.r!=null)p.push(d.r+" reps");if(d.w!=null)p.push(fmtN(d.w)+" kg");if(d.m!=null)p.push(fmtDist(d.m));if(d.t!=null)p.push(fmtDur(d.t));t=p.join(" · ")||"✓"}
    return '<span class="hs '+st+'">'+esc(t)+(st==="up"?"↑":st==="down"?"↓":"")+'</span>';
  }
  function dayCompactHTML(d,l){
    let sets=0,vol=0;
    l.forEach(e=>doneArr(e).forEach(x=>{if(x){sets++;if(x.w!=null&&x.r!=null)vol+=x.w*x.r}}));
    const rows=l.map(e=>{
      const r=imgOf(e.name),ds=doneArr(e),done=ds.filter(Boolean);
      const body=done.length?done.map(x=>compactSet(e,x)).join("")+(done.length<ds.length?'<span class="hs miss">'+(ds.length-done.length)+' sin hacer</span>':''):'<span class="hs plan">'+esc((e.sets?e.sets+"× ":"")+(planText(e)||"sin datos"))+(d<=today&&ds.length?' · sin marcar':'')+'</span>';
      return '<li><span class="hthumb">'+(r?mediaHTML(r):'<i>'+esc((e.name||"?").charAt(0).toUpperCase())+'</i>')+'</span><div><b>'+esc(e.name)+(recIds.has(e.id)?' <span class="pr">★</span>':'')+'</b><div class="hsets">'+body+'</div>'+(e.memo?'<small class="hmemo">'+esc(e.memo)+'</small>':'')+'</div></li>';
    }).join("");
    return '<div class="hcompact"><div class="hbar"><span>'+(sets?sets+(sets===1?" serie":" series")+(vol?' · '+Math.round(vol).toLocaleString("es-CL")+' kg':''):'Sin series marcadas')+'</span>'+
      '<button type="button" class="iconbtn hgo" data-hgo="'+d+'" aria-label="Abrir este día en Hoy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>'+
      '<button type="button" class="iconbtn hed" data-hedit="'+d+'" aria-label="Editar este día">'+PENCIL+'</button></div><ul class="hrows">'+rows+'</ul></div>';
  }
  $("history").addEventListener("click",e=>{
    const b=e.target.closest("[data-hedit],[data-hgo]");if(!b)return;
    if(b.dataset.hgo){showTab("anotar");goDay(b.dataset.hgo);return}
    const d=b.dataset.hedit;editDays.has(d)?editDays.delete(d):editDays.add(d);editEntry=null;editing=null;renderHistory();
  });
  function renderHistory(){
    renderStreak();
    const h=$("history");
    if(!entries.length){
      h.innerHTML='<div class="empty"><span class="tag">Ejemplo</span><p style="margin:0 0 8px">Aquí aparecerán tus sesiones agrupadas por día. Se verá así:</p>'+
        entryHTML({name:"Sentadilla con barra",sets:4,reps:10,weight:40,memo:"Bajar más profundo"},true)+
        entryHTML({name:"Plancha",sets:3,mins:1},true)+'</div>';
      $("moreBtn").hidden=true;return;
    }
    const byDay={};entries.forEach(e=>(byDay[e.date]=byDay[e.date]||[]).push(e));
    const allDays=Object.keys(byDay).sort().reverse();
    const daysToShow=allDays.slice(0,shownDays);
    let html="",lastMonth="";
    daysToShow.forEach(d=>{
      const m=d.slice(0,7);
      if(m!==lastMonth){html+='<div class="month">'+esc(fmtMonth(d))+'</div>';lastMonth=m}
      const l=byDay[d].sort(byCreated);
      const names=[...new Set(l.map(e=>e.name))].join(" · ");
      html+='<details class="day" data-d="'+d+'"'+(openDays.has(d)?' open':'')+'><summary><h3>'+(d===today?"Hoy · ":"")+esc(fmtDay(d))+'</h3><span class="cnt">'+l.length+(l.length===1?" ejercicio":" ejercicios")+(()=>{const gs=splitSessions(l);return gs.map(g=>sessDur(g)&&g.end>g.start?(gs.length>1?(sessLabel(g).split(" · ")[0]+" "):"")+fmtSess(sessDur(g)):"").filter(Boolean).map(x=>" · "+x).join("")})()+'</span><span class="names">'+esc(names)+'</span></summary>'+(editDays.has(d)
        ?'<div class="list"><div class="hbar"><span>Editando este día</span><button type="button" class="btnlike solid" data-hedit="'+d+'">Listo</button></div>'+sessListHTML(splitSessions(l))+'<button type="button" class="linkbtn hsave" data-hsave="'+d+'">'+SAVEIC+' Guardar este día como rutina</button></div>'
        :dayCompactHTML(d,l))+'</details>';
    });
    h.innerHTML=html;
    const left=allDays.length-daysToShow.length;
    $("moreBtn").hidden=left<=0;
    $("moreBtn").textContent="Ver días anteriores ("+left+")";
  }
  $("history").addEventListener("toggle",e=>{
    const d=e.target.closest&&e.target.closest(".day");if(!d)return;
    d.open?openDays.add(d.dataset.d):openDays.delete(d.dataset.d);
  },true);
  $("moreBtn").addEventListener("click",()=>{shownDays+=10;renderHistory()});

  // borrar registros (dos toques)
  document.addEventListener("click",async ev=>{
    const b=ev.target.closest(".del");if(!b)return;
    const e=entries.find(x=>x.id===b.dataset.id);if(!e)return;
    const copy=Object.assign({},e);delete copy.id;
    b.disabled=true;
    if(editEntry===e.id){editEntry=null;eeDraft={}}
    if(editing&&editing.id===e.id)editing=null;
    if(running&&running.id===e.id)running=null;
    try{
      await store.remove(e.id);
      toast("Borrado: "+e.name,false,{label:"Deshacer",fn:async()=>{await store.add(copy)}});
    }catch(err){b.disabled=false;toast("No se pudo borrar. Inténtalo de nuevo.")}
  });

  // ---------- progreso ----------
  // selector propio: buscador + lista (los más recientes primero)
  function progNames(){
    const last={};
    entries.filter(isReal).forEach(e=>{const k=e.date+String(1e15+(e.createdAt||0));if(!last[e.name]||k>last[e.name].k)last[e.name]={k,date:e.date,n:0}});
    entries.filter(isReal).forEach(e=>{last[e.name].n++});
    return Object.keys(last).sort((a,b)=>last[b].k.localeCompare(last[a].k)).map(n=>({n,date:last[n].date,count:last[n].n}));
  }
  function renderProgress(){
    const names=progNames().map(o=>o.n);
    if(!names.length){$("picker").hidden=true;$("chart").innerHTML='<p class="note">Cuando anotes el mismo ejercicio en distintos días, aquí verás cómo sube tu peso, tus repeticiones o tu tiempo.</p>';$("plog").innerHTML="";return}
    $("picker").hidden=false;
    if(!names.includes(picked))picked=names[0];
    $("pickName").textContent=picked;
    const r=imgOf(picked);$("pickImg").innerHTML=r?mediaHTML(r):"";$("pickImg").hidden=!r;
    if(!$("pickPop").hidden)renderPickList();
    drawChart(picked);
  }
  function renderPickList(){
    const q=norm($("pickQ").value),words=q?q.split(" "):[];
    const items=progNames().filter(o=>words.every(w=>norm(o.n).includes(w)));
    $("pickList").innerHTML=items.length?items.map(o=>{const r=imgOf(o.n);return '<button type="button" role="option" data-pick="'+esc(o.n)+'" aria-selected="'+(o.n===picked)+'">'+(r?mediaHTML(r,"pkthumb"):'<span class="pkthumb empty"></span>')+'<span class="pk-row"><b>'+esc(o.n)+'</b><small>'+o.count+(o.count===1?" vez":" veces")+' · último '+esc(fmtShort(o.date))+'</small></span></button>'}).join("")
      :'<p class="hint">No hay ejercicios con ese nombre en tu historial.</p>';
  }
  function openPick(open){
    $("pickPop").hidden=!open;$("pickBtn").setAttribute("aria-expanded",open?"true":"false");
    if(open){$("pickQ").value="";renderPickList();setTimeout(()=>$("pickQ").focus(),30)}
  }
  $("pickBtn").addEventListener("click",()=>openPick($("pickPop").hidden));
  $("pickQ").addEventListener("input",renderPickList);
  $("pickQ").addEventListener("keydown",e=>{if(e.key==="Escape")openPick(false);if(e.key==="Enter"){e.preventDefault();const b=$("pickList").querySelector("[data-pick]");if(b)b.click()}});
  $("pickList").addEventListener("click",e=>{const b=e.target.closest("[data-pick]");if(!b)return;picked=b.dataset.pick;openPick(false);renderProgress()});
  function drawChart(name){
    const rows=entries.filter(e=>e.name===name&&isReal(e));
    const recent=rows.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt).slice(0,8);
    $("plog").innerHTML='<h2 style="font-size:1rem;margin-top:8px">Últimos registros</h2>'+recent.map(e=>'<div class="entry"><div class="name"><span>'+esc(fmtShort(e.date))+'</span></div><div class="figs">'+figs(e)+'</div>'+(doneArr(e).some(Boolean)?'<div class="memo">Series: '+doneArr(e).map((d,i)=>d?pillLabel(e,d,i):"—").join("  ")+'</div>':'')+(e.memo?'<div class="memo">'+esc(e.memo)+'</div>':'')+'</div>').join("");
    let key=null,unit="";
    const hasOrm=rows.some(r=>valOf(r,"orm")!=null);
    if(hasOrm){key=progMetric;unit="kg"}
    else if(rows.some(r=>valOf(r,"weight")!=null)){key="weight";unit="kg"}
    else if(rows.some(r=>valOf(r,"dist")!=null)){key="dist";unit="m"}
    else if(rows.some(r=>valOf(r,"mins")!=null)){key="mins";unit="min"}
    else if(rows.some(r=>valOf(r,"reps")!=null)){key="reps";unit="reps"}
    if(key==="dist"&&new Set(rows.map(r=>r.dist).filter(v=>v!=null)).size===1&&rows.some(r=>valOf(r,"best")!=null)){key="best";unit="min"}
    const box=$("chart");
    const mchips=hasOrm?'<div class="metrics" role="group" aria-label="Qué graficar">'+[["orm","1RM estimado"],["weight","Peso máximo"],["vol","Volumen"]].map(([k,l])=>'<button type="button" data-metric="'+k+'" aria-pressed="'+(key===k)+'">'+l+'</button>').join("")+'</div>':'';
    if(!key){box.innerHTML='<p class="note">Este ejercicio no tiene peso, tiempo ni repeticiones anotadas todavía.</p>';return}
    const per={};
    // "mejor tiempo" solo compara la misma distancia (no mezclar 1 km con intervalos de 1 minuto)
    const bestD=key==="best"?(rows.find(r=>r.dist!=null)||{}).dist:null;
    rows.filter(r=>key!=="best"||r.dist===bestD).forEach(r=>{const v=valOf(r,key);if(v!=null)per[r.date]=key==="vol"?(per[r.date]||0)+v:key==="best"?Math.min(per[r.date]??Infinity,v):Math.max(per[r.date]??-Infinity,v)});
    const pts=Object.keys(per).sort().map(d=>({d,v:per[d]}));
    const label={orm:"1RM estimado, mejor serie del día",vol:"Volumen por día",best:"Mejor tiempo por día en "+fmtDist((rows.find(r=>r.dist!=null)||{}).dist||0),weight:"Peso máximo por día",dist:"Distancia máxima por día",mins:"Tiempo máximo por día",reps:"Repeticiones máximas por día"}[key];
    const fv=v=>key==="mins"||key==="best"?fmtDur(v):key==="dist"||key==="vol"?Math.round(v).toLocaleString("es-CL"):fmtN(Math.round(v*10)/10);
    const why=key==="orm"?'<p class="note">Combina peso y repeticiones en un solo número: 30 kg × 10 (≈40) cuenta como más fuerza que 20 kg × 15 (≈30).</p>':key==="vol"?'<p class="note">El trabajo total: suma de peso × reps de cada serie.</p>':'';
    if(pts.length<2){box.innerHTML=mchips+'<p class="note">'+label+': <b class="num">'+fv(pts[0].v)+' '+unit+'</b> el '+fmtShort(pts[0].d)+'. Anótalo otro día para ver la curva.</p>'+why;return}
    const W=600,H=220,L=40,R=16,T=16,B=30;
    let lo=Math.min(...pts.map(p=>p.v)),hi=Math.max(...pts.map(p=>p.v));
    if(lo===hi){lo=Math.max(0,lo-1);hi=hi+1}
    const span=hi-lo;lo=Math.max(0,lo-span*.15);hi=hi+span*.15;
    const x=i=>L+i*(W-L-R)/(pts.length-1);
    const y=v=>T+(hi-v)*(H-T-B)/(hi-lo);
    const line=pts.map((p,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(p.v).toFixed(1)).join(" ");
    const area=line+" L"+x(pts.length-1).toFixed(1)+" "+(H-B)+" L"+L+" "+(H-B)+" Z";
    const step=Math.ceil(pts.length/6);
    let s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="min-width:320px;display:block" role="img" aria-label="'+esc(label+" de "+name)+'">';
    [lo,(lo+hi)/2,hi].forEach(t=>{s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="var(--line)" stroke-width="1"/><text x="'+(L-6)+'" y="'+(y(t)+4)+'" text-anchor="end">'+fv(t)+'</text>'});
    s+='<path d="'+area+'" fill="var(--accent)" fill-opacity=".12"/><path d="'+line+'" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>';
    pts.forEach((p,i)=>{
      const last=i===pts.length-1;
      s+='<circle cx="'+x(i)+'" cy="'+y(p.v)+'" r="'+(last?5:3)+'" fill="'+(last?"var(--accent)":"var(--surface)")+'" stroke="var(--accent)" stroke-width="2"/>';
      if(i%step===0||last)s+='<text x="'+x(i)+'" y="'+(H-10)+'" text-anchor="'+(i===0?"start":last?"end":"middle")+'">'+fmtShort(p.d)+'</text>';
    });
    s+='</svg>';
    const diff=r1(pts[pts.length-1].v-pts[0].v);
    box.innerHTML=mchips+s+'<p class="note">'+label+' ('+unit+'). Desde el '+fmtShort(pts[0].d)+': <b class="num">'+(diff>0?"+":diff<0?"−":"")+fv(Math.abs(diff))+' '+unit+'</b> · <span class="pr">★ '+(key==="vol"?"Máximo ":"Récord ")+fv(key==="best"?Math.min(...pts.map(p=>p.v)):Math.max(...pts.map(p=>p.v)))+' '+unit+'</span></p>'+why;
  }
  let progMetric="orm";
  $("chart").addEventListener("click",e=>{const b=e.target.closest("[data-metric]");if(!b)return;progMetric=b.dataset.metric;drawChart(picked)});

  // ---------- categorías por músculo ----------
  const CATS=[["piernas","Piernas","#2E9BD6"],["gluteos","Glúteos","#D6457A"],["espalda","Espalda","#15985C"],["pecho","Pecho","#C98A00"],["hombros","Hombros","#8E6BE8"],["brazos","Brazos","#E07A3F"],["core","Core","#0E8C7E"],["cardio","Cardio","#E0485F"],["otro","Otro","#8B93A6"]];
  const CATMAP=Object.fromEntries(CATS.map(c=>[c[0],c]));
  function guessCat(n){
    const t=norm(n),h=(...w)=>w.some(x=>t.includes(x));
    if(h("ergometro","trote","correr","bici","eliptica","cinta","caminadora","cuerda","burpee","spinning","assault","remoerg"))return "cardio";
    if(h("femoral","isquio","cuadricep","sentadilla","prensa","zancada","estocada","extension de pierna","extension de cuadri","gemelo","pantorrilla","peso muerto","bulgara","step up","pierna"))return "piernas";
    if(h("plancha","abdominal","crunch","core","oblicuo","rueda","hollow","dead bug","bear","oso","pallof","russian","elevacion de piernas"))return "core";
    if(h("gluteo","hip thrust","puente","patada","abduc"))return "gluteos";
    if(h("militar","hombro","lateral","vuelo","face pull","arnold","deltoid","pajaro"))return "hombros";
    if(h("banca","pecho","apertura","flexion","pec deck","cruce","press inclinado","press declinado"))return "pecho";
    if(h("remo","jalon","dominada","pull","lumbar","espalda","pullover","encogimiento"))return "espalda";
    if(h("curl","bicep","tricep","fondos","martillo","frances","copa"))return "brazos";
    return null;
  }
  // cats[clave] = "piernas" (elegido por ti, formato antiguo) o {c:"piernas",by:"user"|"ai"}
  const catEntry=n=>{const v=cats[imgKey(n)];if(!v)return null;if(typeof v==="string")return {c:v,by:"user"};return CATMAP[v.c]?v:null};
  const catOf=n=>{const v=catEntry(n);return v?v.c:(guessCat(n)||"otro")};
  const isGuess=n=>!catEntry(n);
  // ---------- clasificación con Claude ----------
  let classifying=false,autoCatDone=false,catLoaded=false,entLoaded=false;
  const allExerciseNames=()=>{const m=new Map();catalog.concat(entries.map(e=>e.name)).forEach(n=>{if(n&&!m.has(imgKey(n)))m.set(imgKey(n),n)});return [...m.values()]};
  async function classifyNames(names,opts){
    opts=opts||{};
    if(!sampler||classifying)return 0;
    names=names.filter(n=>n&&(opts.force?(catEntry(n)||{}).by!=="user":!catEntry(n)));
    if(!names.length)return 0;
    classifying=true;renderCatAI();
    let done=0;
    try{
      for(let k=0;k<names.length;k+=40){
        const chunk=names.slice(k,k+40);
        const res=await sampler.classify(chunk);
        if(res&&typeof res==="object"){
          const m=Object.assign({},cats);
          chunk.forEach(n=>{
            const v=res[n]??Object.entries(res).find(([key])=>norm(key)===norm(n))?.[1];
            const c=typeof v==="string"?norm(v).replace("glúteos","gluteos"):null;
            if(c&&CATMAP[c]&&(opts.force?(catEntry(n)||{}).by!=="user":!catEntry(n))){m[imgKey(n)]={c,by:"ai"};done++}
          });
          if(done)await store.setCats(m);
        }
      }
    }catch(e){
      if(opts.manual)toast(e&&e.code==="rate_limited"?"Hay muchas consultas seguidas. Inténtalo en un momento.":e&&e.code==="not_granted"?"La IA no está disponible ahora"+(e.message?": "+e.message:"."):"No se pudo clasificar ahora"+(e&&e.message?" ("+e.message+")":"")+".");
    }finally{classifying=false;renderCatAI()}
    return done;
  }
  function renderCatAI(){
    const b=$("catAIBtn");if(!b)return;
    b.hidden=!sampler||!catalog.some(n=>segOf(n)==="mio")||exSeg!=="mio";b.disabled=classifying;
    b.innerHTML=classifying?"Clasificando con IA…":"✨ Reclasificar todo con IA";
  }
  // al abrir la app: clasifica una vez los ejercicios que aún no tienen músculo asignado
  function maybeAutoClassify(){
    if(autoCatDone||!sampler||!catLoaded||!entLoaded)return;
    const pend=allExerciseNames().filter(n=>!catEntry(n));
    if(!pend.length){autoCatDone=true;return}
    autoCatDone=true;
    setTimeout(async()=>{const n=await classifyNames(pend);if(n)toast("La IA clasificó "+n+(n===1?" ejercicio":" ejercicios")+" por músculo")},1500);
  }
  let catFilter="",catOpen=null;
  function renderCatFilter(pool){
    pool=pool||catalog;
    const present=new Set(pool.map(catOf)),f=$("catFilter");
    f.hidden=pool.length<4;
    if(catFilter&&!present.has(catFilter))catFilter="";
    f.innerHTML='<button type="button" data-cf="" aria-pressed="'+(!catFilter)+'">Todos</button>'+CATS.filter(c=>present.has(c[0])).map(c=>'<button type="button" data-cf="'+c[0]+'" aria-pressed="'+(catFilter===c[0])+'"><span class="catdot" style="background:'+c[2]+'"></span>'+c[1]+'</button>').join("");
  }
  $("catAIBtn").addEventListener("click",async()=>{
    const n=await classifyNames(allExerciseNames().filter(x=>{const o=originOf(x);return o!=="comun"&&o!=="profe"}),{force:true,manual:true});
    if(n)toast("Listo: "+n+(n===1?" ejercicio clasificado":" ejercicios clasificados")+". Los que elegiste tú se mantienen.");
    else if(!classifying)toast("No hubo cambios. Los que elegiste tú se mantienen.");
  });
  $("catFilter").addEventListener("click",e=>{const b=e.target.closest("[data-cf]");if(!b)return;catFilter=b.dataset.cf;renderGrid()});
  // ---------- tendencia por ejercicio ----------
  function trendHTML(n){
    const rows=entries.filter(e=>isReal(e)&&norm(e.name)===norm(n));if(!rows.length)return "";
    const k=rows.map(keyFor).find(Boolean);if(!k)return "";
    const per={};rows.forEach(r=>{const v=valOf(r,k);if(v!=null)per[r.date]=k==="best"?Math.min(per[r.date]??Infinity,v):Math.max(per[r.date]??-Infinity,v)});
    const days=Object.keys(per).sort().slice(-10),pts=days.map(d=>per[d]);if(!pts.length)return "";
    const fmtV=v=>k==="mins"||k==="best"?fmtDur(v):k==="dist"?fmtDist(v):fmtN(r1(v))+(k==="reps"?"":" kg");
    const what={orm:"1RM estimado (kg)",weight:"Peso máximo (kg)",reps:"Repeticiones",mins:"Tiempo (min:seg)",best:"Mejor tiempo (min:seg)",dist:"Distancia"}[k]||"";
    const who=env.isCoach()&&ath&&ath.user_id!==me?"Progreso de "+(ath.name||"tu alumno"):"Tu progreso";
    const last=pts[pts.length-1];
    let arrow="";
    if(pts.length>1){const d=last-pts[0],better=k==="best"?d<0:d>0;arrow=Math.abs(d)<1e-9?'<span class="ta">= sin cambio</span>':'<span class="ta '+(better?"up":"dn")+'">'+(better?"↑ ":"↓ ")+fmtV(Math.abs(d))+' desde el '+esc(fmtShort(days[0]))+'</span>'}
    let svg="";
    if(pts.length>1){
      // gráfico con ejes: Y = valor (mín, medio, máx), X = fechas
      const W=320,H=150,L=44,R=12,T=10,B=26;
      let lo=Math.min(...pts),hi=Math.max(...pts);if(lo===hi){lo-=1;hi+=1}const pad=(hi-lo)*.1;lo-=pad;hi+=pad;
      const x=i=>L+i*(W-L-R)/(pts.length-1),y=v=>T+(1-(v-lo)/(hi-lo))*(H-T-B);
      let g="";
      [lo+pad,(lo+hi)/2,hi-pad].forEach(t=>{g+='<line class="tg" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(t).toFixed(1)+'" y2="'+y(t).toFixed(1)+'"/><text class="tyl" x="'+(L-6)+'" y="'+(y(t)+4).toFixed(1)+'" text-anchor="end">'+esc(fmtV(t).replace(" kg",""))+'</text>'});
      g+='<line class="tax" x1="'+L+'" x2="'+L+'" y1="'+T+'" y2="'+(H-B)+'"/><line class="tax" x1="'+L+'" x2="'+(W-R)+'" y1="'+(H-B)+'" y2="'+(H-B)+'"/>';
      const step=Math.max(1,Math.ceil(pts.length/4));
      days.forEach((d,i)=>{const lastI=i===days.length-1;if(i%step===0||lastI){if(!lastI&&days.length-1-i<step/2&&i!==0)return;g+='<text class="txl" x="'+x(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+(i===0?"start":lastI?"end":"middle")+'">'+esc(fmtShort(d))+'</text>'}});
      g+='<polyline class="tl" points="'+pts.map((v,i)=>x(i).toFixed(1)+","+y(v).toFixed(1)).join(" ")+'"/>'+pts.map((v,i)=>'<circle class="td" cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="'+(i===pts.length-1?4:2.5)+'"/>').join("");
      svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(who+": "+what)+'">'+g+'</svg>';
    }
    return '<div class="trend"><div class="trh"><b>'+esc(who)+'</b><span>'+esc(what)+'</span></div>'+svg+
      '<div class="trf">Último: <b>'+esc(fmtV(last))+'</b> '+arrow+(pts.length<2?'<span> · con 2 o más días verás el gráfico</span>':'')+'</div></div>';
  }


  // ---------- grilla de ejercicios: banco común / míos / del profesor ----------
  let exSeg="comun",fichaN=null;
  const SEGS=[["comun","Banco común"],["mio","Mis ejercicios"],["profe","De mi profesor"],["alumno","Del alumno"]];
  const segOf=n=>originOf(n)||"mio";
  function renderGrid(){
    const counts={comun:0,mio:0,profe:0,alumno:0};catalog.forEach(n=>counts[segOf(n)]++);
    const shown=SEGS.filter(sg=>sg[0]==="comun"||sg[0]==="mio"||counts[sg[0]]);
    if(!shown.some(sg=>sg[0]===exSeg))exSeg="comun";
    $("exSegs").style.gridTemplateColumns="repeat("+shown.length+",minmax(0,1fr))";
    $("exSegs").innerHTML=shown.map(sg=>'<button type="button" role="tab" data-seg="'+sg[0]+'" aria-selected="'+(exSeg===sg[0])+'">'+sg[1]+' <small>'+counts[sg[0]]+'</small></button>').join("");
    $("catCount").textContent="";
    const g=$("exgrid");
    const pool=catalog.filter(n=>segOf(n)===exSeg);
    renderCatFilter(pool);
    const q=norm($("catNew").value),words=q?q.split(" "):[];
    const vis=pool.filter(n=>(!words.length||words.every(w=>norm(n).includes(w)))&&(!catFilter||catOf(n)===catFilter));
    if(!pool.length){
      g.innerHTML='<p class="hint exempty">'+(exSeg==="mio"?(env.isCoach()?"Aún no creas ejercicios. Los que crees aquí los verán también tus alumnos.":"Aún no creas ejercicios propios. Escribe el nombre arriba y toca “Crear”."):"No hay ejercicios aquí todavía.")+'</p>';
    }else if(!vis.length){
      g.innerHTML='<p class="hint exempty">Ninguno coincide'+(q&&exSeg!=="mio"?'. Si no existe, puedes crearlo como ejercicio tuyo con el botón de arriba.':'.')+'</p>';
    }else{
      const by={};vis.forEach(n=>{const c=catOf(n);(by[c]=by[c]||[]).push(n)});
      g.innerHTML=CATS.filter(c=>by[c[0]]).map(c=>'<h3 class="exgh"><span class="catdot" style="background:'+c[2]+'"></span>'+c[1]+' <small>'+by[c[0]].length+'</small></h3><div class="exg3">'+
        by[c[0]].map(n=>{const i=catalog.indexOf(n),r=imgOf(n);return '<button type="button" class="bcell'+(n===freshName?' fresh':'')+'" data-ficha="'+i+'"><span class="bthumb">'+(r?mediaHTML(r):'<i>'+esc(n.charAt(0).toUpperCase())+'</i>')+'</span><span class="bname">'+esc(n)+'</span></button>'}).join("")+'</div>').join("");
      if(freshName&&!freshScrolled){freshScrolled=true;setTimeout(()=>{const x=g.querySelector(".bcell.fresh");if(x)x.scrollIntoView({block:"center",behavior:"smooth"})},80)}
    }
    $("gifTip").hidden=exSeg==="comun";
    updateCatHint();renderFicha();
  }
  $("exSegs").addEventListener("click",e=>{const b=e.target.closest("[data-seg]");if(!b)return;exSeg=b.dataset.seg;catFilter="";renderGrid()});
  function openFicha(n){bkReset();fichaN=n;catOpen=null;renderFicha();$("fichaOv").hidden=false;document.body.classList.add("sm-open")}
  function closeFicha(force){if(!force&&bkDirty()&&!confirmDiscard())return;bkReset();fichaN=null;catOpen=null;$("fichaOv").hidden=true;$("ficha").innerHTML="";if($("smOv").hidden)document.body.classList.remove("sm-open")}
  function renderFicha(){
    if(!fichaN)return;
    const i=catalog.indexOf(fichaN);if(i<0){closeFicha(true);return}
    const n=fichaN,o=segOf(n),own=o==="mio",cat=CATMAP[catOf(n)],r=imgOf(n);
    const rows=entries.filter(e=>norm(e.name)===norm(n));
    const last=rows.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt)[0];
    const meta=rows.length?(rows.length+(rows.length===1?" vez":" veces")+" · último "+fmtShort(last.date)+(valOf(last,"weight")!=null?" · "+fmtN(valOf(last,"weight"))+" kg":"")):"Sin registros aún";
    $("ficha").innerHTML='<div class="grab" aria-hidden="true"></div>'+
      '<div class="fihead"><h2 id="fichaName">'+esc(n)+'</h2>'+originTag(n)+'<button type="button" class="iconbtn" data-fclose aria-label="Cerrar">✕</button></div>'+
      (BK&&BK.preview&&bankRowOf(n)&&bankRowOf(n).key===BK.key?'<div class="fimedia preview">'+mediaHTML({url:BK.preview,type:BK.ptype})+'<span class="pvtag">Vista previa · sin guardar</span></div>':'<button type="button" class="fimedia'+(r?'':' noimg')+'" data-view="'+i+'" aria-label="Ver '+esc(n)+' en grande"'+(r?'':' disabled')+'>'+(r?mediaHTML(r):'Sin imagen')+'</button>')+
      '<div class="firow">'+(own?'<button type="button" class="catchip'+(isGuess(n)?' guess':'')+'" data-catopen="'+i+'" aria-expanded="'+(catOpen===n)+'" title="Cambiar músculo"><span class="catdot" style="background:'+cat[2]+'"></span>'+cat[1]+' ▾</button>':'<span class="catchip ro"><span class="catdot" style="background:'+cat[2]+'"></span>'+cat[1]+'</span>')+'<span class="meta">'+esc(meta)+'</span></div>'+
      (catOpen===n&&own?'<div class="catpick" role="group" aria-label="Elegir músculo">'+CATS.map(c=>'<button type="button" data-catset="'+c[0]+'" data-ci="'+i+'" aria-pressed="'+(c[0]===cat[0]&&!isGuess(n))+'"><span class="catdot" style="background:'+c[2]+'"></span>'+c[1]+'</button>').join("")+'</div>':'')+
      trendHTML(n)+
      (o==="comun"&&isAdmin()?adminBankHTML(n,i):o==="comun"?'<p class="hint">Del banco común: lo ven todos y no se edita.</p>':o==="profe"?'<p class="hint">Lo creó tu profesor: solo él puede cambiarlo.</p>':'')+
      '<div class="fiacts"><button type="button" class="btnlike solid" data-log="'+i+'">Agregar a hoy</button>'+
        (own&&assets?'<button type="button" class="btnlike" data-img="'+i+'">'+(r?"Cambiar imagen":"Subir imagen")+'</button>':'')+
        (own&&!r?'<a class="btnlike" href="'+esc(searchURL(n))+'" target="_blank" rel="noopener">Buscar imagen</a>':'')+
        (own?'<button type="button" class="btnlike danger" data-rm="'+i+'">Quitar</button>':'')+
        (own&&isAdmin()?'<button type="button" class="btnlike" data-bkpromote="'+i+'">Pasar al banco común</button>':'')+'</div>';
  }
  // borrador de cambios del banco: se aplican todos juntos con "Guardar cambios"
  let BK=null; // {key,name,cat,file,preview,ptype}
  function bkDraft(n){const b=bankRowOf(n);if(!b)return null;if(!BK||BK.key!==b.key)BK={key:b.key,name:b.name,cat:b.category||catOf(n),file:null,preview:null};return BK}
  function bkDirty(){if(!BK)return false;const b=bankRows.find(x=>x.key===BK.key);if(!b)return false;return BK.name.trim()!==b.name||BK.cat!==(b.category||"")||!!BK.file}
  function bkReset(){if(BK&&BK.preview)URL.revokeObjectURL(BK.preview);BK=null}
  let discardArm=0;
  function confirmDiscard(){if(Date.now()-discardArm<4000)return true;discardArm=Date.now();toast("Tienes cambios sin guardar. Cierra otra vez para descartarlos.");return false}
  function adminBankHTML(n,i){
    const d=bkDraft(n);if(!d)return "";
    return '<div class="adminbox"><b>Administrar banco común</b>'+
      '<label class="f"><span>Nombre</span><input id="bkName" value="'+esc(d.name)+'" enterkeyhint="done" autocomplete="off"></label>'+
      '<div class="catpick" role="group" aria-label="Músculo">'+CATS.map(c=>'<button type="button" data-bkcat="'+c[0]+'" aria-pressed="'+(c[0]===d.cat)+'"><span class="catdot" style="background:'+c[2]+'"></span>'+c[1]+'</button>').join("")+'</div>'+
      '<div class="fiacts"><button type="button" class="btnlike" data-bkimg="1">'+(d.file?'Elegir otro video':'Cambiar video o imagen')+'</button><button type="button" class="btnlike danger" data-bkdel="'+i+'">Quitar del banco</button></div>'+
      (d.file?'<p class="hint">Nuevo: '+esc(d.file.name||"archivo")+' ('+(d.file.size/1048576).toFixed(1).replace(".",",")+' MB). Se sube al guardar.</p>':'')+
      '<div class="bksave"><button type="button" class="btnlike" data-bkundo="1"'+(bkDirty()?'':' disabled')+'>Descartar</button><button type="button" class="btnlike solid" id="bkSave" data-bksave="1"'+(bkDirty()?'':' disabled')+'>Guardar cambios</button></div>'+
      '<p class="hint">Los cambios los ven todos los usuarios.</p></div>';
  }
  function bkSync(){const on=bkDirty();document.querySelectorAll("[data-bksave],[data-bkundo]").forEach(x=>x.disabled=!on)}
  $("ficha").addEventListener("input",e=>{if(e.target.id==="bkName"&&BK){BK.name=e.target.value;bkSync()}});
  $("ficha").addEventListener("keydown",e=>{if(e.target.id==="bkName"&&e.key==="Enter"){e.preventDefault();const x=$("bkSave");if(x&&!x.disabled)x.click()}});
  async function bkCommit(btn){
    if(!BK||!bkDirty())return;
    const d=BK,b=bankRows.find(x=>x.key===d.key);if(!b)return;
    const name=d.name.trim().replace(/\s+/g," ");if(!name){toast("Escribe un nombre");return}
    btn.disabled=true;btn.textContent=d.file?"Subiendo video…":"Guardando…";
    const patch={};
    if(name!==b.name)patch.name=name;
    if(d.cat!==(b.category||""))patch.category=d.cat;
    try{if(d.file){const res=await assets.upload(d.file);patch.image_url=res.url;patch.image_type=res.contentType||d.file.type}}
    catch(e){toast("No se pudo subir el video. Revisa tu conexión.");btn.disabled=false;btn.textContent="Guardar cambios";return}
    const prevN=fichaN;if(patch.name)fichaN=patch.name;
    bkReset();
    if(await bankSave(d.key,patch))toast("Cambios guardados");else{fichaN=prevN;renderFicha()}
  }
  $("fichaOv").addEventListener("click",e=>{if(e.target.id==="fichaOv"||e.target.closest("[data-fclose]"))closeFicha()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&fichaN&&$("lb").hidden)closeFicha()});
  function updateCatHint(){
    const v=$("catNew").value.trim(),b=$("catNewBtn"),h=$("catHint");
    if(!v){b.disabled=true;b.textContent="Crear";h.textContent="";return}
    if(inCatalog(v)){b.disabled=true;b.textContent="Ya existe";const o=segOf(canonical(v));h.textContent="“"+canonical(v)+"” ya está en "+(o==="comun"?"el banco común":o==="profe"?"los ejercicios de tu profesor":"tus ejercicios")+".";return}
    b.disabled=false;b.textContent="Crear";h.textContent="";
  }
  $("catNew").addEventListener("input",renderGrid);
  async function exAction(e){
    const t=e.target.closest("button");if(!t)return;
    if(t.dataset.ficha!=null){openFicha(catalog[+t.dataset.ficha]);return}
    if(isAdmin()){
      if(t.dataset.bkcat&&BK){BK.cat=t.dataset.bkcat;renderFicha();return}
      if(t.dataset.bkimg!=null&&BK&&assets){pendingBank=BK.key;$("fileIn").click();return}
      if(t.dataset.bksave){await bkCommit(t);return}
      if(t.dataset.bkundo){bkReset();renderFicha();return}
      if(t.dataset.bkdel!=null){const n=catalog[+t.dataset.bkdel];if(!t.classList.contains("arm")){t.classList.add("arm");t.textContent="¿Seguro? Lo dejan de ver todos";return}closeFicha(true);await bankDelete(n);return}
      if(t.dataset.bkpromote!=null){const n=catalog[+t.dataset.bkpromote];closeFicha(true);await bankPromote(n);return}
    }
    if(t.dataset.catopen!=null){const n=catalog[+t.dataset.catopen];catOpen=catOpen===n?null:n;renderFicha();return}
    if(t.dataset.catset){const n=catalog[+t.dataset.ci],m=Object.assign({},cats);m[imgKey(n)]={c:t.dataset.catset,by:"user"};catOpen=null;await store.setCats(m);return}
    if(t.dataset.view!=null){openLB(catalog[+t.dataset.view]);return}
    if(t.dataset.log!=null){const n=catalog[+t.dataset.log];closeFicha(true);showTab("anotar");renderToday();addUserClosed=false;setAddOpen(true);nameIn.value=n;updateAddBtn();fillFromLast(nameIn.value);setTimeout(()=>$("sets").focus(),80);return}
    if(t.dataset.img!=null){pickFile(catalog[+t.dataset.img]);return}
    if(t.dataset.rm!=null){
      const n=catalog[+t.dataset.rm];
      if(!t.classList.contains("arm")){t.classList.add("arm");t.textContent="¿Seguro? Toca otra vez";return}
      closeFicha(true);
      try{
        await store.setCatalog(catalog.filter(c=>c!==n));
        toast("Quitado: "+n,false,{label:"Deshacer",fn:async()=>{await store.setCatalog(sortCat(Array.from(new Set(catalog.concat(n)))))}});
      }catch(err){toast("No se pudo quitar. Inténtalo de nuevo.")}
    }
  }
  $("exgrid").addEventListener("click",exAction);
  $("ficha").addEventListener("click",exAction);
  let freshName=null,freshScrolled=false;
  async function addFromBox(){
    const v=$("catNew").value.trim().replace(/\s+/g," ");
    if(!v||inCatalog(v)){$("catNew").select();return}
    const name=v.charAt(0).toUpperCase()+v.slice(1);
    $("catNew").value="";freshName=name;freshScrolled=false;setTimeout(()=>{freshName=null;renderGrid()},4000);
    exSeg="mio";
    if(await addToCatalog(name))toast("Creado: "+name+". Tócalo para ponerle imagen.");
    else freshName=null;
  }
  $("catNewBtn").addEventListener("click",addFromBox);
  $("catNew").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addFromBox()}});

  // ---------- respaldo (CSV para Excel) ----------
  function buildCSV(){
    const sep=";",num=v=>v==null||v===""?"":String(Math.round(v*100)/100).replace(".",",");
    const cell=v=>{v=v==null?"":String(v);return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
    const head=["Fecha","Sesión","Ejercicio","Series pedidas","Reps pedidas","Peso pedido (kg)","Distancia pedida (m)","Tiempo pedido","Serie","Hecha","Peso (kg)","Reps","Distancia (m)","Tiempo","Nota"];
    const rows=[head];
    const days=[...new Set(entries.map(e=>e.date))].sort();
    days.forEach(day=>{
      const gs=splitSessions(entries.filter(e=>e.date===day).sort(byCreated));
      gs.forEach(g=>{
        const sl=gs.length>1?sessLabel(g):"";
        g.entries.forEach(e=>{
          const base=[day,sl,e.name,e.sets??"",e.reps??"",num(e.weight),num(e.dist),e.mins!=null?fmtDur(e.mins):""];
          const ds=doneArr(e);
          if(!ds.length){rows.push(base.concat(["","","","","","",e.memo||""]));return}
          ds.forEach((d,i)=>rows.push(base.concat([i+1,d?"sí":"no",d?num(d.w):"",d&&d.r!=null?d.r:"",d?num(d.m):"",d&&d.t!=null?fmtDur(d.t):"",i===0?(e.memo||""):""])));
        });
      });
    });
    return "\ufeff"+rows.map(r=>r.map(cell).join(sep)).join("\r\n");
  }
  $("backupBtn").addEventListener("click",async()=>{
    if(!downloads)return;
    try{await downloads.save({filename:"trainly-"+today+".csv",data:buildCSV()});toast("Respaldo descargado")}
    catch(e){if(e&&e.code==="declined")return;if(e&&e.code==="rate_limited"){toast("Espera un momento e inténtalo de nuevo.");return}toast("No se pudo descargar el respaldo aquí.")}
  });

  // ---------- Claude: identificar ejercicio ----------
  function wireIdentify(P,onUse,useLabel){
    $(P+"Toggle").addEventListener("click",()=>{const b=$(P+"Box");b.hidden=!b.hidden;if(!b.hidden)$(P+"Desc").focus()});
    $(P+"Go").addEventListener("click",async()=>{
      const desc=$(P+"Desc").value.trim(),out=$(P+"Out"),btn=$(P+"Go");
      if(!desc){$(P+"Desc").focus();return}
      if(!sampler)return;
      btn.disabled=true;btn.textContent="Pensando…";out.innerHTML="";
      try{
        const r=await sampler.identify(desc);
        if(!r||!r.nombre){out.innerHTML='<p class="hint">No pude identificarlo. Prueba describiendo la posición, el implemento y el movimiento.</p>';return}
        out.innerHTML='<div class="idres"><b>'+esc(r.nombre)+'</b>'+(r.en_ingles?'<small>En inglés: '+esc(r.en_ingles)+'</small>':'')+(r.trabaja?'<small>Trabaja: '+esc(r.trabaja)+'</small>':'')+(r.seguro===false?'<small>No estoy 100% seguro: confírmalo con tu entrenador.</small>':'')+
          '<div><button type="button" class="btnlike solid">'+esc(useLabel)+'</button></div></div>';
        out.querySelector("button").onclick=()=>{$(P+"Box").hidden=true;$(P+"Desc").value="";out.innerHTML="";onUse(r)};
      }catch(e){
        out.innerHTML='<p class="hint">'+(e&&e.code==="rate_limited"?"Hay muchas consultas seguidas. Espera un momento.":e&&e.code==="not_granted"?"La IA no está disponible ahora"+(e.message?": "+esc(e.message):"."):"No se pudo consultar ahora. Inténtalo de nuevo."+(e&&e.message?"<br><small>"+esc(e.message)+"</small>":""))+'</p>';
      }finally{btn.disabled=false;btn.textContent="Identificar"}
    });
  }
  wireIdentify("id",r=>{nameIn.value=r.nombre;updateAddBtn();fillFromLast(r.nombre);flash("Nombre listo. Toca “☆ Guardar en mis ejercicios” para tenerlo a mano.")},"Usar este nombre");
  wireIdentify("catId",async r=>{if(inCatalog(r.nombre)){$("catNew").value=r.nombre;renderGrid();return}$("catNew").value=r.nombre;await addFromBox()},"Agregar a mis ejercicios");

  // ---------- Claude: analizar progreso ----------
  function historyText(){
    const since=iso(new Date(Date.now()-56*864e5));
    const rows=entries.filter(e=>e.date>=since).sort((a,b)=>a.date.localeCompare(b.date)||byCreated(a,b));
    return rows.map(e=>{
      const ds=doneArr(e).map((d,i)=>d?("S"+(i+1)+": "+setParts(e,d).map(p=>p.txt).join(" ")+(d.w!=null&&d.r!=null?" (1RM≈"+fmtN(r1(e1rm(d.w,d.r)))+")":"")):("S"+(i+1)+": no hecha")).join("; ");
      return e.date+" | "+e.name+" | pedido: "+(planText(e)||"-")+(e.sets?" ("+e.sets+" series)":"")+(ds?" | hecho: "+ds:""); // sin notas ni nombres: solo números (privacidad)
    }).join("\n");
  }
  function mdLite(t){
    const lines=esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").split(/\n/);
    let h="",inList=false;
    lines.forEach(l=>{
      const m=l.match(/^\s*[-•*]\s+(.*)/);
      if(m){if(!inList){h+="<ul>";inList=true}h+="<li>"+m[1]+"</li>"}
      else{if(inList){h+="</ul>";inList=false}if(l.trim())h+="<p>"+l+"</p>"}
    });
    return h+(inList?"</ul>":"");
  }
  let aiCtl=null;
  $("aiGo").addEventListener("click",async()=>{
    if(!sampler)return;
    const out=$("aiOut"),btn=$("aiGo"),q=$("aiQ").value.trim();
    if(aiCtl)aiCtl.abort();aiCtl=new AbortController();
    btn.disabled=true;btn.textContent="Analizando…";out.hidden=false;out.innerHTML='<p class="hint">Revisando tu historial…</p>';
    const payload={question:q,today,history:historyText()};
    try{
      const text=await sampler.analyze(payload,{signal:aiCtl.signal});out.innerHTML=mdLite(text);
    }catch(e){
      if(e&&e.name==="AbortError")return;
      out.innerHTML='<p class="hint">'+(e&&e.code==="rate_limited"?"Hay muchas consultas seguidas. Espera un momento.":e&&e.code==="not_granted"?"La IA no está disponible ahora"+(e.message?": "+esc(e.message):"."):"No se pudo completar el análisis. Inténtalo de nuevo."+(e&&e.message?"<br><small>"+esc(e.message)+"</small>":""))+'</p>';
    }finally{btn.disabled=false;btn.textContent="Analizar de nuevo"}
  });

  // ---------- paleta ----------
  const PALK="bitacora-paleta";
  function setPalette(pal){
    if(pal)document.documentElement.setAttribute("data-palette",pal);else document.documentElement.removeAttribute("data-palette");
    document.querySelectorAll("#swatches [data-pal]").forEach(b=>b.setAttribute("aria-checked",b.dataset.pal===(pal||"")?"true":"false"));
    try{localStorage.setItem(PALK,pal||"")}catch(e){}
  }
  try{setPalette(localStorage.getItem(PALK)||"")}catch(e){setPalette("")}
  $("swatches").addEventListener("click",e=>{const b=e.target.closest("[data-pal]");if(b)setPalette(b.dataset.pal)});
  applyFields();
  init();

}
