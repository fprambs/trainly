// Avisos, sonido y pantalla encendida.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { esc } from "../lib/format.js";

export function install(app) {
  const { $, env } = app;
  Object.assign(app, { renderWho, toast, ensureAudio, beep, keepAwake, updateAwake });
  // ---------- aviso flotante ----------
  let toastT = null;
  let toastAct = null;
  // modo profesor: nombre del alumno al que se está anotando (vacío si es uno mismo)
  app.otherName = () => (env.isCoach() && app.ath && app.ath.user_id !== app.me ? app.ath.name : "");
  function renderWho() {
    const n = app.otherName(),
      w = $("whoBar");
    if (!w) return;
    w.hidden = !n;
    if (n)
      w.innerHTML =
        '<span class="av">' + esc(n.charAt(0).toUpperCase()) + "</span><span>Anotando a <b>" + esc(n) + "</b></span>";
  }
  function toast(msg, star, action) {
    const t = $("toast");
    toastAct = action || null;
    t.innerHTML =
      '<span class="tmsg">' +
      (star ? "<b>★</b> " : "") +
      esc(msg) +
      "</span>" +
      (action ? '<button type="button" id="toastBtn">' + esc(action.label) + "</button>" : "");
    t.classList.toggle("gold", !!star);
    t.style.bottom = ""; // arriba de la pantalla: no tapa la barra Te toca ni las ventanas
    if (star) burst();
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(
      () => {
        t.hidden = true;
        toastAct = null;
      },
      action ? 7000 : 4500
    );
  }
  // destello dorado al hacer un récord
  function burst() {
    try {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch (e) {}
    const t = $("toast").getBoundingClientRect(),
      cx = t.left + t.width / 2 || window.innerWidth / 2,
      cy = t.top + t.height / 2 || window.innerHeight - 120;
    for (let k = 0; k < 14; k++) {
      const d = document.createElement("i");
      d.className = "burst";
      const a = (Math.PI * 2 * k) / 14,
        r = 60 + Math.random() * 50;
      d.style.left = cx + "px";
      d.style.top = cy + "px";
      d.style.setProperty("--dx", Math.cos(a) * r + "px");
      d.style.setProperty("--dy", Math.sin(a) * r - 30 + "px");
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1000);
    }
  }
  $("toast").addEventListener("click", async e => {
    if (!e.target.closest("#toastBtn") || !toastAct) {
      $("toast").hidden = true;
      clearTimeout(toastT);
      toastAct = null;
      return;
    }
    const a = toastAct;
    toastAct = null;
    $("toast").hidden = true;
    clearTimeout(toastT);
    try {
      await a.fn();
    } catch (err) {
      toast("No se pudo deshacer. Inténtalo de nuevo.");
    }
  });

  // ---------- sonido y pantalla encendida ----------
  let actx = null;
  function ensureAudio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (e) {}
  }
  function beep() {
    if (!actx) return;
    try {
      [0, 0.28, 0.56].forEach((d, i) => {
        const o = actx.createOscillator(),
          g = actx.createGain(),
          s = actx.currentTime + d;
        o.frequency.value = i === 2 ? 1320 : 880;
        o.connect(g);
        g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.45, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22);
        o.start(s);
        o.stop(s + 0.25);
      });
    } catch (e) {}
  }
  app.wl = null;
  app.lastAct = 0;
  app.touch = () => {
    app.lastAct = Date.now();
  };
  async function keepAwake() {
    app.touch();
    try {
      if (!app.wl && navigator.wakeLock && document.visibilityState === "visible") {
        app.wl = await navigator.wakeLock.request("screen");
        app.wl.addEventListener("release", () => {
          app.wl = null;
          updateAwake();
        });
      }
    } catch (e) {
      app.wl = null;
    }
    updateAwake();
  }
  function updateAwake() {
    $("rAwake").hidden = !app.wl;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - app.lastAct < 10 * 60e3) keepAwake();
  });
}
