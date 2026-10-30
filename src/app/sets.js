// Series: valores, comparación con lo pedido y récords.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { doneArr } from "../lib/sessions.js";
import { iso, esc, norm, imgKey, fmtN, fmtTime, fmtDist, e1rm, r1, fmtDur, fmtSecs } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, {
    getMins,
    setMins,
    valOf,
    setParts,
    setVerdict,
    pillLabel,
    setsHTML,
    saveSet,
    markDone,
    bestOther,
    checkPR,
    computeRecords
  });
  // ---------- series ----------
  app.editing = null; // {id,i,draft:{w,r,t}}
  app.isTimed = e => e.mins != null || e.dist != null;
  // ejercicios con mancuernas "por lado": se anota el peso de UNA mancuerna; el volumen cuenta las dos
  app.perSide = n => {
    const k = imgKey(n || "");
    const o = app.restCfg.side && app.restCfg.side[k];
    if (o != null) return !!o;
    const b = app.bankRows.find(x => x.key === k);
    return !!(b && b.per_side);
  };
  app.SF = e => (e && app.perSide(e.name) ? 2 : 1);
  app.KG = e => (e && app.perSide(e.name) ? " kg c/u" : " kg");
  app.planText = e =>
    [
      e.weight != null ? String(e.weight).replace(".", ",") + app.KG(e) : "",
      e.reps != null ? e.reps + " reps" : "",
      e.dist != null ? fmtDist(e.dist) : "",
      e.mins != null ? fmtTime(e.mins) : ""
    ]
      .filter(Boolean)
      .join(" · ");
  function getMins() {
    const a = $("tMin").value,
      b = $("tSec").value;
    if (a === "" && b === "") return null;
    return ((+a || 0) * 60 + (+b || 0)) / 60;
  }
  function setMins(v) {
    if (v == null) {
      $("tMin").value = "";
      $("tSec").value = "";
      return;
    }
    const s = Math.round(v * 60);
    $("tMin").value = Math.floor(s / 60);
    $("tSec").value = s % 60;
  }
  // valor real logrado: el máximo de las series marcadas; si no hay series marcadas, lo anotado
  function valOf(e, key) {
    const dd = (Array.isArray(e.done) ? e.done : []).filter(Boolean);
    if (key === "orm") {
      const v = dd
        .filter(d => d.w != null && d.r != null)
        .map(d => e1rm(d.w, d.r))
        .filter(x => x != null);
      return v.length ? Math.max(...v) : e.weight != null && e.reps != null ? e1rm(e.weight, e.reps) : null;
    }
    if (key === "vol") {
      const v = dd.filter(d => d.w != null && d.r != null);
      return v.length
        ? v.reduce((a, d) => a + d.w * d.r * app.SF(e), 0)
        : e.weight && e.reps && e.sets
          ? e.weight * e.reps * e.sets * app.SF(e)
          : null;
    }
    if (key === "best") {
      const ts = (Array.isArray(e.done) ? e.done : []).filter(d => d && d.t != null).map(d => d.t);
      return ts.length ? Math.min(...ts) : null;
    }
    const k = { weight: "w", reps: "r", mins: "t", dist: "m" }[key];
    const vs = (Array.isArray(e.done) ? e.done : [])
      .filter(Boolean)
      .map(d => d[k])
      .filter(v => v != null);
    return vs.length ? Math.max(...vs) : (e[key] ?? null);
  }
  // cada valor de la serie con su flecha: ↑ mejor que lo pedido, ↓ peor
  // referencia para comparar cada valor: lo pedido; si no se pidió (ej. "3×15" sin peso), la serie anterior
  const PLANK = { w: "weight", r: "reps", m: "dist", t: "mins" };
  function refFor(e, d, k) {
    const pv = e[PLANK[k]];
    if (pv != null) return { v: k === "t" ? Math.round(pv * 60) : pv, src: "plan" };
    const ds = Array.isArray(e.done) ? e.done : [],
      i = ds.indexOf(d);
    for (let j = (i < 0 ? ds.length : i) - 1; j >= 0; j--) {
      const p = ds[j];
      if (p && p[k] != null) return { v: k === "t" ? Math.round(p[k] * 60) : p[k], src: "S" + (j + 1) };
    }
    return null;
  }
  function setParts(e, d) {
    const dir = (ref, val, lower) =>
      !ref || val == null || ref.v === val ? 0 : (lower ? val < ref.v : val > ref.v) ? 1 : -1;
    const P = [];
    if (d.w != null)
      P.push({
        k: "w",
        txt: fmtN(d.w) + (app.perSide(e.name) ? "kg c/u" : "kg"),
        ref: refFor(e, d, "w"),
        dir: dir(refFor(e, d, "w"), d.w)
      });
    if (d.r != null)
      P.push({
        k: "r",
        txt: (d.w != null ? "×" : "") + d.r + (d.w != null ? "" : " reps"),
        ref: refFor(e, d, "r"),
        dir: dir(refFor(e, d, "r"), d.r)
      });
    if (d.m != null)
      P.push({ k: "m", txt: fmtDist(d.m).replace(" ", ""), ref: refFor(e, d, "m"), dir: dir(refFor(e, d, "m"), d.m) });
    if (d.t != null) {
      const fmtOnly = e.mins != null && e.dist == null && d.m != null; // por tiempo con metros: el tiempo es el formato
      const ts = Math.round(d.t * 60),
        ref = refFor(e, d, "t");
      P.push({ k: "t", txt: fmtDur(d.t), ref, dir: fmtOnly ? 0 : dir(ref, ts, e.dist != null) });
    }
    return P;
  }
  function setState(P) {
    const up = P.some(p => p.dir > 0),
      dn = P.some(p => p.dir < 0);
    return up && dn ? "mixed" : up ? "up" : dn ? "down" : "done";
  }
  // 1RM estimado (Epley): peso × (1 + reps/30). Mide fuerza: 30×10 (40) > 20×15 (30) aunque haya menos reps
  function ormRef(e, d) {
    if (e.weight != null && e.reps != null) return { v: e1rm(e.weight, e.reps), src: "plan" };
    const ds = Array.isArray(e.done) ? e.done : [],
      i = ds.indexOf(d);
    for (let j = (i < 0 ? ds.length : i) - 1; j >= 0; j--) {
      const p = ds[j];
      if (p && p.w != null && p.r != null) return { v: e1rm(p.w, p.r), src: "S" + (j + 1) };
    }
    return null;
  }
  // veredicto de la serie: con peso y reps decide la fuerza (1RM est.); si no, cada valor por separado
  function setVerdict(e, d) {
    const P = setParts(e, d),
      orm = d.w != null && d.r != null ? e1rm(d.w, d.r) : null,
      ref = orm != null ? ormRef(e, d) : null;
    if (orm != null && ref && ref.v) {
      const diff = orm - ref.v,
        rel = Math.abs(diff) / ref.v;
      const state = rel < 0.01 ? (P.some(p => p.dir) ? "same" : "done") : diff > 0 ? "up" : "down";
      return { P, state, orm, ref, diff, byOrm: true };
    }
    return { P, state: setState(P), orm, ref: null, diff: 0, byOrm: false };
  }
  const STSYM = { done: "✓", up: "↑", down: "↓", same: "≈", mixed: '<i class="mu">↑</i><i class="md">↓</i>' };
  function pillLabel(e, d, i) {
    if (!d) return String(i + 1);
    const V = setVerdict(e, d),
      P = V.P,
      st = V.state;
    if (V.orm != null)
      return (
        (st === "done" ? "✓ " : "") +
        P.map(p => p.txt + (p.dir > 0 ? "↑" : p.dir < 0 ? "↓" : "")).join(" ") +
        " (1RM " +
        fmtN(r1(V.orm)) +
        (V.ref && Math.abs(V.diff) >= 0.05 ? (V.diff > 0 ? " +" : " −") + fmtN(r1(Math.abs(V.diff))) : "") +
        ")"
      );
    return (st === "done" ? "✓ " : "") + P.map(p => p.txt + (p.dir > 0 ? "↑" : p.dir < 0 ? "↓" : "")).join(" ");
  }
  const ICON = {
    w: '<svg viewBox="0 0 24 24"><path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/></svg>',
    r: '<svg viewBox="0 0 24 24"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
    m: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M6 7v4M10 7v3M14 7v4M18 7v3"/></svg>',
    t: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>'
  };
  function chipsHTML(e, d, V) {
    V = V || setVerdict(e, d);
    const fmtRef = (k, v) => (k === "w" ? fmtN(v) : k === "t" ? fmtDur(v / 60) : k === "m" ? fmtDist(v) : String(v));
    const NAME = { w: "Peso", r: "Reps", m: "Distancia", t: "Tiempo" };
    return V.P.map(p => {
      const val =
        p.k === "w" ? fmtN(d.w) : p.k === "r" ? String(d.r) : p.k === "m" ? fmtDist(d.m).split(" ")[0] : fmtDur(d.t);
      const unit =
        p.k === "w"
          ? app.perSide(e.name)
            ? "kg c/u"
            : "kg"
          : p.k === "r"
            ? "reps"
            : p.k === "m"
              ? fmtDist(d.m).split(" ")[1]
              : "";
      const against =
        V.byOrm &&
        p.dir &&
        (V.state === "same" || (V.state === "up" && p.dir < 0) || (V.state === "down" && p.dir > 0));
      const cls = against ? " nt" : p.dir > 0 ? " up" : p.dir < 0 ? " dn" : "";
      const refTxt = p.ref ? fmtRef(p.k, p.ref.v) : "";
      const vs = p.ref && p.ref.src !== "plan" ? p.ref.src + " " : "";
      const title = p.dir
        ? NAME[p.k] +
          ": " +
          (p.dir > 0 ? "subiste" : "bajaste") +
          " respecto a " +
          (p.ref.src === "plan" ? "lo pedido" : "la serie " + p.ref.src.slice(1)) +
          " (" +
          refTxt +
          ")"
        : p.ref
          ? "Igual que " + (p.ref.src === "plan" ? "lo pedido" : "la serie " + p.ref.src.slice(1))
          : NAME[p.k];
      return (
        '<span class="mchip' +
        cls +
        '" title="' +
        esc(title) +
        '">' +
        ICON[p.k] +
        "<b>" +
        esc(val) +
        "</b>" +
        (unit ? "<small>" + unit + "</small>" : "") +
        (p.dir ? "<i>" + (p.dir > 0 ? "↑" : "↓") + "</i><s>" + esc(vs) + esc(refTxt) + "</s>" : "") +
        "</span>"
      );
    }).join("");
  }
  app.isRunning = (id, i) => app.running && app.running.id === id && app.running.i === i;
  app.expandedSets = new Set();
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-expand]");
    if (!b) return;
    app.expandedSets.add(b.dataset.expand);
    app.reRenderLists();
  });
  function setsHTML(e) {
    const ds = doneArr(e),
      n = ds.filter(Boolean).length;
    // se ven las hechas y la próxima; el resto de pendientes queda en una línea
    const fp = ds.findIndex(x => !x),
      hiddenP = [];
    let h =
      '<div class="sets">' +
      ds
        .map((d, i) => {
          const run = !d && app.isRunning(e.id, i),
            timedLive = app.isTimed(e) && app.isLive(e);
          if (!d && !run && i !== fp && !app.expandedSets.has(e.id)) {
            hiddenP.push(i + 1);
            return "";
          }
          const V = d ? setVerdict(e, d) : null,
            st = V ? V.state : "",
            cls =
              "setpill" +
              (d ? " " + st : "") +
              (d &&
              app.lastDone &&
              app.lastDone.id === e.id &&
              app.lastDone.i === i &&
              Date.now() - app.lastDone.t < 1500
                ? " pop"
                : "") +
              (run ? " running" : "") +
              (app.editing && app.editing.id === e.id && app.editing.i === i ? " editing" : "");
          let body;
          if (run)
            body =
              '<span class="rt">■ ' +
              fmtSecs((Date.now() - app.running.start) / 1000) +
              '</span><span class="pend">toca para detener</span>';
          else if (!d)
            body =
              '<span class="pend">' +
              (timedLive ? "▶ Iniciar cronómetro" : "Pendiente · toca al terminarla") +
              "</span>";
          else
            body =
              '<span class="chips">' +
              chipsHTML(e, d, V) +
              (V.orm != null
                ? '<span class="orm">1RM est. <b>' +
                  fmtN(r1(V.orm)) +
                  " kg</b>" +
                  (V.ref && Math.abs(V.diff) >= 0.05
                    ? ' <em class="' +
                      (V.diff > 0 ? "up" : "dn") +
                      '">' +
                      (V.diff > 0 ? "+" : "−") +
                      fmtN(r1(Math.abs(V.diff))) +
                      "</em> <small>vs " +
                      (V.ref.src === "plan" ? "lo pedido" : V.ref.src) +
                      "</small>"
                    : "") +
                  (V.state === "up" && V.P.some(p => p.dir < 0)
                    ? ' · <span class="up">más fuerza</span>'
                    : V.state === "same"
                      ? " · <span>misma fuerza</span>"
                      : "") +
                  "</span>"
                : "") +
              '</span><span class="st' +
              (st === "mixed" ? " mx" : "") +
              '">' +
              STSYM[st] +
              "</span>";
          return (
            '<button type="button" class="' +
            cls +
            '" data-sid="' +
            esc(e.id) +
            '" data-si="' +
            i +
            '" aria-label="Serie ' +
            (i + 1) +
            (d
              ? " hecha: " + esc(pillLabel(e, d, i))
              : run
                ? " en curso, toca para detener"
                : timedLive
                  ? " pendiente, toca para iniciar el cronómetro"
                  : " pendiente") +
            '"><span class="sn">S' +
            (i + 1) +
            "</span>" +
            body +
            "</button>"
          );
        })
        .join("") +
      (hiddenP.length
        ? '<button type="button" class="setmore" data-expand="' +
          esc(e.id) +
          '">+ S' +
          hiddenP.join(", S") +
          " pendiente" +
          (hiddenP.length > 1 ? "s" : "") +
          "</button>"
        : "") +
      '<span class="setcount">' +
      n +
      " de " +
      ds.length +
      " series hechas</span></div>";
    if (app.editing && app.editing.id === e.id) h += editorHTML(e);
    return h;
  }
  // atajos de peso: suman al número; el campo se sigue pudiendo escribir (ej. 11 kg)
  const QUICKW =
    '<div class="quickw" role="group" aria-label="Atajos de peso"><button type="button" data-step="w" data-d="-2.5">−2,5</button><button type="button" data-step="w" data-d="2.5">+2,5</button><button type="button" data-step="w" data-d="5">+5</button></div>';
  function stepper(k, label, val, step) {
    return (
      '<div class="stepper">' +
      '<button type="button" data-step="' +
      k +
      '" data-d="-' +
      step +
      '" aria-label="Bajar ' +
      label +
      '">−</button>' +
      '<input id="ed-' +
      k +
      '" data-ed="' +
      k +
      '" class="num" type="number" inputmode="decimal" step="any" min="0" value="' +
      (val == null ? "" : val) +
      '">' +
      '<button type="button" data-step="' +
      k +
      '" data-d="' +
      step +
      '" aria-label="Subir ' +
      label +
      '">+</button>' +
      '<label for="ed-' +
      k +
      '">' +
      label +
      "</label></div>"
    );
  }
  function editorHTML(e) {
    const d = app.editing.draft,
      i = app.editing.i;
    const showW = e.weight != null || d.w != null,
      showR = e.reps != null || d.r != null,
      showT = e.mins != null || d.t != null || e.dist != null,
      showM = e.dist != null || d.m != null || app.editing.addM;
    let f = "";
    if (showW || (!showR && !showT && !showM))
      f += stepper("w", app.perSide(e.name) ? "kg c/u" : "kg", d.w, 1) + QUICKW;
    if (showR) f += stepper("r", "reps", d.r, 1);
    if (showM) f += stepper("m", "m", d.m, 50);
    if (showT) {
      const ts = d.t == null ? null : Math.round(d.t * 60);
      f +=
        '<div class="stepper tstep"><input id="ed-tm" data-ed="tm" class="num" type="number" inputmode="numeric" min="0" placeholder="min" aria-label="Minutos" value="' +
        (ts == null ? "" : Math.floor(ts / 60)) +
        '"><span>:</span><input id="ed-ts" data-ed="ts" class="num" type="number" inputmode="numeric" min="0" max="59" placeholder="seg" aria-label="Segundos" value="' +
        (ts == null ? "" : ts % 60) +
        '"><label for="ed-tm">min : seg</label></div>';
    }
    if (!showM && app.isTimed(e)) f += '<button type="button" class="btnlike" data-edact="addm">+ Metros</button>';
    const meta = app.planText(e);
    return (
      '<div class="seted"><div class="ttl"><b>Serie ' +
      (i + 1) +
      "</b>" +
      (meta ? "pedido: " + esc(meta) : "") +
      "</div>" +
      '<div class="flds">' +
      f +
      "</div>" +
      '<div class="acts"><button type="button" class="btnlike solid" data-edact="ok">Listo</button><button type="button" data-edact="undo">Desmarcar</button></div></div>'
    );
  }
  app.targetOf = e => ({ w: e.weight ?? null, r: e.reps ?? null, t: e.mins ?? null, m: e.dist ?? null });
  app.lastDone = null;
  async function saveSet(e, i, val) {
    if (val) app.lastDone = { id: e.id, i, t: Date.now() };
    const ds = doneArr(e);
    ds[i] = val;
    try {
      await app.store.update(e.id, { done: ds });
    } catch (err) {
      app.flash("No se pudo guardar la serie. Inténtalo de nuevo.", true);
    }
  }
  app.running = null; // cronómetro de serie por tiempo {id,i,start}
  // solo las sesiones de hoy activan descanso, cronómetro y pantalla encendida
  app.isLive = e => e.date === iso(new Date());
  async function markDone(id, i) {
    const e = app.entries.find(x => x.id === id);
    if (!e) return;
    app.touch();
    app.ensureAudio();
    const live = app.isLive(e);
    if (app.isTimed(e) && live) {
      if (!app.isRunning(id, i)) {
        app.running = { id, i, start: Date.now() };
        app.editing = null;
        app.stopRest();
        app.keepAwake();
        app.reRenderLists();
        return;
      }
      const secs = (Date.now() - app.running.start) / 1000;
      app.running = null;
      const prev = bestOther(e);
      const t = Object.assign(app.targetOf(e), { t: Math.round(secs) / 60, at: Date.now() });
      app.editing = { id, i, draft: Object.assign({}, t) };
      await saveSet(e, i, t);
      app.startRest(e);
      checkPR(e, prev);
      return;
    }
    if (!live) {
      const t = Object.assign(app.targetOf(e), { at: null });
      app.editing = { id, i, draft: Object.assign({}, t) };
      await saveSet(e, i, t);
      return;
    }
    const prev = bestOther(e);
    const t = Object.assign(app.targetOf(e), { at: Date.now() });
    app.editing = { id, i, draft: Object.assign({}, t) };
    await saveSet(e, i, t);
    app.startRest(e);
    checkPR(e, prev);
  }

  // ---------- récords ----------
  // distancia fija sin tiempo pedido (ej. remo 500 m): el récord es el menor tiempo
  const hasDoneM = e => (Array.isArray(e.done) ? e.done : []).some(d => d && d.m != null);
  const hasReps = e => e.reps != null || (Array.isArray(e.done) ? e.done : []).some(d => d && d.r != null);
  app.keyFor = e =>
    e.weight != null
      ? hasReps(e)
        ? "orm"
        : "weight"
      : e.mins != null && e.dist == null && hasDoneM(e)
        ? "dist"
        : e.dist != null && e.mins == null
          ? "best"
          : e.dist != null
            ? "dist"
            : e.mins != null
              ? "mins"
              : e.reps != null
                ? "reps"
                : null;
  const unitFor = k => ({ orm: "kg", weight: "kg", mins: "min", reps: "reps", dist: "m", best: "min" })[k];
  const better = (k, a, b) => (k === "best" ? a < b : a > b);
  function bestOther(e) {
    const k = app.keyFor(e);
    if (!k) return null;
    const vs = app.entries
      .filter(x => x.id !== e.id && app.isReal(x) && norm(x.name) === norm(e.name))
      .map(x => valOf(x, k))
      .filter(v => v != null);
    return vs.length ? { k, v: k === "best" ? Math.min(...vs) : Math.max(...vs) } : null;
  }
  function checkPR(e) {
    const cur = app.entries.find(x => x.id === e.id) || e,
      prev = bestOther(cur);
    if (!prev) return;
    const v = valOf(cur, prev.k);
    if (v != null && prev.k === "orm" && v > prev.v + 0.05) {
      app.toast("Nuevo récord de fuerza en " + cur.name + ": 1RM est. " + fmtN(r1(v)) + " kg", true);
      return;
    }
    if (prev.k === "orm") return;
    if (v != null && better(prev.k, v, prev.v))
      app.toast(
        "Nuevo récord en " +
          cur.name +
          ": " +
          (prev.k === "mins" || prev.k === "best"
            ? fmtTime(v)
            : prev.k === "dist"
              ? fmtDist(v)
              : fmtN(v) + " " + unitFor(prev.k)),
        true
      );
  }
  app.recIds = new Set();
  function computeRecords() {
    app.recIds = new Set();
    const groups = {};
    app.entries.filter(app.isReal).forEach(e => (groups[norm(e.name)] = groups[norm(e.name)] || []).push(e));
    Object.values(groups).forEach(g => {
      const k = g.map(app.keyFor).find(Boolean);
      if (!k) return;
      // solo se compara lo comparable: mismo tipo de marca (y misma distancia si es por tiempo)
      const d0 = k === "best" ? (g.find(e => app.keyFor(e) === "best") || {}).dist : null;
      const vals = g
        .filter(e => app.keyFor(e) === k && (k !== "best" || e.dist === d0))
        .map(e => ({ e, v: valOf(e, k) }))
        .filter(o => o.v != null);
      if (vals.length < 2) return;
      const max = k === "best" ? Math.min(...vals.map(o => o.v)) : Math.max(...vals.map(o => o.v));
      const holder = vals
        .filter(o => o.v === max)
        .sort((a, b) => a.e.date.localeCompare(b.e.date) || (a.e.createdAt || 0) - (b.e.createdAt || 0))[0];
      if (vals.some(o => o.v !== max)) app.recIds.add(holder.e.id);
    });
  }
}
