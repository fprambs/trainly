// Gráficos SVG (sin librerías): curva de Progreso y tendencia chica de la ficha del ejercicio.
import { esc, fmtShort } from "./format.js";

// curva de la pestaña Progreso. pts=[{d:'AAAA-MM-DD',v}], fv=formato del valor
export function progressSVG(pts, { fv, ariaLabel }) {
  const W = 600,
    H = 220,
    L = 40,
    R = 16,
    T = 16,
    B = 30;
  let lo = Math.min(...pts.map(p => p.v)),
    hi = Math.max(...pts.map(p => p.v));
  if (lo === hi) {
    lo = Math.max(0, lo - 1);
    hi = hi + 1;
  }
  const span = hi - lo;
  lo = Math.max(0, lo - span * 0.15);
  hi = hi + span * 0.15;
  const x = i => L + (i * (W - L - R)) / (pts.length - 1);
  const y = v => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const line = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
  const area = line + " L" + x(pts.length - 1).toFixed(1) + " " + (H - B) + " L" + L + " " + (H - B) + " Z";
  const step = Math.ceil(pts.length / 6);
  let s =
    '<svg viewBox="0 0 ' +
    W +
    " " +
    H +
    '" width="100%" style="min-width:320px;display:block" role="img" aria-label="' +
    esc(ariaLabel) +
    '">';
  [lo, (lo + hi) / 2, hi].forEach(t => {
    s +=
      '<line x1="' +
      L +
      '" x2="' +
      (W - R) +
      '" y1="' +
      y(t) +
      '" y2="' +
      y(t) +
      '" stroke="var(--line)" stroke-width="1"/><text x="' +
      (L - 6) +
      '" y="' +
      (y(t) + 4) +
      '" text-anchor="end">' +
      fv(t) +
      "</text>";
  });
  s +=
    '<path d="' +
    area +
    '" fill="var(--accent)" fill-opacity=".12"/><path d="' +
    line +
    '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>';
  pts.forEach((p, i) => {
    const last = i === pts.length - 1;
    s +=
      '<circle cx="' +
      x(i) +
      '" cy="' +
      y(p.v) +
      '" r="' +
      (last ? 5 : 3) +
      '" fill="' +
      (last ? "var(--accent)" : "var(--surface)") +
      '" stroke="var(--accent)" stroke-width="2"/>';
    // la última fecha siempre; la etiqueta anterior se omite si quedaría pegada a ella
    if ((i % step === 0 && !(pts.length - 1 - i < step * 0.6 && i !== 0)) || last)
      s +=
        '<text x="' +
        x(i) +
        '" y="' +
        (H - 10) +
        '" text-anchor="' +
        (i === 0 ? "start" : last ? "end" : "middle") +
        '">' +
        fmtShort(p.d) +
        "</text>";
  });
  s += "</svg>";
  return s;
}

// gráfico chico de la ficha: Y = valor (mín, medio, máx), X = fechas
export function trendSVG(days, pts, fmtV, ariaLabel) {
  // gráfico con ejes: Y = valor (mín, medio, máx), X = fechas
  const W = 320,
    H = 150,
    L = 44,
    R = 12,
    T = 10,
    B = 26;
  let lo = Math.min(...pts),
    hi = Math.max(...pts);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const x = i => L + (i * (W - L - R)) / (pts.length - 1),
    y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let g = "";
  [lo + pad, (lo + hi) / 2, hi - pad].forEach(t => {
    g +=
      '<line class="tg" x1="' +
      L +
      '" x2="' +
      (W - R) +
      '" y1="' +
      y(t).toFixed(1) +
      '" y2="' +
      y(t).toFixed(1) +
      '"/><text class="tyl" x="' +
      (L - 6) +
      '" y="' +
      (y(t) + 4).toFixed(1) +
      '" text-anchor="end">' +
      esc(fmtV(t).replace(" kg", "")) +
      "</text>";
  });
  g +=
    '<line class="tax" x1="' +
    L +
    '" x2="' +
    L +
    '" y1="' +
    T +
    '" y2="' +
    (H - B) +
    '"/><line class="tax" x1="' +
    L +
    '" x2="' +
    (W - R) +
    '" y1="' +
    (H - B) +
    '" y2="' +
    (H - B) +
    '"/>';
  const step = Math.max(1, Math.ceil(pts.length / 4));
  days.forEach((d, i) => {
    const lastI = i === days.length - 1;
    if (i % step === 0 || lastI) {
      if (!lastI && days.length - 1 - i < step / 2 && i !== 0) return;
      g +=
        '<text class="txl" x="' +
        x(i).toFixed(1) +
        '" y="' +
        (H - 8) +
        '" text-anchor="' +
        (i === 0 ? "start" : lastI ? "end" : "middle") +
        '">' +
        esc(fmtShort(d)) +
        "</text>";
    }
  });
  g +=
    '<polyline class="tl" points="' +
    pts.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ") +
    '"/>' +
    pts
      .map(
        (v, i) =>
          '<circle class="td" cx="' +
          x(i).toFixed(1) +
          '" cy="' +
          y(v).toFixed(1) +
          '" r="' +
          (i === pts.length - 1 ? 4 : 2.5) +
          '"/>'
      )
      .join("");
  return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(ariaLabel) + '">' + g + "</svg>";
}
