// Historique des tenues créées par le styliste + courbe de progression (SVG, sans bibliothèque).

export const HISTORY_MAX = 400;

/** Ajoute une entrée d'historique (renvoie un nouveau tableau, plafonné). */
export function addHistory(list, entry) {
  const r = Number(entry.rating);
  if (!Number.isFinite(r) || r <= 0) return list; // pas de note valide : rien à tracer
  const clean = {
    at: entry.at || new Date().toISOString(),
    source: entry.source === 'ai' ? 'ai' : 'local',
    rating: Math.max(1, Math.min(10, r)),
    title: String(entry.title || 'Tenue').slice(0, 60),
  };
  return [...list, clean].slice(-HISTORY_MAX);
}

export function filterHistory(list, mode) {
  return mode === 'all' ? list : list.filter((h) => h.source === mode);
}

export function summary(list) {
  if (!list.length) return { count: 0, avg: null, best: null, trend: null, last: null };
  const avg = list.reduce((s, h) => s + h.rating, 0) / list.length;
  const best = Math.max(...list.map((h) => h.rating));
  // Tendance : moyenne des 5 dernières moins la moyenne des 5 précédentes (si assez de données)
  let trend = null;
  if (list.length >= 6) {
    const k = Math.min(5, Math.floor(list.length / 2));
    const a = list.slice(-k).reduce((s, h) => s + h.rating, 0) / k;
    const b = list.slice(-2 * k, -k).reduce((s, h) => s + h.rating, 0) / k;
    trend = a - b;
  }
  return { count: list.length, avg, best, trend, last: list[list.length - 1] };
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); } catch { return ''; } };
export const fmtRating = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** Courbe : une série (cohérence /10 de chaque tenue, dans l'ordre), moyenne en repère pointillé. */
export function chartSVG(list, { max = 60 } = {}) {
  const data = list.slice(-max);
  const W = 360, H = 210, L = 30, R = 14, T = 14, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const y = (v) => T + ih - ((v - 1) / 9) * ih; // échelle fixe 1 → 10 (la note ne peut pas sortir de là)
  const x = (i) => L + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const avg = data.reduce((s, h) => s + h.rating, 0) / (data.length || 1);

  const grid = [2, 4, 6, 8, 10].map((v) => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ch-axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const pts = data.map((h, i) => `${x(i).toFixed(1)},${y(h.rating).toFixed(1)}`);
  const line = data.length > 1 ? `<polyline class="ch-line" points="${pts.join(' ')}"/>` : '';
  const dots = data.map((h, i) => `<circle class="ch-dot" cx="${x(i).toFixed(1)}" cy="${y(h.rating).toFixed(1)}" r="4.5"/>`).join('');
  const hits = data.map((h, i) => `<circle class="ch-hit" data-i="${list.length - data.length + i}" cx="${x(i).toFixed(1)}" cy="${y(h.rating).toFixed(1)}" r="15" tabindex="0" role="button" aria-label="${esc(`${h.title}, ${h.rating} sur 10, ${fmtDay(h.at)}`)}"/>`).join('');
  const avgLine = data.length > 1 ? `<line class="ch-avg" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/><text class="ch-avg-label" x="${W - R}" y="${y(avg) + 15}" text-anchor="end">moy. ${fmtRating(avg)}</text>` : '';
  const xl = data.length ? `<text class="ch-axis" x="${L}" y="${H - 8}">${esc(fmtDay(data[0].at))}</text><text class="ch-axis" x="${W - R}" y="${H - 8}" text-anchor="end">${esc(fmtDay(data[data.length - 1].at))}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de cohérence des tenues créées, de ${data.length ? fmtDay(data[0].at) : ''} à ${data.length ? fmtDay(data[data.length - 1].at) : ''}">${grid}${avgLine}${line}${dots}${hits}${xl}</svg>`;
}
