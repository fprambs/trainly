// Formatos y utilidades sin estado (fechas, números, nombres). Se usan en toda la app.
export const pad = n => String(n).padStart(2, "0");
export const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const parse = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const fmtDay = s => parse(s).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" });
export const fmtShort = s => parse(s).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
export const fmtMonth = s => parse(s).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}
export const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const imgKey = n => norm(n).replace(/[^a-z0-9]+/g, "_");
export const fmtN = v => String(Math.round(v * 100) / 100).replace(".", ",");
export const fmtTime = min => {
  const s = Math.round(min * 60);
  return s < 60 ? s + " s" : Math.floor(s / 60) + ":" + pad(s % 60) + " min";
};
export const fmtDist = m => (m >= 1000 ? fmtN(m / 1000) + " km" : fmtN(m) + " m");
export const e1rm = (w, r) => (w > 0 && r > 0 ? (r === 1 ? w : w * (1 + r / 30)) : null);
export const r1 = v => Math.round(v * 10) / 10;
export const fmtDur = min => {
  const s = Math.round(min * 60);
  return Math.floor(s / 60) + ":" + pad(s % 60);
};
export const fmtSecs = s => {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ":" + pad(s % 60);
};
export const fmtSess = m => (m >= 60 ? Math.floor(m / 60) + " h " + pad(m % 60) + " min" : m + " min");
export function fmtClock(ms) {
  const t = Math.max(0, Math.round(ms / 1000)),
    h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    sec = t % 60;
  return h ? h + ":" + pad(m) + ":" + pad(sec) : m + ":" + pad(sec);
}
