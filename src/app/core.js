// Base: fechas de hoy, pestañas.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { iso } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { showTab });

  app.today = iso(new Date());
  setInterval(() => {
    const t = iso(new Date());
    if (t !== app.today) {
      const wasToday = $("date").value === app.today;
      app.today = t;
      if (wasToday) $("date").value = t;
      app.render();
    }
  }, 30000);
  $("today").textContent = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  $("date").value = app.today;

  app.entries = [];
  app.catalog = [];
  app.images = {};
  app.assets = null;
  app.store = null;
  app.lastNew = null;
  app.picked = "";
  app.shownDays = 10;
  app.openDays = new Set();
  let openInit = false;

  // ---------- pestañas ----------
  const TABS = ["anotar", "rutinas", "historial", "progreso", "ejercicios"];
  // teclado abierto (campo de texto con foco): se esconden la barra de abajo y el +, y el campo queda a la vista
  const isTextField = el =>
    el &&
    ((el.tagName === "INPUT" && !/^(button|checkbox|radio|submit|file|range|color)$/i.test(el.type)) ||
      el.tagName === "TEXTAREA");
  const touchUI = () => {
    try {
      return matchMedia("(pointer:coarse)").matches && !matchMedia("(pointer:fine)").matches;
    } catch (e) {
      return false;
    }
  };
  document.addEventListener("focusin", ev => {
    if (isTextField(ev.target) && touchUI()) {
      document.body.classList.add("kb");
      setTimeout(() => {
        try {
          ev.target.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch (e) {}
      }, 280);
    }
  });
  document.addEventListener("focusout", () =>
    setTimeout(() => {
      if (!isTextField(document.activeElement)) document.body.classList.remove("kb");
    }, 60)
  );
  const tabScroll = {};
  function showTab(t) {
    if (!TABS.includes(t)) t = "anotar";
    const prevT = document.body.dataset.tab;
    if (prevT && prevT !== t) tabScroll[prevT] = window.scrollY;
    document.body.dataset.tab = t;
    TABS.forEach(x => {
      $("tab-" + x).hidden = x !== t;
      $("t-" + x).setAttribute("aria-selected", x === t ? "true" : "false");
    });
    // el historial siempre parte con todos los días cerrados
    if (t === "historial") {
      app.openDays.clear();
      document.querySelectorAll("#history details.day[open]").forEach(x => {
        x.open = false;
      });
    }
    try {
      history.replaceState(history.state, "", "#" + t);
    } catch (e) {}
    window.scrollTo(0, t === "historial" ? 0 : tabScroll[t] || 0);
  }
  (() => {
    const tb = document.querySelector(".tabs");
    const set = () =>
      document.documentElement.style.setProperty("--dock", Math.round(tb.getBoundingClientRect().height) + "px");
    set();
    try {
      new ResizeObserver(set).observe(tb);
    } catch (e) {
      addEventListener("resize", set);
    }
  })();
  document.querySelector(".tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]");
    if (b) showTab(b.dataset.tab);
  });
  showTab((location.hash || "").slice(1));
}
