// Datos: Supabase, cola sin conexión y banco común.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { optimizeVideo, optimizeImage, posterURL } from "../media.js";
import { doneArr, splitSessions } from "../lib/sessions.js";
import { iso, imgKey, fmtSecs } from "../lib/format.js";

export function install(app) {
  const { $, env } = app;
  Object.assign(app, { bankSave, bankPromote, bankDelete, init });
  // ---------- almacenamiento (Supabase) ----------
  const sb = env.sb;
  app.me = env.userId;
  app.restCfg = { def: 90, by: {} };
  app.ath = null; // alumno que se está viendo {id,name,user_id,rest_cfg}
  let athCoaches = []; // ids de profesores de ese alumno
  let exRows = [],
    rutRows = [];
  const uuid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 3) | 8).toString(16);
        });
  const toEntry = r => ({
    id: r.id,
    date: r.date,
    name: r.name,
    sets: r.sets,
    reps: r.reps == null ? null : +r.reps,
    weight: r.weight == null ? null : +r.weight,
    mins: r.mins == null ? null : +r.mins,
    dist: r.dist == null ? null : +r.dist,
    memo: r.memo || "",
    order: r.ord,
    createdAt: r.created_ms == null ? null : +r.created_ms,
    done: Array.isArray(r.done) ? r.done : [],
    circuit: !!r.circuit
  });
  const ENTRY_COLS = { order: "ord", createdAt: "created_ms" };
  const toRowPatch = p => {
    const o = {};
    Object.keys(p).forEach(k => {
      if (k === "id") return;
      o[ENTRY_COLS[k] || k] = p[k];
    });
    o.updated_at = new Date().toISOString();
    return o;
  };
  // ---------- cola sin conexión ----------
  const OBK = "bit-outbox-" + app.me;
  let outbox = [];
  app.downloads = null;
  app.sampler = null;
  app.cats = {};
  app.routines = [];
  try {
    outbox = JSON.parse(localStorage.getItem(OBK) || "[]") || [];
  } catch (e) {
    outbox = [];
  }
  function saveOB() {
    try {
      localStorage.setItem(OBK, JSON.stringify(outbox));
    } catch (e) {}
    renderSync();
  }
  function applyPending(list) {
    let m = list.slice();
    outbox.forEach(op => {
      if (op.table !== "entries") return;
      if (op.t === "ins" && op.row.athlete_id === (app.ath && app.ath.id)) {
        m = m.filter(x => x.id !== op.row.id);
        m.push(toEntry(op.row));
      } else if (op.t === "upd")
        m = m.map(x => (x.id === op.id ? Object.assign({}, x, toEntry(Object.assign(fromEntry(x), op.patch))) : x));
      else if (op.t === "del") m = m.filter(x => x.id !== op.id);
    });
    return m;
  }
  const fromEntry = e => ({
    id: e.id,
    athlete_id: app.ath && app.ath.id,
    date: e.date,
    name: e.name,
    sets: e.sets ?? null,
    reps: e.reps ?? null,
    weight: e.weight ?? null,
    mins: e.mins ?? null,
    dist: e.dist ?? null,
    memo: e.memo || "",
    ord: e.order ?? null,
    created_ms: e.createdAt ?? null,
    done: e.done || [],
    circuit: !!e.circuit
  });
  function renderSync() {
    const n = outbox.length,
      el = $("syncNote");
    el.hidden = !n;
    if (n)
      el.textContent =
        (navigator.onLine === false ? "Sin conexión · " : "Guardando · ") +
        n +
        (n === 1 ? " cambio por subir" : " cambios por subir") +
        ". Quedan guardados en tu celular y se suben solos.";
  }
  window.addEventListener("offline", renderSync);
  async function runOp(op) {
    let q;
    if (op.t === "ins") q = sb.from(op.table).insert(op.row);
    else if (op.t === "ups") q = sb.from(op.table).upsert(op.row, { onConflict: op.onConflict });
    else if (op.t === "upd") q = sb.from(op.table).update(op.patch).eq("id", op.id);
    else if (op.t === "del") q = sb.from(op.table).delete().eq("id", op.id);
    else if (op.t === "delm") {
      q = sb.from(op.table).delete();
      Object.keys(op.match).forEach(k => {
        q = q.eq(k, op.match[k]);
      });
    }
    const { error } = await q;
    if (error) {
      const e = new Error(error.message);
      e.code = error.code || "net";
      e.perm = !!error.code && !/^(PGRST00|08|57)/.test(error.code);
      throw e;
    }
  }
  const withTimeout = (pr, ms) =>
    Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej({ code: "timeout" }), ms))]);
  let flushing = false,
    flushT = null;
  const schedule = () => {
    clearTimeout(flushT);
    flushT = setTimeout(flush, 15000);
  };
  async function flush() {
    if (flushing) return;
    flushing = true;
    renderSync();
    while (outbox.length) {
      try {
        await withTimeout(runOp(outbox[0]), 10000);
        outbox.shift();
        saveOB();
      } catch (e) {
        if (e && e.perm) {
          console.warn("descartado", outbox[0], e);
          outbox.shift();
          saveOB();
          app.toast("Un cambio no se pudo guardar (" + (e.message || "permiso") + ").");
          continue;
        }
        break;
      }
    }
    flushing = false;
    renderSync();
    if (outbox.length) schedule();
  }
  async function exec(op) {
    if (outbox.length) {
      outbox.push(op);
      saveOB();
      flush();
      return;
    }
    try {
      await withTimeout(runOp(op), 10000);
    } catch (e) {
      if (e && e.perm) throw e;
      outbox.push(op);
      saveOB();
      schedule();
    }
  }
  window.addEventListener("online", flush);
  if (outbox.length) setTimeout(flush, 1500);
  // la pantalla se actualiza al tiro; la subida va por detrás (sin esperar la señal)
  const bg = op => {
    exec(op).catch(e => app.toast("No se pudo guardar un cambio: " + ((e && e.message) || "error")));
  };

  // catálogo visible: el propio, el del alumno y el de sus profesores (prioridad en ese orden)
  const exOwnersRank = () => {
    const r = [app.me];
    if (app.ath && app.ath.user_id && app.ath.user_id !== app.me) r.push(app.ath.user_id);
    athCoaches.forEach(c => {
      if (!r.includes(c)) r.push(c);
    });
    return r;
  };
  // origen de cada ejercicio: "comun" (banco para todos), "mio", "profe" (de un profesor) o "alumno" (del alumno que miro)
  let exOrigin = {};
  app.bankRows = [];
  function deriveCatalog() {
    const rank = exOwnersRank(),
      by = {};
    exOrigin = {};
    exRows
      .filter(x => rank.includes(x.owner_id))
      .sort((a, b) => rank.indexOf(a.owner_id) - rank.indexOf(b.owner_id))
      .forEach(x => {
        const k = x.key;
        if (!by[k]) {
          by[k] = { name: x.name, img: null, cat: null };
          exOrigin[k] = x.owner_id === app.me ? "mio" : athCoaches.includes(x.owner_id) ? "profe" : "alumno";
        }
        if (!by[k].img && x.image_url)
          by[k].img = { id: x.image_path || x.id, url: x.image_url, type: x.image_type || "image/png" };
        if (!by[k].cat && x.category) by[k].cat = { c: x.category, by: x.category_by || "user" };
      });
    // el banco común completa lo que falte (y marca el origen)
    app.bankRows.forEach(b => {
      const k = b.key;
      if (!by[k]) by[k] = { name: b.name, img: null, cat: null };
      else by[k].name = b.name;
      exOrigin[k] = "comun";
      if (!by[k].img && b.image_url)
        by[k].img = { id: "bank:" + k, url: b.image_url, type: b.image_type || "image/png" };
      if (!by[k].cat && b.category) by[k].cat = { c: b.category, by: "bank" };
    });
    const alias = {};
    app.bankRows.forEach(b => {
      const a = imgKey(b.name);
      if (a !== b.key && !by[a]) alias[a] = b.key;
    });
    app.catalog = Object.values(by)
      .map(v => v.name)
      .sort((a, b) => a.localeCompare(b, "es"));
    app.images = {};
    app.cats = {};
    Object.keys(by).forEach(k => {
      if (by[k].img) app.images[k] = by[k].img;
      if (by[k].cat) app.cats[k] = by[k].cat;
    });
    Object.keys(alias).forEach(a => {
      const k = alias[a];
      if (by[k].img) app.images[a] = by[k].img;
      if (by[k].cat) app.cats[a] = by[k].cat;
      exOrigin[a] = "comun";
    });
  }
  // ---------- administración del banco común (solo admin) ----------
  app.isAdmin = () => !!(env.isAdmin && env.isAdmin());
  app.bankRowOf = n => app.bankRows.find(b => b.key === imgKey(n) || imgKey(b.name) === imgKey(n)) || null;
  async function bankSave(key, patch) {
    const { error } = await sb.from("bank_exercises").update(patch).eq("key", key);
    if (error) {
      app.toast("No se pudo guardar en el banco: " + error.message);
      return false;
    }
    const b = app.bankRows.find(x => x.key === key);
    if (b) Object.assign(b, patch);
    deriveCatalog();
    app.render();
    return true;
  }
  async function bankPromote(n) {
    const k = imgKey(n),
      own = ownExRow(k),
      img = app.imgOf(n),
      c = app.cats[k];
    const row = {
      key: k,
      name: n,
      image_url: img ? img.url : null,
      image_type: img ? img.type : null,
      category: c ? c.c : app.catOf(n)
    };
    const { error } = await sb.from("bank_exercises").insert(row);
    if (error) {
      app.toast("No se pudo pasar al banco: " + error.message);
      return;
    }
    app.bankRows.push(row);
    if (own) {
      exRows = exRows.filter(x => x !== own);
      bg({ t: "delm", table: "exercises", match: { owner_id: app.me, key: k } });
    }
    deriveCatalog();
    app.exSeg = "comun";
    app.render();
    app.toast("“" + n + "” ahora está en el banco común");
  }
  async function bankDelete(n) {
    const b = app.bankRowOf(n);
    if (!b) return;
    const { error } = await sb.from("bank_exercises").delete().eq("key", b.key);
    if (error) {
      app.toast("No se pudo quitar: " + error.message);
      return;
    }
    app.bankRows = app.bankRows.filter(x => x !== b);
    deriveCatalog();
    app.render();
    app.toast("Quitado del banco: " + b.name);
  }
  app.pendingBank = null;
  app.originOf = n => exOrigin[imgKey(n)] || null;
  const ORIGIN_TXT = { comun: "Común", mio: "Mío", profe: "Profesor", alumno: "Alumno" };
  app.originTag = n => {
    const o = app.originOf(n);
    return o ? '<span class="otag o-' + o + '">' + ORIGIN_TXT[o] + "</span>" : "";
  };
  function deriveRoutines() {
    const rank = [app.me].concat(athCoaches);
    app.routines = rutRows
      .filter(r => (app.ath && r.athlete_id === app.ath.id) || (r.athlete_id == null && rank.includes(r.owner_id)))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map(r => ({
        id: r.id,
        name: r.name,
        items: Array.isArray(r.items) ? r.items : [],
        circuit: !!r.circuit,
        own: r.owner_id === app.me,
        ownerId: r.owner_id
      }));
  }
  const ownExRow = key => exRows.find(x => x.owner_id === app.me && x.key === key);
  function putOwnEx(key, patch) {
    const bk = app.bankRows.find(b => b.key === key);
    const name =
      patch.name ||
      app.catalog.find(n => imgKey(n) === key) ||
      (bk && bk.name) ||
      (app.entries.find(e => imgKey(e.name) === key) || {}).name ||
      key;
    let row = ownExRow(key);
    if (row) Object.assign(row, patch);
    else {
      row = Object.assign({ id: uuid(), owner_id: app.me, key, name, created_at: new Date().toISOString() }, patch);
      exRows.push(row);
    }
    bg({
      t: "ups",
      table: "exercises",
      onConflict: "owner_id,key",
      row: {
        owner_id: app.me,
        key,
        name: row.name,
        image_url: row.image_url ?? null,
        image_type: row.image_type ?? null,
        image_path: row.image_path ?? null,
        category: row.category ?? null,
        category_by: row.category_by ?? null
      }
    });
  }
  app.store = {
    add: async e => {
      const row = fromEntry(Object.assign({}, e, { id: uuid() }));
      app.entries.push(toEntry(row));
      app.render();
      bg({ t: "ins", table: "entries", row });
    },
    remove: async id => {
      app.entries = app.entries.filter(x => x.id !== id);
      app.render();
      bg({ t: "del", table: "entries", id });
    },
    update: async (id, patch) => {
      const e = app.entries.find(x => x.id === id);
      if (e) {
        Object.assign(e, patch);
        app.render();
      }
      bg({ t: "upd", table: "entries", id, patch: toRowPatch(patch) });
    },
    setCatalog: async list => {
      const now = new Set(list.map(imgKey)),
        before = new Set(app.catalog.map(imgKey));
      list.forEach(n => {
        const k = imgKey(n);
        if (!before.has(k)) putOwnEx(k, { name: n });
      });
      app.catalog.forEach(n => {
        const k = imgKey(n);
        if (!now.has(k)) {
          const own = ownExRow(k);
          if (own) {
            exRows = exRows.filter(x => x !== own);
            bg({ t: "delm", table: "exercises", match: { owner_id: app.me, key: k } });
          }
          if (app.bankRows.some(b => b.key === k)) app.toast("“" + n + "” es del banco común: no se puede quitar.");
          else if (!own) app.toast("“" + n + "” es del catálogo de tu profesor: solo él puede quitarlo.");
        }
      });
      deriveCatalog();
      app.render();
    },
    setImages: async map => {
      Object.keys(map).forEach(k => {
        if (app.bankRows.some(b => b.key === k)) return;
        const v = map[k],
          cur = app.images[k];
        if (!cur || cur.url !== v.url) putOwnEx(k, { image_url: v.url, image_type: v.type, image_path: v.id });
      });
      deriveCatalog();
      app.render();
    },
    setCats: async map => {
      Object.keys(map).forEach(k => {
        if (app.bankRows.some(b => b.key === k)) return;
        const v = map[k],
          c = typeof v === "string" ? { c: v, by: "user" } : v,
          cur = app.cats[k];
        if (!cur || cur.c !== c.c || cur.by !== c.by) putOwnEx(k, { category: c.c, category_by: c.by });
      });
      deriveCatalog();
      app.render();
    },
    setRoutines: async list => {
      const prev = new Map(app.routines.map(r => [r.id, r]));
      list.forEach(r => {
        const p = prev.get(r.id);
        if (!p || !rutRows.some(x => x.id === r.id)) {
          const id = /^[0-9a-f-]{36}$/.test(r.id) ? r.id : uuid();
          // el profesor guarda en su biblioteca (sirve para todos sus alumnos); el alumno, en su propio historial
          const row = {
            id,
            owner_id: app.me,
            athlete_id: env.isCoach() ? null : app.ath.id,
            name: r.name,
            items: r.items,
            circuit: !!r.circuit
          };
          rutRows.push(Object.assign({ created_at: new Date().toISOString() }, row));
          bg({ t: "ins", table: "routines", row });
        } else if (
          p.name !== r.name ||
          !!p.circuit !== !!r.circuit ||
          JSON.stringify(p.items) !== JSON.stringify(r.items)
        ) {
          if (p.own === false) {
            app.toast("Esa rutina es de tu profesor: no la puedes modificar.");
            return;
          }
          const x = rutRows.find(z => z.id === r.id);
          Object.assign(x, { name: r.name, items: r.items, circuit: !!r.circuit });
          bg({ t: "upd", table: "routines", id: r.id, patch: { name: r.name, items: r.items, circuit: !!r.circuit } });
        }
      });
      const ids = new Set(list.map(r => r.id));
      app.routines.forEach(r => {
        if (!ids.has(r.id)) {
          if (r.own === false) {
            app.toast("Esa rutina es de tu profesor: no la puedes borrar.");
            return;
          }
          rutRows = rutRows.filter(x => x.id !== r.id);
          bg({ t: "del", table: "routines", id: r.id });
        }
      });
      deriveRoutines();
      app.render();
    },
    setSettings: async s => {
      app.restCfg = s;
      if (app.ath) {
        app.ath.rest_cfg = s;
        bg({ t: "upd", table: "athletes", id: app.ath.id, patch: { rest_cfg: s } });
      }
    }
  };
  // imágenes y videos → Supabase Storage (bucket público "media", carpeta del usuario)
  app.assets = {
    upload: async (file, onProgress) => {
      if (/^video\//.test(file.type)) {
        const o = await optimizeVideo(file, onProgress);
        const base = app.me + "/" + uuid();
        const vf = o.file,
          vext =
            vf.type === "video/mp4"
              ? "mp4"
              : ((vf.name || "").split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
        const vpath = base + "." + vext;
        if (vf.size > 20 * 1024 * 1024)
          throw new Error(
            "El video pesa " +
              Math.round(vf.size / 1048576) +
              " MB y este navegador no pudo comprimirlo. Prueba desde Chrome actualizado o con un video más corto."
          );
        const up = await sb.storage
          .from("media")
          .upload(vpath, vf, { contentType: vf.type, cacheControl: "31536000", upsert: false });
        if (up.error) throw up.error;
        if (o.poster) {
          try {
            await sb.storage
              .from("media")
              .upload(base + ".jpg", o.poster, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
          } catch (e) {}
        }
        return {
          id: vpath,
          url: sb.storage.from("media").getPublicUrl(vpath).data.publicUrl,
          contentType: vf.type,
          info: o.info
        };
      }
      file = await optimizeImage(file);
      const ext = (file.name && file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/")[1] || "bin")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const path = app.me + "/" + uuid() + "." + ext;
      const { error } = await sb.storage
        .from("media")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const url = sb.storage.from("media").getPublicUrl(path).data.publicUrl;
      return { id: path, url, contentType: file.type };
    },
    delete: async id => {
      if (String(id).startsWith(app.me + "/")) {
        const l = [id];
        const p = posterURL(id);
        if (p) l.push(p);
        await sb.storage.from("media").remove(l);
      }
    }
  };
  app.downloads = {
    save: async ({ filename, data }) => {
      const blob =
        data instanceof Blob
          ? data
          : new Blob([data], { type: filename.endsWith(".csv") ? "text/csv" : "application/octet-stream" });
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (e) {
          if (e && e.name === "AbortError") throw { code: "declined" };
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 2000);
    }
  };
  app.sampler = env.ai || null;

  async function loadAthleteData() {
    const aid = app.ath.id;
    const since = new Date();
    since.setDate(since.getDate() - 400);
    const [en, ex, ru, co, bk] = await Promise.all([
      sb.from("entries").select("*").eq("athlete_id", aid).gte("date", iso(since)).order("date"),
      sb.from("exercises").select("*"),
      sb.from("routines").select("*"),
      sb.from("coach_athletes").select("coach_id").eq("athlete_id", aid),
      app.bankRows.length ? Promise.resolve({ data: app.bankRows }) : sb.from("bank_exercises").select("*")
    ]);
    if (app.ath.id !== aid) return; // se cambió de alumno mientras cargaba
    if (en.error) throw en.error;
    app.entries = applyPending((en.data || []).map(toEntry));
    exRows = ex.data || [];
    rutRows = ru.data || [];
    athCoaches = (co.data || []).map(x => x.coach_id);
    app.bankRows = (bk && bk.data) || app.bankRows;
    const rc = app.ath.rest_cfg;
    app.restCfg =
      rc && rc.by
        ? { def: +rc.def || 90, by: Object.assign({}, rc.by), side: Object.assign({}, rc.side || {}) }
        : { def: 90, by: {}, side: Object.assign({}, (rc && rc.side) || {}) };
    deriveCatalog();
    deriveRoutines();
    app.catLoaded = app.entLoaded = true;
  }
  // tiempo real: lo que marca el alumno lo ve el profesor al instante (y al revés)
  let rtChannel = null;
  function subscribeRealtime() {
    if (rtChannel) return;
    rtChannel = sb
      .channel("bitacora-" + app.me)
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, p => {
        const row = p.new && p.new.id ? p.new : p.old;
        env.onEntryChange && env.onEntryChange(p);
        if (!app.ath || !row) return;
        if (outbox.some(o => o.table === "entries" && (o.id === row.id || (o.row && o.row.id === row.id)))) return;
        if (p.eventType === "DELETE") {
          if (app.entries.some(e => e.id === row.id)) {
            app.entries = app.entries.filter(e => e.id !== row.id);
            app.render();
          }
          return;
        }
        if (row.athlete_id !== app.ath.id) return;
        const ne = toEntry(row),
          i = app.entries.findIndex(e => e.id === ne.id);
        if (i >= 0) {
          if (JSON.stringify(app.entries[i]) === JSON.stringify(Object.assign({}, app.entries[i], ne))) return;
          app.entries[i] = Object.assign({}, app.entries[i], ne);
        } else app.entries.push(ne);
        app.render();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "routines" }, async () => {
        const { data } = await sb.from("routines").select("*");
        if (data) {
          rutRows = data;
          deriveRoutines();
          app.render();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "coach_athletes" }, () => {
        env.onLinksChange && env.onLinksChange();
      })
      .subscribe();
  }
  // cambiar de alumno (modo profesor) o cargar el propio historial
  const transient = {}; // descanso/cronómetro por alumno: cada uno sigue corriendo aunque mires a otro
  async function setAthlete(a) {
    if (app.ath && app.ath.id === a.id && !a._reload) return;
    if (app.ath) transient[app.ath.id] = { rest: app.rest, running: app.running };
    app.ath = a;
    const t = transient[a.id] || {};
    app.rest = t.rest || null;
    app.running = t.running || null;
    app.editing = null;
    app.editEntry = null;
    app.expandedSets.clear();
    if (app.rest) {
      $("rest").hidden = false;
      document.body.classList.add("resting");
      $("rLabel").textContent = "Descanso · " + app.rest.name;
      app.renderRestPresets();
    } else {
      $("rest").hidden = true;
      $("rest").classList.remove("over");
      document.body.classList.remove("resting");
    }
    app.entries = [];
    app.catalog = [];
    app.images = {};
    app.cats = {};
    app.routines = [];
    app.catLoaded = app.entLoaded = false;
    app.autoCatDone = false;
    app.FS.key = null;
    $("repeatBox").hidden = true;
    app.render();
    try {
      await loadAthleteData();
    } catch (e) {
      app.toast("No se pudo cargar: " + (e.message || "revisa tu conexión"));
    }
    app.render();
  }
  env.api.setAthlete = setAthlete;
  env.api.currentAthlete = () => app.ath;
  env.api.restOf = id => (app.ath && id === app.ath.id ? app.rest : (transient[id] && transient[id].rest) || null);
  env.api.runningOf = id =>
    app.ath && id === app.ath.id ? app.running : (transient[id] && transient[id].running) || null;
  env.api.splitSessions = l => splitSessions(l);
  env.api.findNext = l => app.findNext(l);
  env.api.doneArr = e => doneArr(e);
  env.api.planText = e => app.planText(e);
  env.api.toEntry = toEntry;
  env.api.toast = (m, s, a) => app.toast(m, s, a);
  env.api.render = () => app.render();
  env.api.fmtSecs = s => fmtSecs(s);
  env.api.today = () => app.today;
  async function init() {
    renderSync();
    subscribeRealtime();
    await setAthlete(env.initialAthlete);
  }
}
