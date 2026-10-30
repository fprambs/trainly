// Hoy: dibujar la lista y reordenar arrastrando.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { ordOf, doneArr, byCreated } from "../lib/sessions.js";
import { esc, fmtN, fmtTime, fmtDist } from "../lib/format.js";

export function install(app) {
  Object.assign(app, { figs, entryHTML, cancelPress, entryEditHTML });
  // ---------- render ----------
  function figs(e) {
    const p = [];
    if (e.sets && e.reps) p.push(e.sets + "×" + e.reps);
    else if (e.sets) p.push(e.sets + (e.sets == 1 ? " serie" : " series"));
    else if (e.reps) p.push(e.reps + " reps");
    if (e.weight != null) p.push("<em>" + fmtN(e.weight) + app.KG(e) + "</em>");
    if (e.dist != null) p.push(fmtDist(e.dist));
    if (e.mins != null) p.push(fmtTime(e.mins));
    return p.join(" · ") || "—";
  }
  app.TRASH =
    '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  function entryHTML(e, demo) {
    const r = !demo && app.imgOf(e.name);
    return (
      '<div class="entry' +
      (e.createdAt === app.lastNew ? " new" : "") +
      '"' +
      (demo ? "" : ' data-id="' + esc(e.id) + '"') +
      ">" +
      '<div class="name">' +
      (r ? app.mediaHTML(r, "mini", e.name) : "") +
      "<span>" +
      esc(e.name) +
      (!demo && app.recIds.has(e.id) ? ' <span class="pr">★ Récord</span>' : "") +
      '</span></div><div class="figs">' +
      figs(e) +
      "</div>" +
      (demo
        ? "<span></span>"
        : '<span class="eacts"><button type="button" class="edt iconbtn' +
          (app.editEntry === e.id ? " on" : "") +
          '" data-eid="' +
          esc(e.id) +
          '" aria-label="Editar o borrar ejercicio">' +
          app.PENCIL +
          "</button></span>") +
      (e.memo ? '<div class="memo">' + esc(e.memo) + "</div>" : "") +
      (!demo && app.editEntry === e.id ? entryEditHTML(e) : "") +
      (!demo && e.sets > 0 ? app.setsHTML(e) : "") +
      "</div>"
    );
  }
  // ---------- reordenar arrastrando ----------
  app.drag = null;
  app.lastDragEnd = 0;
  // mantener presionado ~0,5 s sobre el ejercicio para tomarlo; si el dedo se mueve antes, es scroll
  let press = null;
  const HOLD = 450;
  document.addEventListener("pointerdown", ev => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const el = ev.target.closest(".entry[data-id]");
    if (!el) return;
    if (ev.target.closest("button,input,textarea,a,select,.mini,.sets,.eedit,.seted")) return;
    const box = el.parentElement;
    cancelPress();
    press = {
      el,
      box,
      x0: ev.clientX,
      y0: ev.clientY,
      pid: ev.pointerId,
      t: setTimeout(() => {
        if (!press) return;
        const p = press;
        press = null;
        try {
          p.el.setPointerCapture(p.pid);
        } catch (e) {}
        app.drag = { el: p.el, box: p.box, id: p.el.dataset.id, y0: p.y0, target: null, after: false, moved: false };
        p.el.classList.remove("pressing");
        p.el.classList.add("dragging");
        document.body.classList.add("is-dragging");
        if (navigator.vibrate)
          try {
            navigator.vibrate(15);
          } catch (e) {}
      }, HOLD)
    };
    el.classList.add("pressing");
  });
  function cancelPress() {
    if (press) {
      clearTimeout(press.t);
      press.el.classList.remove("pressing");
      press = null;
    }
  }
  // mientras se arrastra, que la página no haga scroll
  document.addEventListener(
    "touchmove",
    ev => {
      if (app.drag) ev.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener("contextmenu", ev => {
    if (app.drag || press) ev.preventDefault();
  });
  document.addEventListener("pointermove", ev => {
    if (press && (Math.abs(ev.clientX - press.x0) > 8 || Math.abs(ev.clientY - press.y0) > 8)) cancelPress();
    if (!app.drag) return;
    const dy = ev.clientY - app.drag.y0;
    if (Math.abs(dy) > 3) app.drag.moved = true;
    app.drag.el.style.transform = "translateY(" + dy + "px)";
    if (ev.clientY < 90) window.scrollBy(0, -12);
    else if (ev.clientY > window.innerHeight - 170) window.scrollBy(0, 12);
    const items = [...app.drag.box.querySelectorAll(":scope > .entry[data-id]")].filter(x => x !== app.drag.el);
    app.drag.box
      .querySelectorAll(".drop-before,.drop-after")
      .forEach(x => x.classList.remove("drop-before", "drop-after"));
    let tgt = null,
      after = false;
    for (const it of items) {
      const b = it.getBoundingClientRect();
      if (ev.clientY < b.top + b.height / 2) {
        tgt = it;
        after = false;
        break;
      }
      tgt = it;
      after = true;
    }
    app.drag.target = tgt;
    app.drag.after = after;
    if (tgt) tgt.classList.add(after ? "drop-after" : "drop-before");
  });
  async function endDrag() {
    cancelPress();
    if (!app.drag) return;
    const d = app.drag;
    app.drag = null;
    if (app.deferred) {
      app.deferred = false;
      setTimeout(app.render, 0);
    }
    document.body.classList.remove("is-dragging");
    d.el.classList.remove("dragging");
    d.el.style.transform = "";
    d.box.querySelectorAll(".drop-before,.drop-after").forEach(x => x.classList.remove("drop-before", "drop-after"));
    if (d.moved) app.lastDragEnd = Date.now();
    if (!d.moved || !d.target || !d.el.isConnected) return;
    // nuevo orden: entre los vecinos del punto donde lo soltaste
    const ids = [...d.box.querySelectorAll(":scope > .entry[data-id]")].map(x => x.dataset.id).filter(x => x !== d.id);
    let pos = ids.indexOf(d.target.dataset.id) + (d.after ? 1 : 0);
    const list = ids.map(id => app.entries.find(x => x.id === id)).filter(Boolean);
    const prev = list[pos - 1],
      next = list[pos];
    const me = app.entries.find(x => x.id === d.id);
    if (!me) return;
    let o;
    if (prev && next) o = (ordOf(prev) + ordOf(next)) / 2;
    else if (prev) o = ordOf(prev) + 1000;
    else if (next) o = ordOf(next) - 1000;
    else return;
    if (prev && next && (o === ordOf(prev) || o === ordOf(next))) {
      // sin espacio entre vecinos: renumerar el día completo
      const day = app.entries
        .filter(x => x.date === me.date)
        .sort(byCreated)
        .filter(x => x.id !== me.id);
      const at = day.indexOf(next);
      day.splice(at < 0 ? day.length : at, 0, me);
      const base = ordOf(day[0]);
      for (let k = 0; k < day.length; k++) await app.store.update(day[k].id, { order: base + k * 1000 });
    } else await app.store.update(me.id, { order: o });
    app.reRenderLists();
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  app.PENCIL = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
  app.editEntry = null;
  app.eeDraft = {};
  document.addEventListener("input", ev => {
    const k = ev.target.dataset && ev.target.dataset.ef;
    if (k && app.editEntry) app.eeDraft[k] = ev.target.value;
  });
  function entryEditHTML(e) {
    const D = k => k in app.eeDraft;
    const ts = e.mins != null ? Math.round(e.mins * 60) : null;
    const f = (k, label, val0, attrs) => {
      const val = D(k) ? app.eeDraft[k] : val0;
      return (
        '<div class="f"><label for="ee-' +
        k +
        '">' +
        label +
        '</label><input id="ee-' +
        k +
        '" data-ef="' +
        k +
        '" ' +
        (attrs || 'class="num" type="number" inputmode="decimal" min="0"') +
        ' value="' +
        (val == null ? "" : esc(val)) +
        '"></div>'
      );
    };
    const V = (k, v) => (D(k) ? app.eeDraft[k] : v);
    return (
      '<div class="eedit" data-eid="' +
      esc(e.id) +
      '">' +
      '<div class="eegrid">' +
      '<div class="f wide"><label for="ee-name">Ejercicio</label><input id="ee-name" data-ef="name" value="' +
      esc(V("name", e.name)) +
      '"></div>' +
      f("date", "Fecha", e.date, 'type="date"') +
      f("sets", "Series", e.sets) +
      f("reps", "Reps", e.reps) +
      f("weight", app.perSide(e.name) ? "Peso por mancuerna (kg c/u)" : "Peso (kg)", e.weight) +
      f("dist", "Distancia (m)", e.dist) +
      '<div class="f"><label for="ee-tm">Tiempo</label><div class="trow"><input id="ee-tm" data-ef="tm" class="num" type="number" inputmode="numeric" min="0" placeholder="min" value="' +
      esc(V("tm", ts == null ? "" : Math.floor(ts / 60))) +
      '"><span>:</span><input id="ee-ts" data-ef="ts" class="num" type="number" inputmode="numeric" min="0" max="59" placeholder="seg" value="' +
      esc(V("ts", ts == null ? "" : ts % 60)) +
      '"></div></div>' +
      '<div class="f wide"><label for="ee-memo">Nota</label><input id="ee-memo" data-ef="memo" value="' +
      esc(V("memo", e.memo || "")) +
      '"></div>' +
      "</div>" +
      '<div class="eebar"><button type="button" class="del dangerbtn" data-id="' +
      esc(e.id) +
      '">' +
      app.TRASH +
      ' Borrar</button><span class="mv"><button type="button" data-mv="-1" aria-label="Mover arriba">↑</button><button type="button" data-mv="1" aria-label="Mover abajo">↓</button><small>Orden en el circuito</small></span>' +
      '<span class="sv"><button type="button" data-ee="cancel">Cancelar</button><button type="button" class="btnlike solid" data-ee="save">Guardar</button></span></div></div>'
    );
  }
  app.isReal = e => e.date < app.today || (e.date === app.today && doneArr(e).some(Boolean));
  document.addEventListener("click", async ev => {
    const pb = ev.target.closest(".edt");
    if (pb) {
      app.editEntry = app.editEntry === pb.dataset.eid ? null : pb.dataset.eid;
      app.eeDraft = {};
      app.reRenderLists();
      if (app.editEntry) {
        const n = document.querySelector('.eedit [data-ef="name"]');
        if (n) n.focus();
      }
      return;
    }
    const box = ev.target.closest(".eedit");
    if (!box) return;
    if (ev.target.closest("[data-ee],[data-mv],.del")) app.releaseFocus();
    const id = box.dataset.eid,
      e = app.entries.find(x => x.id === id);
    if (!e) return;
    const b = ev.target.closest("[data-ee],[data-mv]");
    if (!b) return;
    if (b.dataset.ee === "cancel") {
      app.editEntry = null;
      app.eeDraft = {};
      app.reRenderLists();
      return;
    }
    if (b.dataset.mv) {
      const list = app.entries.filter(x => x.date === e.date).sort(byCreated),
        i = list.indexOf(e),
        j = i + Number(b.dataset.mv);
      if (j < 0 || j >= list.length) return;
      const o = list[j];
      let a = ordOf(o),
        c = ordOf(e);
      if (a === c) c = a + Number(b.dataset.mv);
      try {
        await app.store.update(e.id, { order: a });
        await app.store.update(o.id, { order: c });
      } catch (err) {
        app.toast("No se pudo mover. Inténtalo de nuevo.");
      }
      app.reRenderLists();
      return;
    }
    if (b.dataset.ee === "save") {
      const g = k => {
        const el = box.querySelector('[data-ef="' + k + '"]');
        return el ? el.value.trim() : "";
      };
      const num = v => (v === "" ? null : Number(v.replace(",", ".")));
      const name = app.canonical(g("name"));
      if (!name) {
        box.querySelector('[data-ef="name"]').focus();
        return;
      }
      const tm = g("tm"),
        tsec = g("ts");
      const patch = {
        name,
        date: g("date") || e.date,
        sets: num(g("sets")),
        reps: num(g("reps")),
        weight: num(g("weight")),
        dist: num(g("dist")),
        mins: tm === "" && tsec === "" ? null : ((+tm || 0) * 60 + (+tsec || 0)) / 60,
        memo: g("memo")
      };
      if (Array.isArray(e.done)) patch.done = e.done.slice(0, Math.max(0, +patch.sets || 0));
      app.editEntry = null;
      app.eeDraft = {};
      try {
        await app.store.update(id, patch);
        app.toast("Cambios guardados");
      } catch (err) {
        app.toast("No se pudieron guardar los cambios.");
      }
      app.reRenderLists();
    }
  });
}
