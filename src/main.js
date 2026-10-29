import "./style.css";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { startApp } from "./app.js";
import { createAI } from "./ai.js";
import { initTheme, appearanceHTML } from "./theme.js";
import { initLayers } from "./layers.js";
initTheme();
initLayers();

const $ = id => document.getElementById(id);
const esc = s => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

// ---------- service worker (app instalable y funciona sin señal) ----------
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
// ---------- aviso de versión nueva: la app instalada puede quedar abierta días con el código viejo ----------
if (import.meta.env.PROD) {
  const myScript = () => { const s = document.querySelector('script[type="module"][src*="/assets/"]'); return s ? new URL(s.src, location.href).pathname : null; };
  let lastCheck = 0, dismissed = false;
  $("updBtn").onclick = () => location.reload();
  $("updX").onclick = () => { dismissed = true; $("updBar").hidden = true; setTimeout(() => { dismissed = false; }, 30 * 60e3); };
  async function checkUpdate() {
    if (Date.now() - lastCheck < 60e3 || !$("updBar").hidden) return;
    lastCheck = Date.now();
    try {
      const html = await (await fetch("/?_v=" + Date.now(), { cache: "no-store" })).text();
      const m = html.match(/\/assets\/index-[\w-]+\.js/), cur = myScript();
      if (m && cur && m[0] !== cur && !dismissed) {
        $("updBar").hidden = false;
      }
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
  setInterval(checkUpdate, 10 * 60e3);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  $("boot").innerHTML = '<div class="setupmsg"><h1>Falta configurar Supabase</h1><p>Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en Netlify (o en un archivo <code>.env</code>) y vuelve a publicar.</p></div>';
  throw new Error("Supabase no configurado");
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
window.__sb = sb; // útil para depurar desde la consola

// ======================================================================
// ACCESO
// ======================================================================
let mode = "in";
function setMode(m) {
  mode = m;
  $("aTabIn").setAttribute("aria-selected", m === "in");
  $("aTabUp").setAttribute("aria-selected", m === "up");
  $("aNameRow").hidden = m !== "up";
  $("aRoleRow").hidden = m !== "up";
  $("aForgot").hidden = m !== "in";
  $("authGo").textContent = m === "in" ? "Ingresar" : "Crear cuenta";
  $("aPass").autocomplete = m === "in" ? "current-password" : "new-password";
  $("authErr").textContent = "";
}
$("aTabIn").onclick = () => setMode("in");
$("aTabUp").onclick = () => setMode("up");
const authMsg = (t, ok) => { const e = $("authErr"); e.textContent = t; e.classList.toggle("ok", !!ok); };
function niceAuthError(e) {
  const m = (e && e.message) || "";
  if (/Invalid login/i.test(m)) return "Email o contraseña incorrectos.";
  if (/already registered|already exists/i.test(m)) return "Ese email ya tiene cuenta. Toca “Ingresar”.";
  if (/Password should be|at least 6/i.test(m)) return "La contraseña debe tener al menos 6 caracteres.";
  if (/Email not confirmed/i.test(m)) return "Falta confirmar el email (revisa tu correo).";
  if (/rate limit|too many/i.test(m)) return "Demasiados intentos. Espera un momento.";
  if (/fetch|network/i.test(m)) return "Sin conexión. Revisa tu internet.";
  return m || "No se pudo completar. Inténtalo de nuevo.";
}
$("authForm").addEventListener("submit", async ev => {
  ev.preventDefault();
  const email = $("aEmail").value.trim().toLowerCase(), password = $("aPass").value;
  if (!email || !password) { authMsg("Completa email y contraseña."); return; }
  const btn = $("authGo"); btn.disabled = true; authMsg("");
  try {
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const name = $("aName").value.trim();
      if (!name) { authMsg("Escribe tu nombre."); btn.disabled = false; return; }
      const role = (document.querySelector('input[name="role"]:checked') || {}).value || "athlete";
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name, role } } });
      if (error) throw error;
      if (!data.session) authMsg("Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.", true);
    }
  } catch (e) { authMsg(niceAuthError(e)); }
  btn.disabled = false;
});
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>', EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
$("aShow").onclick = () => { const i = $("aPass"), b = $("aShow"), show = i.type === "password"; i.type = show ? "text" : "password"; b.innerHTML = show ? EYE_OFF : EYE; b.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña"); };
$("aForgot").onclick = async () => {
  const email = $("aEmail").value.trim().toLowerCase();
  if (!email) { authMsg("Escribe tu email arriba y vuelve a tocar aquí."); $("aEmail").focus(); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/" });
  authMsg(error ? niceAuthError(error) : "Te enviamos un correo a " + email + ". Abre el enlace en este mismo equipo para crear tu nueva contraseña.", !error);
};

// ======================================================================
// ARRANQUE
// ======================================================================
let booted = false, profile = null, myAthlete = null, students = [], coachesOfMe = [];
const api = {};
const LASTK = () => "bit-last-athlete-" + profile.id;

sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") { setTimeout(askNewPassword, 300); }
  if (session && !booted) { booted = true; boot(session).catch(showFatal); }
  if (!session && booted && event === "SIGNED_OUT") location.reload();
});
sb.auth.getSession().then(({ data }) => {
  if (!data.session) { $("boot").hidden = true; $("auth").hidden = false; setMode("in"); }
});

function showFatal(e) {
  console.error(e);
  $("boot").hidden = false;
  $("boot").innerHTML = '<div class="setupmsg"><h1>No se pudo abrir</h1><p>' + esc(e && e.message || e) + '</p><button class="btnlike solid" onclick="location.reload()">Reintentar</button></div>';
}

async function fetchProfile(uid) {
  for (let i = 0; i < 6; i++) {
    const { data } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) return data;
    if (i === 2) await sb.rpc("ensure_my_athlete");
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("No se encontró tu perfil. Revisa que el esquema de la base esté cargado.");
}

async function loadMyAthlete() {
  let { data } = await sb.from("athletes").select("*").eq("user_id", profile.id).maybeSingle();
  if (!data) { await sb.rpc("ensure_my_athlete"); ({ data } = await sb.from("athletes").select("*").eq("user_id", profile.id).maybeSingle()); }
  return data;
}
async function loadStudents() {
  if (profile.role !== "coach") { students = []; return; }
  const { data, error } = await sb.from("coach_athletes").select("athlete_id, created_at, athletes(id,name,user_id,invite_code,rest_cfg)").eq("coach_id", profile.id);
  if (error) throw error;
  students = (data || []).map(r => r.athletes).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "es"));
}
async function loadMyCoaches() {
  const { data } = await sb.from("coach_athletes").select("coach_id").eq("athlete_id", myAthlete.id);
  const ids = (data || []).map(x => x.coach_id);
  if (!ids.length) { coachesOfMe = []; return; }
  const { data: ps } = await sb.from("profiles").select("id,name").in("id", ids);
  coachesOfMe = ps || [];
}

async function boot(session) {
  $("auth").hidden = true; $("boot").hidden = false;
  profile = await fetchProfile(session.user.id);
  profile.email = session.user.email;
  myAthlete = await loadMyAthlete();
  if (!myAthlete) throw new Error("No se pudo crear tu historial.");
  await Promise.all([loadStudents(), loadMyCoaches()]);
  $("acctInitial").textContent = (profile.name || "?").charAt(0).toUpperCase();

  let initial = myAthlete;
  if (profile.role === "coach") {
    let last = null; try { last = localStorage.getItem(LASTK()); } catch (e) {}
    initial = students.find(s => s.id === last) || myAthlete;
  }
  $("boot").hidden = true; $("appRoot").hidden = false;

  startApp({
    sb, userId: profile.id, api,
    isCoach: () => profile.role === "coach",
    isAdmin: () => !!profile.is_admin,
    ai: createAI(sb),
    initialAthlete: initial,
    onEntryChange: p => { onCoachEntryChange(p); },
    onLinksChange: async () => { await loadStudents(); await loadMyCoaches(); renderAthBar(); if (!$("sheetOv").hidden) renderSheet(); }
  });
  if (profile.role === "coach") { await loadTodayAll(); renderAthBar(); setInterval(coachTick, 1000); }
  updateWho();
}

// ======================================================================
// MODO PROFESOR: barra de alumnos entrenando
// ======================================================================
let todayAll = {}; // athleteId → entries de hoy
const today = () => iso(new Date());
async function loadTodayAll() {
  const ids = students.map(s => s.id).concat(myAthlete.id);
  const { data } = await sb.from("entries").select("*").in("athlete_id", ids).eq("date", today());
  todayAll = {};
  (data || []).forEach(r => { (todayAll[r.athlete_id] = todayAll[r.athlete_id] || []).push(api.toEntry(r)); });
}
function onCoachEntryChange(p) {
  if (!profile || profile.role !== "coach") return;
  const row = p.new && p.new.id ? p.new : p.old;
  if (!row) return;
  Object.keys(todayAll).forEach(k => { todayAll[k] = todayAll[k].filter(e => e.id !== row.id); });
  if (p.eventType !== "DELETE" && row.date === today()) (todayAll[row.athlete_id] = todayAll[row.athlete_id] || []).push(api.toEntry(row));
  renderAthBar();
}
function currentId() { const a = api.currentAthlete && api.currentAthlete(); return a && a.id; }
function statusOf(a) {
  const id = a.id, cur = currentId();
  // para el alumno que se está viendo, usar los datos vivos de la app
  const list = (todayAll[id] || []).slice().sort((x, y) => (x.order ?? x.createdAt ?? 0) - (y.order ?? y.createdAt ?? 0));
  const rest = api.restOf(id), run = api.runningOf(id);
  if (rest) {
    const left = (rest.end - Date.now()) / 1000;
    return left > 0 ? { cls: "resting", txt: "⏱ " + api.fmtSecs(Math.ceil(left)) } : { cls: "ready", txt: "¡Le toca!" };
  }
  if (run) return { cls: "running", txt: "■ " + api.fmtSecs((Date.now() - run.start) / 1000) };
  if (!list.length) return { cls: "idle", txt: id === cur ? "Sin sesión hoy" : "Sin sesión" };
  const gs = api.splitSessions(list), g = gs[gs.length - 1].entries;
  const nx = api.findNext(g);
  let d = 0, t = 0; g.forEach(e => { const ds = api.doneArr(e); t += ds.length; d += ds.filter(Boolean).length; });
  if (!nx) return { cls: t ? "done" : "idle", txt: t ? "✓ " + d + "/" + t : "Planificado" };
  const nm = nx.e.name.length > 14 ? nx.e.name.slice(0, 13) + "…" : nx.e.name;
  return { cls: "next", txt: "S" + (nx.r + 1) + " · " + nm, prog: t ? d / t : 0 };
}
function renderAthBar() {
  const bar = $("athBar");
  if (!profile || profile.role !== "coach") { bar.hidden = true; return; }
  bar.hidden = false;
  const cur = currentId();
  // todos los alumnos, primero los que están entrenando hoy
  const isActive = s => (todayAll[s.id] || []).length || s.id === cur || api.restOf(s.id) ? 1 : 0;
  const shown = students.slice().sort((x, y) => isActive(y) - isActive(x) || x.name.localeCompare(y.name, "es"));
  const me = { id: myAthlete.id, name: "Yo" };
  const chip = a => {
    const st = statusOf(a);
    return '<button type="button" class="athchip ' + st.cls + (a.id === cur ? " cur" : "") + '" data-ath="' + esc(a.id) + '" aria-pressed="' + (a.id === cur) + '">' +
      '<span class="av">' + esc((a.name || "?").charAt(0).toUpperCase()) + '</span><span class="at"><b>' + esc(a.name) + '</b><small data-st="' + esc(a.id) + '">' + esc(st.txt) + '</small></span>' +
      (st.prog != null ? '<i class="pb" style="width:' + Math.round(st.prog * 100) + '%"></i>' : '') + '</button>';
  };
  bar.innerHTML = '<div class="athscroll">' + chip(me) + shown.map(chip).join("") + '</div>' +
    '<button type="button" class="athall" data-sheet="students" aria-label="Gestionar mis alumnos">Alumnos ▾</button>';
  // el alumno actual siempre a la vista
  if (cur !== lastCurChip) { lastCurChip = cur; const c = bar.querySelector(".athchip.cur"); if (c) try { c.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {} }
}
let lastBarHtml = "";
let lastCurChip = null;
const alerted = new Set();
function coachTick() {
  if (!profile || profile.role !== "coach") return;
  // actualiza solo los textos de estado (sin redibujar toda la barra)
  document.querySelectorAll("#athBar [data-st]").forEach(el => {
    const id = el.dataset.st, a = students.find(s => s.id === id) || (id === myAthlete.id ? { id, name: "Yo" } : null);
    if (!a) return;
    const st = statusOf(a); el.textContent = st.txt;
    const b = el.closest(".athchip"); if (b) b.className = "athchip " + st.cls + (id === currentId() ? " cur" : "");
  });
  // aviso cuando termina el descanso de un alumno que no estoy mirando
  students.forEach(s => {
    if (s.id === currentId()) return;
    const r = api.restOf(s.id);
    if (r && r.end <= Date.now() && !alerted.has(s.id + r.end)) {
      alerted.add(s.id + r.end);
      api.toast(s.name + ": ¡terminó el descanso!", false, { label: "Ver", fn: async () => switchTo(s.id) });
      try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch (e) {}
    }
  });
}
async function switchTo(id) {
  const a = students.find(s => s.id === id) || (id === myAthlete.id ? myAthlete : null);
  if (!a) return;
  try { localStorage.setItem(LASTK(), id); } catch (e) {}
  await api.setAthlete(a);
  renderAthBar(); updateWho();
}
$("athBar").addEventListener("click", e => {
  const b = e.target.closest("[data-ath]"); if (b) { switchTo(b.dataset.ath); return; }
  if (e.target.closest("[data-sheet]")) openSheet("students");
});
function updateWho() {
  const a = api.currentAthlete && api.currentAthlete();
  const mine = !a || a.id === myAthlete.id;
  $("weekWho").textContent = mine ? "Esta semana" : "Esta semana · " + a.name;
  document.body.classList.toggle("viewing-other", !mine);
}

// ======================================================================
// HOJA: cuenta y alumnos
// ======================================================================
let sheetKind = "account";
function openSheet(kind) { sheetKind = kind || "account"; renderSheet(); $("sheetOv").hidden = false; document.body.classList.add("sheet-open"); }
function closeSheet() { $("sheetOv").hidden = true; document.body.classList.remove("sheet-open"); }
$("acctBtn").onclick = () => openSheet(profile.role === "coach" ? "students" : "account");
$("sheetOv").addEventListener("click", e => { if (e.target.id === "sheetOv") closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("sheetOv").hidden) closeSheet(); });

const pwIn = (id, ph, ac) => '<input id="' + id + '" type="password" minlength="6" placeholder="' + ph + '" autocomplete="' + ac + '" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="' + ph + '">';
function pwFormHTML() {
  return '<form class="pwform" id="pwForm" novalidate>' +
    (recovering ? '<p class="hint">Entraste con el enlace de recuperación: elige tu nueva contraseña.</p>' : pwIn("pwOld", "Contraseña actual", "current-password")) +
    pwIn("pwNew", "Nueva contraseña (mín. 6)", "new-password") + pwIn("pwNew2", "Repite la nueva contraseña", "new-password") +
    '<div class="pwacts"><button type="button" class="linkbtn" id="pwShow">Mostrar</button><button class="btnlike solid" type="submit">Cambiar contraseña</button></div></form>';
}
function copyBtn(text) { return '<button type="button" class="btnlike" data-copy="' + esc(text) + '">Copiar</button>'; }
function renderSheet() {
  const s = $("sheet");
  const isCoach = profile.role === "coach";
  const tabs = isCoach ? '<div class="shtabs"><button type="button" data-sk="students" aria-pressed="' + (sheetKind === "students") + '">Alumnos</button><button type="button" data-sk="account" aria-pressed="' + (sheetKind === "account") + '">Mi cuenta</button></div>' : "";
  let body = "";
  if (isCoach && sheetKind === "students") {
    const cur = currentId();
    body = '<div class="codebox"><small>Tu código de profesor</small><b>' + esc(profile.coach_code || "—") + '</b>' + copyBtn(profile.coach_code || "") +
      '<p class="hint">Tus alumnos con cuenta lo ingresan en <b>Mi cuenta → Vincular con un profesor</b>.</p></div>' +
      '<form class="addstu" id="addStu"><input id="stuName" placeholder="Nombre del alumno" autocomplete="off" aria-label="Nombre del alumno"><button class="btnlike solid" type="submit">Agregar</button></form>' +
      '<p class="hint">Puedes agregar alumnos que aún no tienen cuenta: tú les anotas todo y, si después se registran, ingresan su código de invitación y ven su historial.</p>' +
      '<div class="stulist">' + (students.length ? students.map(a => {
        const st = statusOf(a);
        return '<div class="sturow' + (a.id === cur ? " cur" : "") + '"><button type="button" class="stumain" data-go="' + esc(a.id) + '"><span class="av">' + esc(a.name.charAt(0).toUpperCase()) + '</span><span><b>' + esc(a.name) + '</b><small>' +
          (a.user_id ? "Con cuenta" : "Sin cuenta · invitación <b class='code'>" + esc(a.invite_code || "") + "</b>") + ' · ' + esc(st.txt) + '</small></span></button>' +
          '<div class="stuacts">' + (a.user_id ? "" : copyBtn(a.invite_code || "") + '<button type="button" class="btnlike" data-newcode="' + esc(a.id) + '">Nuevo código</button>') +
          '<button type="button" class="btnlike danger" data-unlink="' + esc(a.id) + '">' + (a.user_id ? "Desvincular" : "Eliminar") + '</button></div></div>';
      }).join("") : '<p class="hint">Aún no tienes alumnos. Agrega el primero arriba o comparte tu código.</p>') + '</div>';
  } else {
    body = '<div class="f"><label for="pName">Tu nombre</label><div class="rowin"><input id="pName" value="' + esc(profile.name) + '"><button type="button" class="btnlike" id="pNameSave">Guardar</button></div></div>' +
      '<p class="hint">' + esc(profile.email || "") + ' · ' + (isCoach ? "Profesor" : "Alumno") + '</p>' +
      (isCoach ? '' :
        '<h3>Mis profesores</h3>' + (coachesOfMe.length ? '<div class="stulist">' + coachesOfMe.map(c => '<div class="sturow"><span class="stumain"><span class="av">' + esc(c.name.charAt(0).toUpperCase()) + '</span><span><b>' + esc(c.name) + '</b></span></span><div class="stuacts"><button type="button" class="btnlike danger" data-leave="' + esc(c.id) + '">Dejar</button></div></div>').join("") + '</div>' : '<p class="hint">Entrenas por tu cuenta. Puedes vincularte con uno o más profesores cuando quieras.</p>') +
        '<form class="addstu" id="linkForm"><input id="linkCode" placeholder="Código del profesor o invitación" autocomplete="off" autocapitalize="characters" aria-label="Código"><button class="btnlike solid" type="submit">Vincular</button></form>' +
        '<button type="button" class="linkbtn" id="becomeCoach">Quiero ser profesor (también puedo seguir entrenando)</button>') +
      '<h3>Apariencia</h3><div data-appear>' + appearanceHTML() + '</div>' +
      '<div id="backupSlot"></div>' +
      '<h3>Contraseña</h3>' + pwFormHTML() +
      '<div class="sheetfoot"><button type="button" class="btnlike danger" id="logout">Cerrar sesión</button></div>';
  }
  const bk = $("backupBox"); if (bk) $("park").appendChild(bk);
  s.innerHTML = '<div class="sheethead"><h2 id="sheetTitle">' + (isCoach && sheetKind === "students" ? "Mis alumnos" : "Mi cuenta") + '</h2><button type="button" class="iconbtn" id="sheetX" aria-label="Cerrar">✕</button></div>' + tabs + '<p class="autherr" id="sheetMsg" role="status"></p>' + body;
  if (bk && $("backupSlot")) $("backupSlot").appendChild(bk);
}
const sheetMsg = (t, ok) => { const e = $("sheetMsg"); if (e) { e.textContent = t; e.classList.toggle("ok", !!ok); } };
$("sheet").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "sheetX") { closeSheet(); return; }
  if (b.id === "pwShow") { const show = b.textContent === "Mostrar"; ["pwOld", "pwNew", "pwNew2"].forEach(id => { const i = $(id); if (i) i.type = show ? "text" : "password"; }); b.textContent = show ? "Ocultar" : "Mostrar"; return; }
  if (b.dataset.sk) { sheetKind = b.dataset.sk; renderSheet(); return; }
  if (b.dataset.copy != null) {
    const t = b.dataset.copy;
    try { await navigator.clipboard.writeText(t); b.textContent = "¡Copiado!"; } catch (er) { b.textContent = t; }
    setTimeout(() => { b.textContent = "Copiar"; }, 1500); return;
  }
  if (b.dataset.go) { closeSheet(); await switchTo(b.dataset.go); return; }
  if (b.dataset.newcode) {
    const { data, error } = await sb.rpc("new_invite_code", { p_athlete: b.dataset.newcode });
    if (error) { sheetMsg(error.message); return; }
    const a = students.find(s => s.id === b.dataset.newcode); if (a) a.invite_code = data; renderSheet(); sheetMsg("Nuevo código: " + data, true); return;
  }
  if (b.dataset.unlink) {
    const a = students.find(s => s.id === b.dataset.unlink); if (!a) return;
    if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = a.user_id ? "¿Seguro? Toca otra vez" : "¿Borrar su historial? Toca otra vez"; return; }
    const { error } = await sb.rpc("unlink", { p_coach: profile.id, p_athlete: a.id });
    if (error) { sheetMsg(error.message); return; }
    if (currentId() === a.id) await switchTo(myAthlete.id);
    await loadStudents(); renderSheet(); renderAthBar(); sheetMsg(a.user_id ? "Desvinculaste a " + a.name : "Eliminaste a " + a.name, true); return;
  }
  if (b.dataset.leave) {
    if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = "¿Seguro?"; return; }
    const { error } = await sb.rpc("unlink", { p_coach: b.dataset.leave, p_athlete: myAthlete.id });
    if (error) { sheetMsg(error.message); return; }
    await loadMyCoaches(); renderSheet(); sheetMsg("Listo. Tu historial sigue siendo tuyo.", true); return;
  }
  if (b.id === "pNameSave") {
    const name = $("pName").value.trim(); if (!name) return;
    const { error } = await sb.from("profiles").update({ name }).eq("id", profile.id);
    if (error) { sheetMsg(error.message); return; }
    await sb.from("athletes").update({ name }).eq("id", myAthlete.id);
    profile.name = name; myAthlete.name = name; $("acctInitial").textContent = name.charAt(0).toUpperCase(); sheetMsg("Nombre guardado", true); return;
  }
  if (b.id === "becomeCoach") {
    if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = "Toca otra vez para confirmar: pasarás a ser profesor"; return; }
    const { error } = await sb.rpc("become_coach");
    if (error) { sheetMsg(error.message); return; }
    location.reload(); return;
  }
  if (b.id === "logout") { await sb.auth.signOut(); location.reload(); }
});
$("sheet").addEventListener("submit", async e => {
  e.preventDefault();
  if (e.target.id === "pwForm") {
    const old = $("pwOld"), pw = $("pwNew").value, pw2 = $("pwNew2").value;
    if (old && !old.value) { sheetMsg("Escribe tu contraseña actual."); old.focus(); return; }
    if (pw.length < 6) { sheetMsg("La nueva contraseña debe tener al menos 6 caracteres."); $("pwNew").focus(); return; }
    if (pw !== pw2) { sheetMsg("Las contraseñas nuevas no coinciden."); $("pwNew2").focus(); return; }
    if (old && old.value === pw) { sheetMsg("La nueva contraseña debe ser distinta de la actual."); $("pwNew").focus(); return; }
    const btn = e.target.querySelector("[type=submit]"); btn.disabled = true;
    try {
      if (old) { // verifica la contraseña actual antes de cambiarla
        const { error: e1 } = await sb.auth.signInWithPassword({ email: profile.email, password: old.value });
        if (e1) { sheetMsg("La contraseña actual no es correcta."); old.value = ""; old.focus(); return; }
      }
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) { sheetMsg(niceAuthError(error)); return; }
      recovering = false; renderSheet(); sheetMsg("Contraseña actualizada.", true);
    } finally { btn.disabled = false; }
    return;
  }
  if (e.target.id === "addStu") {
    const name = $("stuName").value.trim(); if (!name) { $("stuName").focus(); return; }
    const { data, error } = await sb.rpc("create_athlete", { p_name: name });
    if (error) { sheetMsg(error.message); return; }
    await loadStudents(); renderSheet(); renderAthBar(); sheetMsg("Agregaste a " + name + ". Tócalo para empezar a anotarle.", true);
    void data; return;
  }
  if (e.target.id === "linkForm") {
    const code = $("linkCode").value.trim(); if (!code) { $("linkCode").focus(); return; }
    const { data, error } = await sb.rpc("link_with_code", { code });
    if (error) { sheetMsg(error.message); return; }
    await loadMyCoaches(); renderSheet(); sheetMsg(data, true);
    // si se unió un historial, recargar los datos
    await api.setAthlete(Object.assign({}, myAthlete, { id: myAthlete.id, _reload: Date.now() }));
  }
});

// nueva contraseña tras el correo de recuperación
let recovering = false;
function askNewPassword() {
  recovering = true;
  if (!profile) { setTimeout(askNewPassword, 300); return; }
  openSheet("account");
  sheetMsg("Elige tu nueva contraseña abajo, repítela y toca Cambiar contraseña.", true);
  const i = $("pwNew"); if (i) { i.scrollIntoView({ block: "center" }); i.focus(); }
}
