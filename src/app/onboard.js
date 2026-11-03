// Guía para quien recién empieza: cuatro pasos en Hoy que se marcan solos según lo que ya hizo.
// Se oculta al completarlos o al tocar "Ocultar" (se recuerda en este dispositivo).
import { doneArr, routineItems } from "../lib/sessions.js";
import { esc } from "../lib/format.js";

export function install(app) {
  const { $, env } = app;
  const KEY = "trainly-guia-" + app.me;
  const hidden = () => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch (e) {
      return false;
    }
  };
  const hide = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch (e) {}
  };
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';

  function steps() {
    const mine = app.entries,
      today = mine.filter(e => e.date === app.today),
      own = app.routines.filter(r => r.own);
    return [
      {
        ok: mine.length > 0,
        t: "Agrega tu primer ejercicio",
        d: "Toca + y busca en el banco: más de 400 ejercicios en español o en inglés.",
        act: "add",
        btn: "Agregar"
      },
      {
        ok: mine.some(e => doneArr(e).some(Boolean)),
        t: "Completa una serie",
        d: "Abajo aparece «Te toca»: toca Completar al terminar cada serie y corre el descanso.",
        act: today.some(e => e.sets > 0) ? "go" : null,
        btn: "Empezar"
      },
      {
        ok: own.length > 0,
        t: "Crea tu primera rutina",
        d: "Guarda lo que hiciste hoy como rutina: la próxima vez la cargas con un toque, hoy o en la fecha que quieras.",
        act: today.length ? "save" : "ruts",
        btn: today.length ? "Crear rutina" : "Ver rutinas"
      },
      {
        ok: own.some(r => routineItems(r).some(it => it.link)) || mine.some(e => e.link),
        t: "Agrupa ejercicios en circuito",
        d: "En tu rutina toca ✎ y une ejercicios con el eslabón: se hacen por rondas (serie 1 de cada uno, luego serie 2…). En Hoy también: mantén presionado un ejercicio y suéltalo sobre otro.",
        act: own.length ? "rutedit" : null,
        btn: "Armar circuito"
      }
    ];
  }

  let shown = false;
  app.renderOnboard = () => {
    const box = $("obBox");
    if (!box) return;
    const st = steps(),
      n = st.filter(s => s.ok).length;
    // hasta que lleguen los datos no se sabe qué pasos ya hizo
    if (!app.entLoaded || env.isCoach() || hidden() || n === st.length) {
      if (app.entLoaded && n === st.length && shown && !hidden()) {
        hide();
        app.toast("¡Listo! Ya sabes lo básico de Trainly 💪");
      }
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    shown = true;
    const cur = st.findIndex(s => !s.ok);
    box.hidden = false;
    box.innerHTML =
      '<div class="obhead"><b>Empieza aquí</b><span>' +
      n +
      " de " +
      st.length +
      '</span><button type="button" class="oboff" data-ob="off">Ocultar</button></div>' +
      '<ol class="obsteps">' +
      st
        .map(
          (s, i) =>
            '<li class="' +
            (s.ok ? "ok" : i === cur ? "cur" : "") +
            '"><span class="obn">' +
            (s.ok ? CHECK : i + 1) +
            "</span><div><b>" +
            esc(s.t) +
            "</b>" +
            (i === cur ? "<small>" + esc(s.d) + "</small>" : "") +
            "</div>" +
            (i === cur && s.act
              ? '<button type="button" class="btnlike solid" data-ob="' + s.act + '">' + esc(s.btn) + "</button>"
              : "") +
            "</li>"
        )
        .join("") +
      "</ol>";
  };

  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-ob]");
    if (!b) return;
    const a = b.dataset.ob;
    if (a === "off") {
      hide();
      app.renderOnboard();
    } else if (a === "add") $("addOpen").click();
    else if (a === "go") {
      const nx = app.findNext(app.entries.filter(e => e.date === app.today));
      if (nx) app.openFocus(true);
    } else if (a === "ruts") app.showTab("rutinas");
    else if (a === "rutedit") {
      const r = app.routines.find(x => x.own);
      if (r) app.editRoutine(r.id);
    } else if (a === "save") {
      app.goDay(app.today);
      app.openSaveFor({ date: app.today, g: null });
    }
  });
}
