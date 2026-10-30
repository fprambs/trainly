// Detalle del ejercicio y ventana para confirmar una serie.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { doneArr, byCreated } from "../lib/sessions.js";
import { CATMAP } from "../lib/categories.js";
import { pad, fmtShort, esc, fmtN, fmtSecs } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { openDetail, renderDetail, openSetModal });
  // ---------- detalle del ejercicio ----------
  app.DET = null; // {id}
  function dayListOf(e) {
    return app.entries.filter(x => x.date === e.date).sort(byCreated);
  }
  function openDetail(id) {
    app.DET = { id };
    app.editEntry = null;
    $("exDet").hidden = false;
    document.body.classList.add("det-open");
    renderDetail();
    $("exDet").scrollTop = 0;
  }
  function closeDetail() {
    app.DET = null;
    app.editEntry = null;
    $("exDet").hidden = true;
    $("exDet").innerHTML = "";
    document.body.classList.remove("det-open");
    app.renderToday();
  }
  function renderDetail() {
    if (!app.DET) return;
    const e = app.entries.find(x => x.id === app.DET.id);
    if (!e) {
      closeDetail();
      return;
    }
    if (app.typingInPanel()) {
      app.deferred = true;
      return;
    }
    const day = dayListOf(e),
      idx = day.indexOf(e),
      prev = day[idx - 1],
      next = day[idx + 1];
    const r = app.imgOf(e.name),
      cat = app.catOf(e.name),
      ds = doneArr(e),
      fp = ds.findIndex(x => !x),
      lt = app.lastTimeOf(e);
    const rows = ds
      .map((d, i) => {
        if (d) {
          const V = app.setVerdict(e, d);
          return (
            '<li><button type="button" class="srow done st-' +
            V.state +
            '" data-dset="' +
            i +
            '"><span class="sdot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></span><span class="slab">Serie ' +
            (i + 1) +
            '</span><span class="sval">' +
            esc(d.w != null && d.r != null ? fmtN(d.w) + app.KG(e) + " × " + d.r : app.setLine(e, d)) +
            '</span><span class="stime">' +
            (d.at ? pad(new Date(d.at).getHours()) + ":" + pad(new Date(d.at).getMinutes()) : "") +
            "</span></button>" +
            '<button type="button" class="srm" data-drm="' +
            i +
            '" aria-label="Eliminar serie ' +
            (i + 1) +
            '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
            "</li>"
          );
        }
        if (i === fp)
          return (
            '<li class="scur"><div class="srow cur"><span class="sdot">' +
            (i + 1) +
            '</span><span class="slab">Serie ' +
            (i + 1) +
            ' <em>· te toca</em></span><span class="sval">' +
            esc(app.planText(e) || "") +
            "</span>" +
            '<button type="button" class="srm" data-drm="' +
            i +
            '" aria-label="Eliminar serie ' +
            (i + 1) +
            '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
            "</div>" +
            app.goBtnHTML(e, i, "bigbtn", "Completar serie " + (i + 1)) +
            "</li>"
          );
        return (
          '<li><button type="button" class="srow pend" data-dgo="' +
          i +
          '"><span class="sdot">' +
          (i + 1) +
          '</span><span class="slab">Serie ' +
          (i + 1) +
          '</span><span class="sval">' +
          esc(app.planText(e) || "") +
          "</span></button>" +
          '<button type="button" class="srm" data-drm="' +
          i +
          '" aria-label="Eliminar serie ' +
          (i + 1) +
          '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
          "</li>"
        );
      })
      .join("");
    $("exDet").innerHTML =
      '<div class="dwrap">' +
      '<div class="dtop"><button type="button" class="iconbtn" data-dact="close" aria-label="Volver"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button><span>Ejercicio ' +
      (idx + 1) +
      " de " +
      day.length +
      "</span>" +
      '<span class="dtsp"></span></div>' +
      '<div class="dmedia">' +
      (r ? app.mediaBig(r) : '<span class="fletter">' + esc((e.name || "?").charAt(0).toUpperCase()) + "</span>") +
      (cat && cat !== "otro" && CATMAP[cat] ? '<span class="dcat">' + esc(CATMAP[cat][1]) + "</span>" : "") +
      "</div>" +
      '<div class="dhead"><h2 id="detName">' +
      esc(e.name) +
      (app.recIds.has(e.id) ? ' <span class="pr">★ Récord</span>' : "") +
      "</h2>" +
      (app.perSide(e.name) ? '<span class="sidepill">' + app.DUO_IC + "Peso por mancuerna · kg c/u</span>" : "") +
      (lt ? "<p>La vez pasada (" + esc(fmtShort(lt.date)) + "): " + esc(lt.line) + "</p>" : "") +
      (e.memo ? '<p class="dmemo">' + esc(e.memo) + "</p>" : "") +
      "</div>" +
      (app.editEntry === e.id ? app.entryEditHTML(e) : "") +
      (ds.length
        ? '<ol class="srows" aria-label="Series">' + rows + "</ol>"
        : '<p class="hint">Este ejercicio no tiene series. Agrega una con “+ Serie”.</p>') +
      '<div class="dacts"><button type="button" class="btnlike" data-dact="addset"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Serie</button>' +
      '<button type="button" class="btnlike edt" data-eid="' +
      esc(e.id) +
      '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>' +
      (app.editEntry === e.id ? "Cerrar edición" : "Editar o borrar") +
      "</button></div>" +
      '<div class="dnav">' +
      (prev
        ? '<button type="button" class="btnlike" data-dnav="' +
          esc(prev.id) +
          '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>' +
          esc(prev.name) +
          "</span></button>"
        : "<span></span>") +
      (next
        ? '<button type="button" class="btnlike" data-dnav="' +
          esc(next.id) +
          '"><span>' +
          esc(next.name) +
          '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>'
        : "<span></span>") +
      "</div>" +
      "</div>";
  }
  $("exDet").addEventListener("click", async ev => {
    const b = ev.target.closest("button");
    if (!b || !app.DET) return;
    const e = app.entries.find(x => x.id === app.DET.id);
    if (!e) return;
    if (b.dataset.dact === "close") {
      closeDetail();
      return;
    }
    if (b.dataset.dnav) {
      app.DET = { id: b.dataset.dnav };
      app.editEntry = null;
      renderDetail();
      $("exDet").scrollTop = 0;
      return;
    }
    if (b.dataset.dact === "addset") {
      await app.store.update(e.id, { sets: (+e.sets || 0) + 1 });
      return;
    }
    if (b.dataset.dact === "rmset") {
      const n = Math.max(0, (+e.sets || 0) - 1);
      await app.store.update(e.id, { sets: n, done: doneArr(e).slice(0, n) });
      return;
    }
    if (b.dataset.drm != null) {
      const i = +b.dataset.drm,
        old = { sets: e.sets, done: (Array.isArray(e.done) ? e.done : []).slice() };
      const ds = doneArr(e);
      ds.splice(i, 1);
      if (app.running && app.running.id === e.id) app.running = null;
      await app.store.update(e.id, { sets: Math.max(0, (+e.sets || 0) - 1), done: ds });
      app.toast("Serie " + (i + 1) + " eliminada", false, {
        label: "Deshacer",
        fn: async () => {
          await app.store.update(e.id, old);
        }
      });
      return;
    }
    if (b.dataset.dset != null) {
      const i = +b.dataset.dset,
        d = doneArr(e)[i];
      if (d) openSetModal(e, i, Object.assign({}, d), true);
      return;
    }
    if (b.dataset.dgo != null) {
      app.completeFlow(e.id, +b.dataset.dgo);
      return;
    }
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && app.DET && $("smOv").hidden && $("lb").hidden) closeDetail();
  });

  // ---------- ventana: confirmar serie ----------
  app.SM = null; // {id,i,draft,edit}
  function smFields(e, D) {
    const timed = app.isTimed(e) || D.t != null;
    return {
      w: e.weight != null || D.w != null || (!timed && e.reps == null),
      r: e.reps != null || D.r != null || (!timed && e.weight == null),
      m: e.dist != null || D.m != null || app.wantsMeters(e),
      t: timed
    };
  }
  function smStep(k, label, unit, val, step) {
    return (
      '<div class="smf"><label for="sm-' +
      k +
      '">' +
      label +
      '</label><div class="smstep">' +
      '<button type="button" data-sms="' +
      k +
      '" data-d="-' +
      step +
      '" aria-label="Bajar ' +
      label +
      '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>' +
      '<span class="smbox"><input id="sm-' +
      k +
      '" data-smk="' +
      k +
      '" class="num" type="text" inputmode="decimal" autocomplete="off" value="' +
      (val == null ? "" : String(val).replace(".", ",")) +
      '">' +
      (unit ? "<small>" + unit + "</small>" : "") +
      "</span>" +
      '<button type="button" data-sms="' +
      k +
      '" data-d="' +
      step +
      '" aria-label="Subir ' +
      label +
      '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>' +
      (k === "w"
        ? '<div class="smquick" role="group" aria-label="Atajos de peso"><button type="button" data-sms="w" data-d="-5">−5</button><button type="button" data-sms="w" data-d="-2.5">−2,5</button><button type="button" data-sms="w" data-d="2.5">+2,5</button><button type="button" data-sms="w" data-d="5">+5</button></div>'
        : "") +
      "</div>"
    );
  }
  function smDelta(e, D) {
    const parts = [],
      ref = app.targetOf(e);
    const cmpOne = (k, lbl, unit, lower) => {
      if (ref[k] == null || D[k] == null) return;
      const a = k === "t" ? Math.round(ref[k] * 60) : ref[k],
        b = k === "t" ? Math.round(D[k] * 60) : D[k];
      if (a === b) return;
      const up = lower ? b < a : b > a,
        diff = Math.abs(b - a);
      parts.push({ up, txt: (b > a ? "+" : "−") + (k === "t" ? fmtSecs(diff) : fmtN(diff) + " " + unit) + " " + lbl });
    };
    cmpOne("w", "de peso", "kg");
    cmpOne("r", "reps", "");
    cmpOne("m", "metros", "m");
    cmpOne("t", "de tiempo", "", e.dist != null);
    if (!parts.length)
      return (
        '<p class="smdelta same"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>Igual que lo planificado' +
        (app.planText(e) ? " (" + esc(app.planText(e)) + ")" : "") +
        "</p>"
      );
    const up = parts.some(p => p.up),
      dn = parts.some(p => !p.up);
    return (
      '<p class="smdelta ' +
      (up && !dn ? "up" : dn && !up ? "dn" : "mx") +
      '">' +
      (up && !dn
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
        : dn && !up
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>'
          : "") +
      esc(parts.map(p => p.txt).join(" · ")) +
      " respecto a lo planificado" +
      (app.planText(e) ? " (" + esc(app.planText(e)) + ")" : "") +
      "</p>"
    );
  }
  function openSetModal(e, i, draft, edit) {
    app.SM = { id: e.id, i, draft: Object.assign({}, draft), edit };
    renderSetModal();
    $("smOv").hidden = false;
    document.body.classList.add("sm-open");
    setTimeout(() => {
      const b = $("smOk");
      if (b) b.focus({ preventScroll: true });
    }, 50);
  }
  function closeSetModal() {
    app.SM = null;
    $("smOv").hidden = true;
    $("setModal").innerHTML = "";
    document.body.classList.remove("sm-open");
    if (app.deferred) {
      app.deferred = false;
      app.render();
    }
  }
  function renderSetModal() {
    if (!app.SM) return;
    const e = app.entries.find(x => x.id === app.SM.id);
    if (!e) {
      closeSetModal();
      return;
    }
    const D = app.SM.draft,
      F = smFields(e, D),
      r = app.imgOf(e.name),
      t = doneArr(e).length;
    let f = "";
    if (F.w)
      f += smStep(
        "w",
        app.perSide(e.name) ? "Peso por mancuerna" : "Peso",
        app.perSide(e.name) ? "kg c/u" : "kg",
        D.w,
        1
      );
    if (F.r) f += smStep("r", "Repeticiones", "", D.r, 1);
    if (F.m) f += smStep("m", "Distancia", "m", D.m, 50);
    if (F.t) {
      const ts = D.t == null ? null : Math.round(D.t * 60);
      f +=
        '<div class="smf"><label for="sm-tm">Tiempo</label><div class="smtime"><input id="sm-tm" data-smk="tm" class="num" type="text" inputmode="numeric" placeholder="min" aria-label="Minutos" value="' +
        (ts == null ? "" : Math.floor(ts / 60)) +
        '"><span>:</span><input id="sm-ts" data-smk="ts" class="num" type="text" inputmode="numeric" placeholder="seg" aria-label="Segundos" value="' +
        (ts == null ? "" : pad(ts % 60)) +
        '"><small>min : seg</small></div></div>';
    }
    $("setModal").innerHTML =
      '<div class="grab" aria-hidden="true"></div>' +
      '<div class="smhead">' +
      (r ? '<span class="smthumb">' + app.mediaHTML(r) + "</span>" : "") +
      "<div><small>Serie " +
      (app.SM.i + 1) +
      " de " +
      t +
      (app.SM.edit ? " · hecha" : "") +
      (app.otherName() ? " · " + esc(app.otherName()) : "") +
      '</small><h2 id="smTitle">' +
      esc(e.name) +
      "</h2>" +
      (app.perSide(e.name) ? '<span class="sidepill">' + app.DUO_IC + "Peso por mancuerna</span>" : "") +
      "</div></div>" +
      '<div class="smfields">' +
      f +
      '</div><div id="smDelta">' +
      smDelta(e, D) +
      "</div>" +
      '<div class="smacts"><button type="button" class="btnlike" data-sma="cancel">Cancelar</button>' +
      (app.SM.edit ? '<button type="button" class="btnlike danger" data-sma="undo">Desmarcar</button>' : "") +
      '<button type="button" class="btnlike solid" id="smOk" data-sma="ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>' +
      (app.SM.edit ? "Guardar" : "Confirmar serie") +
      "</button></div>";
  }
  const smNum = v => {
    v = String(v).trim().replace(",", ".");
    if (v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  $("setModal").addEventListener("input", ev => {
    if (!app.SM) return;
    const k = ev.target.dataset.smk;
    if (!k) return;
    if (k === "tm" || k === "ts") {
      const a = $("sm-tm").value,
        b = $("sm-ts").value;
      app.SM.draft.t = a === "" && b === "" ? null : ((+a || 0) * 60 + (+b || 0)) / 60;
    } else app.SM.draft[k] = smNum(ev.target.value);
    const e = app.entries.find(x => x.id === app.SM.id);
    if (e) $("smDelta").innerHTML = smDelta(e, app.SM.draft);
  });
  $("smOv").addEventListener("click", async ev => {
    if (!app.SM) return;
    if (ev.target.id === "smOv") {
      closeSetModal();
      return;
    }
    const b = ev.target.closest("button");
    if (!b) return;
    const e = app.entries.find(x => x.id === app.SM.id);
    if (!e) {
      closeSetModal();
      return;
    }
    if (b.dataset.sms) {
      const k = b.dataset.sms,
        cur = app.SM.draft[k] ?? 0,
        nv = Math.max(0, Math.round((cur + Number(b.dataset.d)) * 100) / 100);
      app.SM.draft[k] = nv;
      const inp = $("sm-" + k);
      if (inp) inp.value = String(nv).replace(".", ",");
      $("smDelta").innerHTML = smDelta(e, app.SM.draft);
      return;
    }
    const act = b.dataset.sma;
    if (!act) return;
    if (act === "cancel") {
      closeSetModal();
      return;
    }
    const i = app.SM.i,
      edit = app.SM.edit,
      D = app.SM.draft;
    if (act === "undo") {
      const old = doneArr(e)[i],
        id = e.id;
      closeSetModal();
      await app.saveSet(e, i, null);
      app.reRenderLists();
      app.toast("Serie " + (i + 1) + " desmarcada", false, {
        label: "Deshacer",
        fn: async () => {
          const x = app.entries.find(z => z.id === id);
          if (x) {
            await app.saveSet(x, i, old);
            app.reRenderLists();
          }
        }
      });
      return;
    }
    const old = doneArr(e)[i];
    const val = {
      w: D.w ?? null,
      r: D.r ?? null,
      m: D.m ?? null,
      t: D.t ?? null,
      at: edit && old ? (old.at ?? null) : app.isLive(e) ? Date.now() : null
    };
    const prev = app.bestOther(e);
    closeSetModal();
    await app.saveSet(e, i, val);
    if (!edit && app.isLive(e)) app.startRest(e);
    app.checkPR(e, prev);
    app.reRenderLists();
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && app.SM) closeSetModal();
    if (ev.key === "Enter" && app.SM && ev.target.dataset && ev.target.dataset.smk) {
      ev.preventDefault();
      $("smOk").click();
    }
  });
}
