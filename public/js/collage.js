// Aperçu d'une tenue : tous les stickers des pièces réunis sur une seule image (PNG).
// Les pièces sans sticker apparaissent avec leur photo (cadre blanc), ou à défaut une pastille de couleur.

export const COLLAGE = { W: 1080, H: 1350, M: 60, TOP: 170, BOTTOM: 110 };

/**
 * Calcule la position de chaque pièce. Fonction pure (testable sans navigateur).
 * pieces : [{ id, role, aspect }] avec role ∈ top|dress|layer|bottom|shoes|outer|accessory, aspect = largeur/hauteur.
 * Retourne [{ id, role, x, y, w, h, rot }] (x,y = coin haut-gauche, w,h = taille finale).
 */
export function layoutOutfit(pieces, { W, H, M, TOP, BOTTOM } = COLLAGE) {
  const area = { x: M, y: TOP, w: W - 2 * M, h: H - TOP - BOTTOM };
  const by = (r) => pieces.find((p) => p.role === r);
  const main = [];
  const dress = by('dress'), top = by('top'), bottom = by('bottom'), shoes = by('shoes');
  if (dress) main.push({ p: dress, weight: 0.68 });
  else { if (top) main.push({ p: top, weight: 0.36 }); if (bottom) main.push({ p: bottom, weight: 0.42 }); }
  if (shoes) main.push({ p: shoes, weight: dress ? 0.26 : 0.22 });
  const side = [by('outer'), by('layer'), ...pieces.filter((p) => p.role === 'accessory')].filter(Boolean);

  const gap = 22;
  const mainW = side.length ? Math.round(area.w * 0.62) : Math.round(area.w * 0.78);
  const mainX = side.length ? area.x : area.x + Math.round((area.w - mainW) / 2);
  const sideX = area.x + mainW + 24, sideW = area.w - mainW - 24;
  const out = [];
  const rots = [-3, 2, -2, 3, -1.5, 2.5, -2.5];
  let ri = 0;

  const fit = (p, bx, by_, bw, bh) => {
    let w = bw, h = w / (p.aspect || 1);
    if (h > bh) { h = bh; w = h * (p.aspect || 1); }
    return { id: p.id, role: p.role, x: Math.round(bx + (bw - w) / 2), y: Math.round(by_ + (bh - h) / 2), w: Math.round(w), h: Math.round(h), rot: rots[ri++ % rots.length] };
  };

  // Colonne principale
  const totalW = main.reduce((s, m) => s + m.weight, 0) || 1;
  const usableH = area.h - gap * Math.max(0, main.length - 1);
  let y = area.y;
  // Centrage vertical si peu de pièces
  const used = Math.min(1, totalW) * usableH;
  y += Math.max(0, (usableH - used) / 2);
  for (const m of main) {
    const h = (m.weight / Math.max(totalW, 1)) * usableH;
    out.push(fit(m.p, mainX, y, mainW, h));
    y += h + gap;
  }

  // Colonne latérale
  if (side.length) {
    const cellH = Math.min(area.h * 0.34, (area.h - gap * (side.length - 1)) / side.length);
    const total = cellH * side.length + gap * (side.length - 1);
    let sy = area.y + Math.max(0, (area.h - total) / 2);
    for (const p of side) {
      out.push(fit(p, sideX, sy, sideW, cellH));
      sy += cellH + gap;
    }
  }
  return out;
}

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};

function silhouette(img, w, h, color) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  return c;
}

function drawSticker(ctx, img, r) {
  const { x, y, w, h, rot } = r;
  const pad = Math.round(Math.max(w, h) * 0.03) + 4; // épaisseur du liseré blanc
  // Contour blanc construit une seule fois (silhouette décalée dans toutes les directions)
  const cw = w + pad * 4, ch = h + pad * 4;
  const outline = document.createElement('canvas'); outline.width = cw; outline.height = ch;
  const og = outline.getContext('2d');
  const sil = silhouette(img, w, h, '#ffffff');
  const N = 36;
  for (const k of [1, 0.5]) for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    og.drawImage(sil, pad * 2 + Math.cos(a) * pad * k, pad * 2 + Math.sin(a) * pad * k, w, h);
  }
  og.drawImage(sil, pad * 2, pad * 2, w, h);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
  ctx.drawImage(outline, -cw / 2, -ch / 2);
  ctx.shadowColor = 'transparent';
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawPhotoCard(ctx, img, r) {
  const { x, y, w, h, rot } = r;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#fff'; roundRect(ctx, -w / 2, -h / 2, w, h, 26); ctx.fill();
  ctx.shadowColor = 'transparent';
  const b = 9;
  roundRect(ctx, -w / 2 + b, -h / 2 + b, w - 2 * b, h - 2 * b, 20); ctx.clip();
  ctx.drawImage(img, -w / 2 + b, -h / 2 + b, w - 2 * b, h - 2 * b);
  ctx.restore();
}

function drawSwatch(ctx, color, r) {
  const { x, y, w, h } = r;
  const d = Math.min(w, h);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
  ctx.fillStyle = color || '#777';
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, d / 2, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
}

/**
 * pieces : [{ id, role, name, img (ImageBitmap/Image) | null, kind: 'sticker'|'photo'|'color', color }]
 * Retourne un Blob PNG.
 */
export async function renderOutfitImage({ title, pieces, accent = '#C8F135', subtitle = '' }) {
  const { W, H, M } = COLLAGE;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // Fond
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#17181b'); bg.addColorStop(1, '#0B0B0C');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.42, W * 0.8);
  glow.addColorStop(0, `${accent}26`); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // En-tête
  ctx.fillStyle = '#F4F4F5'; ctx.font = '800 58px -apple-system, "SF Pro Display", system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  let t = title || 'Ma tenue';
  while (ctx.measureText(t).width > W - 2 * M && t.length > 4) t = t.slice(0, -2);
  if (t !== (title || 'Ma tenue')) t += '…';
  ctx.fillText(t, M, 108);
  if (subtitle) { ctx.fillStyle = 'rgba(244,244,245,.55)'; ctx.font = '600 28px -apple-system, system-ui, sans-serif'; ctx.fillText(subtitle, M, 150); }

  // Pièces
  const withAspect = pieces.map((p) => ({ ...p, aspect: p.img ? p.img.width / p.img.height : 1 }));
  const rects = layoutOutfit(withAspect.map(({ id, role, aspect }) => ({ id, role, aspect })));
  for (const r of rects) {
    const p = withAspect.find((x) => x.id === r.id && x.role === r.role);
    if (!p) continue;
    if (p.img && p.kind === 'sticker') drawSticker(ctx, p.img, r);
    else if (p.img) drawPhotoCard(ctx, p.img, r);
    else drawSwatch(ctx, p.color, r);
  }

  // Signature
  ctx.fillStyle = accent; ctx.font = '800 34px -apple-system, "SF Pro Display", system-ui, sans-serif';
  ctx.fillText('Mon dressing', M, H - 52);
  ctx.fillStyle = 'rgba(244,244,245,.5)'; ctx.font = '600 26px -apple-system, system-ui, sans-serif';
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dw = ctx.measureText(date).width;
  ctx.fillText(date, W - M - dw, H - 54);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Création de l\'image impossible.'))), 'image/png'));
}
