// Ejercicios: músculos, clasificación con IA, grilla, ficha y banco común.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { CATS, CATMAP, guessCat } from "../lib/categories.js";
import { trendSVG } from "../lib/charts.js";
import { fmtShort, esc, norm, imgKey, fmtN, fmtDist, r1, fmtDur } from "../lib/format.js";

export function install(app) {
  const { $, env } = app;
  Object.assign(app, { classifyNames, renderCatAI, maybeAutoClassify, renderGrid, renderFicha, addFromBox });
  // ---------- categorías por músculo ----------
  // cats[clave] = "piernas" (elegido por ti, formato antiguo) o {c:"piernas",by:"user"|"ai"}
  app.catEntry = n => {
    const v = app.cats[imgKey(n)];
    if (!v) return null;
    if (typeof v === "string") return { c: v, by: "user" };
    return CATMAP[v.c] ? v : null;
  };
  app.catOf = n => {
    const v = app.catEntry(n);
    return v ? v.c : guessCat(n) || "otro";
  };
  const isGuess = n => !app.catEntry(n);
  // ---------- clasificación con Claude ----------
  let classifying = false;
  app.autoCatDone = false;
  app.catLoaded = false;
  app.entLoaded = false;
  const allExerciseNames = () => {
    const m = new Map();
    app.catalog.concat(app.entries.map(e => e.name)).forEach(n => {
      if (n && !m.has(imgKey(n))) m.set(imgKey(n), n);
    });
    return [...m.values()];
  };
  async function classifyNames(names, opts) {
    opts = opts || {};
    if (!app.sampler || classifying) return 0;
    names = names.filter(n => n && (opts.force ? (app.catEntry(n) || {}).by !== "user" : !app.catEntry(n)));
    if (!names.length) return 0;
    classifying = true;
    renderCatAI();
    let done = 0;
    try {
      for (let k = 0; k < names.length; k += 40) {
        const chunk = names.slice(k, k + 40);
        const res = await app.sampler.classify(chunk);
        if (res && typeof res === "object") {
          const m = Object.assign({}, app.cats);
          chunk.forEach(n => {
            const v = res[n] ?? Object.entries(res).find(([key]) => norm(key) === norm(n))?.[1];
            const c = typeof v === "string" ? norm(v).replace("glúteos", "gluteos") : null;
            if (c && CATMAP[c] && (opts.force ? (app.catEntry(n) || {}).by !== "user" : !app.catEntry(n))) {
              m[imgKey(n)] = { c, by: "ai" };
              done++;
            }
          });
          if (done) await app.store.setCats(m);
        }
      }
    } catch (e) {
      if (opts.manual)
        app.toast(
          e && e.code === "rate_limited"
            ? e.message && /límite/.test(e.message)
              ? e.message
              : "Hay muchas consultas seguidas. Inténtalo en un momento."
            : e && e.code === "not_granted"
              ? "La IA no está disponible ahora" + (e.message ? ": " + e.message : ".")
              : "No se pudo clasificar ahora" + (e && e.message ? " (" + e.message + ")" : "") + "."
        );
    } finally {
      classifying = false;
      renderCatAI();
    }
    return done;
  }
  function renderCatAI() {
    const b = $("catAIBtn");
    if (!b) return;
    b.hidden = !app.sampler || !app.catalog.some(n => segOf(n) === "mio") || app.exSeg !== "mio";
    b.disabled = classifying;
    b.innerHTML = classifying ? "Clasificando con IA…" : "✨ Reclasificar todo con IA";
  }
  // al abrir la app: clasifica una vez los ejercicios que aún no tienen músculo asignado
  function maybeAutoClassify() {
    if (app.autoCatDone || !app.sampler || !app.catLoaded || !app.entLoaded) return;
    const pend = allExerciseNames().filter(n => !app.catEntry(n));
    if (!pend.length) {
      app.autoCatDone = true;
      return;
    }
    app.autoCatDone = true;
    setTimeout(async () => {
      const n = await classifyNames(pend);
      if (n) app.toast("La IA clasificó " + n + (n === 1 ? " ejercicio" : " ejercicios") + " por músculo");
    }, 1500);
  }
  let catFilter = "",
    catOpen = null;
  function renderCatFilter(pool) {
    pool = pool || app.catalog;
    const present = new Set(pool.map(app.catOf)),
      f = $("catFilter");
    f.hidden = pool.length < 4;
    if (catFilter && !present.has(catFilter)) catFilter = "";
    const cur = catFilter && CATMAP[catFilter];
    // en el celular: un solo botón que despliega las categorías; en pantallas grandes se ven todas
    f.innerHTML =
      '<button type="button" class="cftoggle' +
      (cur ? " on" : "") +
      '" data-cft aria-expanded="' +
      cfOpen +
      '">' +
      (cur ? '<span class="catdot" style="background:' + cur[2] + '"></span>' + cur[1] : "Todos los músculos") +
      '<span class="cfar">▾</span></button>' +
      '<div class="cfpanel' +
      (cfOpen ? " open" : "") +
      '"><button type="button" data-cf="" aria-pressed="' +
      !catFilter +
      '">Todos</button>' +
      CATS.filter(c => present.has(c[0]))
        .map(
          c =>
            '<button type="button" data-cf="' +
            c[0] +
            '" aria-pressed="' +
            (catFilter === c[0]) +
            '"><span class="catdot" style="background:' +
            c[2] +
            '"></span>' +
            c[1] +
            "</button>"
        )
        .join("") +
      "</div>";
  }
  $("catAIBtn").addEventListener("click", async () => {
    const n = await classifyNames(
      allExerciseNames().filter(x => {
        const o = app.originOf(x);
        return o !== "comun" && o !== "profe";
      }),
      { force: true, manual: true }
    );
    if (n)
      app.toast(
        "Listo: " +
          n +
          (n === 1 ? " ejercicio clasificado" : " ejercicios clasificados") +
          ". Los que elegiste tú se mantienen."
      );
    else if (!classifying) app.toast("No hubo cambios. Los que elegiste tú se mantienen.");
  });
  let cfOpen = false;
  $("catFilter").addEventListener("click", e => {
    if (e.target.closest("[data-cft]")) {
      cfOpen = !cfOpen;
      renderGrid();
      return;
    }
    const b = e.target.closest("[data-cf]");
    if (!b) return;
    catFilter = b.dataset.cf;
    cfOpen = false;
    renderGrid();
  });
  // ---------- tendencia por ejercicio ----------
  function trendHTML(n) {
    const rows = app.entries.filter(e => app.isReal(e) && norm(e.name) === norm(n));
    if (!rows.length) return "";
    const k = rows.map(app.keyFor).find(Boolean);
    if (!k) return "";
    const per = {};
    rows.forEach(r => {
      const v = app.valOf(r, k);
      if (v != null)
        per[r.date] = k === "best" ? Math.min(per[r.date] ?? Infinity, v) : Math.max(per[r.date] ?? -Infinity, v);
    });
    const days = Object.keys(per).sort().slice(-10),
      pts = days.map(d => per[d]);
    if (!pts.length) return "";
    const fmtV = v =>
      k === "mins" || k === "best" ? fmtDur(v) : k === "dist" ? fmtDist(v) : fmtN(r1(v)) + (k === "reps" ? "" : " kg");
    const what =
      {
        orm: "1RM estimado (kg)",
        weight: "Peso máximo (kg)",
        reps: "Repeticiones",
        mins: "Tiempo (min:seg)",
        best: "Mejor tiempo (min:seg)",
        dist: "Distancia"
      }[k] || "";
    const who =
      env.isCoach() && app.ath && app.ath.user_id !== app.me
        ? "Progreso de " + (app.ath.name || "tu alumno")
        : "Tu progreso";
    const last = pts[pts.length - 1];
    let arrow = "";
    if (pts.length > 1) {
      const d = last - pts[0],
        better = k === "best" ? d < 0 : d > 0;
      arrow =
        Math.abs(d) < 1e-9
          ? '<span class="ta">= sin cambio</span>'
          : '<span class="ta ' +
            (better ? "up" : "dn") +
            '">' +
            (better ? "↑ " : "↓ ") +
            fmtV(Math.abs(d)) +
            " desde el " +
            esc(fmtShort(days[0])) +
            "</span>";
    }
    let svg = "";
    if (pts.length > 1) {
      svg = trendSVG(days, pts, fmtV, who + ": " + what);
    }
    return (
      '<div class="trend"><div class="trh"><b>' +
      esc(who) +
      "</b><span>" +
      esc(what) +
      "</span></div>" +
      svg +
      '<div class="trf">Último: <b>' +
      esc(fmtV(last)) +
      "</b> " +
      arrow +
      (pts.length < 2 ? "<span> · con 2 o más días verás el gráfico</span>" : "") +
      "</div></div>"
    );
  }

  // ---------- grilla de ejercicios: banco común / míos / del profesor ----------
  let fichaN = null;
  app.exSeg = "comun";
  const SEGS = [
    ["comun", "Banco común"],
    ["mio", "Mis ejercicios"],
    ["profe", "De mi profesor"],
    ["alumno", "Del alumno"]
  ];
  const segOf = n => app.originOf(n) || "mio";
  function renderGrid() {
    const counts = { comun: 0, mio: 0, profe: 0, alumno: 0 };
    app.catalog.forEach(n => counts[segOf(n)]++);
    const shown = SEGS.filter(sg => sg[0] === "comun" || sg[0] === "mio" || counts[sg[0]]);
    if (!shown.some(sg => sg[0] === app.exSeg)) app.exSeg = "comun";
    $("exSegs").style.gridTemplateColumns = "repeat(" + shown.length + ",minmax(0,1fr))";
    $("exSegs").innerHTML = shown
      .map(
        sg =>
          '<button type="button" role="tab" data-seg="' +
          sg[0] +
          '" aria-selected="' +
          (app.exSeg === sg[0]) +
          '">' +
          sg[1] +
          " <small>" +
          counts[sg[0]] +
          "</small></button>"
      )
      .join("");
    $("catCount").textContent = "";
    const g = $("exgrid");
    const pool = app.catalog.filter(n => segOf(n) === app.exSeg);
    renderCatFilter(pool);
    const q = norm($("catNew").value),
      words = q ? q.split(" ") : [];
    const vis = pool.filter(
      n => (!words.length || words.every(w => norm(n).includes(w))) && (!catFilter || app.catOf(n) === catFilter)
    );
    if (!pool.length) {
      g.innerHTML =
        '<p class="hint exempty">' +
        (app.exSeg === "mio"
          ? env.isCoach()
            ? "Aún no creas ejercicios. Los que crees aquí los verán también tus alumnos."
            : "Aún no creas ejercicios propios. Escribe el nombre arriba y toca “Crear”."
          : "No hay ejercicios aquí todavía.") +
        "</p>";
    } else if (!vis.length) {
      g.innerHTML =
        '<p class="hint exempty">Ninguno coincide' +
        (q && app.exSeg !== "mio"
          ? ". Si no existe, puedes crearlo como ejercicio tuyo con el botón de arriba."
          : ".") +
        "</p>";
    } else {
      const by = {};
      vis.forEach(n => {
        const c = app.catOf(n);
        (by[c] = by[c] || []).push(n);
      });
      g.innerHTML = CATS.filter(c => by[c[0]])
        .map(
          c =>
            '<h3 class="exgh"><span class="catdot" style="background:' +
            c[2] +
            '"></span>' +
            c[1] +
            " <small>" +
            by[c[0]].length +
            '</small></h3><div class="exg3">' +
            by[c[0]]
              .map(n => {
                const i = app.catalog.indexOf(n),
                  r = app.imgOf(n);
                return (
                  '<button type="button" class="bcell' +
                  (n === freshName ? " fresh" : "") +
                  '" data-ficha="' +
                  i +
                  '"><span class="bthumb">' +
                  (r ? app.mediaHTML(r) : "<i>" + esc(n.charAt(0).toUpperCase()) + "</i>") +
                  '</span><span class="bname">' +
                  esc(n) +
                  "</span></button>"
                );
              })
              .join("") +
            "</div>"
        )
        .join("");
      if (freshName && !freshScrolled) {
        freshScrolled = true;
        setTimeout(() => {
          const x = g.querySelector(".bcell.fresh");
          if (x) x.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 80);
      }
    }
    $("gifTip").hidden = app.exSeg === "comun";
    updateCatHint();
    renderFicha();
  }
  $("exSegs").addEventListener("click", e => {
    const b = e.target.closest("[data-seg]");
    if (!b) return;
    app.exSeg = b.dataset.seg;
    catFilter = "";
    renderGrid();
  });
  function openFicha(n) {
    bkReset();
    fichaN = n;
    catOpen = null;
    renderFicha();
    $("fichaOv").hidden = false;
    document.body.classList.add("sm-open");
  }
  function closeFicha(force) {
    if (!force && bkDirty() && !confirmDiscard()) return;
    bkReset();
    fichaN = null;
    catOpen = null;
    $("fichaOv").hidden = true;
    $("ficha").innerHTML = "";
    if ($("smOv").hidden) document.body.classList.remove("sm-open");
  }
  function renderFicha() {
    if (!fichaN) return;
    const i = app.catalog.indexOf(fichaN);
    if (i < 0) {
      closeFicha(true);
      return;
    }
    const n = fichaN,
      o = segOf(n),
      own = o === "mio",
      cat = CATMAP[app.catOf(n)],
      r = app.imgOf(n);
    const rows = app.entries.filter(e => norm(e.name) === norm(n));
    const last = rows.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];
    const meta = rows.length
      ? rows.length +
        (rows.length === 1 ? " vez" : " veces") +
        " · último " +
        fmtShort(last.date) +
        (app.valOf(last, "weight") != null ? " · " + fmtN(app.valOf(last, "weight")) + app.KG(last) : "")
      : "Sin registros aún";
    $("ficha").innerHTML =
      '<div class="grab" aria-hidden="true"></div>' +
      '<div class="fihead"><h2 id="fichaName">' +
      esc(n) +
      "</h2>" +
      app.originTag(n) +
      '<button type="button" class="iconbtn" data-fclose aria-label="Cerrar">✕</button></div>' +
      (app.BK && app.BK.preview && app.bankRowOf(n) && app.bankRowOf(n).key === app.BK.key
        ? '<div class="fimedia preview">' +
          app.mediaBig({ url: app.BK.preview, type: app.BK.ptype }) +
          '<span class="pvtag">Vista previa · sin guardar</span></div>'
        : '<button type="button" class="fimedia' +
          (r ? "" : " noimg") +
          '" data-view="' +
          i +
          '" aria-label="Ver ' +
          esc(n) +
          ' en grande"' +
          (r ? "" : " disabled") +
          ">" +
          (r ? app.mediaBig(r) : "Sin imagen") +
          "</button>") +
      '<div class="firow">' +
      (own
        ? '<button type="button" class="catchip' +
          (isGuess(n) ? " guess" : "") +
          '" data-catopen="' +
          i +
          '" aria-expanded="' +
          (catOpen === n) +
          '" title="Cambiar músculo"><span class="catdot" style="background:' +
          cat[2] +
          '"></span>' +
          cat[1] +
          " ▾</button>"
        : '<span class="catchip ro"><span class="catdot" style="background:' +
          cat[2] +
          '"></span>' +
          cat[1] +
          "</span>") +
      '<span class="meta">' +
      esc(meta) +
      "</span></div>" +
      (catOpen === n && own
        ? '<div class="catpick" role="group" aria-label="Elegir músculo">' +
          CATS.map(
            c =>
              '<button type="button" data-catset="' +
              c[0] +
              '" data-ci="' +
              i +
              '" aria-pressed="' +
              (c[0] === cat[0] && !isGuess(n)) +
              '"><span class="catdot" style="background:' +
              c[2] +
              '"></span>' +
              c[1] +
              "</button>"
          ).join("") +
          "</div>"
        : "") +
      '<button type="button" class="sidetog" role="switch" aria-checked="' +
      app.perSide(n) +
      '" data-side="' +
      i +
      '"><span><b>Peso por mancuerna</b><small>' +
      (app.perSide(n)
        ? "Anotas lo que pesa cada mancuerna (ej. 5 kg c/u). El volumen cuenta las dos."
        : "Actívalo si lo haces con dos mancuernas y quieres anotar el peso de una.") +
      '</small></span><i aria-hidden="true"></i></button>' +
      trendHTML(n) +
      (o === "comun" && app.isAdmin()
        ? adminBankHTML(n, i)
        : o === "comun"
          ? '<p class="hint">Del banco común: lo ven todos y no se edita.</p>'
          : o === "profe"
            ? '<p class="hint">Lo creó tu profesor: solo él puede cambiarlo.</p>'
            : "") +
      '<div class="fiacts"><button type="button" class="btnlike solid" data-log="' +
      i +
      '">Agregar a hoy</button>' +
      (own && app.assets
        ? '<button type="button" class="btnlike" data-img="' +
          i +
          '">' +
          (r ? "Cambiar imagen" : "Subir imagen") +
          "</button>"
        : "") +
      (own && !r
        ? '<a class="btnlike" href="' + esc(app.searchURL(n)) + '" target="_blank" rel="noopener">Buscar imagen</a>'
        : "") +
      (own ? '<button type="button" class="btnlike danger" data-rm="' + i + '">Quitar</button>' : "") +
      (own && app.isAdmin()
        ? '<button type="button" class="btnlike" data-bkpromote="' + i + '">Pasar al banco común</button>'
        : "") +
      "</div>";
  }
  // borrador de cambios del banco: se aplican todos juntos con "Guardar cambios"
  app.BK = null; // {key,name,cat,file,preview,ptype}
  function bkDraft(n) {
    const b = app.bankRowOf(n);
    if (!b) return null;
    if (!app.BK || app.BK.key !== b.key)
      app.BK = {
        key: b.key,
        name: b.name,
        cat: b.category || app.catOf(n),
        side: !!b.per_side,
        file: null,
        preview: null
      };
    return app.BK;
  }
  function bkDirty() {
    if (!app.BK) return false;
    const b = app.bankRows.find(x => x.key === app.BK.key);
    if (!b) return false;
    return (
      app.BK.name.trim() !== b.name ||
      app.BK.cat !== (b.category || "") ||
      app.BK.side !== !!b.per_side ||
      !!app.BK.file
    );
  }
  function bkReset() {
    if (app.BK && app.BK.preview) URL.revokeObjectURL(app.BK.preview);
    app.BK = null;
  }
  let discardArm = 0;
  function confirmDiscard() {
    if (Date.now() - discardArm < 4000) return true;
    discardArm = Date.now();
    app.toast("Tienes cambios sin guardar. Cierra otra vez para descartarlos.");
    return false;
  }
  function adminBankHTML(n, i) {
    const d = bkDraft(n);
    if (!d) return "";
    return (
      '<div class="adminbox"><b>Administrar banco común</b>' +
      '<label class="f"><span>Nombre</span><input id="bkName" value="' +
      esc(d.name) +
      '" enterkeyhint="done" autocomplete="off"></label>' +
      '<div class="catpick" role="group" aria-label="Músculo">' +
      CATS.map(
        c =>
          '<button type="button" data-bkcat="' +
          c[0] +
          '" aria-pressed="' +
          (c[0] === d.cat) +
          '"><span class="catdot" style="background:' +
          c[2] +
          '"></span>' +
          c[1] +
          "</button>"
      ).join("") +
      "</div>" +
      '<label class="bkside"><input type="checkbox" id="bkSide"' +
      (d.side ? " checked" : "") +
      "> Peso por mancuerna por defecto (para todos)</label>" +
      '<div class="fiacts"><button type="button" class="btnlike" data-bkimg="1">' +
      (d.file ? "Elegir otro video" : "Cambiar video o imagen") +
      '</button><button type="button" class="btnlike danger" data-bkdel="' +
      i +
      '">Quitar del banco</button></div>' +
      (d.file
        ? '<p class="hint">Nuevo: ' +
          esc(d.file.name || "archivo") +
          " (" +
          (d.file.size / 1048576).toFixed(1).replace(".", ",") +
          " MB). Se sube al guardar.</p>"
        : "") +
      '<div class="bksave"><button type="button" class="btnlike" data-bkundo="1"' +
      (bkDirty() ? "" : " disabled") +
      '>Descartar</button><button type="button" class="btnlike solid" id="bkSave" data-bksave="1"' +
      (bkDirty() ? "" : " disabled") +
      ">Guardar cambios</button></div>" +
      '<p class="hint">Los cambios los ven todos los usuarios.</p></div>'
    );
  }
  function bkSync() {
    const on = bkDirty();
    document.querySelectorAll("[data-bksave],[data-bkundo]").forEach(x => (x.disabled = !on));
  }
  $("ficha").addEventListener("input", e => {
    if (e.target.id === "bkName" && app.BK) {
      app.BK.name = e.target.value;
      bkSync();
    }
  });
  $("ficha").addEventListener("change", e => {
    if (e.target.id === "bkSide" && app.BK) {
      app.BK.side = e.target.checked;
      bkSync();
    }
  });
  $("ficha").addEventListener("keydown", e => {
    if (e.target.id === "bkName" && e.key === "Enter") {
      e.preventDefault();
      const x = $("bkSave");
      if (x && !x.disabled) x.click();
    }
  });
  async function bkCommit(btn) {
    if (!app.BK || !bkDirty()) return;
    const d = app.BK,
      b = app.bankRows.find(x => x.key === d.key);
    if (!b) return;
    const name = d.name.trim().replace(/\s+/g, " ");
    if (!name) {
      app.toast("Escribe un nombre");
      return;
    }
    const patch = {};
    if (name !== b.name) patch.name = name;
    if (d.cat !== (b.category || "")) patch.category = d.cat;
    if (d.side !== !!b.per_side) patch.per_side = d.side;
    const file = d.file,
      key = d.key;
    btn.disabled = true;
    if (Object.keys(patch).length) {
      const prevN = fichaN;
      if (patch.name) fichaN = patch.name;
      if (!(await app.bankSave(key, patch))) {
        fichaN = prevN;
        btn.disabled = false;
        return;
      }
    }
    bkReset();
    if (file) {
      closeFicha(true);
      app.bgUpload("Video de " + name, file, async res => {
        if (!(await app.bankSave(key, { image_url: res.url, image_type: res.contentType || file.type })))
          throw new Error("guardar");
      });
      app.toast("Subiendo el video en segundo plano. Puedes seguir usando la app.");
    } else {
      renderFicha();
      app.toast("Cambios guardados");
    }
  }
  $("fichaOv").addEventListener("click", e => {
    if (e.target.id === "fichaOv" || e.target.closest("[data-fclose]")) closeFicha();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && fichaN && $("lb").hidden) closeFicha();
  });
  function updateCatHint() {
    const v = $("catNew").value.trim(),
      b = $("catNewBtn"),
      h = $("catHint");
    if (!v) {
      b.disabled = true;
      b.textContent = "Crear";
      h.textContent = "";
      return;
    }
    if (app.inCatalog(v)) {
      b.disabled = true;
      b.textContent = "Ya existe";
      const o = segOf(app.canonical(v));
      h.textContent =
        "“" +
        app.canonical(v) +
        "” ya está en " +
        (o === "comun" ? "el banco común" : o === "profe" ? "los ejercicios de tu profesor" : "tus ejercicios") +
        ".";
      return;
    }
    b.disabled = false;
    b.textContent = "Crear";
    h.textContent = "";
  }
  $("catNew").addEventListener("input", renderGrid);
  async function exAction(e) {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.ficha != null) {
      openFicha(app.catalog[+t.dataset.ficha]);
      return;
    }
    if (app.isAdmin()) {
      if (t.dataset.bkcat && app.BK) {
        app.BK.cat = t.dataset.bkcat;
        renderFicha();
        return;
      }
      if (t.dataset.bkimg != null && app.BK && app.assets) {
        app.pendingBank = app.BK.key;
        $("fileIn").click();
        return;
      }
      if (t.dataset.bksave) {
        await bkCommit(t);
        return;
      }
      if (t.dataset.bkundo) {
        bkReset();
        renderFicha();
        return;
      }
      if (t.dataset.bkdel != null) {
        const n = app.catalog[+t.dataset.bkdel];
        if (!t.classList.contains("arm")) {
          t.classList.add("arm");
          t.textContent = "¿Seguro? Lo dejan de ver todos";
          return;
        }
        closeFicha(true);
        await app.bankDelete(n);
        return;
      }
      if (t.dataset.bkpromote != null) {
        const n = app.catalog[+t.dataset.bkpromote];
        closeFicha(true);
        await app.bankPromote(n);
        return;
      }
    }
    if (t.dataset.side != null) {
      const n = app.catalog[+t.dataset.side],
        k = imgKey(n),
        on = !app.perSide(n);
      const b = app.bankRows.find(x => x.key === k),
        side = Object.assign({}, app.restCfg.side || {});
      if (b && !!b.per_side === on) delete side[k];
      else side[k] = on;
      await app.store.setSettings(Object.assign({}, app.restCfg, { side }));
      app.render();
      renderFicha();
      app.toast(on ? "“" + n + "”: ahora anotas el peso de cada mancuerna" : "“" + n + "”: ahora anotas el peso total");
      return;
    }
    if (t.dataset.catopen != null) {
      const n = app.catalog[+t.dataset.catopen];
      catOpen = catOpen === n ? null : n;
      renderFicha();
      return;
    }
    if (t.dataset.catset) {
      const n = app.catalog[+t.dataset.ci],
        m = Object.assign({}, app.cats);
      m[imgKey(n)] = { c: t.dataset.catset, by: "user" };
      catOpen = null;
      await app.store.setCats(m);
      return;
    }
    if (t.dataset.view != null) {
      app.openLB(app.catalog[+t.dataset.view]);
      return;
    }
    if (t.dataset.log != null) {
      const n = app.catalog[+t.dataset.log];
      closeFicha(true);
      app.showTab("anotar");
      app.renderToday();
      app.addUserClosed = false;
      app.setAddOpen(true);
      app.nameIn.value = n;
      app.updateAddBtn();
      app.fillFromLast(app.nameIn.value);
      setTimeout(() => $("sets").focus(), 80);
      return;
    }
    if (t.dataset.img != null) {
      app.pickFile(app.catalog[+t.dataset.img]);
      return;
    }
    if (t.dataset.rm != null) {
      const n = app.catalog[+t.dataset.rm];
      if (!t.classList.contains("arm")) {
        t.classList.add("arm");
        t.textContent = "¿Seguro? Toca otra vez";
        return;
      }
      closeFicha(true);
      try {
        await app.store.setCatalog(app.catalog.filter(c => c !== n));
        app.toast("Quitado: " + n, false, {
          label: "Deshacer",
          fn: async () => {
            await app.store.setCatalog(app.sortCat(Array.from(new Set(app.catalog.concat(n)))));
          }
        });
      } catch (err) {
        app.toast("No se pudo quitar. Inténtalo de nuevo.");
      }
    }
  }
  $("exgrid").addEventListener("click", exAction);
  $("ficha").addEventListener("click", exAction);
  let freshName = null,
    freshScrolled = false;
  async function addFromBox() {
    const v = $("catNew").value.trim().replace(/\s+/g, " ");
    if (!v || app.inCatalog(v)) {
      $("catNew").select();
      return;
    }
    const name = v.charAt(0).toUpperCase() + v.slice(1);
    $("catNew").value = "";
    freshName = name;
    freshScrolled = false;
    setTimeout(() => {
      freshName = null;
      renderGrid();
    }, 4000);
    app.exSeg = "mio";
    if (await app.addToCatalog(name)) app.toast("Creado: " + name + ". Tócalo para ponerle imagen.");
    else freshName = null;
  }
  $("catNewBtn").addEventListener("click", addFromBox);
  $("catNew").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFromBox();
    }
  });
}
