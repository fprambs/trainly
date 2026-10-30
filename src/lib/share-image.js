// Imagen del resumen de la sesión (PNG dibujado en canvas, sin librerías) y versión para historias de Instagram (1080×1920).
// Recibe los datos ya calculados (sumData) para no depender del estado de la app.
// imagen PNG dibujada a mano en canvas (no depende de librerías)
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
function wrapText(ctx,text,maxW){
  const words=String(text).split(" "),lines=[];let cur="";
  words.forEach(w=>{const t=cur?cur+" "+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w}else cur=t});
  if(cur)lines.push(cur);return lines;
}
const loadImg=src=>new Promise(res=>{const im=new Image();if(/^https?:/.test(src)&&!src.startsWith(location.origin))im.crossOrigin="anonymous";im.onload=()=>res(im);im.onerror=()=>res(null);im.src=src});
// primer cuadro de un video, para dibujarlo como miniatura
const loadFrame=src=>new Promise(res=>{
  const v=document.createElement("video");let done=false;const fin=x=>{if(!done){done=true;res(x)}};
  v.muted=true;v.playsInline=true;v.preload="auto";v.setAttribute("playsinline","");v.crossOrigin="anonymous";
  v.onloadeddata=()=>{try{v.currentTime=Math.min(.2,(v.duration||1)/2)}catch(e){fin(v)}};
  v.onseeked=()=>fin(v.videoWidth?v:null);v.onerror=()=>fin(null);
  setTimeout(()=>fin(v.videoWidth?v:null),4000);
  v.src=src;try{v.load()}catch(e){}
});
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
export async function buildPNG(D,withImages){
  const C={accent:cssVar("--accent"),ai:cssVar("--accent-ink"),bg:cssVar("--surface"),bg2:cssVar("--surface2"),ink:cssVar("--ink"),muted:cssVar("--muted"),line:cssVar("--line"),ok:cssVar("--ok"),gold:cssVar("--gold"),goldsoft:cssVar("--goldsoft"),media:cssVar("--media")};
  const DISP='"Barlow Condensed","Arial Narrow",sans-serif',BODY='"Barlow",system-ui,sans-serif';
  try{await Promise.all(['800 160px "Barlow Condensed"','700 48px "Barlow Condensed"','600 38px "Barlow"','400 32px "Barlow"'].map(f=>document.fonts.load(f)))}catch(e){}
  const W=1080,P=64,meas=document.createElement("canvas").getContext("2d");
  meas.font="400 32px "+BODY;
  const NMW=W-P*2-120-200;
  const rows=D.rows.map(r=>{
    const lines=wrapText(meas,r.detail,NMW).slice(0,3);
    meas.font="600 38px "+BODY;const names=wrapText(meas,r.name,NMW).slice(0,2);meas.font="400 32px "+BODY;
    meas.font="600 38px "+BODY;const inl=r.pr&&meas.measureText(names[names.length-1]).width+170<=NMW;meas.font="400 32px "+BODY;
    const badgeRow=r.pr&&!inl;
    return Object.assign({lines,names,inl,badgeRow,h:Math.max(124,40+names.length*46+(badgeRow?50:0)+lines.length*40)},r)});
  const HEAD=400,STATS=D.rows.length?190:0,LIST=rows.reduce((a,r)=>a+r.h,0)+(rows.length?24:120),FOOT=96;
  const H=HEAD+STATS+LIST+FOOT;
  const cv=document.createElement("canvas");cv.width=W;cv.height=H;const ctx=cv.getContext("2d");
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  // cabecera
  ctx.fillStyle=C.accent;ctx.fillRect(0,0,W,HEAD);
  const logo=await loadImg("/icons/icon-192.png");
  if(logo){ctx.save();rr(ctx,P,56,84,84,20);ctx.clip();ctx.drawImage(logo,P,56,84,84);ctx.restore()}
  ctx.fillStyle=C.ai;ctx.font="800 44px "+DISP;ctx.textBaseline="alphabetic";ctx.fillText("TRAINLY",P+112,92);
  ctx.font="500 32px "+BODY;ctx.globalAlpha=.88;const dayCap=D.day.charAt(0).toUpperCase()+D.day.slice(1);ctx.fillText(dayCap+(D.sess?" · "+D.sess:""),P+112,134);ctx.globalAlpha=1;
  ctx.font="800 176px "+DISP;ctx.fillText(D.rows.length?D.dur:"—",P-4,318);
  if(D.rows.length&&D.total){const cx=W-P-80,cy=258,rad=72;ctx.lineWidth=14;ctx.lineCap="round";
    ctx.strokeStyle=C.ai;ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    ctx.beginPath();ctx.arc(cx,cy,rad,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,D.done/D.total));ctx.stroke();
    ctx.textAlign="center";ctx.fillStyle=C.ai;
    if(D.done>=D.total){ctx.font="800 84px "+DISP;ctx.fillText("✓",cx,cy+30)}else{ctx.font="800 56px "+DISP;ctx.fillText(Math.round(D.done/D.total*100)+"%",cx,cy+20)}
    ctx.textAlign="left"}
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
  const raw=withImages?await Promise.all(rows.map(async r=>{if(!r.img)return null;if(r.vid){const p=r.poster?await loadImg(r.poster):null;return p||loadFrame(r.img)}return loadImg(r.img)})):rows.map(()=>null);
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
    const ty=y+20,ti=y+Math.max(14,(r.h-96)/2);
    ctx.fillStyle=C.bg2;rr(ctx,P,ti,96,96,18);ctx.fill();
    if(imgs[i]){ctx.save();rr(ctx,P,ti,96,96,18);ctx.clip();ctx.fillStyle=C.media;ctx.fillRect(P,ti,96,96);ctx.drawImage(imgs[i],P,ti,96,96);ctx.restore()}
    else{ctx.fillStyle=C.muted;ctx.font="700 48px "+DISP;ctx.textAlign="center";ctx.fillText((r.name||"?").charAt(0).toUpperCase(),P+48,ti+66);ctx.textAlign="left"}
    const tx=P+120;
    ctx.fillStyle=C.ink;ctx.font="600 38px "+BODY;
    let yy=ty+40;
    r.names.forEach((nm,k)=>{ctx.fillStyle=C.ink;ctx.font="600 38px "+BODY;ctx.fillText(nm,tx,yy);
      if(k===r.names.length-1&&r.pr){
        const bx=r.inl?tx+ctx.measureText(nm).width+14:tx,by=r.inl?yy-32:yy+14;
        ctx.font="700 22px "+BODY;const bw=ctx.measureText("★ RÉCORD").width+28;ctx.fillStyle=C.goldsoft;rr(ctx,bx,by,bw,40,8);ctx.fill();ctx.fillStyle=C.gold;ctx.fillText("★ RÉCORD",bx+14,by+28);
        if(!r.inl)yy+=50}
      if(k<r.names.length-1)yy+=46});
    ctx.fillStyle=C.muted;ctx.font="400 32px "+BODY;r.lines.forEach((l,k)=>ctx.fillText(l,tx,yy+44+k*40));
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
// formato historia de Instagram (1080×1920, 9:16): la tarjeta centrada sobre un fondo con los colores de la app
export async function buildStory(D,withImages){
  const card=await buildPNG(D,withImages);
  const bmp=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=URL.createObjectURL(card)});
  const W=1080,H=1920,cv=document.createElement("canvas");cv.width=W;cv.height=H;const ctx=cv.getContext("2d");
  const acc=cssVar("--accent")||"#5B4FE6",dark="#0E0F16";
  ctx.fillStyle=dark;ctx.fillRect(0,0,W,H);
  const glow=(x,y,r,c,a)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c);g.addColorStop(1,"transparent");ctx.globalAlpha=a;ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1};
  glow(160,220,900,acc,.55);glow(980,1700,900,acc,.35);
  // tarjeta: ancho máximo 940 y alto máximo dejando aire para las zonas de la interfaz de Instagram
  const maxW=940,maxH=H-420,sc=Math.min(maxW/bmp.width,maxH/bmp.height),cw=bmp.width*sc,ch=bmp.height*sc;
  const x=(W-cw)/2,y=Math.max(210,(H-ch)/2),r=44;
  ctx.save();ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=60;ctx.shadowOffsetY=24;ctx.fillStyle=dark;rr(ctx,x,y,cw,ch,r);ctx.fill();ctx.restore();
  ctx.save();rr(ctx,x,y,cw,ch,r);ctx.clip();ctx.drawImage(bmp,x,y,cw,ch);ctx.restore();
  URL.revokeObjectURL(bmp.src);
  return await new Promise((res,rej)=>{try{cv.toBlob(b=>b?res(b):rej(new Error("blob")),"image/png")}catch(e){rej(e)}});
}
