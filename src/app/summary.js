// Resumen de la sesión para compartir.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { posterURL } from "../media.js";
import { buildStory } from "../lib/share-image.js";
import { doneArr, byCreated, GAP, splitSessions, sessLabel } from "../lib/sessions.js";
import { parse, esc, fmtN, r1, fmtClock } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { setLine, renderSummary, openSummary });
  // ---------- resumen para compartir ----------
  app.sumState = null; // {date,gi}
  const LOGO_SVG = '<img class="slogo" src="/icons/icon-192.png" alt="" aria-hidden="true">';
  function sumGroup() {
    const list = app.entries.filter(e => e.date === app.sumState.date).sort(byCreated);
    const groups = list.length ? splitSessions(list) : [];
    const gi = Math.min(app.sumState.gi ?? groups.length - 1, groups.length - 1);
    return { groups, gi, g: groups[gi] };
  }
  function setLine(e, d) {
    if (d.w != null && d.r != null) return fmtN(d.w) + (app.perSide(e.name) ? " c/u" : "") + "×" + d.r;
    const P = app.setParts(e, d);
    return P.map(p => p.txt.replace(/^×/, "")).join(" ");
  }
  function renderSummary() {
    const { groups, gi, g } = sumGroup(),
      card = $("sumCard");
    const d = app.sumState.date,
      isT = d === app.today;
    const dayTxt = parse(d).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
    if (!g) {
      card.innerHTML =
        '<div class="sh"><div class="shtop">' +
        LOGO_SVG +
        '<div><b id="sumTitle">Resumen</b><span>' +
        esc(dayTxt) +
        '</span></div></div><button type="button" class="shx" data-sum="close" aria-label="Cerrar">✕</button></div><p class="sempty">Todavía no hay ejercicios en esta sesión.</p>';
      return;
    }
    const live = isT && g.start && g.end && Date.now() - g.end < GAP;
    const durMs = g.start ? (live ? Date.now() : g.end) - g.start : null;
    let done = 0,
      total = 0,
      vol = 0;
    g.entries.forEach(e => {
      const ds = doneArr(e);
      total += ds.length;
      ds.forEach(x => {
        if (x) {
          done++;
          if (x.w != null && x.r != null) vol += x.w * x.r * app.SF(e);
        }
      });
    });
    const prs = g.entries.filter(e => app.recIds.has(e.id)).length;
    const startTxt = g.start
      ? new Date(g.start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "";
    const rows = g.entries
      .map(e => {
        const ds = doneArr(e),
          hechas = ds.filter(Boolean),
          r = app.imgOf(e.name);
        const lines = hechas.map(x => setLine(e, x));
        const pend = ds.length - hechas.length;
        const orm = app.valOf(e, "orm"),
          best = hechas.some(x => x.w != null && x.r != null) ? orm : null;
        const detail = lines.length
          ? lines.join(" · ")
          : app.planText(e)
            ? "Plan: " + (e.sets ? e.sets + "× " : "") + app.planText(e)
            : "Sin series";
        return (
          '<div class="sumrow"><span class="sth">' +
          (r ? app.mediaHTML(r) : esc((e.name || "?").charAt(0).toUpperCase())) +
          "</span>" +
          '<span class="sinfo"><b>' +
          esc(e.name) +
          (app.recIds.has(e.id) ? ' <span class="pr">★ Récord</span>' : "") +
          "</b><span>" +
          esc(detail) +
          "</span></span>" +
          '<span class="sside">' +
          (ds.length
            ? '<b class="' +
              (pend ? "pend" : "ok") +
              '">' +
              hechas.length +
              "/" +
              ds.length +
              (pend ? "" : " ✓") +
              "</b>"
            : "") +
          (best ? "<small>1RM " + fmtN(r1(best)) + " kg</small>" : "") +
          "</span></div>"
        );
      })
      .join("");
    card.innerHTML =
      '<div class="sh"><div class="shtop">' +
      LOGO_SVG +
      '<div><b id="sumTitle">Trainly</b><span>' +
      esc(dayTxt) +
      (groups.length > 1 ? " · " + esc(sessLabel(g).split(" · ")[0]) : "") +
      "</span></div></div>" +
      '<button type="button" class="shx" data-sum="close" aria-label="Cerrar">✕</button>' +
      '<div class="durrow"><div class="dur"><b id="sumDur">' +
      (durMs != null ? fmtClock(durMs) : "—") +
      "</b><small>" +
      (live
        ? '<span class="live"><i></i>En curso</span> · desde ' + startTxt
        : durMs != null
          ? "Duración · desde " + startTxt
          : "Sin series marcadas") +
      "</small></div>" +
      app.ringSVG(
        done,
        total,
        84,
        8,
        total && done >= total
          ? '<span style="font-size:2rem;line-height:1">✓</span>'
          : '<span style="font-size:1.25rem">' +
              (total ? Math.round((done / total) * 100) : 0) +
              "<small>%</small></span>"
      ) +
      "</div></div>" +
      (groups.length > 1
        ? '<div class="stabs">' +
          groups
            .map(
              (x, k) =>
                '<button type="button" data-sg="' +
                k +
                '" aria-pressed="' +
                (k === gi) +
                '">' +
                esc(sessLabel(x).split(" · ")[0]) +
                "</button>"
            )
            .join("") +
          "</div>"
        : "") +
      '<div class="sgrid"><div><b>' +
      g.entries.length +
      "</b><small>" +
      (g.entries.length === 1 ? "ejercicio" : "ejercicios") +
      "</small></div><div><b>" +
      done +
      '<span style="font-size:.9rem;color:var(--muted)">/' +
      total +
      "</span></b><small>series</small></div><div><b>" +
      Math.round(vol).toLocaleString("es-CL") +
      '</b><small>kg volumen</small></div><div class="gold"><b>' +
      prs +
      "</b><small>★ récords</small></div></div>" +
      '<div class="slist">' +
      rows +
      "</div>" +
      '<div class="sfoot"><span>Trainly</span><span>' +
      esc(parse(d).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })) +
      "</span></div>";
    card.dataset.live = live ? "1" : "";
    card.dataset.start = g.start || "";
  }
  function sumData() {
    const { groups, gi, g } = sumGroup(),
      d = app.sumState.date,
      isT = d === app.today;
    const out = {
      day: parse(d).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }),
      foot: parse(d).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }),
      sess: groups.length > 1 && g ? sessLabel(g).split(" · ")[0] : "",
      rows: []
    };
    if (!g) return out;
    const live = isT && g.start && g.end && Date.now() - g.end < GAP,
      durMs = g.start ? (live ? Date.now() : g.end) - g.start : null;
    const startTxt = g.start
      ? new Date(g.start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "";
    let done = 0,
      total = 0,
      vol = 0;
    g.entries.forEach(e => {
      const ds = doneArr(e);
      total += ds.length;
      ds.forEach(x => {
        if (x) {
          done++;
          if (x.w != null && x.r != null) vol += x.w * x.r * app.SF(e);
        }
      });
    });
    Object.assign(out, {
      live,
      dur: durMs != null ? fmtClock(durMs) : "—",
      durLabel: live
        ? "En curso · desde " + startTxt
        : durMs != null
          ? "Duración · desde " + startTxt
          : "Sin series marcadas",
      nEx: g.entries.length,
      done,
      total,
      vol: Math.round(vol),
      prs: g.entries.filter(e => app.recIds.has(e.id)).length
    });
    out.rows = g.entries.map(e => {
      const ds = doneArr(e),
        h = ds.filter(Boolean),
        r = app.imgOf(e.name);
      const best = h.some(x => x.w != null && x.r != null) ? app.valOf(e, "orm") : null;
      const post = r && app.isVid(r) ? r.poster || posterURL(app.srcOf(r)) : null;
      return {
        name: e.name,
        pr: app.recIds.has(e.id),
        img: r ? app.srcOf(r) : null,
        vid: !!(r && app.isVid(r)),
        poster: post,
        detail: h.length
          ? h.map(x => setLine(e, x)).join(" · ")
          : app.planText(e)
            ? "Plan: " + (e.sets ? e.sets + "× " : "") + app.planText(e)
            : "Sin series",
        side: ds.length ? h.length + "/" + ds.length + (h.length === ds.length ? " ✓" : "") : "",
        complete: ds.length && h.length === ds.length,
        orm: best ? "1RM " + fmtN(r1(best)) + " kg" : ""
      };
    });
    return out;
  }
  function sumText() {
    const D = sumData();
    let t = "🏋️ Sesión · " + D.day + (D.sess ? " (" + D.sess.toLowerCase() + ")" : "") + "\n";
    if (!D.rows.length) return t + "Sin ejercicios todavía.";
    t +=
      "⏱ " +
      D.dur +
      " · " +
      D.nEx +
      (D.nEx === 1 ? " ejercicio" : " ejercicios") +
      " · " +
      D.done +
      "/" +
      D.total +
      " series" +
      (D.vol ? " · " + D.vol.toLocaleString("es-CL") + " kg de volumen" : "") +
      (D.prs ? " · ★ " + D.prs + (D.prs === 1 ? " récord" : " récords") : "") +
      "\n\n";
    t += D.rows
      .map(
        r =>
          "• " +
          r.name +
          (r.pr ? " ★" : "") +
          ": " +
          r.detail +
          (r.orm ? " (" + r.orm + ")" : "") +
          (r.side && !r.complete ? " — " + r.side.replace(" ✓", "") + " series" : "")
      )
      .join("\n");
    return t;
  }
  $("sumTxt").addEventListener("click", () => {
    const t = sumText(),
      b = $("sumTxt");
    const ok = () => {
      b.textContent = "¡Copiado!";
      setTimeout(() => {
        b.textContent = "Copiar texto";
      }, 1800);
    };
    try {
      navigator.clipboard.writeText(t).then(ok, () => fallbackCopy(t) && ok());
    } catch (e) {
      if (fallbackCopy(t)) ok();
    }
  });
  function fallbackCopy(t) {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {}
    ta.remove();
    if (!ok) app.toast("No se pudo copiar. Mantén presionado el texto para copiarlo.");
    return ok;
  }
  $("sumImg").addEventListener("click", async () => {
    const b = $("sumImg");
    b.disabled = true;
    b.textContent = "Generando…";
    try {
      let blob;
      try {
        blob = await buildStory(sumData(), true);
      } catch (e) {
        blob = await buildStory(sumData(), false);
      } // si alguna miniatura bloquea el lienzo, sale sin miniaturas
      const fname = "sesion-" + app.sumState.date + ".png";
      if (app.downloads) {
        try {
          await app.downloads.save({ filename: fname, data: blob });
          app.toast("Imagen guardada");
          return;
        } catch (e) {
          if (e && e.code === "declined") return;
          if (e && e.code === "rate_limited") {
            app.toast("Espera un momento e inténtalo de nuevo.");
            return;
          }
        }
      }
      // sin descargas: mostrar la imagen para guardarla con presión larga
      const url = URL.createObjectURL(blob);
      $("sumPrevImg").src = url;
      $("sumPrev").hidden = false;
      $("sumPrev").scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (e) {
      console.error("resumen png", e);
      app.toast("No se pudo generar la imagen. Inténtalo de nuevo.");
    } finally {
      b.disabled = false;
      b.textContent = "Imagen para historia";
    }
  });
  function openSummary(open) {
    if (open) {
      app.sumState = { date: $("date").value || app.today, gi: null };
      renderSummary();
      $("sumOv").hidden = false;
      $("sumPrev").hidden = true;
      const x = $("sumCard").querySelector(".shx");
      if (x) x.focus();
    } else {
      $("sumOv").hidden = true;
      app.sumState = null;
    }
  }
  $("sumBtn").addEventListener("click", () => openSummary(true));
  $("sumOv").addEventListener("click", e => {
    const b = e.target.closest("[data-sum],[data-sg]");
    if (b && b.dataset.sg != null) {
      app.sumState.gi = +b.dataset.sg;
      $("sumPrev").hidden = true;
      renderSummary();
      return;
    }
    if ((b && b.dataset.sum === "close") || e.target.id === "sumOv") openSummary(false);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("sumOv").hidden) openSummary(false);
  });
  setInterval(() => {
    if (app.sumState && $("sumCard").dataset.live === "1") {
      const st = +$("sumCard").dataset.start;
      if (st) $("sumDur").textContent = fmtClock(Date.now() - st);
    }
  }, 1000);
}
