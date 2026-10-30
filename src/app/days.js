// Navegar entre días: flechas, deslizar y calendario.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { daySwipe } from "../lib/gestures.js";
import { iso, parse, fmtDay, esc } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { goDay, renderCal, renderDay });
  // ---------- navegación de días ----------
  const addDays = (s, n) => {
    const x = parse(s);
    x.setDate(x.getDate() + n);
    return iso(x);
  };
  function goDay(d) {
    $("date").value = d;
    $("repeatBox").hidden = true;
    app.editEntry = null;
    app.editing = null;
    app.renderToday();
    window.scrollTo(0, 0);
  }
  $("dayPrev").addEventListener("click", () => goDay(addDays($("date").value || app.today, -1)));
  // ---------- deslizar hacia los lados para cambiar de día (táctil) ----------
  daySwipe({
    tab: $("tab-anotar"),
    // se mueve solo el contenido (no el botón + ni las hojas, que son fijos)
    parts: () =>
      ["dayState", "nextBox", "todayList", "emptyDay"]
        .map(id => $(id))
        .concat([document.querySelector("#tab-anotar .todayhead"), document.querySelector("#dayNav .daypick")])
        .filter(Boolean),
    busy: () => app.drag || app.DET || app.SM || !$("addCard").hidden || !$("calPop").hidden || app.FS.open,
    onStart: () => app.cancelPress(),
    onStep: step => goDay(addDays($("date").value || app.today, step))
  });
  // ---------- calendario propio ----------
  app.calMonth = null;
  function openCal(open) {
    const pop = $("calPop");
    pop.hidden = !open;
    $("dayPick").setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      const d = parse($("date").value || app.today);
      app.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCal();
    }
  }
  function renderCal() {
    const sel = $("date").value || app.today,
      has = new Set(app.entries.map(e => e.date));
    const y = app.calMonth.getFullYear(),
      m = app.calMonth.getMonth();
    const first = new Date(y, m, 1),
      startOff = (first.getDay() + 6) % 7;
    const start = new Date(y, m, 1 - startOff);
    let cells = "";
    for (let k = 0; k < 42; k++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k),
        ds = iso(dt);
      if (k >= 35 && dt.getMonth() !== m) break;
      const cls = [
        dt.getMonth() !== m ? "other" : "",
        has.has(ds) ? "has" : "",
        ds === app.today ? "istoday" : "",
        ds === sel ? "sel" : ""
      ]
        .filter(Boolean)
        .join(" ");
      cells +=
        '<button type="button" class="' +
        cls +
        '" data-cd="' +
        ds +
        '" aria-label="' +
        esc(dt.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })) +
        (has.has(ds) ? ", con registros" : "") +
        '"' +
        (ds === sel ? ' aria-current="date"' : "") +
        ">" +
        dt.getDate() +
        "</button>";
    }
    $("calPop").innerHTML =
      '<div class="calhead"><button type="button" class="iconbtn" data-cm="-1" aria-label="Mes anterior">‹</button><b>' +
      esc(first.toLocaleDateString("es-CL", { month: "long", year: "numeric" })) +
      '</b><button type="button" class="iconbtn" data-cm="1" aria-label="Mes siguiente">›</button></div>' +
      '<div class="calclip"><div class="calgrid">' +
      ["L", "M", "M", "J", "V", "S", "D"].map(x => '<span class="wd">' + x + "</span>").join("") +
      cells +
      "</div>" +
      '</div><div class="calfoot"><span><i></i>Días con registros</span><button type="button" class="btnlike" data-cd="' +
      app.today +
      '">Volver a hoy</button></div>';
  }
  $("dayPick").addEventListener("click", () => openCal($("calPop").hidden));
  $("calPop").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.cm) {
      app.calMonth = new Date(app.calMonth.getFullYear(), app.calMonth.getMonth() + Number(b.dataset.cm), 1);
      renderCal();
      return;
    }
    if (b.dataset.cd) {
      openCal(false);
      goDay(b.dataset.cd);
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("calPop").hidden) openCal(false);
  });
  $("dayNext").addEventListener("click", () => goDay(addDays($("date").value || app.today, 1)));
  function renderDay(d) {
    const diff = Math.round((parse(d) - parse(app.today)) / 864e5);
    const main =
      diff === 0
        ? "Hoy"
        : diff === -1
          ? "Ayer"
          : diff === 1
            ? "Mañana"
            : parse(d).toLocaleDateString("es-CL", { weekday: "long" });
    const kind = diff === 0 ? "istoday" : diff < 0 ? "past" : "future";
    $("dayNav").className = "daynav " + kind;
    $("dayMain").textContent = main;
    $("daySub").textContent = parse(d).toLocaleDateString("es-CL", {
      weekday: diff === 0 ? "long" : undefined,
      day: "numeric",
      month: "long",
      year: parse(d).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
    });
    $("dayToday").hidden = diff === 0;
    const st = $("dayState");
    st.hidden = diff <= 0;
    st.className = "daystate future";
    $("dayStateTxt").textContent = diff < 0 ? "" : "Planificando un día futuro";
    const short = parse(d).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
    $("submitBtn").textContent = diff === 0 ? "Agregar a hoy" : "Agregar al " + short;
    $("addFor").innerHTML =
      (app.otherName() ? "<b>" + esc(app.otherName()) + "</b> · " : "") +
      "Para <b>" +
      esc(diff === 0 ? "hoy, " + fmtDay(d) : fmtDay(d)) +
      "</b>";
  }
  $("date").addEventListener("change", () => goDay($("date").value || app.today));
}
