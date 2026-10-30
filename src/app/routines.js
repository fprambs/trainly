// Rutinas: guardar, cargar y editar.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { byCreated, splitSessions, sessLabel } from "../lib/sessions.js";
import { CATMAP } from "../lib/categories.js";
import { iso, parse, fmtDay, esc, norm } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { renderRoutinesTab, openSaveFor });
  // ---------- rutinas y sesiones anteriores ----------
  const planOf = e => ({
    name: e.name,
    sets: e.sets ?? null,
    reps: e.reps ?? null,
    weight: e.weight ?? null,
    mins: e.mins ?? null,
    dist: e.dist ?? null
  });
  // ---------- pestaña Rutinas ----------
  let rutEdit = null;
  const openRuts = new Set();
  let rutPick = null;
  // elegir fecha para cargar la rutina: próximos días con un toque, o cualquier fecha
  function rutPickHTML(id) {
    let chips = "";
    for (let k = 1; k <= 7; k++) {
      const d = new Date(parse(app.today));
      d.setDate(d.getDate() + k);
      const ds = iso(d),
        has = app.entries.some(e => e.date === ds);
      chips +=
        '<button type="button" data-rtload="' +
        esc(id) +
        '" data-rd="' +
        ds +
        '"' +
        (has ? ' class="has"' : "") +
        "><small>" +
        d.toLocaleDateString("es-CL", { weekday: "short" }).replace(".", "") +
        "</small><b>" +
        d.getDate() +
        "</b></button>";
    }
    return (
      '<div class="rutpick"><div class="rpchips">' +
      chips +
      '</div><label class="rpother">Otra: <input type="date" data-rtdate="' +
      esc(id) +
      '" min="' +
      iso(new Date(parse(app.today).getFullYear() - 1, 0, 1)) +
      '"></label><p class="hint">Los días con punto ya tienen ejercicios: se suman a lo que hay.</p></div>'
    );
  }
  function renderRoutinesTab() {
    const box = $("rutList"),
      d = $("date").value || app.today;
    const tgt =
      d === app.today
        ? "hoy"
        : parse(d).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
    $("rutTarget").textContent = app.routines.length ? "Abre una rutina y cárgala hoy o en la fecha que quieras." : "";
    void d;
    if (!app.routines.length) {
      box.innerHTML =
        '<div class="empty rutempty">' +
        app.SAVEIC +
        "<p><b>Aún no tienes rutinas guardadas.</b></p><p>Guarda un día de entrenamiento para repetirlo con un toque. Puedes hacerlo desde <b>Historial</b> (abre un día y toca “Guardar este día como rutina”) o desde la sesión con el botón <b>Rutinas</b>.</p></div>";
      return;
    }
    box.innerHTML = app.routines
      .map((r, ri) => {
        const ed = rutEdit === r.id;
        const rows = r.items
          .map((it, ii) => {
            const im = app.imgOf(it.name),
              cat = CATMAP[app.catOf(it.name)];
            return (
              '<div class="rutex">' +
              (im
                ? app.mediaHTML(im, "mini")
                : '<span class="rletter" style="border-color:' +
                  cat[2] +
                  '">' +
                  esc(it.name.charAt(0).toUpperCase()) +
                  "</span>") +
              "<div><b>" +
              esc(it.name) +
              "</b><span>" +
              esc(
                (it.sets ? it.sets + (it.sets == 1 ? " serie" : " series") : "") +
                  (app.planText(it) ? (it.sets ? " · " : "") + app.planText(it) : "")
              ) +
              "</span></div>" +
              (ed
                ? '<button type="button" class="iconbtn" data-rxdel="' +
                  ii +
                  '" data-rid="' +
                  esc(r.id) +
                  '" aria-label="Quitar ' +
                  esc(it.name) +
                  ' de la rutina">✕</button>'
                : "") +
              "</div>"
            );
          })
          .join("");
        const mus = [...new Set(r.items.map(it => app.catOf(it.name)))]
          .filter(c => c !== "otro")
          .map(
            c =>
              '<span class="catchip"><span class="catdot" style="background:' +
              CATMAP[c][2] +
              '"></span>' +
              CATMAP[c][1] +
              "</span>"
          )
          .join("");
        const names = r.items.map(it => it.name).join(" · ");
        return (
          '<details class="day rutday" data-rut="' +
          esc(r.id) +
          '"' +
          (ed || openRuts.has(r.id) ? " open" : "") +
          "><summary><h3>" +
          esc(r.name) +
          '</h3><span class="cnt">' +
          r.items.length +
          (r.items.length === 1 ? " ejercicio" : " ejercicios") +
          '</span><span class="names">' +
          esc(names) +
          "</span></summary>" +
          '<div class="list rutbody">' +
          '<div class="hbar">' +
          (ed
            ? '<input class="rutname" data-rname="' +
              esc(r.id) +
              '" value="' +
              esc(r.name) +
              '" aria-label="Nombre de la rutina">'
            : "<span>" + (mus ? '<span class="rutmus">' + mus + "</span>" : "") + "</span>") +
          '<button type="button" class="' +
          (ed ? "btnlike solid" : "iconbtn hed") +
          '" data-redit="' +
          esc(r.id) +
          '" aria-label="' +
          (ed ? "Terminar de editar" : "Editar rutina") +
          '">' +
          (ed ? "Listo" : app.PENCIL) +
          "</button></div>" +
          (ed
            ? '<div class="rutmode" role="radiogroup" aria-label="Orden de las series"><span>Orden de las series</span><div><button type="button" role="radio" data-rcirc="0" data-rid="' +
              esc(r.id) +
              '" aria-checked="' +
              !r.circuit +
              '"><b>Por ejercicio</b><small>Todas las series de uno y luego el siguiente</small></button><button type="button" role="radio" data-rcirc="1" data-rid="' +
              esc(r.id) +
              '" aria-checked="' +
              !!r.circuit +
              '"><b>Circuito</b><small>Serie 1 de todos, luego serie 2…</small></button></div></div>'
            : r.circuit
              ? '<p class="rutcirc">↻ En circuito: serie 1 de todos, luego serie 2…</p>'
              : "") +
          '<div class="rutexs">' +
          rows +
          "</div>" +
          (ed
            ? '<div class="rutfoot"><button type="button" class="dangerbtn" data-rtdel="' +
              esc(r.id) +
              '">' +
              app.TRASH +
              " Borrar rutina</button></div>"
            : '<div class="rutloads"><button type="button" class="primary rutload" data-rtload="' +
              esc(r.id) +
              '" data-rd="' +
              app.today +
              '">Cargar hoy</button><button type="button" class="btnlike" data-rtpick="' +
              esc(r.id) +
              '" aria-expanded="' +
              (rutPick === r.id) +
              '">Otra fecha ▾</button></div>' +
              (rutPick === r.id ? rutPickHTML(r.id) : "")) +
          "</div></details>"
        );
      })
      .join("");
  }
  $("rutList").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    const find = id => app.routines.findIndex(r => r.id === id);
    if (b.dataset.redit) {
      const id = b.dataset.redit;
      if (rutEdit === id) {
        const inp = document.querySelector('[data-rname="' + id + '"]'),
          i = find(id);
        rutEdit = null;
        if (inp && i >= 0 && inp.value.trim() && inp.value.trim() !== app.routines[i].name) {
          const l = app.routines.slice();
          l[i] = Object.assign({}, l[i], { name: inp.value.trim() });
          await app.store.setRoutines(l);
        } else renderRoutinesTab();
        return;
      }
      rutEdit = id;
      renderRoutinesTab();
      return;
    }
    if (b.dataset.rcirc != null) {
      const i = find(b.dataset.rid);
      if (i < 0) return;
      const l = app.routines.slice();
      l[i] = Object.assign({}, l[i], { circuit: b.dataset.rcirc === "1" });
      await app.store.setRoutines(l);
      return;
    }
    if (b.dataset.rxdel != null) {
      const i = find(b.dataset.rid);
      if (i < 0) return;
      const l = app.routines.slice(),
        r = Object.assign({}, l[i]);
      r.items = r.items.filter((_, k) => k !== +b.dataset.rxdel);
      l[i] = r;
      await app.store.setRoutines(l);
      return;
    }
    if (b.dataset.rtdel) {
      const i = find(b.dataset.rtdel);
      if (i < 0) return;
      const r = app.routines[i];
      rutEdit = null;
      await app.store.setRoutines(app.routines.filter((_, k) => k !== i));
      app.toast("Rutina borrada: " + r.name, false, {
        label: "Deshacer",
        fn: async () => {
          await app.store.setRoutines(app.routines.concat([r]));
        }
      });
      return;
    }
    if (b.dataset.rtpick) {
      rutPick = rutPick === b.dataset.rtpick ? null : b.dataset.rtpick;
      renderRoutinesTab();
      return;
    }
    if (b.dataset.rtload) {
      const r = app.routines[find(b.dataset.rtload)];
      if (!r) return;
      b.disabled = true;
      await loadRutOn(r, b.dataset.rd || app.today);
    }
  });
  async function loadRutOn(r, d) {
    rutPick = null;
    await addPlans(r.items, "“" + r.name + "”" + (d === app.today ? "" : " para el " + fmtDay(d)), d, r.circuit);
    app.showTab("anotar");
    app.goDay(d);
  }
  $("rutList").addEventListener("change", e => {
    const id = e.target.dataset && e.target.dataset.rtdate;
    if (!id || !e.target.value) return;
    const r = app.routines.find(x => x.id === id);
    if (r) loadRutOn(r, e.target.value);
  });
  $("rutList").addEventListener(
    "toggle",
    e => {
      const d = e.target.closest && e.target.closest(".rutday");
      if (!d) return;
      d.open ? openRuts.add(d.dataset.rut) : openRuts.delete(d.dataset.rut);
    },
    true
  );
  $("rutList").addEventListener("keydown", e => {
    if (e.target.dataset && e.target.dataset.rname && e.key === "Enter") {
      e.preventDefault();
      const b = document.querySelector('[data-redit="' + e.target.dataset.rname + '"]');
      if (b) b.click();
    }
  });

  function renderLoadBox() {
    const box = $("repeatBox"),
      d = $("date").value || app.today;
    const list = app.entries.filter(e => e.date === d).sort(byCreated);
    const days = [...new Set(app.entries.map(e => e.date))]
      .filter(x => x !== d)
      .sort()
      .reverse()
      .slice(0, 6);
    const rout = app.routines
      .map(
        (r, ri) =>
          '<div class="reprow"><div><b>' +
          esc(r.name) +
          "</b><span>" +
          esc(r.items.map(x => x.name).join(" · ")) +
          '</span></div><span class="rbtns"><button type="button" class="btnlike solid" data-rload="' +
          ri +
          '">Cargar</button><button type="button" class="iconbtn" data-rdel="' +
          ri +
          '" aria-label="Borrar rutina ' +
          esc(r.name) +
          '">' +
          app.TRASH +
          "</button></span></div>"
      )
      .join("");
    const prev = days
      .map(x => {
        const gs = splitSessions(app.entries.filter(e => e.date === x).sort(byCreated));
        return gs
          .map(
            (g, gi) =>
              '<div class="reprow"><div><b>' +
              esc(fmtDay(x)) +
              (gs.length > 1 ? " · " + esc(sessLabel(g).split(" · ")[0]) : "") +
              "</b><span>" +
              esc([...new Set(g.entries.map(e => e.name))].join(" · ")) +
              '</span></div><span class="rbtns"><button type="button" class="btnlike" data-copy="' +
              x +
              '" data-g="' +
              gi +
              '">Copiar</button><button type="button" class="iconbtn rstar" data-rfrom="' +
              x +
              '" data-g="' +
              gi +
              '" aria-label="Guardar esta sesión como rutina" title="Guardar como rutina">' +
              app.SAVEIC +
              "</button></span></div>"
          )
          .join("");
      })
      .join("");
    box.innerHTML =
      '<div class="lbhead"><h3>Mis rutinas</h3>' +
      (list.length
        ? '<button type="button" class="linkbtn" data-rsave-open="1">+ Guardar ' +
          (d === app.today ? "la de hoy" : "este día") +
          "</button>"
        : "") +
      "</div>" +
      '<div class="rsavebox" id="rSave"' +
      (saveSrc ? "" : " hidden") +
      '><small id="rSaveFor">' +
      (saveSrc ? esc(saveLabel()) : "") +
      '</small><div class="rsave"><input id="rName" placeholder="Nombre, ej: Día 2 · Piernas" aria-label="Nombre de la rutina" autocomplete="off"><button type="button" class="btnlike solid" data-rsave="1">Guardar</button></div></div>' +
      (rout ||
        '<p class="hint">Guarda una sesión como rutina (por ejemplo “Día A”) para cargarla con un toque cuando el entrenador la repita.</p>') +
      (prev ? '<h3 class="lbsub">Sesiones anteriores</h3>' + prev : "") +
      '<p class="hint">Se cargan los ejercicios con series, reps y peso pedidos, sin marcar, en ' +
      esc(d === app.today ? "hoy" : fmtDay(d)) +
      ".</p>";
  }
  app.SAVEIC =
    '<svg viewBox="0 0 24 24" class="svic" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/><path d="M12 7v6M9 10h6"/></svg>';
  // qué sesión se guarda como rutina: cualquier día (y sesión, si hubo mañana y tarde)
  let saveSrc = null;
  const srcItems = src => {
    const l = app.entries.filter(e => e.date === src.date).sort(byCreated);
    if (src.g == null) return l;
    const gs = splitSessions(l);
    return (gs[src.g] || { entries: [] }).entries;
  };
  function saveLabel() {
    if (!saveSrc) return "";
    const gs = splitSessions(app.entries.filter(e => e.date === saveSrc.date).sort(byCreated));
    return (
      "Guardando: " +
      fmtDay(saveSrc.date) +
      (saveSrc.g != null && gs.length > 1 ? " · " + sessLabel(gs[saveSrc.g]).split(" · ")[0] : "") +
      " (" +
      srcItems(saveSrc).length +
      (srcItems(saveSrc).length === 1 ? " ejercicio)" : " ejercicios)")
    );
  }
  function nextRoutineName() {
    let n = app.routines.length + 1;
    while (app.routines.some(r => norm(r.name) === norm("Día " + n))) n++;
    return "Día " + n;
  }
  function openSaveFor(src) {
    saveSrc = src;
    renderLoadBox();
    $("repeatBox").hidden = false;
    $("rName").value = nextRoutineName();
    setTimeout(() => {
      $("rName").focus();
      $("rName").select();
      $("rSave").scrollIntoView({ block: "center", behavior: "smooth" });
    }, 30);
  }
  $("repeatBtn").addEventListener("click", () => {
    const box = $("repeatBox");
    if (!box.hidden) {
      box.hidden = true;
      saveSrc = null;
      return;
    }
    saveSrc = null;
    renderLoadBox();
    box.hidden = false;
  });
  async function addPlans(items, label, date, circuit) {
    const d = date || $("date").value || app.today;
    let n = 0;
    const base = Date.now();
    try {
      for (const it of items) {
        await app.store.add(Object.assign(planOf(it), { date: d, memo: "", createdAt: base + n, circuit: !!circuit }));
        n++;
      }
      $("repeatBox").hidden = true;
      app.toast((n === 1 ? "Cargado 1 ejercicio" : "Cargados " + n + " ejercicios") + " de " + label);
    } catch (err) {
      app.toast("Se cargaron " + n + " de " + items.length + ". Inténtalo de nuevo para el resto.");
    }
  }
  $("repeatBox").addEventListener("click", async ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.rsaveOpen) {
      if (saveSrc && saveSrc.g == null && saveSrc.date === ($("date").value || app.today)) {
        saveSrc = null;
        renderLoadBox();
        return;
      }
      openSaveFor({ date: $("date").value || app.today, g: null });
      return;
    }
    if (b.dataset.rfrom) {
      openSaveFor({ date: b.dataset.rfrom, g: +b.dataset.g });
      return;
    }
    if (b.dataset.rsave) {
      const name = $("rName").value.trim();
      if (!name) {
        $("rName").focus();
        return;
      }
      const items = srcItems(saveSrc || { date: $("date").value || app.today, g: null }).map(planOf);
      if (!items.length) {
        app.toast("Esa sesión no tiene ejercicios.");
        return;
      }
      saveSrc = null;
      const ex = app.routines.findIndex(r => norm(r.name) === norm(name));
      const list = app.routines.slice();
      const r = { id: "r" + Date.now().toString(36), name, items };
      if (ex >= 0) list[ex] = Object.assign(r, { id: app.routines[ex].id });
      else list.push(r);
      await app.store.setRoutines(list);
      app.toast((ex >= 0 ? "Rutina actualizada: " : "Rutina guardada: ") + name);
      renderLoadBox();
      return;
    }
    if (b.dataset.rload != null) {
      const r = app.routines[+b.dataset.rload];
      if (!r) return;
      b.disabled = true;
      await addPlans(r.items, "“" + r.name + "”", null, r.circuit);
      return;
    }
    if (b.dataset.rdel != null) {
      const ri = +b.dataset.rdel,
        r = app.routines[ri];
      if (!r) return;
      await app.store.setRoutines(app.routines.filter((_, k) => k !== ri));
      renderLoadBox();
      app.toast("Rutina borrada: " + r.name, false, {
        label: "Deshacer",
        fn: async () => {
          await app.store.setRoutines(app.routines.concat([r]));
          if (!$("repeatBox").hidden) renderLoadBox();
        }
      });
      return;
    }
    if (b.dataset.copy) {
      b.disabled = true;
      const src = (
        splitSessions(app.entries.filter(e => e.date === b.dataset.copy).sort(byCreated))[+b.dataset.g || 0] || {
          entries: []
        }
      ).entries;
      await addPlans(src, fmtDay(b.dataset.copy));
    }
  });
  $("repeatBox").addEventListener("keydown", e => {
    if (e.target.id === "rName" && e.key === "Enter") {
      e.preventDefault();
      const b = $("repeatBox").querySelector("[data-rsave]");
      if (b) b.click();
    }
  });
}
