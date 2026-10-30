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
