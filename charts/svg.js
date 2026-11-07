// Mon Patrimoine V5 — graphiques SVG en ligne (remplacent Chart.js).
// Partie 1 : calculs purs (layout*, niceScale, anneau), testables sous Node.
// Partie 2 : dessin dans le navigateur (courbe, barres, horizontal, anneau). Aucune ressource externe.

export const PALETTE = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#84cc16', '#ec4899', '#f97316', '#14b8a6', '#64748b', '#a855f7', '#eab308', '#3b82f6', '#10b981'];
const PAD = { l: 52, r: 10, t: 12, b: 26 };

// Graduations rondes couvrant [min, max] ; 0 est toujours inclus.
export function niceScale(min, max, n = 4) {
  const lo = Math.min(0, min), hi0 = Math.max(0, max);
  const hi = hi0 === lo ? lo + 1 : hi0;
  const raw = (hi - lo) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(st => st >= raw * 0.999999);
  const top = Math.ceil(hi / step - 1e-9) * step;
  const bottom = Math.floor(lo / step + 1e-9) * step;
  const ticks = [];
  for (let k = 0, v = bottom; v <= top + step / 2 && k < 100; k++, v = bottom + k * step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: bottom, max: top, ticks };
}

// Pas d'étiquettes lisibles : une étiquette sur k.
export const pasEtiquettes = (n, max = 8) => Math.max(1, Math.ceil(n / max));

function valeursFinies(series) {
  return series.flatMap(s => s.values).filter(v => Number.isFinite(v));
}

// Courbes : points et chemins SVG. Une valeur absente (null) interrompt le tracé.
export function layoutCourbe({ labels, series, w = 320, h = 200 }) {
  const vals = valeursFinies(series);
  if (!labels.length || !vals.length) return null;
  const sc = niceScale(Math.min(...vals), Math.max(...vals));
  const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
  const x = i => PAD.l + (labels.length === 1 ? iw / 2 : i * iw / (labels.length - 1));
  const y = v => PAD.t + ih - (v - sc.min) / (sc.max - sc.min) * ih;
  const tracees = series.map(s => {
    const pts = s.values.map((v, i) => (Number.isFinite(v) ? { x: x(i), y: y(v), v, label: labels[i] } : null));
    let d = '';
    pts.forEach((p, i) => {
      if (!p) return;
      d += (i > 0 && pts[i - 1] ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
    });
    return { name: s.name, color: s.color, d, points: pts.filter(Boolean) };
  });
  return {
    w, h, yTicks: sc.ticks.map(v => ({ v, y: y(v) })),
    xLabels: labels.map((l, i) => ({ label: l, x: x(i) })), series: tracees, zeroY: y(0)
  };
}

// Barres groupées verticales. La ligne de base est à zéro, les négatifs descendent.
export function layoutBarres({ labels, series, w = 320, h = 200 }) {
  const vals = valeursFinies(series);
  if (!labels.length || !vals.length) return null;
  const sc = niceScale(Math.min(...vals), Math.max(...vals));
  const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
  const band = iw / labels.length;
  const bw = band * 0.8 / series.length;
  const y = v => PAD.t + ih - (v - sc.min) / (sc.max - sc.min) * ih;
  const y0 = y(0);
  const bars = [];
  series.forEach((s, si) => s.values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const top = Math.min(y(v), y0), hauteur = Math.abs(y(v) - y0);
    bars.push({ x: PAD.l + i * band + band * 0.1 + si * bw, y: top, w: Math.max(1, bw - 1), h: hauteur, color: s.color, serie: s.name, label: labels[i], value: v });
  }));
  return {
    w, h, yTicks: sc.ticks.map(v => ({ v, y: y(v) })), zeroY: y0,
    xLabels: labels.map((l, i) => ({ label: l, x: PAD.l + i * band + band / 2 })), bars
  };
}

// Barres horizontales (plafonds : prévu et réel). Une barre de rappel marque le plafond.
export function layoutHorizontal(rows, { w = 320, rowH = 30 } = {}) {
  if (!rows.length) return null;
  const maxV = Math.max(...rows.map(r => Math.max(r.value, r.max || 0)), 1);
  const iw = w - 110 - 10;
  return {
    w, h: rows.length * rowH + 6,
    rows: rows.map((r, i) => ({
      label: r.label, y: 6 + i * rowH,
      wValeur: Math.max(0, r.value / maxV * iw), wMax: r.max != null ? Math.max(0, r.max / maxV * iw) : null,
      value: r.value, max: r.max, color: r.over ? '#dc2626' : (r.color || PALETTE[0]), over: !!r.over
    }))
  };
}

// Anneau : tranches proportionnelles, uniquement pour les valeurs positives.
export function layoutAnneau(items, { R = 60, cx = 80, cy = 80 } = {}) {
  const pos = items.filter(i => i.value > 0);
  const total = pos.reduce((s, i) => s + i.value, 0);
  if (!total) return null;
  let a = -Math.PI / 2;
  const segments = pos.map((it, k) => {
    const frac = it.value / total;
    const a2 = a + frac * 2 * Math.PI;
    const seg = { label: it.label, value: it.value, pct: frac * 100, color: PALETTE[k % PALETTE.length] };
    if (pos.length === 1) seg.cercle = true;
    else {
      const p = ang => [cx + R * Math.cos(ang), cy + R * Math.sin(ang)];
      const [x1, y1] = p(a), [x2, y2] = p(a2);
      const large = frac > 0.5 ? 1 : 0;
      seg.d = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
    }
    a = a2;
    return seg;
  });
  return { segments, total, R, cx, cy };
}

// ---------------------------------------------------------------------------
// Partie 2 — dessin (navigateur). Les fonctions ci-dessous n'utilisent le DOM qu'à l'appel.

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, ...enfants) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) n.setAttribute(k, String(v));
  for (const c of enfants) if (c) n.append(c);
  return n;
}
function htmlEl(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, String(v));
  }
  for (const c of enfants) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
const fmtAxe = v => (Math.abs(v) >= 1000 ? Math.round(v / 1000) + ' k' : String(Math.round(v * 100) / 100).replace('.', ','));

function legende(items) {
  return htmlEl('ul', { class: 'legende' }, ...items.map(it => {
    const li = htmlEl('li');
    const sw = htmlEl('span', { class: 'swatch' });
    sw.style.background = it.color;            // CSSOM : autorisé par la CSP (pas d'attribut style)
    li.append(sw, htmlEl('span', { text: it.label }));
    return li;
  }));
}

function tableauDetail(titre, entetes, lignes) {
  const tb = htmlEl('table', { class: 'tab-detail' },
    htmlEl('thead', {}, htmlEl('tr', {}, ...entetes.map((e, i) => htmlEl('th', { text: e, class: i ? 'n' : '' })))),
    htmlEl('tbody', {}, ...lignes.map(l => htmlEl('tr', {}, ...l.map((c, i) => htmlEl('td', { text: c, class: i ? 'n' : '', 'data-label': entetes[i] }))))));
  return htmlEl('details', { class: 'detail' }, htmlEl('summary', { text: 'Voir les valeurs (' + titre + ')' }), htmlEl('div', { class: 'tw' }, tb));
}

function figure(titre, svg, corps = []) {
  return htmlEl('figure', { class: 'graph' },
    htmlEl('figcaption', { class: 'petit', text: titre }),
    svg, ...corps);
}

function svgRacine(w, h, titre) {
  return svgEl('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': titre, width: '100%', class: 'svg' });
}

export function courbe({ titre, labels, series, format = fmtAxe, vide = 'Aucune donnée à afficher.' }) {
  const L = layoutCourbe({ labels, series });
  if (!L) return htmlEl('p', { class: 'petit', text: vide });
  const svg = svgRacine(L.w, L.h, titre);
  L.yTicks.forEach(t => svg.append(svgEl('line', { x1: PAD.l, x2: L.w - PAD.r, y1: t.y, y2: t.y, stroke: '#8a94a6', 'stroke-opacity': 0.35 }),
    svgEl('text', { x: PAD.l - 6, y: t.y + 4, 'text-anchor': 'end', class: 'axe' }, format(t.v))));
  const k = pasEtiquettes(labels.length);
  L.xLabels.forEach((t, i) => { if (i % k === 0) svg.append(svgEl('text', { x: t.x, y: L.h - 6, 'text-anchor': 'middle', class: 'axe' }, t.label)); });
  L.series.forEach(s => {
    svg.append(svgEl('path', { d: s.d, fill: 'none', stroke: s.color, 'stroke-width': 2 }));
    s.points.forEach(p => svg.append(svgEl('circle', { cx: p.x, cy: p.y, r: 2.5, fill: s.color })));
  });
  const leg = legende(series.map(s => ({ label: s.name, color: s.color })));
  const det = tableauDetail(titre, ['Mois', ...series.map(s => s.name)],
    labels.map((l, i) => [l, ...series.map(s => (Number.isFinite(s.values[i]) ? s.values[i].toFixed(2) : '—'))]));
  return figure(titre, svg, [leg, det]);
}

export function barres({ titre, labels, series, format = fmtAxe, vide = 'Aucune donnée à afficher.' }) {
  const L = layoutBarres({ labels, series });
  if (!L) return htmlEl('p', { class: 'petit', text: vide });
  const svg = svgRacine(L.w, L.h, titre);
  L.yTicks.forEach(t => svg.append(svgEl('line', { x1: PAD.l, x2: L.w - PAD.r, y1: t.y, y2: t.y, stroke: '#8a94a6', 'stroke-opacity': 0.35 }),
    svgEl('text', { x: PAD.l - 6, y: t.y + 4, 'text-anchor': 'end', class: 'axe' }, format(t.v))));
  const k = pasEtiquettes(labels.length);
  L.xLabels.forEach((t, i) => { if (i % k === 0) svg.append(svgEl('text', { x: t.x, y: L.h - 6, 'text-anchor': 'middle', class: 'axe' }, t.label)); });
  L.bars.forEach(b => svg.append(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: b.color })));
  const leg = legende(series.map(s => ({ label: s.name, color: s.color })));
  const det = tableauDetail(titre, ['Mois', ...series.map(s => s.name)],
    labels.map((l, i) => [l, ...series.map(s => (Number.isFinite(s.values[i]) ? s.values[i].toFixed(2) : '—'))]));
  return figure(titre, svg, [leg, det]);
}

export function horizontal({ titre, rows, vide = 'Aucune donnée à afficher.' }) {
  const L = layoutHorizontal(rows);
  if (!L) return htmlEl('p', { class: 'petit', text: vide });
  const svg = svgRacine(L.w, L.h, titre);
  L.rows.forEach(r => {
    svg.append(svgEl('text', { x: 0, y: r.y + 16, class: 'axe-h' }, r.label));
    svg.append(svgEl('rect', { x: 110, y: r.y + 4, width: r.wValeur, height: 14, rx: 3, fill: r.color }));
    if (r.wMax !== null) svg.append(svgEl('line', { x1: 110 + r.wMax, x2: 110 + r.wMax, y1: r.y, y2: r.y + 22, stroke: '#1c2330', 'stroke-width': 2 }));
  });
  const det = tableauDetail(titre, ['Catégorie', 'Réel', 'Plafond'],
    rows.map(r => [r.label, r.value.toFixed(2), r.max != null ? r.max.toFixed(2) : '—']));
  return figure(titre, svg, [det]);
}

export function anneau({ titre, items, vide = 'Aucune donnée à afficher.' }) {
  const L = layoutAnneau(items);
  if (!L) return htmlEl('p', { class: 'petit', text: vide });
  const svg = svgRacine(160, 160, titre);
  L.segments.forEach(s => {
    if (s.cercle) svg.append(svgEl('circle', { cx: L.cx, cy: L.cy, r: L.R, fill: s.color }));
    else svg.append(svgEl('path', { d: s.d, fill: s.color }));
  });
  const leg = legende(L.segments.map(s => ({ label: `${s.label} — ${s.pct.toFixed(1).replace('.', ',')} %`, color: s.color })));
  const det = tableauDetail(titre, ['Catégorie', 'Montant'], L.segments.map(s => [s.label, s.value.toFixed(2)]));
  return figure(titre, svg, [leg, det]);
}
