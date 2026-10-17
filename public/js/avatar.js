// Avatar local : un mannequin dessiné d'après ta taille et ton poids, ta photo de visage (si tu en as mis une),
// habillé avec les stickers de la tenue. Tout est calculé sur le téléphone, rien n'est envoyé nulle part.
// Ce n'est PAS un rendu réaliste généré par IA : c'est une silhouette stylisée, fidèle aux proportions saisies.

export const SKIN_TONES = [
  { id: 'tres-clair', label: 'Très clair', hex: '#F6DCC4' },
  { id: 'clair', label: 'Clair', hex: '#EBC29B' },
  { id: 'moyen', label: 'Moyen', hex: '#D09A6A' },
  { id: 'hale', label: 'Hâlé', hex: '#A8714A' },
  { id: 'brun', label: 'Brun', hex: '#7B4E31' },
  { id: 'fonce', label: 'Foncé', hex: '#4F3222' },
];
export const skinHex = (id) => (SKIN_TONES.find((s) => s.id === id) || SKIN_TONES[2]).hex;

export const AVATAR = { W: 1080, H: 1350, FEET: 1215, MAXH: 1030 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Proportions du mannequin (en pixels), calculées d'après taille / poids. Fonction pure (testable). */
export function bodyMetrics({ height, weight } = {}) {
  const h = clamp(Number(height) || 175, 120, 215);
  const w = Number(weight);
  const bmi = w ? clamp(w, 30, 250) / ((h / 100) ** 2) : 22.5;
  const bf = clamp((bmi - 18) / (34 - 18), 0, 1); // 0 = fin … 1 = corpulent
  const u = AVATAR.MAXH * (0.84 + 0.16 * clamp((h - 150) / 50, 0, 1)); // hauteur du personnage sur l'image
  return {
    h, bmi, bf, u,
    top: AVATAR.FEET - u,
    cx: AVATAR.W / 2,
    sw: u * (0.098 + 0.034 * bf), // demi-largeur épaules
    ww: u * (0.068 + 0.040 * bf), // taille
    hw: u * (0.082 + 0.040 * bf), // hanches
    headRx: u * 0.047, headRy: u * 0.062,
    arm: u * (0.036 + 0.014 * bf),
  };
}

/** Où poser chaque pièce : { x, y, w, h } (boîte maximale, l'image garde ses proportions). */
export function slotBox(piece, m) {
  const Y = (f) => m.top + f * m.u;
  const name = `${piece.name || ''}`.toLowerCase();
  const cat = piece.category || '';
  const w = (k) => 2 * k;
  switch (piece.role) {
    case 'top': return { x: m.cx - m.sw * 1.45, y: Y(0.165), w: w(m.sw * 1.45), h: m.u * 0.36, align: 'top' };
    case 'layer': return { x: m.cx - m.sw * 1.52, y: Y(0.165), w: w(m.sw * 1.52), h: m.u * 0.38, align: 'top' };
    case 'outer': return { x: m.cx - m.sw * 1.68, y: Y(0.15), w: w(m.sw * 1.68), h: m.u * 0.46, align: 'top' };
    case 'dress': return { x: m.cx - m.sw * 1.5, y: Y(0.165), w: w(m.sw * 1.5), h: m.u * 0.56, align: 'top' };
    case 'bottom':
      if (cat === 'jupes') return { x: m.cx - m.hw * 1.55, y: Y(0.44), w: w(m.hw * 1.55), h: m.u * 0.30, align: 'top' };
      if (cat === 'shorts') return { x: m.cx - m.hw * 1.5, y: Y(0.46), w: w(m.hw * 1.5), h: m.u * 0.26, align: 'top' };
      return { x: m.cx - m.hw * 1.48, y: Y(0.455), w: w(m.hw * 1.48), h: m.u * 0.50, align: 'top' };
    case 'shoes': return { x: m.cx - m.hw * 1.4, y: Y(1) - m.u * 0.085, w: w(m.hw * 1.4), h: m.u * 0.085, align: 'bottom' };
    default: break;
  }
  // Accessoires : placés selon leur nom
  if (/casquette|bonnet|chapeau|bob|b[ée]ret|cap\b/.test(name)) return { x: m.cx - m.headRx * 1.45, y: Y(0.065) - m.headRy * 1.55, w: w(m.headRx * 1.45), h: m.headRy * 1.1, align: 'bottom' };
  if (/lunettes|solaire/.test(name)) return { x: m.cx - m.headRx * 1.05, y: Y(0.065) - m.headRy * 0.35, w: w(m.headRx * 1.05), h: m.headRy * 0.5, align: 'center' };
  if (/montre|bracelet/.test(name)) return { x: m.cx - m.sw - m.arm * 3.2, y: Y(0.455), w: m.arm * 3, h: m.arm * 3, align: 'center' };
  if (/collier|cha[iî]ne|pendentif|[ée]charpe|foulard|cravate|n[œo]ud/.test(name)) return { x: m.cx - m.sw * 0.8, y: Y(0.14), w: w(m.sw * 0.8), h: m.u * 0.12, align: 'top' };
  if (/ceinture/.test(name)) return { x: m.cx - m.ww * 1.25, y: Y(0.40), w: w(m.ww * 1.25), h: m.u * 0.05, align: 'center' };
  if (cat === 'sacs' || /sac|besace|cabas|banane|pochette/.test(name)) return { x: m.cx + m.sw + m.arm * 0.5, y: Y(0.40), w: m.u * 0.2, h: m.u * 0.2, align: 'top' };
  return { x: m.cx + m.sw + m.arm, y: Y(0.28), w: m.u * 0.14, h: m.u * 0.14, align: 'top' }; // autre accessoire : à côté du buste
}

const ORDER = ['bottom', 'shoes', 'dress', 'top', 'layer', 'outer', 'accessory'];

function fitIn(img, box) {
  const ar = img.width / img.height;
  let w = box.w, h = w / ar;
  if (h > box.h) { h = box.h; w = h * ar; }
  const x = box.x + (box.w - w) / 2;
  const y = box.align === 'bottom' ? box.y + box.h - h : box.align === 'center' ? box.y + (box.h - h) / 2 : box.y;
  return { x, y, w, h };
}

function drawBody(ctx, m, skin) {
  const Y = (f) => m.top + f * m.u;
  const { cx } = m;
  ctx.save();
  ctx.fillStyle = skin; ctx.strokeStyle = skin; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
  // jambes
  const legTop = Y(0.5), legBot = Y(0.97);
  for (const side of [-1, 1]) {
    const x0 = cx + side * m.hw * 0.52, x1 = cx + side * m.hw * 0.40;
    ctx.lineWidth = m.hw * (0.92 - 0.0 * m.bf);
    ctx.beginPath(); ctx.moveTo(x0, legTop); ctx.quadraticCurveTo(x0 + side * m.hw * 0.05, Y(0.74), x1, legBot); ctx.stroke();
    ctx.lineWidth = m.hw * 0.62;
    ctx.beginPath(); ctx.moveTo(x1, Y(0.80)); ctx.lineTo(x1, legBot); ctx.stroke();
  }
  // bras
  ctx.lineWidth = m.arm;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * (m.sw - m.arm * 0.2), Y(0.20));
    ctx.quadraticCurveTo(cx + side * (m.sw + m.arm * 0.9), Y(0.34), cx + side * (m.sw + m.arm * 0.6), Y(0.47));
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + side * (m.sw + m.arm * 0.6), Y(0.485), m.arm * 0.62, 0, Math.PI * 2); ctx.fill();
  }
  // buste
  ctx.beginPath();
  ctx.moveTo(cx - m.sw, Y(0.18));
  ctx.quadraticCurveTo(cx, Y(0.155), cx + m.sw, Y(0.18));
  ctx.quadraticCurveTo(cx + m.sw * 0.98, Y(0.26), cx + m.ww, Y(0.40));
  ctx.quadraticCurveTo(cx + m.hw * 1.02, Y(0.46), cx + m.hw, Y(0.54));
  ctx.lineTo(cx - m.hw, Y(0.54));
  ctx.quadraticCurveTo(cx - m.hw * 1.02, Y(0.46), cx - m.ww, Y(0.40));
  ctx.quadraticCurveTo(cx - m.sw * 0.98, Y(0.26), cx - m.sw, Y(0.18));
  ctx.closePath(); ctx.fill();
  // cou
  ctx.shadowColor = 'transparent';
  ctx.fillRect(cx - m.headRx * 0.38, Y(0.1), m.headRx * 0.76, m.u * 0.08);
  ctx.restore();
}

function drawHead(ctx, m, skin, face) {
  const cy = m.top + m.u * 0.065;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(m.cx, cy, m.headRx, m.headRy, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  if (face) {
    ctx.beginPath(); ctx.ellipse(m.cx, cy, m.headRx, m.headRy, 0, 0, Math.PI * 2); ctx.clip();
    const s = Math.max((2 * m.headRx) / face.width, (2 * m.headRy) / face.height) * 1.04;
    const w = face.width * s, h = face.height * s;
    ctx.drawImage(face, m.cx - w / 2, cy - h / 2, w, h);
  }
  ctx.restore();
}

function drawFallbackShape(ctx, piece, box) {
  // Pas de sticker : une forme unie dans la couleur de la pièce, à la bonne place
  ctx.save();
  ctx.fillStyle = piece.color || '#777'; ctx.globalAlpha = 0.96;
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke(); };
  const gap = box.w * 0.04;
  if (piece.role === 'bottom' && piece.category !== 'jupes') {
    const w = (box.w - gap) / 2;
    rr(box.x, box.y, w, box.h, w * 0.25); rr(box.x + w + gap, box.y, w, box.h, w * 0.25);
    ctx.globalAlpha = 1; ctx.fillRect(box.x + w * 0.2, box.y, box.w - w * 0.4, box.h * 0.12); // ceinture
  } else if (piece.role === 'shoes') {
    const w = (box.w - gap) / 2, h = box.h * 0.7;
    for (const k of [0, 1]) { ctx.beginPath(); ctx.ellipse(box.x + w / 2 + k * (w + gap), box.y + box.h - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  } else if (piece.role === 'top' || piece.role === 'layer' || piece.role === 'outer' || piece.role === 'dress') {
    const sleeve = box.w * 0.2; // manches
    rr(box.x, box.y, box.w, box.h * 0.32, box.w * 0.08);
    rr(box.x + sleeve * 0.6, box.y, box.w - sleeve * 1.2, box.h * 0.9, box.w * 0.06);
  } else rr(box.x, box.y, box.w, box.h * (piece.role === 'accessory' ? 1 : 0.9), Math.min(box.w, box.h) * 0.12);
  ctx.restore();
}

/**
 * me : { height, weight, skin } ; face : ImageBitmap | null
 * pieces : [{ id, role, category, name, img, kind: 'sticker' | 'photo' | 'color', color }]
 * Retourne un Blob PNG 1080×1350.
 */
export async function renderAvatar({ me = {}, face = null, pieces = [], title = 'Mon avatar', accent = '#C8F135' } = {}) {
  const { W, H } = AVATAR;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#17181b'); bg.addColorStop(1, '#0B0B0C');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.5, 40, W / 2, H * 0.5, W * 0.75);
  glow.addColorStop(0, `${accent}26`); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // sol
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(W / 2, AVATAR.FEET + 8, 240, 26, 0, 0, Math.PI * 2); ctx.fill();

  const m = bodyMetrics(me);
  const skin = skinHex(me.skin);
  drawBody(ctx, m, skin);

  const sorted = [...pieces].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));
  for (const p of sorted) {
    const box = slotBox(p, m);
    if (p.img && p.kind === 'sticker') {
      const r = fitIn(p.img, box);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
      ctx.drawImage(p.img, r.x, r.y, r.w, r.h);
      ctx.restore();
    } else drawFallbackShape(ctx, p, box);
  }
  drawHead(ctx, m, skin, face);
  // casquette / lunettes par-dessus le visage
  for (const p of sorted.filter((q) => q.role === 'accessory' && q.img && q.kind === 'sticker' && /casquette|bonnet|chapeau|bob|b[ée]ret|lunettes|solaire/i.test(q.name || ''))) {
    const r = fitIn(p.img, slotBox(p, m)); ctx.drawImage(p.img, r.x, r.y, r.w, r.h);
  }

  ctx.fillStyle = '#F4F4F5'; ctx.font = '800 54px -apple-system, "SF Pro Display", system-ui, sans-serif';
  let t = title; while (ctx.measureText(t).width > W - 120 && t.length > 4) t = t.slice(0, -2);
  ctx.fillText(t === title ? t : t + '…', 60, 104);
  ctx.fillStyle = accent; ctx.font = '800 34px -apple-system, "SF Pro Display", system-ui, sans-serif';
  ctx.fillText('Mon dressing', 60, H - 52);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Création de l\'avatar impossible.'))), 'image/png'));
}
