// Sesiones y series: cómo se agrupan los ejercicios de un día en sesiones (pausas de más de 30 min separan sesiones).
import { pad } from "./format.js";

export const ordOf = e => e.order ?? e.createdAt ?? 0;
export const doneArr = e =>
  Array.from({ length: Math.min(+e.sets || 0, 30) }, (_, i) => (Array.isArray(e.done) && e.done[i]) || null);
export const byCreated = (a, b) => ordOf(a) - ordOf(b);
export function sessionStart(list) {
  const a = list.flatMap(e => (e.done || []).filter(d => d && d.at).map(d => d.at));
  return a.length ? Math.min(...a) : null;
}
export const GAP = 30 * 60e3;
export const firstAt = e => {
  const a = (Array.isArray(e.done) ? e.done : []).filter(d => d && d.at).map(d => d.at);
  return a.length ? Math.min(...a) : null;
};
export function splitSessions(list) {
  const ats = list
    .flatMap(e => (Array.isArray(e.done) ? e.done : []).filter(d => d && d.at).map(d => d.at))
    .sort((a, b) => a - b);
  const iv = [];
  ats.forEach(t => {
    const l = iv[iv.length - 1];
    if (l && t - l.end <= GAP) l.end = t;
    else iv.push({ start: t, end: t });
  });
  if (!iv.length) return [{ entries: list.slice(), start: null, end: null }];
  const groups = iv.map(x => ({ start: x.start, end: x.end, entries: [] }));
  let pending = null;
  list.forEach(e => {
    const t = firstAt(e) ?? e.createdAt ?? 0;
    let g = groups.find(x => t >= x.start - GAP && t <= x.end + GAP);
    if (!g && firstAt(e) == null && t > groups[groups.length - 1].end + GAP) {
      pending = pending || { start: null, end: null, entries: [] };
      g = pending;
    }
    if (!g) g = groups.reduce((best, x) => (Math.abs(t - x.start) < Math.abs(t - best.start) ? x : best), groups[0]);
    g.entries.push(e);
  });
  if (pending) groups.push(pending);
  return groups.filter(x => x.entries.length);
}
export function sessLabel(g) {
  if (g.start == null) return "Nueva sesión";
  const dt = new Date(g.start),
    h = dt.getHours();
  return (h < 12 ? "Mañana" : h < 19 ? "Tarde" : "Noche") + " · " + pad(h) + ":" + pad(dt.getMinutes());
}
export const sessDur = g =>
  g.start == null || g.end == null ? null : Math.max(1, Math.round((g.end - g.start) / 60000));

// Bloques (circuitos): un ejercicio unido al siguiente (`link`) se hace por rondas con él —serie 1 de cada uno,
// luego serie 2…— y los bloques van en orden. `circuit` es el formato antiguo: todo el día en un solo circuito.
export const linkedTo = (a, b) => !!(a && b && (a.link || (a.circuit && b.circuit)));
export function blocksOf(list) {
  const out = [];
  list.forEach((e, i) => {
    if (i && linkedTo(list[i - 1], e)) out[out.length - 1].push(e);
    else out.push([e]);
  });
  return out;
}
// items de una rutina con las uniones explícitas (convierte las rutinas antiguas "en circuito")
export const routineItems = r =>
  (r.items || []).map((it, i, a) =>
    r.circuit && !("link" in it) ? Object.assign({}, it, { link: i < a.length - 1 }) : it
  );

// Mover un elemento en una lista con uniones ({ link }): i = posición actual, t = destino (en la lista sin él).
// join: soltado sobre el centro del destino (queda unido a él, justo después); inBlk: soltado dentro de la tarjeta
// de un circuito (antes o después del destino, dentro del circuito); si no, queda suelto entre sus vecinos.
export function relink(list, i, t, { join = false, after = false, inBlk = false } = {}) {
  const arr = list.map(o => Object.assign({}, o));
  if (i > 0) arr[i - 1].link = arr[i - 1].link && arr[i].link;
  const mine = arr.splice(i, 1)[0];
  if (inBlk && !after && !join) {
    mine.link = true;
    arr.splice(t, 0, mine);
  } else if (join || inBlk) {
    mine.link = arr[t].link;
    arr[t].link = true;
    arr.splice(t + 1, 0, mine);
  } else {
    const p = t + (after ? 1 : 0),
      prev = arr[p - 1];
    mine.link = !!(prev && prev.link);
    arr.splice(p, 0, mine);
  }
  arr[arr.length - 1].link = false;
  return arr;
}
