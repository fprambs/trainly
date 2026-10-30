// Respaldo de todo el historial en CSV (se abre en Excel o Google Sheets).
import { fmtDur } from "./format.js";
import { splitSessions, sessLabel, byCreated, doneArr } from "./sessions.js";

export function buildCSV(entries){
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
