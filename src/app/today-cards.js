// Hoy: tarjeta de sesión, barra Te toca y tarjetas de ejercicios.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { doneArr, sessionStart, sessLabel, sessDur } from "../lib/sessions.js";
import { esc, fmtSecs, fmtSess } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { renderNext, goBtnHTML, cardsHTML, completeFlow });
  // ---------- Hoy: resumen de la sesión + barra "Te toca" ----------
  function renderNext(list) {
    const box = $("nextBox"),
      withSets = list.filter(e => e.sets > 0);
    $("legend").hidden = true;
    const nx = withSets.length ? app.findNext(list) : null;
    renderTeToca(nx);
    if (!withSets.length) {
      box.innerHTML = "";
      return;
    }
    const C = app.countSets(withSets),
      pct = C.t ? Math.round((C.d / C.t) * 100) : 0;
    const st = sessionStart(list),
      dur = st ? Math.max(1, Math.round((Date.now() - st) / 60000)) : null;
    const focusOk = nx && app.isLive(nx.e);
    box.innerHTML =
      '<div class="sesscard' +
      (!nx ? " complete" : "") +
      '"><div class="sc-top"><b>' +
      (!nx ? "¡Sesión completa!" : "Sesión") +
      "</b><span>" +
      C.d +
      " de " +
      C.t +
      " series" +
      (dur && app.isLive(withSets[0]) ? " · " + fmtSess(dur) : "") +
      "</span></div>" +
      '<div class="sc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' +
      C.t +
      '" aria-valuenow="' +
      C.d +
      '" aria-label="Series hechas"><i style="width:' +
      pct +
      '%"></i></div>' +
      (focusOk
        ? '<button type="button" class="sc-focus" id="focusOpen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>Modo entrenamiento</button>'
        : "") +
      "</div>";
  }
  $("nextBox").addEventListener("click", ev => {
    if (ev.target.closest("#focusOpen")) app.openFocus(true);
  });
  function goBtnHTML(e, i, cls, label) {
    const timed = app.isTimed(e) && app.isLive(e),
      run = app.isRunning(e.id, i);
    const ic = run
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
      : timed
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
    const txt = run
      ? 'Detener <span class="runtxt">' + fmtSecs((Date.now() - app.running.start) / 1000) + "</span>"
      : timed
        ? "Iniciar"
        : label || "Completar";
    return (
      '<button type="button" class="' +
      cls +
      (run ? " running" : "") +
      '" data-go="' +
      esc(e.id) +
      '" data-gi="' +
      i +
      '">' +
      ic +
      "<span>" +
      txt +
      "</span></button>"
    );
  }
  function renderTeToca(nx) {
    const bar = $("teToca");
    const show = !!nx && !app.FS.open;
    bar.hidden = !show;
    document.body.classList.toggle("has-toca", show);
    const rn = $("rNext");
    if (nx) {
      rn.hidden = false;
      rn.innerHTML =
        "Después: <b>" +
        esc(nx.e.name) +
        " · serie " +
        (nx.r + 1) +
        "</b>" +
        goBtnHTML(nx.e, nx.r, "btnlike rnextbtn", "Anotar ya");
    } else {
      rn.hidden = true;
    }
    if (!show) {
      bar.innerHTML = "";
      return;
    }
    const e = nx.e,
      t = doneArr(e).length;
    bar.innerHTML =
      '<button type="button" class="tt-info" data-open="' +
      esc(e.id) +
      '"><small>Te toca</small><b>' +
      esc(e.name) +
      "</b><span>Serie " +
      (nx.r + 1) +
      " de " +
      t +
      (app.planText(e) ? " · " + esc(app.planText(e)) : "") +
      "</span></button>" +
      goBtnHTML(e, nx.r, "tt-go");
  }

  // ---------- Hoy: tarjetas ----------
  function cardHTML(e, nx) {
    const ds = doneArr(e),
      n = ds.filter(Boolean).length,
      t = ds.length,
      r = app.imgOf(e.name);
    const full = t > 0 && n >= t,
      cur = nx && nx.e.id === e.id;
    const dots = t
      ? '<span class="tdots" aria-hidden="true">' +
        (t <= 6
          ? ds.map((d, i) => '<i class="' + (d ? "on" : cur && i === nx.r ? "nx" : "") + '"></i>').join("")
          : "<em>" + n + "/" + t + "</em>") +
        "</span>"
      : "";
    return (
      '<div class="entry tcard' +
      (full ? " done" : "") +
      (cur ? " cur" : "") +
      (e.createdAt === app.lastNew ? " new" : "") +
      '" data-id="' +
      esc(e.id) +
      '" data-open="' +
      esc(e.id) +
      '" role="button" tabindex="0" aria-label="' +
      esc(e.name) +
      (t ? ": " + n + " de " + t + " series" : "") +
      '">' +
      '<span class="tthumb">' +
      (r ? app.mediaHTML(r) : "<i>" + esc((e.name || "?").charAt(0).toUpperCase()) + "</i>") +
      "</span>" +
      '<span class="tinfo"><b>' +
      esc(e.name) +
      (app.recIds.has(e.id) ? ' <span class="pr">★</span>' : "") +
      "</b><small>" +
      app.figs(e) +
      "</small>" +
      (e.memo ? '<small class="tmemo">' + esc(e.memo) + "</small>" : "") +
      "</span>" +
      (full
        ? '<span class="tdone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>Listo</span>'
        : dots) +
      "</div>"
    );
  }
  function cardsHTML(groups, nx) {
    if (groups.length < 2) return groups[0].entries.map(e => cardHTML(e, nx)).join("");
    return groups
      .map(
        g =>
          '<div class="sesshead">' +
          esc(sessLabel(g)) +
          (sessDur(g) && g.end > g.start ? " <span>· " + fmtSess(sessDur(g)) + "</span>" : "") +
          "</div>" +
          g.entries.map(e => cardHTML(e, nx)).join("")
      )
      .join("");
  }
  document.addEventListener("click", ev => {
    const g = ev.target.closest("[data-go]");
    if (g) {
      ev.stopPropagation();
      completeFlow(g.dataset.go, +g.dataset.gi);
      return;
    }
    const c = ev.target.closest("[data-open]");
    if (c && !c.closest("#exDet")) {
      if (Date.now() - app.lastDragEnd < 500) return;
      app.openDetail(c.dataset.open);
    }
  });
  document.addEventListener("click", ev => {
    const g = ev.target.closest("[data-gotab]");
    if (g) app.showTab(g.dataset.gotab);
  });
  document.addEventListener("keydown", ev => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches(".tcard[data-open]")) {
      ev.preventDefault();
      app.openDetail(ev.target.dataset.open);
    }
  });

  // completar una serie: por tiempo (hoy) primero corre el cronómetro; luego siempre se confirma en la ventana
  function completeFlow(id, i) {
    const e = app.entries.find(x => x.id === id);
    if (!e) return;
    app.touch();
    app.ensureAudio();
    if (app.isTimed(e) && app.isLive(e)) {
      if (!app.isRunning(id, i)) {
        app.running = { id, i, start: Date.now() };
        app.stopRest();
        app.keepAwake();
        app.reRenderLists();
        return;
      }
      const secs = (Date.now() - app.running.start) / 1000;
      app.running = null;
      const dr = app.defaultDraft(e, i);
      dr.t = Math.round(secs) / 60;
      app.reRenderLists();
      app.openSetModal(e, i, dr, false);
      return;
    }
    app.openSetModal(e, i, app.defaultDraft(e, i), false);
  }
}
