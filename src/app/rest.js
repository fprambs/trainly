// Descanso entre series.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { doneArr } from "../lib/sessions.js";
import { imgKey, fmtDur, fmtSecs } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { startRest, stopRest, renderRestPresets, tick, reRenderLists, releaseFocus, findNext, ringSVG });
  // ---------- descanso ----------
  app.rest = null; // {name,key,end,total,beeped}
  const restFor = n => app.restCfg.by[imgKey(n)] || app.restCfg.def || 90;
  function startRest(e, secs) {
    const total = secs || restFor(e.name);
    app.rest = { name: e.name, key: imgKey(e.name), total, end: Date.now() + total * 1000, beeped: false };
    $("rest").hidden = false;
    document.body.classList.add("resting");
    $("rPre").hidden = true;
    $("rTimeBtn").setAttribute("aria-expanded", "false");
    $("rLabel").textContent = "Descanso · " + e.name;
    renderRestPresets();
    app.keepAwake();
    tick();
    try {
      if (
        "Notification" in window &&
        Notification.permission === "default" &&
        !localStorage.getItem("trainly-noti-asked")
      ) {
        localStorage.setItem("trainly-noti-asked", "1");
        app.askNotify();
      }
    } catch (e) {}
  }
  function stopRest() {
    if (typeof app.clearRestNoti === "function") app.clearRestNoti();
    app.rest = null;
    $("rest").hidden = true;
    $("rest").classList.remove("over");
    document.body.classList.remove("resting");
  }
  function renderRestPresets() {
    if (!app.rest) return;
    const cur = app.restCfg.by[app.rest.key] || null;
    $("rPresets").innerHTML = [30, 45, 60, 90, 120, 180]
      .map(
        s =>
          '<button type="button" data-preset="' +
          s +
          '"' +
          ((cur || app.restCfg.def) === s ? ' aria-pressed="true"' : "") +
          ">" +
          (s < 60 ? s + "s" : fmtSecs(s)) +
          "</button>"
      )
      .join("");
  }
  $("rest").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b || !app.rest) return;
    app.touch();
    app.ensureAudio();
    if (b.id === "rTimeBtn") {
      const p = $("rPre");
      p.hidden = !p.hidden;
      b.setAttribute("aria-expanded", p.hidden ? "false" : "true");
      return;
    }
    if (b.dataset.r === "skip") {
      stopRest();
      return;
    }
    if (b.dataset.go) {
      stopRest();
      return;
    } // "Anotar ya": corta el descanso y abre la serie
    if (b.dataset.r) {
      const d = +b.dataset.r;
      app.rest.end += d * 1000;
      app.rest.total = Math.max(1, app.rest.total + d);
      app.rest.beeped = app.rest.end <= Date.now() && app.rest.beeped;
      $("rest").classList.toggle("over", app.rest.end <= Date.now());
      tick();
      return;
    }
    if (b.dataset.preset) {
      const s = +b.dataset.preset,
        by = Object.assign({}, app.restCfg.by);
      by[app.rest.key] = s;
      const name = app.rest.name;
      try {
        await app.store.setSettings(Object.assign({}, app.restCfg, { def: app.restCfg.def || 90, by }));
      } catch (err) {}
      const now = Date.now(),
        elapsed = app.rest.total - (app.rest.end - now) / 1000;
      app.rest.total = s;
      app.rest.end = now + (s - elapsed) * 1000;
      app.rest.beeped = app.rest.end <= now;
      $("rPre").hidden = true;
      $("rTimeBtn").setAttribute("aria-expanded", "false");
      renderRestPresets();
      tick();
      app.toast("Descanso de " + name + ": " + (s < 60 ? s + " s" : fmtSecs(s) + " min"));
    }
  });
  function tick() {
    if (app.rest) {
      const left = (app.rest.end - Date.now()) / 1000;
      if (left > 0) {
        $("rTime").textContent = fmtSecs(Math.ceil(left));
        $("rFill").style.width = Math.max(0, Math.min(100, (1 - left / app.rest.total) * 100)) + "%";
        $("rest").classList.remove("over");
      } else {
        if (!app.rest.beeped) {
          app.rest.beeped = true;
          app.beep();
        }
        $("rest").classList.add("over");
        $("rTime").textContent = "+" + fmtSecs(-left);
        $("rFill").style.width = "100%";
        $("rLabel").textContent = "¡A la siguiente serie!";
        if (-left > 180) stopRest();
      }
    }
    if (app.running) {
      const txt = "■ " + fmtSecs((Date.now() - app.running.start) / 1000);
      document.querySelectorAll(".setpill.running .rt").forEach(p => (p.textContent = txt));
      const nb = $("nextDone");
      if (nb && app.isRunning(nb.dataset.sid, +nb.dataset.si)) nb.textContent = "Detener " + txt.slice(2);
      document.querySelectorAll(".runtxt").forEach(x => (x.textContent = txt.slice(2)));
    }
    if (app.wl && !app.rest && !app.running && !app.FS.open && Date.now() - app.lastAct > 10 * 60e3) {
      try {
        app.wl.release();
      } catch (e) {}
      app.wl = null;
      app.updateAwake();
    }
    app.tickFocus();
  }
  setInterval(tick, 250);
  function reRenderLists() {
    app.renderToday();
    app.renderHistory();
    app.renderDetail();
  }
  app.deferred = false;
  function releaseFocus() {
    const a = document.activeElement;
    if (a && a.blur && a.closest && a.closest(".eedit,.seted")) a.blur();
    if (app.deferred) {
      app.deferred = false;
      app.render();
    }
  }
  app.typingInPanel = () => {
    const a = document.activeElement;
    return !!(a && a.closest && a.closest(".eedit,.seted,#focus,#setModal") && /INPUT|TEXTAREA/.test(a.tagName));
  };
  document.addEventListener("focusout", () =>
    setTimeout(() => {
      if (app.deferred && !app.typingInPanel()) {
        app.deferred = false;
        app.render();
      }
    }, 50)
  );
  document.addEventListener("click", async ev => {
    const p = ev.target.closest(".setpill");
    if (p) {
      const id = p.dataset.sid,
        i = +p.dataset.si,
        e = app.entries.find(x => x.id === id);
      if (!e) return;
      const d = doneArr(e)[i];
      if (!d) {
        await app.markDone(id, i);
        return;
      }
      if (app.editing && app.editing.id === id && app.editing.i === i) app.editing = null;
      else app.editing = { id, i, draft: Object.assign({}, d) };
      reRenderLists();
      return;
    }
    const st = ev.target.closest("[data-step]");
    if (st && app.editing) {
      const k = st.dataset.step,
        inp = document.querySelector('[data-ed="' + k + '"]');
      if (k === "t") {
        const secs = Math.max(0, Math.round((app.editing.draft.t || 0) * 60) + Number(st.dataset.d));
        app.editing.draft.t = secs / 60;
        document.querySelectorAll('[data-ed="t"]').forEach(x => (x.value = fmtDur(secs / 60)));
        return;
      }
      const cur = app.editing.draft[k] ?? 0,
        nv = Math.max(0, Math.round((cur + Number(st.dataset.d)) * 100) / 100);
      app.editing.draft[k] = nv;
      document.querySelectorAll('[data-ed="' + k + '"]').forEach(x => (x.value = nv));
      return;
    }
    const a = ev.target.closest("[data-edact]");
    if (a) releaseFocus();
    if (a && app.editing && a.dataset.edact === "addm") {
      app.editing.addM = true;
      reRenderLists();
      const m = document.querySelector('[data-ed="m"]');
      if (m) m.focus();
      return;
    }
    if (a && app.editing) {
      const e = app.entries.find(x => x.id === app.editing.id),
        i = app.editing.i,
        draft = app.editing.draft;
      app.editing = null;
      if (!e) {
        reRenderLists();
        return;
      }
      const ok = a.dataset.edact === "ok",
        prev = ok ? app.bestOther(e) : null;
      if (ok && !draft.at && app.isLive(e)) draft.at = Date.now();
      await app.saveSet(e, i, ok ? draft : null);
      if (ok) app.checkPR(e, prev);
      reRenderLists();
    }
  });
  document.addEventListener("input", ev => {
    const k = ev.target.dataset && ev.target.dataset.ed;
    if (k && app.editing) {
      if (k === "tm" || k === "ts") {
        const a = $("ed-tm").value,
          b = $("ed-ts").value;
        app.editing.draft.t = a === "" && b === "" ? null : ((+a || 0) * 60 + (+b || 0)) / 60;
        return;
      }
      const v = ev.target.value;
      app.editing.draft[k] = v === "" ? null : Number(v);
    }
  });

  // Siguiente serie: por defecto se termina el ejercicio en curso antes de pasar al siguiente.
  // Los ejercicios cargados de una rutina en "circuito" se hacen por rondas (serie 1 de todos, luego serie 2…).
  function findNext(list) {
    const withSets = list.filter(e => e.sets > 0);
    if (app.running) {
      const re = withSets.find(e => e.id === app.running.id);
      if (re && !doneArr(re)[app.running.i]) return { e: re, r: app.running.i };
    }
    const pend = e => doneArr(e).findIndex(d => !d);
    const circ = withSets.filter(e => e.circuit);
    const circNext = () => {
      const maxS = Math.max(0, ...circ.map(e => doneArr(e).length));
      for (let r = 0; r < maxS; r++)
        for (const e of circ) {
          const ds = doneArr(e);
          if (r < ds.length && !ds[r]) return { e, r };
        }
      return null;
    };
    // la serie marcada más recientemente es el ancla
    let anchor = null,
      at = -1;
    withSets.forEach(e =>
      doneArr(e).forEach(d => {
        if (d && d.at != null && d.at > at) {
          at = d.at;
          anchor = e;
        }
      })
    );
    if (app.lastDone && app.lastDone.t >= at) {
      const x = withSets.find(e => e.id === app.lastDone.id);
      if (x) anchor = x;
    }
    if (anchor) {
      if (anchor.circuit) {
        const nx = circNext();
        if (nx) return nx;
      } else if (pend(anchor) >= 0) return { e: anchor, r: pend(anchor) };
    }
    for (const e of withSets) {
      if (pend(e) < 0) continue;
      if (e.circuit) {
        const nx = circNext();
        if (nx) return nx;
      }
      return { e, r: pend(e) };
    }
    return null;
  }
  function ringSVG(done, total, size, stroke, inner) {
    const r = (size - stroke) / 2,
      c = 2 * Math.PI * r,
      f = total ? Math.min(1, done / total) : 0;
    return (
      '<span class="ring' +
      (total && done >= total ? " full" : "") +
      '" style="width:' +
      size +
      "px;height:" +
      size +
      'px" role="img" aria-label="' +
      done +
      " de " +
      total +
      ' series"><svg viewBox="0 0 ' +
      size +
      " " +
      size +
      '" width="' +
      size +
      '" height="' +
      size +
      '"><circle class="rbg" cx="' +
      size / 2 +
      '" cy="' +
      size / 2 +
      '" r="' +
      r +
      '" stroke-width="' +
      stroke +
      '"/><circle class="rfg" cx="' +
      size / 2 +
      '" cy="' +
      size / 2 +
      '" r="' +
      r +
      '" stroke-width="' +
      stroke +
      '" stroke-dasharray="' +
      c.toFixed(1) +
      '" stroke-dashoffset="' +
      (c * (1 - f)).toFixed(1) +
      '"/></svg><b>' +
      inner +
      "</b></span>"
    );
  }
  app.countSets = list => {
    let d = 0,
      t = 0;
    list.forEach(e => {
      const ds = doneArr(e);
      t += ds.length;
      d += ds.filter(Boolean).length;
    });
    return { d, t };
  };
}
