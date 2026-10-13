// Découpe d'un vêtement en « sticker » (PNG transparent, sans arrière-plan).
// Deux méthodes, essayées dans cet ordre :
//  1. « ia » : modèle de détourage qui tourne SUR le téléphone (bibliothèque @imgly/background-removal,
//     chargée seulement au premier ajout ; le modèle fait quelques dizaines de Mo, téléchargé une fois).
//     Aucune photo n'est envoyée à un serveur pour cette étape.
//  2. « simple » : secours sans téléchargement, qui efface un fond uni connecté aux bords de la photo
//     (fonctionne bien sur un drap, un sol ou un mur clair et uni ; échoue si le fond est chargé).
// Si les deux échouent, aucun sticker n'est créé et l'app utilise la photo normale.

const ML_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';
const ML_TIMEOUT = 120000;
let mlLib = null;

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

async function loadBitmap(blob) {
  if ('createImageBitmap' in self) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* repli */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
    img.src = url;
  });
}

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const toPNG = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export PNG impossible.'))), 'image/png'));

/** Recadre sur les pixels non transparents, avec une petite marge, et limite la taille. */
export function trimToContent(src, { pad = 0.03, max = 800 } = {}) {
  const w = src.width, h = src.height;
  const ctx = src.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return null;
  const p = Math.round(Math.max(x1 - x0, y1 - y0) * pad);
  x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const scale = Math.min(1, max / Math.max(cw, ch));
  const out = canvasOf(Math.round(cw * scale), Math.round(ch * scale));
  out.getContext('2d').drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out;
}

/** Part des pixels visibles (0..1) — sert à refuser une découpe absurde. */
function coverage(c) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
  return n / (c.width * c.height);
}

// ---------- Méthode 2 : fond uni ----------
export function simpleCutout(bitmap, { work = 900, tol = 46 } = {}) {
  const scale = Math.min(1, work / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Couleur de fond = médiane des pixels du bord
  const rs = [], gs = [], bs = [];
  const sample = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
  const step = Math.max(1, Math.floor(Math.max(w, h) / 200));
  for (let x = 0; x < w; x += step) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += step) { sample(0, y); sample(w - 1, y); }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  const bg = [med(rs), med(gs), med(bs)];
  const dist2 = (i) => { const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2]; return dr * dr + dg * dg + db * db; };
  const T2 = tol * tol;

  // Le fond doit être assez uniforme sur les bords
  let close = 0;
  for (let k = 0; k < rs.length; k++) { const dr = rs[k] - bg[0], dg = gs[k] - bg[1], db = bs[k] - bg[2]; if (dr * dr + dg * dg + db * db < T2) close++; }
  if (close / rs.length < 0.72) throw new Error('Le fond est trop chargé pour le retirer sans IA.');

  // Remplissage depuis les bords
  const isBg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (isBg[p]) return;
    if (dist2(p * 4) > T2) return;
    isBg[p] = 1; stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop(); const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }

  // Alpha adouci : on érode d'un pixel le bord pour retirer le liseré de fond, puis on floute légèrement
  const alpha = new Float32Array(w * h);
  for (let p = 0; p < alpha.length; p++) alpha[p] = isBg[p] ? 0 : 1;
  const er = new Float32Array(alpha);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x;
    if (alpha[p] && (!alpha[p - 1] || !alpha[p + 1] || !alpha[p - w] || !alpha[p + w])) er[p] = 0.5;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    d[p * 4 + 3] = Math.round(255 * er[p]);
  }
  ctx.putImageData(img, 0, 0);

  const cov = coverage(c);
  if (cov < 0.03) throw new Error('Rien n\'a été reconnu sur cette photo.');
  if (cov > 0.93) throw new Error('Le fond n\'a pas pu être séparé de la pièce.');
  const out = trimToContent(c);
  if (!out) throw new Error('Découpe vide.');
  return out;
}

// ---------- Méthode 1 : IA locale ----------
async function aiCutout(blob, onStatus) {
  onStatus?.('Chargement du détourage IA (la première fois, quelques dizaines de Mo)…');
  if (!mlLib) mlLib = await withTimeout(import(/* @vite-ignore */ ML_URL), 30000, 'Bibliothèque de détourage injoignable.');
  const removeBackground = mlLib.removeBackground || mlLib.default?.removeBackground || mlLib.default;
  if (typeof removeBackground !== 'function') throw new Error('Bibliothèque de détourage inattendue.');
  onStatus?.('Découpe en cours…');
  const out = await withTimeout(removeBackground(blob, { model: 'isnet_quint8', output: { format: 'image/png', quality: 0.9 } }), ML_TIMEOUT, 'Le détourage IA a pris trop de temps.');
  const bmp = await loadBitmap(out);
  const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = canvasOf(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const cov = coverage(c);
  if (cov < 0.02 || cov > 0.97) throw new Error('Découpe IA non exploitable.');
  const t = trimToContent(c);
  if (!t) throw new Error('Découpe vide.');
  return t;
}

/**
 * Crée le sticker. Retourne { blob (PNG), method: 'ia' | 'simple' }.
 * Lève une erreur (avec un message lisible) si aucune méthode n'a fonctionné.
 */
export async function makeSticker(photoBlob, { onStatus, methods = ['ia', 'simple'] } = {}) {
  const errors = [];
  for (const m of methods) {
    try {
      if (m === 'ia') {
        const c = await aiCutout(photoBlob, onStatus);
        return { blob: await toPNG(c), method: 'ia' };
      }
      onStatus?.('Découpe du fond uni…');
      const bmp = await loadBitmap(photoBlob);
      const c = simpleCutout(bmp);
      return { blob: await toPNG(c), method: 'simple' };
    } catch (e) { errors.push(`${m}: ${e.message}`); }
  }
  const err = new Error('Découpe impossible. ' + errors.map((x) => x.split(': ')[1]).filter(Boolean).slice(-1)[0]);
  err.details = errors;
  throw err;
}
