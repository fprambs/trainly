// Gestos táctiles: deslizar a los lados para cambiar de día (pantalla Hoy) o de mes (calendarios).
// Solo dedo o lápiz (no mouse); el desplazamiento vertical de la página sigue funcionando.

// cfg: {tab, parts():Element[], busy():bool, onStart(), onStep(+1|-1)}
export function daySwipe(cfg){
  let sw=null,swipedAt=0;
  const setT=(tr,op,cls)=>cfg.parts().forEach(el=>{el.style.transform=tr;el.style.opacity=op;el.classList.remove("sw-out","sw-in");if(cls)el.classList.add(cls)});
  // se escucha en toda la pantalla (también en el espacio vacío bajo la lista), solo en la pestaña Hoy
  document.addEventListener("pointerdown",ev=>{
    if(ev.pointerType==="mouse"||cfg.busy()||cfg.tab.hidden)return;
    if(ev.target.closest("input,textarea,select,.calpop,.repeat,.eedit,.fab,.addcard,.tabs,.athbar,.exdet,.smov,.sheetov,.focus,.lb,.sumov,.addback"))return;
    sw={x0:ev.clientX,y0:ev.clientY,t0:Date.now(),id:ev.pointerId,dir:0,dx:0};
  },{passive:true});
  document.addEventListener("pointermove",ev=>{
    if(!sw||ev.pointerId!==sw.id)return;
    const dx=ev.clientX-sw.x0,dy=ev.clientY-sw.y0;
    if(!sw.dir){
      if(Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.4){sw.dir=1;cfg.onStart&&cfg.onStart()}
      else if(Math.abs(dy)>14){sw=null;return}
      else return;
    }
    sw.dx=dx;setT("translateX("+(dx*.55)+"px)",String(Math.max(.35,1-Math.abs(dx)/600)));
  },{passive:true});
  const end=ev=>{
    if(!sw||(ev&&ev.pointerId!==sw.id))return;
    const s0=sw;sw=null;
    if(!s0.dir)return;
    swipedAt=Date.now();
    const go=Math.abs(s0.dx)>70||(Math.abs(s0.dx)>40&&Date.now()-s0.t0<250);
    if(!go){setT("","","sw-in");return}
    const step=s0.dx<0?1:-1; // deslizar a la izquierda = día siguiente
    setT("translateX("+(s0.dx<0?-45:45)+"%)","0","sw-out");
    setTimeout(()=>{
      cfg.onStep(step);
      setT("translateX("+(s0.dx<0?35:-35)+"%)","0");
      requestAnimationFrame(()=>requestAnimationFrame(()=>setT("","","sw-in")));
      if(navigator.vibrate)try{navigator.vibrate(8)}catch(e){}
    },150);
  };
  document.addEventListener("pointerup",end);
  document.addEventListener("pointercancel",ev=>{if(sw&&sw.dir)end(ev);else sw=null});
  // un deslizamiento no debe abrir la tarjeta que estaba bajo el dedo
  document.addEventListener("click",ev=>{if(Date.now()-swipedAt<350){ev.stopPropagation();ev.preventDefault()}},true);
}

// deslizar a los lados sobre un calendario cambia de mes (táctil)
export function monthSwipe(box,gridSel,go,canGo){
  let s=null,blockUntil=0;
  box.addEventListener("pointerdown",ev=>{if(ev.pointerType==="mouse"||!ev.target.closest(gridSel))return;s={x0:ev.clientX,y0:ev.clientY,id:ev.pointerId,dir:0,dx:0}},{passive:true});
  box.addEventListener("pointermove",ev=>{
    if(!s||ev.pointerId!==s.id)return;const dx=ev.clientX-s.x0,dy=ev.clientY-s.y0;
    if(!s.dir){if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.3)s.dir=1;else if(Math.abs(dy)>12){s=null;return}else return}
    s.dx=dx;const g=box.querySelector(gridSel);
    const blocked=canGo&&!canGo(dx<0?1:-1);
    if(g){g.style.transition="none";g.style.transform="translateX("+(blocked?Math.sign(dx)*Math.min(24,Math.abs(dx)*.15):dx*.6)+"px)";g.style.opacity=blocked?"":String(Math.max(.35,1-Math.abs(dx)/400))}
  },{passive:true});
  const end=ev=>{
    if(!s||(ev&&ev.pointerId!==s.id))return;const s0=s;s=null;if(!s0.dir)return;
    blockUntil=Date.now()+350;
    const g=box.querySelector(gridSel),step=s0.dx<0?1:-1;
    const ok=Math.abs(s0.dx)>50&&go(step)!==false;
    const g2=box.querySelector(gridSel);
    if(ok&&g2){g2.style.transition="none";g2.style.transform="translateX("+(step*30)+"%)";g2.style.opacity="0";
      requestAnimationFrame(()=>requestAnimationFrame(()=>{g2.style.transition="transform .22s cubic-bezier(.2,.8,.2,1),opacity .22s";g2.style.transform="";g2.style.opacity=""}))}
    else if(g){g.style.transition="transform .2s,opacity .2s";g.style.transform="";g.style.opacity=""}
  };
  box.addEventListener("pointerup",end);box.addEventListener("pointercancel",end);
  box.addEventListener("click",ev=>{if(Date.now()<blockUntil){ev.stopPropagation();ev.preventDefault()}},true);
}
// se puede ir hasta 12 meses hacia adelante (para planificar)
