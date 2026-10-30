// Progreso: gráfico por ejercicio.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { doneArr } from "../lib/sessions.js";
import { progressSVG } from "../lib/charts.js";
import { fmtShort, esc, norm, fmtN, fmtDist, r1, fmtDur } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { renderProgress });
  // ---------- progreso ----------
  // selector propio: buscador + lista (los más recientes primero)
  function progNames() {
    const last = {};
    app.entries.filter(app.isReal).forEach(e => {
      const k = e.date + String(1e15 + (e.createdAt || 0));
      if (!last[e.name] || k > last[e.name].k) last[e.name] = { k, date: e.date, n: 0 };
    });
    app.entries.filter(app.isReal).forEach(e => {
      last[e.name].n++;
    });
    return Object.keys(last)
      .sort((a, b) => last[b].k.localeCompare(last[a].k))
      .map(n => ({ n, date: last[n].date, count: last[n].n }));
  }
  function renderProgress() {
    const names = progNames().map(o => o.n);
    if (!names.length) {
      $("picker").hidden = true;
      $("chart").innerHTML =
        '<div class="emptyst"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/></svg><b>Aún no hay progreso que mostrar</b><p>Cuando anotes el mismo ejercicio en distintos días, aquí verás cómo sube tu peso, tus repeticiones o tu tiempo.</p><button type="button" class="btnlike solid" data-gotab="anotar">Ir a Hoy</button></div>';
      $("plog").innerHTML = "";
      return;
    }
    $("picker").hidden = false;
    if (!names.includes(app.picked)) app.picked = names[0];
    $("pickName").textContent = app.picked;
    const r = app.imgOf(app.picked);
    $("pickImg").innerHTML = r ? app.mediaHTML(r) : "";
    $("pickImg").hidden = !r;
    if (!$("pickPop").hidden) renderPickList();
    drawChart(app.picked);
  }
  function renderPickList() {
    const q = norm($("pickQ").value),
      words = q ? q.split(" ") : [];
    const items = progNames().filter(o => words.every(w => norm(o.n).includes(w)));
    $("pickList").innerHTML = items.length
      ? items
          .map(o => {
            const r = app.imgOf(o.n);
            return (
              '<button type="button" role="option" data-pick="' +
              esc(o.n) +
              '" aria-selected="' +
              (o.n === app.picked) +
              '">' +
              (r ? app.mediaHTML(r, "pkthumb") : '<span class="pkthumb empty"></span>') +
              '<span class="pk-row"><b>' +
              esc(o.n) +
              "</b><small>" +
              o.count +
              (o.count === 1 ? " vez" : " veces") +
              " · último " +
              esc(fmtShort(o.date)) +
              "</small></span></button>"
            );
          })
          .join("")
      : '<p class="hint">No hay ejercicios con ese nombre en tu historial.</p>';
  }
  function openPick(open) {
    $("pickPop").hidden = !open;
    $("pickBtn").setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      $("pickQ").value = "";
      renderPickList();
      setTimeout(() => $("pickQ").focus(), 30);
    }
  }
  $("pickBtn").addEventListener("click", () => openPick($("pickPop").hidden));
  $("pickQ").addEventListener("input", renderPickList);
  $("pickQ").addEventListener("keydown", e => {
    if (e.key === "Escape") openPick(false);
    if (e.key === "Enter") {
      e.preventDefault();
      const b = $("pickList").querySelector("[data-pick]");
      if (b) b.click();
    }
  });
  $("pickList").addEventListener("click", e => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    app.picked = b.dataset.pick;
    openPick(false);
    renderProgress();
  });
  function drawChart(name) {
    const rows = app.entries.filter(e => e.name === name && app.isReal(e));
    const recent = rows
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .slice(0, 8);
    $("plog").innerHTML =
      '<h2 style="font-size:1rem;margin-top:8px">Últimos registros</h2>' +
      recent
        .map(
          e =>
            '<div class="entry"><div class="name"><span>' +
            esc(fmtShort(e.date)) +
            '</span></div><div class="figs">' +
            app.figs(e) +
            "</div>" +
            (doneArr(e).some(Boolean)
              ? '<div class="memo">Series: ' +
                doneArr(e)
                  .map((d, i) => (d ? app.pillLabel(e, d, i) : "—"))
                  .join("  ") +
                "</div>"
              : "") +
            (e.memo ? '<div class="memo">' + esc(e.memo) + "</div>" : "") +
            "</div>"
        )
        .join("");
    let key = null,
      unit = "";
    const hasOrm = rows.some(r => app.valOf(r, "orm") != null);
    if (hasOrm) {
      key = progMetric;
      unit = "kg";
    } else if (rows.some(r => app.valOf(r, "weight") != null)) {
      key = "weight";
      unit = "kg";
    } else if (rows.some(r => app.valOf(r, "dist") != null)) {
      key = "dist";
      unit = "m";
    } else if (rows.some(r => app.valOf(r, "mins") != null)) {
      key = "mins";
      unit = "min";
    } else if (rows.some(r => app.valOf(r, "reps") != null)) {
      key = "reps";
      unit = "reps";
    }
    if (
      key === "dist" &&
      new Set(rows.map(r => r.dist).filter(v => v != null)).size === 1 &&
      rows.some(r => app.valOf(r, "best") != null)
    ) {
      key = "best";
      unit = "min";
    }
    const box = $("chart");
    const mchips = hasOrm
      ? '<div class="metrics" role="group" aria-label="Qué graficar">' +
        [
          ["orm", "1RM estimado"],
          ["weight", "Peso máximo"],
          ["vol", "Volumen"]
        ]
          .map(
            ([k, l]) =>
              '<button type="button" data-metric="' + k + '" aria-pressed="' + (key === k) + '">' + l + "</button>"
          )
          .join("") +
        "</div>"
      : "";
    if (!key) {
      box.innerHTML = '<p class="note">Este ejercicio no tiene peso, tiempo ni repeticiones anotadas todavía.</p>';
      return;
    }
    const per = {};
    // "mejor tiempo" solo compara la misma distancia (no mezclar 1 km con intervalos de 1 minuto)
    const bestD = key === "best" ? (rows.find(r => r.dist != null) || {}).dist : null;
    rows
      .filter(r => key !== "best" || r.dist === bestD)
      .forEach(r => {
        const v = app.valOf(r, key);
        if (v != null)
          per[r.date] =
            key === "vol"
              ? (per[r.date] || 0) + v
              : key === "best"
                ? Math.min(per[r.date] ?? Infinity, v)
                : Math.max(per[r.date] ?? -Infinity, v);
      });
    const pts = Object.keys(per)
      .sort()
      .map(d => ({ d, v: per[d] }));
    const label = {
      orm: "1RM estimado, mejor serie del día",
      vol: "Volumen por día",
      best: "Mejor tiempo por día en " + fmtDist((rows.find(r => r.dist != null) || {}).dist || 0),
      weight: "Peso máximo por día",
      dist: "Distancia máxima por día",
      mins: "Tiempo máximo por día",
      reps: "Repeticiones máximas por día"
    }[key];
    const fv = v =>
      key === "mins" || key === "best"
        ? fmtDur(v)
        : key === "dist" || key === "vol"
          ? Math.round(v).toLocaleString("es-CL")
          : fmtN(Math.round(v * 10) / 10);
    const why =
      key === "orm"
        ? '<p class="note">Combina peso y repeticiones en un solo número: 30 kg × 10 (≈40) cuenta como más fuerza que 20 kg × 15 (≈30).</p>'
        : key === "vol"
          ? '<p class="note">El trabajo total: suma de peso × reps de cada serie.</p>'
          : "";
    if (pts.length < 2) {
      box.innerHTML =
        mchips +
        '<p class="note">' +
        label +
        ': <b class="num">' +
        fv(pts[0].v) +
        " " +
        unit +
        "</b> el " +
        fmtShort(pts[0].d) +
        ". Anótalo otro día para ver la curva.</p>" +
        why;
      return;
    }
    const s = progressSVG(pts, { fv, ariaLabel: label + " de " + name });
    const diff = r1(pts[pts.length - 1].v - pts[0].v);
    box.innerHTML =
      mchips +
      s +
      '<p class="note">' +
      label +
      " (" +
      unit +
      "). Desde el " +
      fmtShort(pts[0].d) +
      ': <b class="num">' +
      (diff > 0 ? "+" : diff < 0 ? "−" : "") +
      fv(Math.abs(diff)) +
      " " +
      unit +
      '</b> · <span class="pr">★ ' +
      (key === "vol" ? "Máximo " : "Récord ") +
      fv(key === "best" ? Math.min(...pts.map(p => p.v)) : Math.max(...pts.map(p => p.v))) +
      " " +
      unit +
      "</span></p>" +
      why;
  }
  let progMetric = "orm";
  $("chart").addEventListener("click", e => {
    const b = e.target.closest("[data-metric]");
    if (!b) return;
    progMetric = b.dataset.metric;
    drawChart(app.picked);
  });
}
