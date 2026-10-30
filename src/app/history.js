// Historial: racha, calendario y días.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { monthSwipe } from "../lib/gestures.js";
import { doneArr, byCreated, splitSessions, sessLabel, sessDur } from "../lib/sessions.js";
import { CATMAP } from "../lib/categories.js";
import { iso, parse, fmtDay, fmtMonth, esc, fmtN, fmtDist, fmtDur, fmtSess } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { renderHistory });
  // ---------- constancia (12 semanas) ----------
  // calendario del historial: mes a mes, cada día entrenado marcado (más series = más intenso)
  let stkMonth = null;
  function renderStreak() {
    const card = $("streakCard");
    if (!app.entries.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const setsBy = {};
    app.entries.forEach(e => {
      const n = doneArr(e).filter(Boolean).length || (!+e.sets && e.date <= app.today ? 1 : 0);
      if (n) setsBy[e.date] = (setsBy[e.date] || 0) + n;
    });
    const planned = new Set(app.entries.filter(e => e.date > app.today).map(e => e.date));
    const now = parse(app.today),
      dow = (now.getDay() + 6) % 7,
      mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    // racha: semanas seguidas con al menos un día entrenado (si esta semana aún no, cuenta desde la anterior)
    const weekHas = w => {
      for (let k = 0; k < 7; k++) {
        const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 7 * w + k);
        if (setsBy[iso(d)]) return true;
      }
      return false;
    };
    let streak = 0,
      w = weekHas(0) ? 0 : 1;
    while (weekHas(w) && w < 200) {
      streak++;
      w++;
    }
    if (!stkMonth) stkMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const y = stkMonth.getFullYear(),
      m = stkMonth.getMonth(),
      first = new Date(y, m, 1),
      nDays = new Date(y, m + 1, 0).getDate(),
      lead = (first.getDay() + 6) % 7;
    const lv = n => (n ? "l3" : ""); // un solo color: entrenaste o no (la cantidad de series casi no cambia)
    let cells = ["L", "M", "M", "J", "V", "S", "D"].map(L => '<span class="cdh">' + L + "</span>").join("");
    // días del mes anterior/siguiente para completar la primera y última semana
    const cell = (dt, other) => {
      const ds = iso(dt),
        n = setsBy[ds] || 0;
      const cls = [
        other ? "other" : "",
        lv(n),
        ds === app.today ? "tdy" : "",
        ds > app.today ? "fut" : "",
        planned.has(ds) ? "plan" : ""
      ]
        .filter(Boolean)
        .join(" ");
      return (
        '<button type="button" class="' +
        cls +
        '" data-hd="' +
        ds +
        '" aria-label="' +
        esc(fmtDay(ds)) +
        (n ? ": " + n + (n === 1 ? " serie" : " series") : planned.has(ds) ? ": planificado" : ": sin entrenar") +
        '">' +
        dt.getDate() +
        "</button>"
      );
    };
    for (let k = lead; k > 0; k--) cells += cell(new Date(y, m, 1 - k), true);
    let mDays = 0,
      mSets = 0;
    for (let d = 1; d <= nDays; d++) {
      const ds = iso(new Date(y, m, d)),
        n = setsBy[ds] || 0;
      if (n) {
        mDays++;
        mSets += n;
      }
      const cls = [lv(n), ds === app.today ? "tdy" : "", ds > app.today ? "fut" : "", planned.has(ds) ? "plan" : ""]
        .filter(Boolean)
        .join(" ");
      cells +=
        '<button type="button" class="' +
        cls +
        '" data-hd="' +
        ds +
        '" aria-label="' +
        esc(fmtDay(ds)) +
        (n ? ": " + n + (n === 1 ? " serie" : " series") : planned.has(ds) ? ": planificado" : ": sin entrenar") +
        '">' +
        d +
        "</button>";
    }
    const trail = (7 - ((lead + nDays) % 7)) % 7;
    for (let k = 1; k <= trail; k++) cells += cell(new Date(y, m + 1, k), true);
    let title = first.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
    title = title.charAt(0).toUpperCase() + title.slice(1);
    const atNow = y === now.getFullYear() && m === now.getMonth();
    // músculos trabajados esta semana
    const wk = {};
    app.entries
      .filter(e => parse(e.date) >= mon)
      .forEach(e => {
        const n = doneArr(e).filter(Boolean).length;
        if (n) {
          const c = app.catOf(e.name);
          wk[c] = (wk[c] || 0) + n;
        }
      });
    const wkHtml = Object.keys(wk)
      .sort((a, b) => wk[b] - wk[a])
      .map(
        c =>
          '<span class="catchip"><span class="catdot" style="background:' +
          CATMAP[c][2] +
          '"></span>' +
          CATMAP[c][1] +
          " · " +
          wk[c] +
          "</span>"
      )
      .join("");
    card.innerHTML =
      '<div class="stk-top"><div><b>' +
      streak +
      "<small>" +
      (streak === 1 ? "semana" : "semanas") +
      " seguidas</small></b></div><span>" +
      mDays +
      (mDays === 1 ? " día" : " días") +
      " en " +
      esc(first.toLocaleDateString("es-CL", { month: "long" })) +
      (mSets ? " · " + mSets + " series" : "") +
      "</span></div>" +
      '<div class="calhead"><button type="button" class="iconbtn" data-cm="-1" aria-label="Mes anterior">‹</button><b class="caltitle">' +
      esc(title) +
      '</b><button type="button" class="iconbtn" data-cm="1" aria-label="Mes siguiente"' +
      (stkCan(1) ? "" : " disabled") +
      ">›</button></div>" +
      '<div class="calclip"><div class="hcal">' +
      cells +
      "</div></div>" +
      '<div class="hlegend"><i class="l3"></i> Entrenado' +
      (planned.size ? ' · <i class="plan"></i> Planificado' : "") +
      "</div>" +
      (wkHtml ? '<div class="wkcats"><span>Esta semana:</span>' + wkHtml + "</div>" : "");
  }
  const stkCan = step => {
    const now = parse(app.today);
    return (
      new Date(stkMonth.getFullYear(), stkMonth.getMonth() + step, 1) <=
      new Date(now.getFullYear(), now.getMonth() + 12, 1)
    );
  };
  monthSwipe(
    $("streakCard"),
    ".hcal",
    step => {
      if (!stkCan(step)) return false;
      stkMonth = new Date(stkMonth.getFullYear(), stkMonth.getMonth() + step, 1);
      renderStreak();
    },
    stkCan
  );
  monthSwipe($("calPop"), ".calgrid", step => {
    app.calMonth = new Date(app.calMonth.getFullYear(), app.calMonth.getMonth() + step, 1);
    app.renderCal();
  });
  $("streakCard").addEventListener("click", e => {
    const b = e.target.closest("[data-cm]");
    if (!b) return;
    e.stopPropagation();
    stkMonth = new Date(stkMonth.getFullYear(), stkMonth.getMonth() + Number(b.dataset.cm), 1);
    renderStreak();
  });
  $("history").addEventListener("click", e => {
    const b = e.target.closest("[data-hsave]");
    if (!b) return;
    app.showTab("anotar");
    app.openSaveFor({ date: b.dataset.hsave, g: null });
  });
  $("streakCard").addEventListener("click", e => {
    const b = e.target.closest("[data-hd]");
    if (!b) return;
    app.showTab("anotar");
    app.goDay(b.dataset.hd);
  });

  // historial: vista compacta del día (para mirar al vuelo); el lápiz abre la edición completa
  const editDays = new Set();
  function compactSet(e, d) {
    const st = app.setVerdict(e, d).state;
    let t;
    if (d.w != null && d.r != null) t = fmtN(d.w) + (app.perSide(e.name) ? " c/u" : "") + "×" + d.r;
    else {
      const p = [];
      if (d.r != null) p.push(d.r + " reps");
      if (d.w != null) p.push(fmtN(d.w) + app.KG(e));
      if (d.m != null) p.push(fmtDist(d.m));
      if (d.t != null) p.push(fmtDur(d.t));
      t = p.join(" · ") || "✓";
    }
    return '<span class="hs ' + st + '">' + esc(t) + (st === "up" ? "↑" : st === "down" ? "↓" : "") + "</span>";
  }
  function dayCompactHTML(d, l) {
    let sets = 0,
      vol = 0;
    l.forEach(e =>
      doneArr(e).forEach(x => {
        if (x) {
          sets++;
          if (x.w != null && x.r != null) vol += x.w * x.r * app.SF(e);
        }
      })
    );
    const rows = l
      .map(e => {
        const r = app.imgOf(e.name),
          ds = doneArr(e),
          done = ds.filter(Boolean);
        const body = done.length
          ? done.map(x => compactSet(e, x)).join("") +
            (done.length < ds.length ? '<span class="hs miss">' + (ds.length - done.length) + " sin hacer</span>" : "")
          : '<span class="hs plan">' +
            esc((e.sets ? e.sets + "× " : "") + (app.planText(e) || "sin datos")) +
            (d <= app.today && ds.length ? " · sin marcar" : "") +
            "</span>";
        return (
          '<li><span class="hthumb">' +
          (r ? app.mediaHTML(r) : "<i>" + esc((e.name || "?").charAt(0).toUpperCase()) + "</i>") +
          "</span><div><b>" +
          esc(e.name) +
          (app.recIds.has(e.id) ? ' <span class="pr">★</span>' : "") +
          '</b><div class="hsets">' +
          body +
          "</div>" +
          (e.memo ? '<small class="hmemo">' + esc(e.memo) + "</small>" : "") +
          "</div></li>"
        );
      })
      .join("");
    return (
      '<div class="hcompact"><div class="hbar"><span>' +
      (sets
        ? sets +
          (sets === 1 ? " serie" : " series") +
          (vol ? " · " + Math.round(vol).toLocaleString("es-CL") + " kg" : "")
        : "Sin series marcadas") +
      "</span>" +
      '<button type="button" class="iconbtn hgo" data-hgo="' +
      d +
      '" aria-label="Abrir este día en Hoy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>' +
      '<button type="button" class="iconbtn hed" data-hedit="' +
      d +
      '" aria-label="Editar este día">' +
      app.PENCIL +
      '</button></div><ul class="hrows">' +
      rows +
      "</ul></div>"
    );
  }
  $("history").addEventListener("click", e => {
    const b = e.target.closest("[data-hedit],[data-hgo]");
    if (!b) return;
    if (b.dataset.hgo) {
      app.showTab("anotar");
      app.goDay(b.dataset.hgo);
      return;
    }
    const d = b.dataset.hedit;
    editDays.has(d) ? editDays.delete(d) : editDays.add(d);
    app.editEntry = null;
    app.editing = null;
    renderHistory();
  });
  function renderHistory() {
    renderStreak();
    const h = $("history");
    if (!app.entries.length) {
      h.innerHTML =
        '<div class="emptyst"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/></svg><b>Tu historial está vacío</b><p>Aquí aparecerán tus entrenamientos agrupados por día, con las series que marcaste.</p><button type="button" class="btnlike solid" data-gotab="anotar">Ir a Hoy</button></div>';
      $("moreBtn").hidden = true;
      return;
    }
    const byDay = {};
    app.entries.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
    const allDays = Object.keys(byDay)
      .filter(d => d <= app.today)
      .sort()
      .reverse(); // los días planificados a futuro se ven en el calendario y en Hoy
    const daysToShow = allDays.slice(0, app.shownDays);
    let html = "",
      lastMonth = "";
    daysToShow.forEach(d => {
      const m = d.slice(0, 7);
      if (m !== lastMonth) {
        html += '<div class="month">' + esc(fmtMonth(d)) + "</div>";
        lastMonth = m;
      }
      const l = byDay[d].sort(byCreated);
      const names = [...new Set(l.map(e => e.name))].join(" · ");
      html +=
        '<details class="day" data-d="' +
        d +
        '"' +
        (app.openDays.has(d) ? " open" : "") +
        "><summary><h3>" +
        (d === app.today ? "Hoy · " : "") +
        esc(fmtDay(d)) +
        '</h3><span class="cnt">' +
        l.length +
        (l.length === 1 ? " ejercicio" : " ejercicios") +
        (() => {
          const gs = splitSessions(l);
          return gs
            .map(g =>
              sessDur(g) && g.end > g.start
                ? (gs.length > 1 ? sessLabel(g).split(" · ")[0] + " " : "") + fmtSess(sessDur(g))
                : ""
            )
            .filter(Boolean)
            .map(x => " · " + x)
            .join("");
        })() +
        '</span><span class="names">' +
        esc(names) +
        "</span></summary>" +
        (editDays.has(d)
          ? '<div class="list"><div class="hbar"><span>Editando este día</span><button type="button" class="btnlike solid" data-hedit="' +
            d +
            '">Listo</button></div>' +
            app.sessListHTML(splitSessions(l)) +
            '<button type="button" class="linkbtn hsave" data-hsave="' +
            d +
            '">' +
            app.SAVEIC +
            " Guardar este día como rutina</button></div>"
          : dayCompactHTML(d, l)) +
        "</details>";
    });
    h.innerHTML = html;
    const left = allDays.length - daysToShow.length;
    $("moreBtn").hidden = left <= 0;
    $("moreBtn").textContent = "Ver días anteriores (" + left + ")";
  }
  $("history").addEventListener(
    "toggle",
    e => {
      const d = e.target.closest && e.target.closest(".day");
      if (!d) return;
      d.open ? app.openDays.add(d.dataset.d) : app.openDays.delete(d.dataset.d);
    },
    true
  );
  $("moreBtn").addEventListener("click", () => {
    app.shownDays += 10;
    renderHistory();
  });

  // borrar registros (dos toques)
  document.addEventListener("click", async ev => {
    const b = ev.target.closest(".del");
    if (!b) return;
    const e = app.entries.find(x => x.id === b.dataset.id);
    if (!e) return;
    const copy = Object.assign({}, e);
    delete copy.id;
    b.disabled = true;
    if (app.editEntry === e.id) {
      app.editEntry = null;
      app.eeDraft = {};
    }
    if (app.editing && app.editing.id === e.id) app.editing = null;
    if (app.running && app.running.id === e.id) app.running = null;
    try {
      await app.store.remove(e.id);
      app.toast("Borrado: " + e.name, false, {
        label: "Deshacer",
        fn: async () => {
          await app.store.add(copy);
        }
      });
    } catch (err) {
      b.disabled = false;
      app.toast("No se pudo borrar. Inténtalo de nuevo.");
    }
  });
}
