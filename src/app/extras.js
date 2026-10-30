// Respaldo, IA (identificar y analizar), accesos directos y notificaciones.
// Comparte el estado de la app a través del objeto `app` (ver src/app.js).
import { doneArr, byCreated, splitSessions } from "../lib/sessions.js";
import { buildCSV } from "../lib/csv.js";
import { iso, esc, fmtN, e1rm, r1 } from "../lib/format.js";

export function install(app) {
  const { $ } = app;
  Object.assign(app, { runShortcut, clearRestNoti });
  // ---------- respaldo (CSV para Excel) ----------
  $("backupBtn").addEventListener("click", async () => {
    if (!app.downloads) return;
    try {
      await app.downloads.save({ filename: "trainly-" + app.today + ".csv", data: buildCSV(app.entries) });
      app.toast("Respaldo descargado");
    } catch (e) {
      if (e && e.code === "declined") return;
      if (e && e.code === "rate_limited") {
        app.toast("Espera un momento e inténtalo de nuevo.");
        return;
      }
      app.toast("No se pudo descargar el respaldo aquí.");
    }
  });

  // ---------- Claude: identificar ejercicio ----------
  function wireIdentify(P, onUse, useLabel) {
    $(P + "Toggle").addEventListener("click", () => {
      const b = $(P + "Box");
      b.hidden = !b.hidden;
      if (!b.hidden) $(P + "Desc").focus();
    });
    $(P + "Go").addEventListener("click", async () => {
      const desc = $(P + "Desc").value.trim(),
        out = $(P + "Out"),
        btn = $(P + "Go");
      if (!desc) {
        $(P + "Desc").focus();
        return;
      }
      if (!app.sampler) return;
      btn.disabled = true;
      btn.textContent = "Pensando…";
      out.innerHTML = "";
      try {
        const r = await app.sampler.identify(desc);
        if (!r || !r.nombre) {
          out.innerHTML =
            '<p class="hint">No pude identificarlo. Prueba describiendo la posición, el implemento y el movimiento.</p>';
          return;
        }
        out.innerHTML =
          '<div class="idres"><b>' +
          esc(r.nombre) +
          "</b>" +
          (r.en_ingles ? "<small>En inglés: " + esc(r.en_ingles) + "</small>" : "") +
          (r.trabaja ? "<small>Trabaja: " + esc(r.trabaja) + "</small>" : "") +
          (r.seguro === false ? "<small>No estoy 100% seguro: confírmalo con tu entrenador.</small>" : "") +
          '<div><button type="button" class="btnlike solid">' +
          esc(useLabel) +
          "</button></div></div>";
        out.querySelector("button").onclick = () => {
          $(P + "Box").hidden = true;
          $(P + "Desc").value = "";
          out.innerHTML = "";
          onUse(r);
        };
      } catch (e) {
        out.innerHTML =
          '<p class="hint">' +
          (e && e.code === "rate_limited"
            ? e.message && /límite/.test(e.message)
              ? e.message
              : "Hay muchas consultas seguidas. Espera un momento."
            : e && e.code === "not_granted"
              ? "La IA no está disponible ahora" + (e.message ? ": " + esc(e.message) : ".")
              : "No se pudo consultar ahora. Inténtalo de nuevo." +
                (e && e.message ? "<br><small>" + esc(e.message) + "</small>" : "")) +
          "</p>";
      } finally {
        btn.disabled = false;
        btn.textContent = "Identificar";
      }
    });
  }
  wireIdentify(
    "id",
    r => {
      app.nameIn.value = r.nombre;
      app.updateAddBtn();
      app.fillFromLast(r.nombre);
      app.flash("Nombre listo. Toca “☆ Guardar en mis ejercicios” para tenerlo a mano.");
    },
    "Usar este nombre"
  );
  wireIdentify(
    "catId",
    async r => {
      if (app.inCatalog(r.nombre)) {
        $("catNew").value = r.nombre;
        app.renderGrid();
        return;
      }
      $("catNew").value = r.nombre;
      await app.addFromBox();
    },
    "Agregar a mis ejercicios"
  );

  // ---------- Claude: analizar progreso ----------
  function historyText() {
    const since = iso(new Date(Date.now() - 56 * 864e5));
    const rows = app.entries
      .filter(e => e.date >= since)
      .sort((a, b) => a.date.localeCompare(b.date) || byCreated(a, b));
    return rows
      .map(e => {
        const ds = doneArr(e)
          .map((d, i) =>
            d
              ? "S" +
                (i + 1) +
                ": " +
                app
                  .setParts(e, d)
                  .map(p => p.txt)
                  .join(" ") +
                (d.w != null && d.r != null ? " (1RM≈" + fmtN(r1(e1rm(d.w, d.r))) + ")" : "")
              : "S" + (i + 1) + ": no hecha"
          )
          .join("; ");
        return (
          e.date +
          " | " +
          e.name +
          " | pedido: " +
          (app.planText(e) || "-") +
          (e.sets ? " (" + e.sets + " series)" : "") +
          (ds ? " | hecho: " + ds : "")
        ); // sin notas ni nombres: solo números (privacidad)
      })
      .join("\n");
  }
  function mdLite(t) {
    const lines = esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .split(/\n/);
    let h = "",
      inList = false;
    lines.forEach(l => {
      const m = l.match(/^\s*[-•*]\s+(.*)/);
      if (m) {
        if (!inList) {
          h += "<ul>";
          inList = true;
        }
        h += "<li>" + m[1] + "</li>";
      } else {
        if (inList) {
          h += "</ul>";
          inList = false;
        }
        if (l.trim()) h += "<p>" + l + "</p>";
      }
    });
    return h + (inList ? "</ul>" : "");
  }
  let aiCtl = null;
  $("aiGo").addEventListener("click", async () => {
    if (!app.sampler) return;
    const out = $("aiOut"),
      btn = $("aiGo"),
      q = $("aiQ").value.trim();
    if (aiCtl) aiCtl.abort();
    aiCtl = new AbortController();
    btn.disabled = true;
    btn.textContent = "Analizando…";
    out.hidden = false;
    out.innerHTML = '<p class="hint">Revisando tu historial…</p>';
    const payload = { question: q, today: app.today, history: historyText() };
    try {
      const text = await app.sampler.analyze(payload, { signal: aiCtl.signal });
      out.innerHTML = mdLite(text);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      out.innerHTML =
        '<p class="hint">' +
        (e && e.code === "rate_limited"
          ? e.message && /límite/.test(e.message)
            ? e.message
            : "Hay muchas consultas seguidas. Espera un momento."
          : e && e.code === "not_granted"
            ? "La IA no está disponible ahora" + (e.message ? ": " + esc(e.message) : ".")
            : "No se pudo completar el análisis. Inténtalo de nuevo." +
              (e && e.message ? "<br><small>" + esc(e.message) + "</small>" : "")) +
        "</p>";
    } finally {
      btn.disabled = false;
      btn.textContent = "Analizar de nuevo";
    }
  });

  app.applyFields();

  // ---------- accesos directos del ícono (mantener presionado el ícono en Android) ----------
  function runShortcut(a) {
    if (a === "agregar") {
      app.showTab("anotar");
      app.goDay(app.today);
      app.setAddOpen(true, true);
    } else if (a === "entrenar") {
      app.showTab("anotar");
      app.goDay(app.today);
      const l = app.entries.filter(e => e.date === app.today).sort(byCreated),
        gs = l.length ? splitSessions(l) : [],
        cur = gs.length ? gs[gs.length - 1].entries : [];
      if (app.findNext(cur)) app.openFocus(true);
      else {
        app.toast("No tienes series pendientes hoy. Agrega un ejercicio o carga una rutina.");
        app.setAddOpen(true, true);
      }
    } else if (a === "rutinas") app.showTab("rutinas");
    else if (a === "historial") app.showTab("historial");
  }
  app.shortcutAct = new URLSearchParams(location.search).get("a");
  if (app.shortcutAct)
    try {
      history.replaceState(history.state, "", location.pathname + location.hash);
    } catch (e) {}

  // ---------- descanso en las notificaciones (con la app en segundo plano o el teléfono bloqueado) ----------
  let restNotiT = null;
  const notiOK = () => "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker;
  async function restNoti(final) {
    try {
      if (!notiOK() || !app.rest) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      const nx = $("rNext").querySelector("[data-go]")
        ? $("rNext")
            .textContent.replace(/^Después:\s*/, "")
            .replace(/Anotar ya$/, "")
            .trim()
        : "";
      if (final)
        await reg.showNotification("¡A la siguiente serie!", {
          body: nx || "Terminó tu descanso",
          tag: "trainly-rest",
          renotify: true,
          requireInteraction: true,
          vibrate: [250, 120, 250],
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          actions: nx ? [{ action: "anotar", title: "Anotar ya" }] : [],
          data: { kind: "rest" }
        });
      else {
        const hh = new Date(app.rest.end).toLocaleTimeString("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        });
        await reg.showNotification("Descansando · termina a las " + hh, {
          body: nx ? "Después: " + nx : app.rest.name,
          tag: "trainly-rest",
          silent: true,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          data: { kind: "rest" }
        });
      }
    } catch (e) {}
  }
  async function clearRestNoti() {
    clearTimeout(restNotiT);
    restNotiT = null;
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) (await reg.getNotifications({ tag: "trainly-rest" })).forEach(n => n.close());
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && app.rest) {
      const left = app.rest.end - Date.now();
      if (left > 1500) {
        restNoti(false);
        clearTimeout(restNotiT);
        restNotiT = setTimeout(() => {
          if (app.rest) restNoti(true);
        }, left);
      }
    } else if (document.visibilityState === "visible") clearRestNoti();
  });
  // "Anotar ya" desde la notificación
  if (navigator.serviceWorker)
    navigator.serviceWorker.addEventListener("message", ev => {
      if (!ev.data || ev.data.type !== "rest-anotar") return;
      app.showTab("anotar");
      const b = $("rNext").querySelector("[data-go]");
      if (b) b.click();
      else if (app.rest) app.stopRest();
    });
}
