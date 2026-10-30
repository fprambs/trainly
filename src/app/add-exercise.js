// Agregar ejercicio: buscador, imágenes, subidas y guardar.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { posterURL } from "../media.js";
import { fmtShort, esc, norm, imgKey } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, {
    mediaHTML,
    mediaBig,
    flash,
    addToCatalog,
    updateAddBtn,
    applyFields,
    setAddOpen,
    fillFromLast,
    pickFile,
    askNotify,
    bgUpload,
    openLB
  });
  // ---------- utilidades de ejercicios ----------
  app.inCatalog = n => app.catalog.some(c => norm(c) === norm(n));
  app.canonical = n =>
    app.catalog.find(c => norm(c) === norm(n)) || app.entries.find(e => norm(e.name) === norm(n))?.name || n;
  app.sortCat = l => l.slice().sort((a, b) => a.localeCompare(b, "es"));
  app.imgOf = n => app.images[imgKey(n)] || null;
  app.srcOf = r => r.url || "/_blob/" + r.id;
  app.isVid = r => (r.type || "").startsWith("video/");
  // miniaturas: los videos se muestran como imagen fija (poster) para no descargar ni reproducir todos a la vez
  function mediaHTML(r, cls, dataN) {
    const a = (cls ? ' class="' + cls + '"' : "") + (dataN != null ? ' data-n="' + esc(dataN) + '"' : "");
    const p = app.isVid(r) && (r.poster || posterURL(app.srcOf(r)));
    if (p && !/^blob:/.test(app.srcOf(r)))
      return (
        "<img" +
        a +
        ' src="' +
        esc(p) +
        '" data-vsrc="' +
        esc(app.srcOf(r)) +
        '" loading="lazy" decoding="async" alt="">'
      );
    return app.isVid(r)
      ? "<video" + a + ' src="' + esc(app.srcOf(r)) + '" muted loop autoplay playsinline preload="metadata"></video>'
      : "<img" + a + ' src="' + esc(app.srcOf(r)) + '" loading="lazy" decoding="async" alt="">';
  }
  // vistas grandes (detalle, ficha, modo entrenamiento, pantalla completa): el video en movimiento
  function mediaBig(r, cls) {
    const a = cls ? ' class="' + cls + '"' : "";
    if (!app.isVid(r)) return "<img" + a + ' src="' + esc(app.srcOf(r)) + '" alt="">';
    const p = r.poster || posterURL(app.srcOf(r));
    return (
      "<video" +
      a +
      ' src="' +
      esc(app.srcOf(r)) +
      '"' +
      (p && !/^blob:/.test(app.srcOf(r)) ? ' poster="' + esc(p) + '"' : "") +
      ' muted loop autoplay playsinline preload="auto"></video>'
    );
  }
  // si un video antiguo no tiene imagen fija, se usa el video
  document.addEventListener(
    "error",
    ev => {
      const t = ev.target;
      if (t && t.tagName === "IMG" && t.dataset && t.dataset.vsrc) {
        const v = document.createElement("video");
        v.className = t.className;
        if (t.dataset.n) v.dataset.n = t.dataset.n;
        v.src = t.dataset.vsrc;
        v.muted = true;
        v.loop = true;
        v.autoplay = true;
        v.playsInline = true;
        v.setAttribute("playsinline", "");
        v.preload = "metadata";
        t.replaceWith(v);
      }
    },
    true
  );
  function flash(msg, err) {
    const st = $("status");
    st.className = "status" + (err ? " err" : "");
    st.textContent = msg;
  }
  async function addToCatalog(n) {
    n = (n || "").trim().replace(/\s+/g, " ");
    if (!n || app.inCatalog(n)) return false;
    n = n.charAt(0).toUpperCase() + n.slice(1);
    try {
      await app.store.setCatalog(app.sortCat(app.catalog.concat(n)));
      if (!app.catEntry(n)) app.classifyNames([n]);
      return true;
    } catch (e) {
      flash("No se pudo guardar el ejercicio. Inténtalo de nuevo.", true);
      return false;
    }
  }

  // ---------- campo Ejercicio + buscador ----------
  const list = $("sugg");
  app.nameIn = $("name");
  function updateAddBtn() {
    const v = app.nameIn.value.trim();
    $("addCat").hidden = !v || app.inCatalog(v);
    updateExCard();
  }
  $("addCat").addEventListener("click", async () => {
    const v = app.nameIn.value.trim();
    if (await addToCatalog(v)) {
      flash("☆ “" + app.canonical(v) + "” quedó en tus ejercicios");
      app.nameIn.value = app.canonical(v);
    }
    updateAddBtn();
  });
  let sugg = [],
    active = -1;
  function highlight(text, q) {
    const w = q.split(" ")[0];
    if (!w) return esc(text);
    const i = norm(text).indexOf(w);
    if (i < 0) return esc(text);
    return (
      esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + w.length)) + "</mark>" + esc(text.slice(i + w.length))
    );
  }
  function openSugg() {
    const q = norm(app.nameIn.value);
    const used = [...new Set(app.entries.map(e => e.name))].filter(n => !app.inCatalog(n));
    const pool = app.catalog.map(n => ({ n, saved: true })).concat(app.sortCat(used).map(n => ({ n, saved: false })));
    const words = q ? q.split(" ") : [];
    sugg = pool.filter(o => words.every(w => norm(o.n).includes(w))).slice(0, 10);
    active = -1;
    if (!sugg.length) {
      if (!q) {
        closeSugg();
        return;
      }
      list.innerHTML = '<li class="none">Nuevo ejercicio: se agrega igual, y puedes guardarlo en tu lista con ☆.</li>';
    } else {
      list.innerHTML = sugg
        .map((o, i) => {
          const r = app.imgOf(o.n);
          return (
            '<li role="option" id="op' +
            i +
            '" data-i="' +
            i +
            '" aria-selected="false">' +
            (r ? mediaHTML(r, "sthumb") : "") +
            "<span>" +
            highlight(o.n, q) +
            "</span><small>" +
            (o.saved ? app.originTag(o.n) || "Guardado" : "Usado antes") +
            "</small></li>"
          );
        })
        .join("");
    }
    list.hidden = false;
    app.nameIn.setAttribute("aria-expanded", "true");
  }
  function closeSugg() {
    list.hidden = true;
    app.nameIn.setAttribute("aria-expanded", "false");
    active = -1;
  }
  function setActive(i) {
    active = i;
    list
      .querySelectorAll("li[role=option]")
      .forEach((li, k) => li.setAttribute("aria-selected", k === i ? "true" : "false"));
    const el = $("op" + i);
    if (el) el.scrollIntoView({ block: "nearest" });
  }
  function choose(i) {
    if (!sugg[i]) return;
    app.nameIn.value = sugg[i].n;
    closeSugg();
    updateAddBtn();
    fillFromLast(app.nameIn.value);
    $("sets").focus();
  }
  // autocompletar con la última vez que hiciste el ejercicio (solo campos vacíos)
  // campos visibles del formulario (chips)
  const fields = new Set(["reps", "weight"]);
  const FIELD_INPUTS = { reps: ["reps"], weight: ["weight"], dist: ["dist"], time: ["tMin", "tSec"], memo: ["memo"] };
  function applyFields() {
    document.querySelectorAll("[data-field]").forEach(el => {
      el.hidden = !fields.has(el.dataset.field);
    });
    document
      .querySelectorAll("#fchips [data-fk]")
      .forEach(b => b.setAttribute("aria-pressed", fields.has(b.dataset.fk) ? "true" : "false"));
  }
  $("fchips").addEventListener("click", e => {
    const b = e.target.closest("[data-fk]");
    if (!b) return;
    const k = b.dataset.fk;
    if (fields.has(k)) {
      fields.delete(k);
      FIELD_INPUTS[k].forEach(id => ($(id).value = ""));
    } else fields.add(k);
    applyFields();
    if (fields.has(k)) $(FIELD_INPUTS[k][0]).focus();
  });
  const fieldVal = (k, id) => (fields.has(k) ? $(id).value : "");
  // formulario plegable
  app.addUserClosed = false;
  function setAddOpen(open, focus) {
    $("addCard").hidden = !open;
    $("addBack").hidden = !open;
    $("addOpen").setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("add-open", open);
    if (open) {
      flash("");
      if (focus) setTimeout(() => app.nameIn.focus(), 60);
    } else {
      closeSugg();
      resetAddForm();
    }
  }
  // al cerrar, el formulario queda limpio para la próxima vez
  function resetAddForm() {
    app.nameIn.value = "";
    ["sets", "reps", "weight", "dist", "tMin", "tSec", "memo"].forEach(k => {
      const x = $(k);
      if (x) x.value = "";
    });
    fields.clear();
    fields.add("reps");
    fields.add("weight");
    applyFields();
    const st = $("status");
    st.textContent = "";
    st.classList.remove("err");
    $("addCard").scrollTop = 0;
    updateAddBtn();
  }
  $("addBack").addEventListener("click", () => {
    app.addUserClosed = true;
    setAddOpen(false);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("addCard").hidden && list.hidden) setAddOpen(false);
  });
  $("emptyAdd").addEventListener("click", () => setAddOpen(true, true));
  $("emptyRut").addEventListener("click", () => $("repeatBtn").click());
  $("addOpen").addEventListener("click", () => {
    app.addUserClosed = false;
    setAddOpen(true, true);
  });
  $("addClose").addEventListener("click", () => {
    app.addUserClosed = true;
    setAddOpen(false);
    closeSugg();
  });
  function fillFromLast(n) {
    const last = app.entries
      .filter(e => app.isReal(e) && norm(e.name) === norm(n))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (!last) return;
    // mostrar los mismos campos que usaste la última vez
    const used = {
      reps: last.reps != null,
      weight: last.weight != null || app.valOf(last, "weight") != null,
      dist: last.dist != null,
      time: last.mins != null
    };
    if (Object.values(used).some(Boolean)) {
      ["reps", "weight", "dist", "time"].forEach(k => {
        if (used[k]) fields.add(k);
        else if (!FIELD_INPUTS[k].some(id => $(id).value !== "")) fields.delete(k);
      });
      applyFields();
    }
    const vals = { sets: last.sets, reps: last.reps, weight: app.valOf(last, "weight"), dist: last.dist };
    let filled = false;
    Object.keys(vals).forEach(k => {
      if ($(k).value === "" && vals[k] != null) {
        $(k).value = k === "weight" ? String(vals[k]).replace(".", ",") : vals[k];
        filled = true;
      }
    });
    if (app.getMins() == null && last.mins != null) {
      app.setMins(last.mins);
      filled = true;
    }
    if (filled) flash("Relleno con tu última vez (" + fmtShort(last.date) + "). Cambia lo que necesites.");
  }
  app.nameIn.addEventListener("change", () => {
    if (app.nameIn.value.trim()) fillFromLast(app.nameIn.value.trim());
  });
  app.nameIn.addEventListener("input", () => {
    openSugg();
    updateAddBtn();
    const st = $("status");
    if (st.classList.contains("err")) {
      st.classList.remove("err");
      st.textContent = "";
    }
  });
  app.nameIn.addEventListener("focus", openSugg);
  app.nameIn.addEventListener("blur", () => setTimeout(closeSugg, 150));
  app.nameIn.addEventListener("keydown", e => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(active + 1, sugg.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      closeSugg();
    }
  });
  list.addEventListener("mousedown", e => e.preventDefault());
  list.addEventListener("click", e => {
    const li = e.target.closest("li[data-i]");
    if (li) choose(+li.dataset.i);
  });

  // ---------- imágenes ----------
  app.searchURL = n => "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(n + " ejercicio gif");
  // ícono de dos mancuernas (peso por mancuerna)
  app.DUO_IC =
    '<svg class="duoic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/></svg><b class="duox">×2</b>';
  function weightLabel(n) {
    const lab = document.querySelector('label[for="weight"]');
    if (!lab) return;
    const ps = !!n && app.perSide(n);
    lab.textContent = ps ? "Peso (kg c/u)" : "Peso (kg)";
    $("weight").placeholder = ps ? "ej. 5 c/u" : "ej. 40";
  }
  function updateExCard() {
    const v = app.nameIn.value.trim(),
      card = $("excard");
    if (!v || !app.inCatalog(v)) {
      card.hidden = true;
      weightLabel(null);
      return;
    }
    const n = app.canonical(v),
      r = app.imgOf(n);
    card.hidden = false;
    card.dataset.name = n;
    $("exName").innerHTML =
      esc(n) + (app.perSide(n) ? '<span class="sidepill">' + app.DUO_IC + "Peso por mancuerna</span>" : "");
    weightLabel(n);
    const bank = app.originOf(n) === "comun";
    $("exSearch").hidden = bank;
    $("exSearch").href = app.searchURL(n);
    const t = $("exThumb");
    const cur = t.dataset.src || "",
      want = r ? app.srcOf(r) : "";
    if (cur !== want) {
      t.innerHTML = r ? mediaHTML(r) : "Sin imagen";
      t.dataset.src = want;
    }
    t.disabled = !r;
    $("exUpload").hidden = !app.assets || bank;
    $("exUpload").textContent = r ? "Cambiar imagen" : "Subir imagen";
    $("exHint").textContent = bank
      ? r
        ? "Toca la imagen para verla en grande."
        : ""
      : !app.assets
        ? "No se pueden subir imágenes ahora."
        : r
          ? "Toca la imagen para verla en grande."
          : "Busca una imagen, mantén presionada la que te guste para guardarla y luego súbela aquí.";
  }
  let pendingName = null;
  function pickFile(n) {
    if (!app.assets) return;
    pendingName = n;
    $("fileIn").click();
  }
  $("exUpload").addEventListener("click", () => pickFile($("excard").dataset.name));
  $("fileIn").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (app.pendingBank) {
      app.pendingBank = null;
      if (!f || !app.BK) return;
      if (!/^(image|video)\//.test(f.type)) {
        app.toast("Ese archivo no es una imagen ni un video.");
        return;
      }
      if (f.size > 200 * 1024 * 1024) {
        app.toast("El archivo pesa más de 200 MB. Prueba con uno más liviano.");
        return;
      }
      if (app.BK.preview) URL.revokeObjectURL(app.BK.preview);
      app.BK.file = f;
      app.BK.preview = URL.createObjectURL(f);
      app.BK.ptype = f.type;
      app.renderFicha();
      return;
    }
    if (pendingName) await uploadFor(pendingName, f);
  });
  // ---------- subidas en segundo plano: se puede seguir usando la app ----------
  const jobs = [];
  function renderJobs() {
    const el = $("upJobs");
    document.body.classList.toggle("has-jobs", jobs.length > 0);
    if (!jobs.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = jobs
      .map(
        j =>
          '<div class="upjob"><span class="upspin" aria-hidden="true"></span><div class="upt"><b>' +
          esc(j.label) +
          "</b><small>" +
          esc(j.stage) +
          '</small><span class="upbar"><i style="width:' +
          Math.round(j.p * 100) +
          '%"></i></span></div></div>'
      )
      .join("");
  }
  function askNotify() {
    try {
      if ("Notification" in window && Notification.permission === "default")
        Notification.requestPermission().catch(() => {});
    } catch (e) {}
  }
  async function notify(title, body) {
    app.toast(title + (body ? " · " + body : ""));
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg && reg.showNotification)
        await reg.showNotification(title, {
          body: body || "",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: "trainly-upload"
        });
      else new Notification(title, { body: body || "", icon: "/icons/icon-192.png" });
    } catch (e) {}
  }
  window.addEventListener("beforeunload", e => {
    if (jobs.length) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  function bgUpload(label, file, onDone) {
    const isV = /^video\//.test(file.type);
    const j = { label, p: 0, stage: isV ? "Optimizando video…" : "Subiendo…" };
    jobs.push(j);
    renderJobs();
    askNotify();
    (async () => {
      try {
        const res = await app.assets.upload(file, p => {
          j.p = p * 0.9;
          j.stage = "Optimizando video " + Math.round(p * 100) + "%";
          renderJobs();
        });
        j.p = 0.95;
        j.stage = "Guardando…";
        renderJobs();
        await onDone(res);
        notify(
          label + " listo",
          res.info && res.info !== "original" ? "Video optimizado: " + res.info : "Ya está disponible"
        );
      } catch (e) {
        app.toast(
          e && e.message && /MB/.test(e.message)
            ? e.message
            : "No se pudo subir " + label + ". Revisa tu conexión e inténtalo de nuevo."
        );
      } finally {
        jobs.splice(jobs.indexOf(j), 1);
        renderJobs();
      }
    })();
  }
  async function uploadFor(name, file) {
    if (!app.assets || !file) return;
    if (!/^(image|video)\//.test(file.type)) {
      flash("Ese archivo no es una imagen ni un video.", true);
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      flash("El archivo pesa más de 200 MB. Prueba con uno más liviano.", true);
      return;
    }
    flash("Se está subiendo en segundo plano. Puedes seguir usando la app.");
    bgUpload((/^video/.test(file.type) ? "Video de " : "Imagen de ") + name, file, async res => {
      const key = imgKey(name),
        old = app.images[key];
      const map = Object.assign({}, app.images);
      map[key] = { id: res.id, url: res.url, type: res.contentType || file.type };
      await app.store.setImages(map);
      if (old && old.id && old.id !== res.id) {
        try {
          await app.assets.delete(old.id);
        } catch (e) {}
      }
    });
  }
  document.addEventListener("paste", async e => {
    if ($("excard").hidden || !app.assets || $("tab-anotar").hidden) return;
    const f = [...(e.clipboardData?.files || [])].find(x => /^(image|video)\//.test(x.type));
    if (f) {
      e.preventDefault();
      await uploadFor($("excard").dataset.name, f);
    }
  });
  function openLB(n) {
    const r = app.imgOf(n);
    if (!r) return;
    $("lbName").textContent = n;
    $("lbBody").innerHTML = mediaBig(r);
    $("lb").hidden = false;
    $("lbClose").focus();
  }
  const closeLB = () => {
    $("lb").hidden = true;
    $("lbBody").innerHTML = "";
  };
  $("lbClose").addEventListener("click", closeLB);
  $("lb").addEventListener("click", e => {
    if (e.target.id === "lb") closeLB();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("lb").hidden) closeLB();
  });
  $("exThumb").addEventListener("click", () => openLB($("excard").dataset.name));
  document.addEventListener("click", e => {
    const m = e.target.closest(".mini");
    if (m) openLB(m.dataset.n);
  });

  // ---------- guardar registro ----------
  const numOrNull = v => {
    v = String(v ?? "")
      .trim()
      .replace(",", ".");
    if (v === "") return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };
  $("form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const e = {
      date: $("date").value || app.today,
      name: app.canonical(app.nameIn.value.trim()),
      sets: numOrNull($("sets").value),
      reps: numOrNull(fieldVal("reps", "reps")),
      weight: numOrNull(fieldVal("weight", "weight")),
      mins: fields.has("time") ? app.getMins() : null,
      dist: numOrNull(fieldVal("dist", "dist")),
      memo: fieldVal("memo", "memo").trim(),
      createdAt: Date.now()
    };
    if (!e.name) {
      const st = $("status");
      st.textContent = "Escribe o elige un ejercicio.";
      st.classList.add("err");
      app.nameIn.focus();
      return;
    }
    $("status").classList.remove("err");
    $("status").textContent = "";
    try {
      app.lastNew = e.createdAt;
      await app.store.add(e);
      ["sets", "reps", "weight", "dist", "tMin", "tSec", "memo"].forEach(k => ($(k).value = ""));
      app.nameIn.value = "";
      updateAddBtn();
      app.picked = e.name;
      setAddOpen(false);
      app.toast("Agregado: " + e.name + (app.otherName() ? " · " + app.otherName() : ""));
    } catch (err) {
      flash(
        err && err.code === "quota_exceeded"
          ? "La bitácora está llena. Borra registros antiguos para seguir anotando."
          : "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.",
        true
      );
    }
  });
}
