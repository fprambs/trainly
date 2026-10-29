// Apariencia: modo (sistema / claro / oscuro) + paleta de colores. Se guarda en este dispositivo.
// index.html aplica lo guardado antes de pintar (sin parpadeo); este módulo dibuja los controles y escucha cambios.
const MODEK = "trainly-modo", PALK = "trainly-paleta";

// light/dark: [acento, texto sobre acento, fondo suave]; bg: tinte opcional de fondos [bg, surface, surface2, line, media]
export const PALETTES = [
  { id: "", name: "Índigo", light: ["#5B4FE6", "#FFFFFF", "#ECEAFE"], dark: ["#8E84FF", "#120F2E", "#221F45"] },
  { id: "azul", name: "Azul", light: ["#1F6FEB", "#FFFFFF", "#E3EEFD"], dark: ["#5AA2FF", "#06162E", "#132A47"] },
  { id: "turquesa", name: "Turquesa", light: ["#0B847C", "#FFFFFF", "#D8F2EF"], dark: ["#2FD4C4", "#04221F", "#0D2E2B"] },
  { id: "esmeralda", name: "Esmeralda", light: ["#11804B", "#FFFFFF", "#DCF2E5"], dark: ["#4ADE94", "#04200F", "#0E2C1C"] },
  { id: "naranja", name: "Naranja", light: ["#D9480F", "#FFFFFF", "#FFE8DB"], dark: ["#FF9350", "#2A1100", "#3A1E0C"] },
  { id: "uva", name: "Uva", light: ["#8B2FD9", "#FFFFFF", "#F1E4FD"], dark: ["#C38BFF", "#1E0638", "#2E1648"] },
  { id: "fucsia", name: "Fucsia", light: ["#C2187A", "#FFFFFF", "#FCE3F1"], dark: ["#FF6CC4", "#33061F", "#3D1430"],
    down: { light: ["#D9480F", "#FFE8DB"], dark: ["#FF9350", "#3A1E0C"] } },
  { id: "grafito", name: "Grafito", light: ["#1E2230", "#FFFFFF", "#E9EBF0"], dark: ["#E9EBF1", "#11141B", "#262B36"],
    up: { light: ["#0E8C7E", "#DDF3EF"], dark: ["#3FD3BF", "#0F2D2A"] } },
  { id: "vidrio", name: "Vidrio", light: ["#6C4CF0", "#FFFFFF", "#ECE6FF"], dark: ["#A08CFF", "#160B3A", "#2E2163"],
    bg: { light: ["#F4F1FC", "#FFFFFF", "#F8F5FF", "#E3DDF4", "#FFFFFF"], dark: ["#140D33", "#1D1545", "#261C55", "#352A6E", "#261C55"] } },
  { id: "oceano", name: "Océano", light: ["#0A78A8", "#FFFFFF", "#DDF0F8"], dark: ["#18D2C4", "#03211F", "#0F3340"],
    bg: { light: ["#EFF5F8", "#FFFFFF", "#F4F9FB", "#D9E6EC", "#FFFFFF"], dark: ["#08131F", "#0F1D2D", "#16283B", "#20354B", "#16283B"] } },
];
const MODES = [
  { id: "system", name: "Sistema", ic: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>' },
  { id: "light", name: "Claro", ic: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' },
  { id: "dark", name: "Oscuro", ic: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' },
];

const get = k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
const VARS = ["--accent", "--accent-ink", "--soft", "--up", "--upsoft", "--down", "--downsoft", "--bg", "--surface", "--surface2", "--line", "--media"];

export const getMode = () => (["light", "dark"].includes(get(MODEK)) ? get(MODEK) : "system");
export const getPalette = () => {
  let v = get(PALK); if (!v && get("bitacora-paleta")) { v = get("bitacora-paleta"); set(PALK, v); } // paleta elegida en la versión anterior
  return PALETTES.some(p => p.id === v) ? v : "";
};

export function applyTheme() {
  const root = document.documentElement, mode = getMode();
  const dark = mode === "dark" || (mode === "system" && !!(mq && mq.matches));
  root.setAttribute("data-theme", dark ? "dark" : "light");
  const p = PALETTES.find(x => x.id === getPalette()) || PALETTES[0], t = dark ? "dark" : "light";
  VARS.forEach(v => root.style.removeProperty(v));
  const [a, ink, soft] = p[t];
  root.style.setProperty("--accent", a); root.style.setProperty("--accent-ink", ink); root.style.setProperty("--soft", soft);
  const up = p.up ? p.up[t] : [a, soft];
  root.style.setProperty("--up", up[0]); root.style.setProperty("--upsoft", up[1]);
  if (p.down) { root.style.setProperty("--down", p.down[t][0]); root.style.setProperty("--downsoft", p.down[t][1]); }
  if (p.bg) ["--bg", "--surface", "--surface2", "--line", "--media"].forEach((v, i) => root.style.setProperty(v, p.bg[t][i]));
  const cache = {}; VARS.forEach(v => { const x = root.style.getPropertyValue(v); if (x) cache[v] = x; });
  set("trainly-tv", JSON.stringify({ t, v: cache }));
  // barra del navegador / estado del teléfono
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim() || (dark ? "#0E0F16" : "#F4F5F9");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => { if (i) m.remove(); else { m.removeAttribute("media"); m.setAttribute("content", bg); } });
  document.querySelectorAll("[data-appear]").forEach(paint);
}

const svg = d => '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
export function appearanceHTML() {
  const mode = getMode(), pal = getPalette();
  return '<div class="apmode" role="radiogroup" aria-label="Modo de color">' +
    MODES.map(m => '<button type="button" role="radio" data-mode="' + m.id + '" aria-checked="' + (m.id === mode) + '">' + svg(m.ic) + "<span>" + m.name + "</span></button>").join("") + "</div>" +
    '<div class="appal" role="radiogroup" aria-label="Paleta de colores">' +
    PALETTES.map(p => {
      const l = p.bg ? p.bg.light[0] : "#F4F5F9", d = p.bg ? p.bg.dark[0] : "#0E0F16";
      return '<button type="button" role="radio" data-pal="' + p.id + '" aria-checked="' + (p.id === pal) + '" aria-label="' + p.name + '">' +
        '<span class="apsw" style="--l:' + p.light[0] + ";--d:" + p.dark[0] + ";--lb:" + l + ";--db:" + d + '"><i></i></span><small>' + p.name + "</small></button>";
    }).join("") + "</div>" +
    '<p class="hint">Se guarda en este dispositivo. «Sistema» sigue el modo claro/oscuro de tu teléfono o computador.</p>';
}
function paint(el) { el.innerHTML = appearanceHTML(); }

export function initTheme() {
  applyTheme();
  if (mq) { const f = () => { if (getMode() === "system") applyTheme(); }; mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f); }
  document.addEventListener("click", e => {
    const host = e.target.closest("[data-appear]"); if (!host) return;
    const m = e.target.closest("[data-mode]"), p = e.target.closest("[data-pal]");
    if (m) { set(MODEK, m.dataset.mode); applyTheme(); }
    else if (p) { set(PALK, p.dataset.pal); applyTheme(); }
  });
}
