import { test, expect } from "@playwright/test";
import { start, layoutOk, swipe, localISO, addDays } from "./helpers.js";

const today = () => localISO();

test("todas las pestañas cargan sin errores ni desbordes", async ({ page }) => {
  const errors = await start(page);
  for (const t of ["anotar", "rutinas", "historial", "progreso", "ejercicios"]) {
    await page.click(`#t-${t}`);
    await expect(page.locator(`#tab-${t}`)).toBeVisible();
    await layoutOk(page);
  }
  expect(errors).toEqual([]);
});

test("completar una serie: ventana, descanso y 'Anotar ya'", async ({ page }) => {
  const errors = await start(page);
  await expect(page.locator("#teToca")).toBeVisible();
  const ex = await page.locator("#teToca .tt-info b").textContent();
  await page.click("#teToca .tt-go");
  await expect(page.locator("#setModal")).toBeVisible();
  await page.click("#smOk");
  await expect(page.locator("body")).toHaveClass(/resting/);
  // por defecto se sigue con el mismo ejercicio (no en circuito)
  await expect(page.locator("#rNext")).toContainText(ex.trim());
  await expect(page.locator("#rNext")).toContainText("serie 2");
  await layoutOk(page);
  // el + no queda tapado por la tarjeta del descanso
  const hit = await page.evaluate(() => {
    const b = document.getElementById("addOpen").getBoundingClientRect();
    const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!e && !!e.closest("#addOpen");
  });
  expect(hit).toBe(true);
  await page.click("#rNext [data-go]");
  await expect(page.locator("#setModal")).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/resting/);
  expect(errors).toEqual([]);
});

test("cambiar la duración del descanso no lo reinicia", async ({ page }) => {
  await start(page);
  await page.click("#teToca .tt-go");
  await page.click("#smOk");
  await page.waitForTimeout(2200);
  await page.click("#rTimeBtn");
  await page.click("[data-preset='180']");
  const t = await page.locator("#rTime").textContent();
  const [m, s] = t.split(":").map(Number);
  expect(m * 60 + s).toBeLessThan(179);
  await expect(page.locator("#rPre")).toBeHidden();
});

test("desmarcar una serie se puede deshacer", async ({ page }) => {
  await start(page);
  await page.click(".tcard[data-open]");
  await expect(page.locator("#exDet")).toBeVisible();
  const before = await page.locator(".srow.done").count();
  await page.locator(".srow.done").first().click();
  await page.click("[data-sma=undo]");
  await expect(page.locator(".srow.done")).toHaveCount(before - 1);
  await page.click("#toastBtn");
  await expect(page.locator(".srow.done")).toHaveCount(before);
});

test("agregar un ejercicio y el formulario se limpia al cerrar", async ({ page }) => {
  const errors = await start(page);
  await page.click("#addOpen");
  await expect(page.locator("#addCard")).toBeVisible();
  await page.fill("#name", "Vuelo lateral");
  await page.click("#addTitle");
  await expect(page.locator("#excard .sidepill")).toBeVisible(); // peso por mancuerna
  await expect(page.locator('label[for="weight"]')).toHaveText("Peso (kg c/u)");
  await page.click("#addClose");
  await page.click("#addOpen");
  await expect(page.locator("#name")).toHaveValue("");
  await page.fill("#name", "Sentadilla búlgara de prueba");
  await page.fill("#sets", "3");
  await page.fill("#reps", "10");
  await page.fill("#weight", "12,5");
  await page.click("#submitBtn");
  await expect(page.locator("#addCard")).toBeHidden();
  await expect(page.locator(".tcard", { hasText: "Sentadilla búlgara de prueba" })).toContainText("12,5 kg");
  expect(errors).toEqual([]);
});

test("la tarjeta que toca muestra su borde completo (no se recorta)", async ({ page }) => {
  await start(page);
  const cur = page.locator(".tcard.cur");
  await expect(cur).toHaveCount(1);
  const ok = await cur.evaluate(el => {
    const r = el.getBoundingClientRect();
    const off = parseFloat(getComputedStyle(el).outlineOffset) || 0;
    const w = parseFloat(getComputedStyle(el).outlineWidth) || 0;
    const out = Math.max(0, off + w); // cuánto sobresale el borde fuera de la tarjeta
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== "visible" || cs.overflow !== "visible") {
        const q = p.getBoundingClientRect();
        if (r.left - out < q.left - 0.5 || r.right + out > q.right + 0.5) return false;
      }
    }
    return true;
  });
  expect(ok).toBe(true);
});

test("foto o video cuadrado se ve completo en modo entrenamiento y en la ficha", async ({ page }) => {
  await start(page);
  const inside = sel =>
    page.locator(sel).evaluate(m => {
      const v = m.querySelector("video,img").getBoundingClientRect(),
        r = m.getBoundingClientRect();
      return v.top >= r.top - 1 && v.bottom <= r.bottom + 1 && v.left >= r.left - 1 && v.right <= r.right + 1;
    });
  await page.click("#focusOpen");
  await expect(page.locator(".fmedia video, .fmedia img")).toHaveCount(1);
  expect(await inside(".fmedia")).toBe(true);
  await page.keyboard.press("Escape");
  await page.click("#t-ejercicios");
  await page.fill("#catNew", "vuelo");
  await page.click(".bcell");
  await expect(page.locator(".fimedia video, .fimedia img")).toHaveCount(1);
  expect(await inside(".fimedia")).toBe(true);
});

// mantener presionado una tarjeta y soltarla en otra: "center" la une en circuito, "top" la pone antes
async function dragCard(page, from, to, where = "center") {
  await from.evaluate(el => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  const a = await from.boundingBox(),
    b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  const y = where === "top" ? b.y + 6 : where === "above" ? b.y - 14 : b.y + b.height / 2;
  await page.mouse.move(b.x + b.width / 2, y, { steps: 12 });
  await page.mouse.up();
}

test("circuito por bloques: unir arrastrando y hacerlos por rondas", async ({ page }) => {
  const errors = await start(page);
  const first = (await page.locator("#teToca .tt-info b").textContent()).trim();
  const card = n => page.locator("#todayList .tcard", { hasText: n });
  const names = (await page.locator("#todayList .tcard .tinfo b").allTextContents()).map(x =>
    x.replace("★", "").trim()
  );
  const i = names.findIndex(n => n.startsWith(first));
  const second = names[i + 1],
    third = names[i + 2];
  // soltar el segundo sobre el primero: nuevo circuito
  await dragCard(page, card(second), card(first));
  await expect(page.locator(".blkbox .tcard")).toHaveCount(2);
  await expect(page.locator(".blkhead")).toContainText("Circuito A");
  // soltar el tercero sobre uno del circuito: se suma
  await dragCard(page, card(third), card(second));
  await expect(page.locator(".blkbox .tcard")).toHaveCount(3);
  await layoutOk(page);
  // rondas en orden: 1º → 2º → 3º → vuelta al 1º (serie 2)
  await page.click("#teToca .tt-go");
  await page.click("#smOk");
  await expect(page.locator("#rNext")).toContainText(second);
  await expect(page.locator("#rNext")).toContainText("serie 1");
  await page.click("#rNext [data-go]");
  await page.click("#smOk");
  await page.click("#rNext [data-go]");
  await page.click("#smOk");
  await expect(page.locator("#rNext")).toContainText(first);
  await expect(page.locator("#rNext")).toContainText("serie 2");
  await page.click("[data-r=skip]");
  // poner el último del circuito en primer lugar (borde de arriba del primero, dentro del circuito)
  await dragCard(page, card(third), page.locator(".blkbox .tcard").first(), "top");
  await expect(page.locator(".blkbox .tcard")).toHaveCount(3);
  await expect(page.locator(".blkbox .tcard").first()).toContainText(third);
  // soltarlo sobre el título del circuito lo deja fuera, justo antes
  await dragCard(page, card(third), page.locator(".blkbox .tcard").first(), "above");
  await expect(page.locator(".blkbox .tcard")).toHaveCount(2);
  await dragCard(page, card(third), page.locator(".blkbox .tcard").first(), "top");
  await expect(page.locator(".blkbox .tcard")).toHaveCount(3);
  // sacar uno arrastrándolo fuera (antes del primer ejercicio de la lista)
  await dragCard(page, card(third), page.locator("#todayList .tcard").first(), "top");
  await expect(page.locator(".blkbox .tcard")).toHaveCount(2);
  // separar el resto
  await page.click("[data-unblk]");
  await expect(page.locator(".blkbox")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("rutina: unir ejercicios en el editor y cargarla con el circuito", async ({ page }) => {
  await start(page);
  await page.click("#t-rutinas");
  await page.locator(".rutday summary").first().click();
  await page.locator("[data-redit]").first().click();
  const rows = page.locator(".rutday[open] .rutex[data-ri]");
  const second = (await rows.nth(1).locator("b").textContent()).trim();
  // mantener presionado el segundo y soltarlo sobre el primero: circuito
  await dragCard(page, rows.nth(1).locator("b"), rows.nth(0));
  await expect(page.locator(".rutday[open] .blkbox .rutex")).toHaveCount(2);
  // moverlo al primer lugar dentro del circuito
  await dragCard(page, rows.nth(1).locator("b"), rows.nth(0), "top");
  await expect(page.locator(".rutday[open] .blkbox .rutex").first()).toContainText(second);
  await expect(page.locator(".rutday[open] .blkbox .rutex")).toHaveCount(2);
  await layoutOk(page);
  // separar
  await page.click(".rutday[open] [data-rsep]");
  await expect(page.locator(".rutday[open] .blkbox")).toHaveCount(0);
  await dragCard(page, rows.nth(1).locator("b"), rows.nth(0));
  await page.locator("[data-redit]").first().click();
  await expect(page.locator(".rutday[open] .blkbox .rutex")).toHaveCount(2);
});

test("guía para empezar: aparece en una cuenta nueva y avanza sola", async ({ page }) => {
  const errors = await start(page, { seed: false });
  const ob = page.locator("#obBox");
  await expect(ob).toBeVisible();
  await expect(ob).toContainText("0 de 4");
  await layoutOk(page);
  await ob.locator("[data-ob=add]").click();
  await page.fill("#name", "Vuelo lateral");
  await page.fill("#sets", "3");
  await page.fill("#reps", "12");
  await page.fill("#weight", "8");
  await page.click("#submitBtn");
  await expect(ob).toContainText("1 de 4");
  await expect(ob.locator("[data-ob=go]")).toBeVisible();
  await ob.locator("[data-ob=off]").click();
  await expect(ob).toBeHidden();
  await page.reload();
  await expect(page.locator("#todayList .tcard")).toHaveCount(1);
  await expect(ob).toBeHidden();
  expect(errors).toEqual([]);
});

test("guía para empezar: lleva a armar un circuito en la rutina", async ({ page }) => {
  await start(page);
  // ya tiene ejercicios, series y rutina: solo falta el circuito
  const ob = page.locator("#obBox");
  await expect(ob).toContainText("3 de 4");
  await ob.locator("[data-ob=rutedit]").click();
  await expect(page.locator("#tab-rutinas")).toBeVisible();
  const rows = page.locator(".rutday[open] .rutex[data-ri]");
  await dragCard(page, rows.nth(1).locator("b"), rows.nth(0));
  await expect(page.locator(".rutday[open] .blkbox")).toHaveCount(1);
  await page.click("#t-anotar");
  await expect(ob).toBeHidden();
});

test("buscador: ver la imagen en grande y elegirlo desde ahí", async ({ page }) => {
  const errors = await start(page);
  await page.click("#addOpen");
  await page.fill("#name", "goblet");
  const op = page.locator("#sugg li[role=option]").first();
  await op.locator(".szoom").click();
  await expect(page.locator("#lb")).toBeVisible();
  await expect(page.locator("#lbName")).toHaveText("Sentadilla goblet");
  await expect(page.locator("#lbBody img, #lbBody video")).toHaveCount(1);
  // la ventana de agregar sigue abierta detrás y el campo no cambió
  await expect(page.locator("#name")).toHaveValue("goblet");
  await layoutOk(page);
  await page.click("#lbPick");
  await expect(page.locator("#lb")).toBeHidden();
  await expect(page.locator("#addCard")).toBeVisible();
  await expect(page.locator("#name")).toHaveValue("Sentadilla goblet");
  // cerrar sin elegir
  await page.fill("#name", "lateral raise");
  await page.locator("#sugg li[role=option]").first().locator(".szoom").click();
  await page.click("#lbClose");
  await expect(page.locator("#addCard")).toBeVisible();
  await expect(page.locator("#name")).toHaveValue("lateral raise");
  // Atrás / Escape cierra solo la imagen, no la ventana de agregar
  await page.locator("#sugg li[role=option]").first().locator(".szoom").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#lb")).toBeHidden();
  await expect(page.locator("#addCard")).toBeVisible();
  expect(errors).toEqual([]);
});

test("rutina desde cero: crear, agregar del banco, ajustar series y unir en circuito", async ({ page }) => {
  const errors = await start(page);
  await page.click("#t-rutinas");
  await page.click("#rutNew");
  const add = page.locator(".rutaddin");
  await expect(add).toBeFocused();
  await add.fill("lateral raise");
  await page.locator(".rsugg [data-rpick]").first().click();
  await expect(page.locator(".rutday[open] .rutex")).toHaveCount(1);
  await expect(page.locator(".rutday[open] .rutex")).toContainText("Vuelo lateral");
  await add.fill("goblet");
  await add.press("Enter");
  await expect(page.locator(".rutday[open] .rutex")).toHaveCount(2);
  // ejercicio que no está en el banco
  await add.fill("Sentadilla con banda");
  await page.locator(".rsugg .rnewex").click();
  await expect(page.locator(".rutday[open] .rutex")).toHaveCount(3);
  // series/reps/kg: se abren tocando el ejercicio
  await page.locator('.rutday[open] .rutex[data-ri="0"] .tinfo').click();
  const reps = page.locator('.rutday[open] [data-rxf="reps"][data-ri="0"]');
  await reps.fill("15");
  await page.locator('.rutday[open] [data-rxf="weight"][data-ri="0"]').click();
  await expect(page.locator('.rutday[open] [data-rxf="weight"][data-ri="0"]')).toBeFocused();
  await page.keyboard.type("8");
  const rows = page.locator(".rutday[open] .rutex[data-ri]");
  await dragCard(page, rows.nth(1).locator("b"), rows.nth(0));
  await expect(page.locator(".rutday[open] .blkbox .rutex")).toHaveCount(2);
  await layoutOk(page);
  await page.locator(".rutday[open] [data-redit]").click();
  await expect(page.locator(".rutday[open] .rutex").first()).toContainText("3×15");
  await expect(page.locator(".rutday[open] .rutex").first()).toContainText("8");
  await expect(page.locator(".rutday[open] .blkbox .rutex")).toHaveCount(2);
  // cargarla en otro día queda con su circuito
  await page.locator(".rutday[open] [data-rtpick]").click();
  expect(errors).toEqual([]);
});

test("sin nombre muestra un mensaje propio", async ({ page }) => {
  await start(page);
  await page.click("#addOpen");
  await page.click("#submitBtn");
  await expect(page.locator("#status")).toHaveClass(/err/);
  await expect(page.locator("#addCard")).toBeVisible();
});

test("el botón Atrás cierra ventanas en vez de salir", async ({ page }) => {
  await start(page);
  await page.click(".tcard[data-open]");
  await expect(page.locator("#exDet")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#exDet")).toBeHidden();
  await page.click("#acctBtn");
  await expect(page.locator("#sheetOv")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#sheetOv")).toBeHidden();
  expect(page.url()).toContain("127.0.0.1");
});

test("días: anterior, futuro y volver a hoy", async ({ page }) => {
  await start(page);
  await expect(page.locator("#dayToday")).toBeHidden();
  await page.click("#dayPrev");
  await expect(page.locator("#date")).toHaveValue(addDays(-1));
  await expect(page.locator("#dayToday")).toBeVisible();
  await page.click("#dayToday");
  await expect(page.locator("#date")).toHaveValue(today());
  await page.click("#dayNext");
  await expect(page.locator("#dayState")).toContainText("Planificando");
  await layoutOk(page);
});

test("deslizar cambia de día en cualquier parte de Hoy", async ({ page }) => {
  await start(page, { seed: false });
  const { width: W, height: H } = page.viewportSize();
  for (const [x, y] of [
    [W / 2, H * 0.3],
    [W / 2, H * 0.75],
    [14, H * 0.5]
  ]) {
    await swipe(page, x, y, W * 0.4);
    await expect(page.locator("#date")).toHaveValue(addDays(-1));
    await swipe(page, x, y, -W * 0.4);
    await expect(page.locator("#date")).toHaveValue(today());
    await layoutOk(page);
  }
});

test("calendario del historial: deslizar cambia de mes y muestra días vecinos", async ({ page }) => {
  await start(page);
  await page.click("#t-historial");
  const title = page.locator(".caltitle");
  const t0 = await title.textContent();
  const g = await page.locator(".hcal").boundingBox();
  await swipe(page, g.x + g.width / 2 - 80, g.y + g.height / 2, 200);
  await expect(title).not.toHaveText(t0);
  await expect(page.locator("body")).toHaveAttribute("data-tab", "historial");
  await expect(page.locator(".hcal button.other").first()).toBeVisible();
  // las celdas completan semanas enteras
  expect((await page.locator(".hcal button").count()) % 7).toBe(0);
  await page.click("[data-cm='1']");
  await page.click("[data-cm='1']"); // se puede ir al futuro para planificar
  await layoutOk(page);
});

test("resumen: se ve completo y se puede desplazar", async ({ page }) => {
  await start(page);
  await page.click("#sumBtn");
  await expect(page.locator("#sumCard")).toBeVisible();
  const top = await page.locator("#sumCard").evaluate(e => e.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  await page.locator("#sumOv").evaluate(e => {
    e.scrollTop = 1e5;
  });
  await expect(page.locator("#sumImg")).toBeInViewport();
});

test("accesos directos del ícono", async ({ page }) => {
  await start(page);
  await page.goto("/?a=agregar");
  await expect(page.locator("#addCard")).toBeVisible();
  await page.goto("/?a=historial");
  await expect(page.locator("body")).toHaveAttribute("data-tab", "historial");
  await page.goto("/?a=entrenar");
  await expect(page.locator("#focus")).toBeVisible();
});

test("apariencia: modo y paleta se guardan", async ({ page }) => {
  await start(page, { seed: false });
  await page.click("#acctBtn");
  await page.click("#sheet [data-mode=dark]");
  await page.click("#sheet [data-pal=oceano]");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
  );
  expect(accent.toLowerCase()).toBe("#18d2c4");
});

test("cambio de contraseña pide la actual y confirmación", async ({ page }) => {
  await start(page, { seed: false });
  await page.click("#acctBtn");
  const send = async (o, a, b) => {
    await page.fill("#pwOld", o);
    await page.fill("#pwNew", a);
    await page.fill("#pwNew2", b);
    await page.click("#pwForm [type=submit]");
  };
  await send("", "abcdef", "abcdef");
  await expect(page.locator("#sheetMsg")).toContainText("actual");
  await send("123456", "abcdef", "abcdeg");
  await expect(page.locator("#sheetMsg")).toContainText("no coinciden");
  await send("malmal", "abcdef", "abcdef");
  await expect(page.locator("#sheetMsg")).toContainText("no es correcta");
  await send("123456", "abcdef", "abcdef");
  await expect(page.locator("#sheetMsg")).toContainText("actualizada");
});

test("ejercicios: filtro por músculo", async ({ page }) => {
  await start(page);
  await page.click("#t-ejercicios");
  const mobile = page.viewportSize().width < 600;
  if (mobile) await page.click("[data-cft]");
  await page.click("[data-cf='piernas']");
  await expect(page.locator(".exgh")).toHaveCount(1);
  await layoutOk(page);
});

test("banco: busca en español o inglés y muestra cómo se hace", async ({ page }) => {
  const errors = await start(page);
  await page.click("#addOpen");
  await page.fill("#name", "goblet");
  await expect(page.locator("#sugg li[role=option]").first()).toContainText("Sentadilla goblet");
  // foto del banco: miniatura fija liviana en la lista
  await expect(page.locator("#sugg li[role=option] img").first()).toHaveAttribute("src", /sentadilla_goblet-t\.webp$/);
  await page.fill("#name", "lateral raise");
  const op = page.locator("#sugg li[role=option]").first();
  await expect(op).toContainText("Vuelo lateral");
  await expect(op.locator(".sen")).toHaveText("dumbbell lateral raise");
  await page.click("#addClose");
  await page.click("#t-ejercicios");
  await page.fill("#catNew", "deadlift");
  await expect(page.locator(".bcell")).toHaveCount(1);
  await page.click(".bcell");
  const how = page.locator(".fihow");
  await expect(how).toContainText("Barra");
  await how.locator("summary").click();
  await expect(how.locator("ol li").first()).toBeVisible();
  await expect(how).toContainText("barbell deadlift");
  await layoutOk(page);
  expect(errors).toEqual([]);
});

test("modo profesor: se ve a quién se anota", async ({ page }) => {
  await start(page, { seed: false, coach: true });
  await page.click("#acctBtn");
  await page.fill("#stuName", "Camila");
  await page.click("#addStu button[type=submit]");
  await page.click("#sheetX");
  await page.locator("#athBar [data-ath]", { hasText: "Camila" }).click();
  await expect(page.locator("#whoBar")).toContainText("Camila");
});

// captura lo que la app "descarga" (sin abrir el menú de compartir del sistema)
async function captureDownload(page, click) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    HTMLAnchorElement.prototype.click = function () {
      window.__dl = { href: this.href, name: this.download };
    };
  });
  await click();
  await page.waitForFunction(() => !!window.__dl, null, { timeout: 20_000 });
  return page.evaluate(() => window.__dl);
}

test("resumen: imagen para historia de Instagram (1080×1920)", async ({ page }) => {
  const errors = await start(page);
  await page.click("#sumBtn");
  const dl = await captureDownload(page, () => page.click("#sumImg"));
  expect(dl.name).toMatch(/^sesion-.*\.png$/);
  const size = await page.evaluate(async href => {
    const im = new Image();
    im.src = href;
    await im.decode();
    return [im.naturalWidth, im.naturalHeight];
  }, dl.href);
  expect(size).toEqual([1080, 1920]);
  expect(errors).toEqual([]);
});

test("respaldo en Excel (CSV) con todo el historial", async ({ page }) => {
  await start(page);
  await page.click("#acctBtn");
  const dl = await captureDownload(page, () => page.click("#backupBtn"));
  expect(dl.name).toMatch(/^trainly-.*\.csv$/);
  const text = await page.evaluate(async href => (await fetch(href)).text(), dl.href);
  const lines = text.trim().split(/\r\n/);
  expect(lines[0]).toContain("Fecha;Sesión;Ejercicio");
  expect(lines.length).toBeGreaterThan(50);
  expect(text).toContain("Vuelo lateral");
});

test("admin: editar el banco común con 'Guardar cambios'", async ({ page }) => {
  const errors = await start(page);
  // convertir a esta cuenta en administradora (solo en la base simulada)
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.mockdb),
      me = JSON.parse(localStorage.mocksession).user.id;
    db.profiles.find(p => p.id === me).is_admin = true;
    localStorage.mockdb = JSON.stringify(db);
  });
  await page.reload();
  await page.click("#t-ejercicios");
  await page.locator(".bcell", { hasText: "Remo en T" }).click();
  await expect(page.locator("#bkName")).toBeVisible();
  await expect(page.locator("#bkSave")).toBeDisabled();
  await page.fill("#bkName", "Remo en T (barra)");
  await expect(page.locator("#bkSave")).toBeEnabled();
  await page.click("#bkSave");
  await expect(page.locator("#fichaName")).toHaveText("Remo en T (barra)");
  await expect(page.locator("#bkSave")).toBeDisabled();
  expect(errors).toEqual([]);
});
