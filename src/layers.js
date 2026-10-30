// Capas (ventanas, hojas, detalle): el botón/gesto Atrás cierra la capa de arriba en vez de salir de la app,
// y el foco entra a la capa al abrirla y vuelve a donde estaba al cerrarla.
// Cada capa ya se cierra con Escape, así que Atrás simplemente envía un Escape.
const IDS = ["sheetOv", "addCard", "calPop", "exDet", "fichaOv", "smOv", "focus", "sumOv", "lb"];

export function initLayers() {
  const stack = []; // {id, ret}
  let skip = 0; // popstate provocados por nosotros
  const visible = el => el && !el.hidden;

  function opened(el) {
    if (stack.some(l => l.id === el.id)) return;
    stack.push({ id: el.id, ret: document.activeElement });
    try {
      history.pushState({ layer: el.id }, "");
    } catch (e) {}
    setTimeout(() => {
      if (!visible(el) || el.contains(document.activeElement)) return;
      const dlg = el.matches("[role=dialog]") ? el : el.querySelector("[role=dialog]") || el;
      const t = dlg.querySelector("h2,h3,[aria-label='Cerrar']") || dlg;
      if (!t.hasAttribute("tabindex") && !/^(BUTTON|A|INPUT)$/.test(t.tagName)) t.setAttribute("tabindex", "-1");
      try {
        t.focus({ preventScroll: true });
      } catch (e) {}
    }, 60);
  }
  function closed(el) {
    const i = stack.findIndex(l => l.id === el.id);
    if (i < 0) return;
    const [l] = stack.splice(i, 1);
    if (history.state && history.state.layer === el.id) {
      skip++;
      history.back();
    }
    const r = l.ret;
    if (
      r &&
      r.isConnected &&
      (document.activeElement === document.body || el.contains(document.activeElement) || !document.activeElement)
    ) {
      try {
        r.focus({ preventScroll: true });
      } catch (e) {}
    }
  }
  const mo = new MutationObserver(ms =>
    ms.forEach(m => {
      const el = m.target;
      visible(el) ? opened(el) : closed(el);
    })
  );
  IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      mo.observe(el, { attributes: true, attributeFilter: ["hidden"] });
      if (visible(el)) opened(el);
    }
  });

  addEventListener("popstate", () => {
    if (skip) {
      skip--;
      return;
    }
    const top = stack[stack.length - 1];
    if (!top) return;
    const el = document.getElementById(top.id);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    // si no se cerró (p. ej. pidió confirmar), se vuelve a dejar el paso en el historial
    setTimeout(() => {
      if (visible(el) && !(history.state && history.state.layer === top.id)) {
        try {
          history.pushState({ layer: top.id }, "");
        } catch (e) {}
      }
    }, 80);
  });
}
