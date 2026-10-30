import { expect } from "@playwright/test";

// Datos de ejemplo: ~6 semanas de entrenamientos, hoy con una sesión a medias, un día planificado y una rutina.
const SEED = `(()=>{const LD=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
const db=JSON.parse(localStorage.mockdb);const a=db.athletes.find(x=>x.user_id===JSON.parse(localStorage.mocksession).user.id);
const ex=[["Peso muerto",3,10,80],["Vuelo lateral",3,15,10],["Press inclinado con mancuernas",3,12,30],["Extensión de cuádriceps",3,15,40],["Remo en T",3,12,30],["Hip Thrust en Maquina",3,15,60]];
const today=new Date();let ord=1;
for(let back=40;back>=0;back--){const d=new Date(today);d.setDate(d.getDate()-back);if(back>0&&(back%2||back%7==3))continue;const ds=LD(d);
 const pick=back===0?ex.slice(0,5):ex.slice(back%3,back%3+4);
 pick.forEach(([n,s,r,w],i)=>{const done=back===0?(i<2?Array.from({length:s},(_,k)=>({w,r,at:Date.now()-60000*(20-k*3-i*9)})):[]):Array.from({length:s},()=>({w:w-(back>20?5:0),r,at:d.getTime()}));
  db.entries.push({id:crypto.randomUUID(),athlete_id:a.id,date:ds,name:n,sets:s,reps:r,weight:w,mins:null,dist:null,memo:i==1&&back==0?"Subir peso la próxima":"",ord:ord++,created_ms:Date.now()+ord,done});});}
const fut=new Date(today);fut.setDate(fut.getDate()+2);db.entries.push({id:crypto.randomUUID(),athlete_id:a.id,date:LD(fut),name:"Peso muerto",sets:3,reps:8,weight:85,memo:"",ord:9999,created_ms:Date.now(),done:[]});
db.routines.push({id:crypto.randomUUID(),owner_id:a.user_id,athlete_id:a.id,name:"Día 1",items:[{name:"Peso muerto",sets:3,reps:10,weight:80},{name:"Remo en T",sets:3,reps:12,weight:30}],created_at:new Date().toISOString()});
localStorage.mockdb=JSON.stringify(db)})()`;

let n = 0;
// crea una cuenta nueva (alumno o profesor) y, si se pide, carga los datos de ejemplo
export async function start(page, { seed = true, coach = false } = {}) {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("/");
  await page.click("#aTabUp");
  await page.fill("#aName", "Felipe");
  await page.fill("#aEmail", `t${Date.now()}${n++}@x.cl`);
  await page.fill("#aPass", "123456");
  if (coach) await page.check("input[value=coach]");
  await page.click("#authGo");
  await expect(page.locator("#acctBtn")).toBeVisible();
  if (seed) {
    await page.evaluate(SEED);
    await page.reload();
    await expect(page.locator(".tcard").first()).toBeVisible();
  }
  return errors;
}

// sin desplazamiento lateral, barra de abajo dentro de la pantalla
export async function layoutOk(page) {
  const r = await page.evaluate(() => {
    const t = document.querySelector(".tabs"),
      b = t && t.getBoundingClientRect();
    return {
      sw: document.documentElement.scrollWidth,
      w: innerWidth,
      h: innerHeight,
      tabsBottom: b ? b.bottom : 0,
      tabsVisible: !!t && getComputedStyle(t).display !== "none"
    };
  });
  expect(r.sw, "la página no debe desplazarse hacia los lados").toBeLessThanOrEqual(r.w + 1);
  if (r.tabsVisible)
    expect(r.tabsBottom, "la barra de abajo debe quedar dentro de la pantalla").toBeLessThanOrEqual(r.h + 2);
}

// gesto táctil horizontal (dx<0 = hacia la izquierda)
export async function swipe(page, x, y, dx) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 10, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
}

export const localISO = (d = new Date()) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const addDays = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localISO(d);
};
