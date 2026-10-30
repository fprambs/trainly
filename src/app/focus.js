// Modo entrenamiento (pantalla completa).
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { ordOf, doneArr, byCreated, sessionStart, splitSessions, sessLabel, sessDur } from "../lib/sessions.js";
import { parse, fmtShort, esc, norm, fmtTime, fmtDist, fmtSecs, fmtSess, fmtClock } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { lastTimeOf, defaultDraft, openFocus, tickFocus, render, sessListHTML, renderToday });
  // ---------- modo entrenamiento ----------
  app.FS = { open: false, key: null, draft: {}, view: null };
  const PLAY = '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  function focusList() {
    const list = app.entries.filter(e => e.date === app.today).sort(byCreated);
    const gs = list.length ? splitSessions(list) : [];
    return gs.length ? gs[gs.length - 1].entries : [];
  }
  function prevSetOf(e, i) {
    const ds = doneArr(e);
    for (let j = i - 1; j >= 0; j--) if (ds[j]) return ds[j];
    return null;
  }
  function lastTimeOf(e) {
    const o = app.entries
      .filter(x => x.id !== e.id && norm(x.name) === norm(e.name) && x.date <= e.date && doneArr(x).some(Boolean))
      .sort((a, b) => b.date.localeCompare(a.date) || ordOf(b) - ordOf(a))[0];
    if (!o) return null;
    const h = doneArr(o).filter(Boolean);
    return { date: o.date, line: h.map(x => app.setLine(o, x)).join(" · ") };
  }
  // metros solo para cardio por tiempo (ej. remo 5 min), no para una plancha
  app.wantsMeters = e =>
    e.mins != null &&
    e.dist == null &&
    (app.catOf(e.name) === "cardio" ||
      app.entries.some(x => norm(x.name) === norm(e.name) && (x.done || []).some(d => d && d.m != null)));
  function defaultDraft(e, i) {
    const b = app.targetOf(e),
      p = prevSetOf(e, i);
    // si en la serie anterior cambiaste peso o reps, la siguiente parte desde ahí
    return { w: p && p.w != null ? p.w : b.w, r: p && p.r != null ? p.r : b.r, m: e.dist != null ? b.m : null };
  }
  function fField(k, label, val, step) {
    return (
      '<div class="ffield"><span class="fl">' +
      label +
      '</span><div class="fstep">' +
      '<button type="button" data-fs="' +
      k +
      '" data-d="-' +
      step +
      '" aria-label="Bajar ' +
      label +
      '">−</button>' +
      '<input data-ff="' +
      k +
      '" id="ff-' +
      k +
      '" class="num" type="number" inputmode="decimal" step="any" min="0" value="' +
      (val == null ? "" : val) +
      '" aria-label="' +
      label +
      '">' +
      '<button type="button" data-fs="' +
      k +
      '" data-d="' +
      step +
      '" aria-label="Subir ' +
      label +
      '">+</button></div></div>'
    );
  }
  function renderFocus() {
    if (!app.FS.open) return;
    const list = focusList(),
      withSets = list.filter(e => e.sets > 0),
      C = app.countSets(withSets),
      nx = app.findNext(list);
    const st = sessionStart(list);
    const top =
      '<div class="ftop"><button type="button" class="fx" data-fa="close" aria-label="Salir del modo entrenamiento">✕ Salir</button>' +
      '<span class="fclock"><b id="fClock">' +
      (st ? fmtClock(Date.now() - st) : "0:00") +
      "</b><small>Sesión</small></span>" +
      app.ringSVG(C.d, C.t, 48, 5, '<span style="font-size:.95rem">' + C.d + "<small>/" + C.t + "</small></span>") +
      "</div>";
    let body = "",
      view;
    const resting = app.rest && app.rest.end > Date.now();
    if (resting) {
      view = "rest";
      const left = Math.max(0, (app.rest.end - Date.now()) / 1000);
      body =
        '<div class="frest arrive"><span id="fRestRing">' +
        app.ringSVG(
          left,
          app.rest.total,
          230,
          12,
          '<span id="fRestT">' + fmtSecs(Math.ceil(left)) + "</span><small>Descanso</small>"
        ) +
        "</span>" +
        '<div class="racts"><button type="button" data-fr="-15">−15</button><button type="button" data-fr="15">+15</button><button type="button" data-fr="skip">Saltar</button></div>' +
        (nx
          ? '<div class="fnext">' +
            (app.imgOf(nx.e.name) ? app.mediaHTML(app.imgOf(nx.e.name), "mini", nx.e.name) : "") +
            "<div><small>Siguiente</small><b>" +
            esc(nx.e.name) +
            '</b><span class="hint">Serie ' +
            (nx.r + 1) +
            " de " +
            doneArr(nx.e).length +
            (app.planText(nx.e) ? " · " + esc(app.planText(nx.e)) : "") +
            "</span></div></div>"
          : "") +
        "</div>";
    } else if (!nx) {
      view = "end";
      let vol = 0;
      withSets.forEach(e =>
        doneArr(e).forEach(x => {
          if (x && x.w != null && x.r != null) vol += x.w * x.r * app.SF(e);
        })
      );
      body =
        '<div class="fend arrive">' +
        app.ringSVG(C.d, C.t, 170, 12, '<span style="font-size:2.6rem">✓</span>') +
        "<h2>¡Sesión completa!</h2><p>" +
        C.d +
        " series" +
        (st ? " · " + fmtClock(Date.now() - st) : "") +
        (vol ? " · " + Math.round(vol).toLocaleString("es-CL") + " kg de volumen" : "") +
        "</p>" +
        '<button type="button" class="btnlike solid" data-fa="summary">Ver resumen</button><button type="button" class="fskip" data-fa="close">Salir</button></div>';
    } else {
      view = "set";
      const e = nx.e,
        i = nx.r,
        key = e.id + ":" + i,
        total = doneArr(e).length;
      const fresh = app.FS.key !== key;
      if (fresh) {
        app.FS.key = key;
        app.FS.draft = defaultDraft(e, i);
      }
      const D = app.FS.draft,
        r = app.imgOf(e.name),
        timed = app.isTimed(e),
        run = app.isRunning(e.id, i);
      const p = prevSetOf(e, i),
        lt = p ? null : lastTimeOf(e);
      let fields = "";
      if (timed) {
        const goal =
          e.dist != null ? fmtDist(e.dist) + (e.mins != null ? " en " + fmtTime(e.mins) : "") : fmtTime(e.mins);
        fields =
          '<div class="frun"><span id="fRun">' +
          (run ? fmtSecs((Date.now() - app.running.start) / 1000) : "0:00") +
          "</span><small>Meta: " +
          esc(goal) +
          "</small></div>" +
          (app.wantsMeters(e) ? '<div class="fields">' + fField("m", "Metros", D.m, 50) + "</div>" : "");
      } else {
        const showW = e.weight != null || D.w != null || e.reps == null,
          showR = e.reps != null || D.r != null || e.weight == null;
        fields =
          '<div class="fields">' +
          (showW
            ? fField("w", app.perSide(nx.e.name) ? "Kg c/u" : "Kg", D.w, 1) +
              '<div class="fquick" role="group" aria-label="Atajos de peso"><button type="button" data-fs="w" data-d="-2.5">−2,5</button><button type="button" data-fs="w" data-d="2.5">+2,5</button><button type="button" data-fs="w" data-d="5">+5</button></div>'
            : "") +
          (showR ? fField("r", "Reps", D.r, 1) : "") +
          "</div>";
      }
      body =
        '<div class="fset' +
        (fresh ? " arrive" : "") +
        '" style="display:flex;flex-direction:column;gap:14px">' +
        '<div class="fmedia">' +
        (r ? app.mediaBig(r) : '<span class="fletter">' + esc((e.name || "?").charAt(0).toUpperCase()) + "</span>") +
        "</div>" +
        '<div class="fname"><small>' +
        (e.circuit ? "Ronda " + (i + 1) : "Ejercicio " + (withSets.indexOf(e) + 1) + " de " + withSets.length) +
        "</small><b>" +
        esc(e.name) +
        "</b><span>Serie " +
        (i + 1) +
        " de " +
        total +
        (app.planText(e) ? " · pedido: " + esc(app.planText(e)) : "") +
        "</span></div>" +
        (p
          ? '<p class="fprev">Serie anterior: <b>' + esc(app.setLine(e, p)) + "</b></p>"
          : lt
            ? '<p class="fprev">Última vez (' + esc(fmtShort(lt.date)) + "): <b>" + esc(lt.line) + "</b></p>"
            : "") +
        fields +
        (timed
          ? '<button type="button" class="fdone' +
            (run ? " stop" : "") +
            '" id="fDone">' +
            (run ? "■ Detener" : PLAY + " Iniciar") +
            "</button>"
          : '<button type="button" class="fdone" id="fDone">✓ Hecha</button>') +
        "</div>";
    }
    app.FS.view = view;
    $("focus").innerHTML = '<div class="fwrap">' + top + body + "</div>";
  }
  function openFocus(open) {
    app.FS.open = open;
    $("focus").hidden = !open;
    document.body.classList.toggle("focusing", open);
    if (open) {
      app.FS.key = null;
      app.touch();
      app.ensureAudio();
      app.keepAwake();
      renderFocus();
    } else {
      $("focus").innerHTML = "";
      app.reRenderLists();
    }
  }
  $("focus").addEventListener("input", ev => {
    const k = ev.target.dataset && ev.target.dataset.ff;
    if (!k) return;
    const v = ev.target.value.replace(",", ".");
    app.FS.draft[k] = v === "" ? null : Number(v);
  });
  $("focus").addEventListener("click", async ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    app.touch();
    app.ensureAudio();
    if (b.dataset.fa === "close") {
      openFocus(false);
      return;
    }
    if (b.dataset.fa === "summary") {
      openFocus(false);
      $("date").value = app.today;
      renderToday();
      app.openSummary(true);
      return;
    }
    if (b.dataset.fs) {
      const k = b.dataset.fs,
        cur = app.FS.draft[k] ?? 0,
        nv = Math.max(0, Math.round((cur + Number(b.dataset.d)) * 100) / 100);
      app.FS.draft[k] = nv;
      const inp = $("ff-" + k);
      if (inp) inp.value = nv;
      return;
    }
    if (b.dataset.fr) {
      if (!app.rest) return;
      if (b.dataset.fr === "skip") {
        app.stopRest();
        renderFocus();
        return;
      }
      const d = +b.dataset.fr;
      app.rest.end += d * 1000;
      app.rest.total = Math.max(1, app.rest.total + d);
      app.tick();
      if (app.rest.end <= Date.now()) {
        renderFocus();
      }
      return;
    }
    if (b.id === "fDone") {
      const list = focusList(),
        nx = app.findNext(list);
      if (!nx) return;
      const e = nx.e,
        i = nx.r;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (app.isTimed(e)) {
        if (!app.isRunning(e.id, i)) {
          app.running = { id: e.id, i, start: Date.now() };
          app.stopRest();
          app.keepAwake();
          renderFocus();
          app.reRenderLists();
          return;
        }
        const secs = (Date.now() - app.running.start) / 1000;
        app.running = null;
        const val = Object.assign(app.targetOf(e), { t: Math.round(secs) / 60, at: Date.now() });
        if (app.wantsMeters(e) && app.FS.draft.m != null) val.m = app.FS.draft.m;
        await app.saveSet(e, i, val);
        app.editing = null;
        app.startRest(e);
        app.checkPR(e);
        renderFocus();
        return;
      }
      const val = Object.assign(app.targetOf(e), {
        w: app.FS.draft.w ?? null,
        r: app.FS.draft.r ?? null,
        at: Date.now()
      });
      await app.saveSet(e, i, val);
      app.editing = null;
      app.startRest(e);
      app.checkPR(e);
      renderFocus();
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && app.FS.open && $("sumOv").hidden) openFocus(false);
  });
  function tickFocus() {
    if (!app.FS.open) return;
    const resting = app.rest && app.rest.end > Date.now();
    if ((resting ? "rest" : "other") !== (app.FS.view === "rest" ? "rest" : "other")) {
      if (!app.typingInPanel()) renderFocus();
      return;
    }
    const list = focusList(),
      st = sessionStart(list),
      c = $("fClock");
    if (c && st) c.textContent = fmtClock(Date.now() - st);
    if (resting) {
      const left = Math.max(0, (app.rest.end - Date.now()) / 1000),
        t = $("fRestT");
      if (t) t.textContent = fmtSecs(Math.ceil(left));
      const fg = document.querySelector("#fRestRing .rfg");
      if (fg) {
        const c2 = +fg.getAttribute("stroke-dasharray");
        fg.setAttribute("stroke-dashoffset", (c2 * (1 - left / app.rest.total)).toFixed(1));
      }
    }
    if (app.running) {
      const fr = $("fRun");
      if (fr) fr.textContent = fmtSecs((Date.now() - app.running.start) / 1000);
    }
  }

  function render() {
    app.renderWho();
    const days = new Set(app.entries.map(e => e.date));
    const now = new Date(),
      dow = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const nDays = [...days].filter(d => parse(d) >= monday).length;
    $("sWeek").textContent = nDays;
    $("sWeekL").textContent = nDays === 1 ? "día" : "días";
    app.computeRecords();
    const wk = app.entries.filter(e => parse(e.date) >= monday);
    // series hechas; si un registro no tiene series marcadas, cuenta las anotadas
    let nSets = 0;
    wk.forEach(e => {
      const ds = (Array.isArray(e.done) ? e.done : []).filter(Boolean);
      nSets += ds.length ? ds.length : +e.sets || 0;
    });
    $("sKg").textContent = nSets;
    $("sKgL").textContent = nSets === 1 ? "serie" : "series";
    // volumen: peso × reps de cada serie hecha (o lo anotado si no hay series marcadas)
    let vol = 0;
    wk.forEach(e => {
      const ds = (Array.isArray(e.done) ? e.done : []).filter(Boolean);
      if (ds.length)
        ds.forEach(d => {
          if (d.w != null && d.r != null) vol += d.w * d.r * app.SF(e);
        });
      else if (e.sets && e.reps && e.weight) vol += e.sets * e.reps * e.weight * app.SF(e);
    });
    $("sVol").textContent = Math.round(vol).toLocaleString("es-CL");
    const prs = wk.filter(e => app.recIds.has(e.id)).length;
    $("sPrL").textContent = prs === 1 ? "récord" : "récords";
    $("sPr").textContent = prs;
    $("sPrBox").hidden = !prs;
    app.updateAddBtn();
    if (app.typingInPanel() || app.drag) app.deferred = true;
    else {
      renderToday();
      app.renderHistory();
      app.renderDetail();
    }
    app.renderProgress();
    app.renderGrid();
    app.renderCatAI();
    app.maybeAutoClassify();
    if (!(
      document.activeElement &&
      document.activeElement.classList &&
      document.activeElement.classList.contains("rutname")
    ))
      app.renderRoutinesTab();
    if (app.FS.open && !app.typingInPanel()) renderFocus();
    $("backupBox").hidden = !app.downloads || !app.entries.length;
    $("aiCard").hidden = !app.sampler || !app.entries.length;
    $("idRow").hidden = !app.sampler;
    $("catIdRow").hidden = !app.sampler;
  }
  // duración: desde la primera a la última serie marcada del día
  // separa un día en sesiones: si pasan más de 30 min sin marcar series, empieza otra
  function sessListHTML(groups) {
    if (groups.length < 2) return groups[0].entries.map(e => app.entryHTML(e)).join("");
    return groups
      .map(
        g =>
          '<div class="sesshead">' +
          esc(sessLabel(g)) +
          (sessDur(g) && g.end > g.start ? " <span>· " + fmtSess(sessDur(g)) + "</span>" : "") +
          "</div>" +
          g.entries.map(e => app.entryHTML(e)).join("")
      )
      .join("");
  }

  function renderToday() {
    const d = $("date").value || app.today;
    const list = app.entries.filter(e => e.date === d).sort(byCreated);
    const groups = list.length ? splitSessions(list) : [];
    const sm = groups.length === 1 ? sessDur(groups[0]) : null;
    $("todayTitle").innerHTML =
      "Ejercicios" + (groups.length > 1 ? ' <span class="sess">· ' + groups.length + " sesiones</span>" : "");
    void sm;
    app.renderDay(d);
    const cur = d > app.today ? [] : groups.length ? groups[groups.length - 1].entries : [];
    app.renderNext(cur);
    const others = [...new Set(app.entries.map(e => e.date))].filter(x => x !== d);
    const canLoad = others.length || app.routines.length || list.length;
    $("repeatBtn").hidden = !canLoad || !list.length; // con el día vacío ya está "Cargar rutina"
    if (!canLoad) $("repeatBox").hidden = true;
    $("todayList").hidden = !list.length;
    $("emptyDay").hidden = !!list.length;
    $("sumBtn").hidden = !list.length;
    if (app.sumState && !$("sumOv").hidden) app.renderSummary();
    const nx = app.findNext(cur);
    $("todayList").innerHTML = list.length ? app.cardsHTML(groups, nx) : "";
  }
  $("dayToday").addEventListener("click", () => app.goDay(app.today));
}
