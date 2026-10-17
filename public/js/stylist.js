// Styliste LOCAL : algorithme de règles (couleurs, formalité, météo, coupes).
// Ce n'est PAS une IA : il fonctionne hors connexion et sert de solution de secours.
import { CATEGORIES, COLORS, STYLES, OCCASIONS, catOf, colorOf, isAvailable, seasonForDate } from './catalog.js';

const STYLE_REQ_FORMALITY = { streetwear: 2, elegant: 5, classe: 4, casual: 2.5, 'smart-casual': 3.5, mix: null };
const STYLE_REQ_TO_ITEM = { streetwear: ['streetwear'], elegant: ['elegant', 'chic'], classe: ['chic', 'elegant', 'smart-casual'], casual: ['casual'], 'smart-casual': ['smart-casual', 'chic', 'casual'], mix: [] };

const GOOD_PAIRS = new Set(['bleu|blanc', 'bleu-clair|bleu', 'bordeaux|rose', 'vert|jaune', 'orange|bleu', 'rouge|bleu-clair', 'violet|rose', 'jaune|bleu', 'bordeaux|bleu-clair', 'vert|bleu-clair']);
const CLASH_PAIRS = new Set(['rouge|rose', 'rouge|orange', 'vert|rouge', 'violet|jaune', 'orange|rose', 'violet|orange', 'rouge|violet', 'vert|violet']);
const pairKey = (a, b) => [a, b].sort().join('|');
const GOOD = new Set([...GOOD_PAIRS].map((k) => pairKey(...k.split('|'))));
const CLASH = new Set([...CLASH_PAIRS].map((k) => pairKey(...k.split('|'))));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const label = (it) => it ? it.name : '';
const colorLabel = (id) => (colorOf(id)?.label || id || '').toLowerCase();
const isNeutral = (id) => !!colorOf(id)?.neutral;
const allColors = (it) => [it.primaryColor, ...(it.secondaryColors || [])].filter(Boolean);

export function itemFormality(it) {
  let f = STYLES.find((s) => s.id === it.style)?.formality ?? 2.5;
  if (it.category === 'jogging') f = Math.min(f, 1.5);
  if (it.category === 'shorts') f -= 0.5;
  if (it.category === 'chemises') f += 0.5;
  if (it.category === 'polos') f = clamp(f, 2.5, 3.5);
  return clamp(f, 1, 5);
}

export function normalizeRequest(req = {}) {
  const occasion = OCCASIONS.find((o) => o.id === req.occasion);
  const styleF = STYLE_REQ_FORMALITY[req.style] ?? null;
  let target = req.formality != null && req.formality !== '' ? Number(req.formality) : null;
  if (target == null) {
    const parts = [occasion?.formality, styleF].filter((x) => x != null);
    target = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 2.5;
  }
  const temp = req.temp === '' || req.temp == null || Number.isNaN(Number(req.temp)) ? null : Number(req.temp);
  return {
    style: req.style || null,
    occasion: req.occasion || null,
    occasionLabel: occasion?.label || null,
    target: clamp(target, 1, 5),
    temp,
    season: req.season || seasonForDate(),
    prefer: req.preferColors || [],
    avoid: req.avoidColors || [],
    must: req.mustItems || [],
    shoesId: req.shoesId || null,
    prefStyles: Array.isArray(req.prefStyles) ? req.prefStyles : [],
  };
}

function itemScore(it, r) {
  let s = 0;
  const f = itemFormality(it);
  s += 3 * (1 - Math.abs(f - r.target) / 4);
  const wanted = STYLE_REQ_TO_ITEM[r.style] || [];
  if (wanted.includes(it.style)) s += 1;
  if (r.prefStyles?.includes(it.style)) s += 0.6; // style préféré du profil
  if (it.seasons?.length && !it.seasons.includes(r.season)) s -= 1;
  if (allColors(it).some((c) => r.prefer.includes(c))) s += 0.7;
  if (it.status === 'porte') s -= 0.2;
  if (it.wearPref === 'often') s += 0.9; // pièce que tu aimes porter
  if (it.wearPref === 'rare') s -= 1.4; // pièce que tu portes peu (ex. trop fine)
  const t = r.temp;
  if (t != null) {
    if (it.category === 'shorts') s += t < 20 ? -1.5 : t >= 24 ? 0.8 : 0;
    if (it.category === 'pantalons' && t >= 28) s -= 0.7;
    if (it.category === 'jogging' && t >= 27) s -= 0.5;
    if (it.category === 'pulls') s += t >= 24 ? -1.5 : t < 14 ? 0.5 : 0;
  }
  return s;
}

function hardExcluded(it, r) {
  if (!isAvailable(it)) return true;
  if (it.wearPref === 'never' && !r.must.includes(it.id)) return true; // « jamais » dans le styliste (sauf si tu l'imposes)
  if (r.avoid.length && allColors(it).some((c) => r.avoid.includes(c))) return !r.must.includes(it.id);
  const t = r.temp;
  if (t != null && !r.must.includes(it.id)) {
    if (it.category === 'shorts' && t < 15) return true;
    if (it.category === 'pulls' && t >= 27) return true;
  }
  return false;
}

export function colorHarmony(pieces) {
  const prim = pieces.filter(Boolean).map((p) => p.primaryColor).filter(Boolean);
  const accents = [...new Set(prim.filter((c) => !isNeutral(c)))];
  const notes = [];
  let score = 0;
  let penalty = 0;
  const weight = accents.reduce((n, c) => n + (c === 'multicolore' ? 1.5 : 1), 0);
  if (accents.length === 0) {
    const uniq = [...new Set(prim)];
    if (uniq.length === 1 && prim.length > 1) { score += 1.2; notes.push(`Look monochrome ${colorLabel(uniq[0])} : net et affirmé.`); }
    else { score += 1; notes.push(`Base 100 % neutre (${uniq.map(colorLabel).join(', ')}) : facile à porter et toujours cohérente.`); }
  } else if (weight <= 1) {
    score += 1.5; notes.push(`Une seule couleur forte (${colorLabel(accents[0])}) posée sur des neutres : le regard sait où aller.`);
  } else if (accents.length === 2 && weight <= 2) {
    const k = pairKey(accents[0], accents[1]);
    if (GOOD.has(k)) { score += 0.6; notes.push(`Duo ${colorLabel(accents[0])} / ${colorLabel(accents[1])} : association classique qui fonctionne.`); }
    else if (CLASH.has(k)) { score -= 1.8; penalty += 3; notes.push(`Attention : ${colorLabel(accents[0])} et ${colorLabel(accents[1])} se concurrencent.`); }
    else { score -= 0.8; penalty += 1.5; notes.push(`Deux couleurs fortes : à porter avec assurance.`); }
  } else {
    score -= 2.5; penalty += 4; notes.push('Trop de couleurs fortes en même temps.');
  }
  return { score, penalty, notes };
}

function proportions(top, bottom, r) {
  const ample = (f) => f === 'oversize' || f === 'large' || f === 'relaxed';
  if (!top || !bottom) return { score: 0, penalty: 0, note: null };
  if (ample(top.fit) && ample(bottom.fit)) {
    if (r.style === 'streetwear') return { score: 0.3, penalty: 0, note: 'Silhouette ample en haut comme en bas : le code streetwear assumé.' };
    return { score: -0.8, penalty: 1.5, note: 'Haut et bas tous deux amples : la silhouette peut sembler un peu noyée.' };
  }
  if (ample(top.fit) && (bottom.fit === 'slim' || bottom.fit === 'droite' || bottom.fit === 'regular')) return { score: 0.5, penalty: 0, note: 'Volume en haut, ligne plus nette en bas : proportions équilibrées.' };
  if (top.fit === 'slim' && ample(bottom.fit)) return { score: 0.3, penalty: 0, note: 'Haut ajusté et bas ample : contraste de volumes moderne.' };
  if (top.fit === 'cropped' && (bottom.fit === 'large' || bottom.fit === 'relaxed')) return { score: 0.4, penalty: 0, note: 'Haut court sur bas ample : allonge la jambe.' };
  return { score: 0, penalty: 0, note: null };
}

function needsOuter(r) {
  if (r.temp != null) return r.temp < 17;
  return r.season === 'hiver' || r.season === 'automne';
}

function evaluate(combo, r) {
  const { top, bottom, shoes, outer, layer } = combo;
  const pieces = [top, bottom, shoes, outer, layer].filter(Boolean);
  let score = pieces.reduce((n, p) => n + p._s, 0);
  let penalty = 0;
  const notes = [];
  const harm = colorHarmony([top, bottom, shoes, outer, layer]);
  score += harm.score * 1.5; penalty += harm.penalty; notes.push(...harm.notes);
  if (top && bottom && top.primaryColor === bottom.primaryColor && !isNeutral(top.primaryColor)) { score -= 0.8; penalty += 1; }
  if (top && bottom && top.primaryColor === 'denim' && bottom.primaryColor === 'denim') { score -= 0.5; penalty += 0.5; notes.push('Denim sur denim : fonctionne si les deux teintes sont différentes.'); }
  const pr = proportions(layer || top, bottom, r);
  score += pr.score; penalty += pr.penalty; if (pr.note) notes.push(pr.note);
  const fs = pieces.map(itemFormality);
  const spread = Math.max(...fs) - Math.min(...fs);
  if (spread > 2) { score -= 2; penalty += 2.5; notes.push('Mélange de pièces très habillées et très sport : cohérence fragile.'); }
  else if (spread > 1.5) { score -= 0.7; penalty += 1; }
  const avgF = fs.reduce((a, b) => a + b, 0) / fs.length;
  penalty += Math.max(0, Math.abs(avgF - r.target) - 0.75) * 1.5;
  if (needsOuter(r) && !outer) { score -= r.temp != null && r.temp < 10 ? 2 : 1; penalty += r.temp != null && r.temp < 10 ? 2 : 1; }
  if (!shoes) penalty += 1;
  for (const p of pieces) if (p.seasons?.length && !p.seasons.includes(r.season)) penalty += 0.7;
  if (r.temp != null && bottom?.category === 'shorts' && r.temp < 20) penalty += 1.5;
  return { score, rating: Math.round(clamp(10 - penalty, 1, 10)), notes };
}

function slotsFor(items, r) {
  const pool = items.filter((it) => !hardExcluded(it, r)).map((it) => ({ ...it, _s: itemScore(it, r) }));
  const by = (slot) => pool.filter((it) => catOf(it.category)?.slot === slot).sort((a, b) => b._s - a._s);
  return { top: by('top'), bottom: by('bottom'), dress: by('dress'), shoes: by('shoes'), outer: by('outer'), accessory: by('accessory'), pool };
}

function describeMissing(items, slotsAvail, r) {
  const labels = { top: 'haut', bottom: 'bas (pantalon, short ou jogging)', shoes: 'paire de chaussures' };
  const missing = [];
  for (const slot of ['top', 'bottom', 'shoes']) {
    if (slotsAvail[slot].length) continue;
    const all = items.filter((it) => catOf(it.category)?.slot === slot);
    let reason;
    if (!all.length) reason = `Aucun ${labels[slot]} enregistré dans ton dressing.`;
    else if (!all.some(isAvailable)) reason = `${{ top: 'Tous tes hauts sont', bottom: 'Tous tes bas sont', shoes: 'Toutes tes chaussures sont' }[slot]} au sale ou au lavage.`;
    else if (all.filter(isAvailable).every((it) => it.wearPref === 'never')) reason = `Aucun ${labels[slot]} utilisable : ceux qui sont propres sont réglés sur « Jamais » dans le styliste.`;
    else reason = `Aucun ${labels[slot]} disponible ne correspond à tes critères (couleurs évitées, météo…).`;
    missing.push({ slot, reason });
  }
  return missing;
}

export function generateOutfits(items, request) {
  const r = normalizeRequest(request);
  const S = slotsFor(items, r);
  const warnings = [];

  // Pièces imposées
  const mustItems = r.must.map((id) => items.find((it) => it.id === id)).filter(Boolean);
  for (const id of r.must) {
    const it = items.find((x) => x.id === id);
    if (!it) warnings.push('Une pièce imposée n\'existe plus dans ton dressing.');
    else if (!isAvailable(it)) warnings.push(`« ${it.name} » est ${it.status === 'sale' ? 'au sale' : 'au lavage'} : impossible de l'utiliser.`);
    else if (it.wearPref === 'never') warnings.push(`« ${it.name} » est réglé sur « Jamais » mais tu l'as imposé : il est utilisé.`);
  }
  let forcedLayer = null;
  const fix = (slot, it) => { S[slot] = S[slot].filter((x) => x.id === it.id); };
  const mustTops = mustItems.filter((it) => isAvailable(it) && catOf(it.category).slot === 'top');
  if (mustTops.length > 1) {
    const pull = mustTops.find((it) => it.category === 'pulls');
    const other = mustTops.find((it) => it !== pull);
    if (pull && other) { forcedLayer = S.pool.find((x) => x.id === pull.id); fix('top', other); }
    else warnings.push('Plusieurs hauts imposés : un seul a été retenu.');
  }
  for (const it of mustItems) {
    if (!isAvailable(it)) continue;
    const slot = catOf(it.category).slot;
    if (slot === 'accessory') continue;
    if (slot === 'top' && mustTops.length > 1) continue;
    fix(slot, it);
  }
  if (r.shoesId) {
    const sh = items.find((x) => x.id === r.shoesId);
    if (!sh || !isAvailable(sh)) warnings.push('Les chaussures choisies ne sont pas disponibles.');
    else S.shoes = S.pool.filter((x) => x.id === sh.id);
  }

  const missing = describeMissing(items, S, r).filter((m) => !(S.dress.length && (m.slot === 'top' || m.slot === 'bottom')));
  const mustSeparates = mustItems.some((it) => isAvailable(it) && ['top', 'bottom'].includes(catOf(it.category).slot));
  const mustDress = mustItems.some((it) => isAvailable(it) && catOf(it.category).slot === 'dress');
  const useSeparates = S.top.length && S.bottom.length && !mustDress;
  const useDresses = S.dress.length && !mustSeparates;
  if (!useSeparates && !useDresses) {
    return { outfits: [], missing: describeMissing(items, S, r).filter((m) => !(S.dress.length && (m.slot === 'top' || m.slot === 'bottom'))), warnings, request: r };
  }

  const wantOuter = needsOuter(r) || mustItems.some((it) => catOf(it.category).slot === 'outer');
  const outerOptions = wantOuter ? S.outer.slice(0, 5) : [];
  const forbidOuter = r.temp != null && r.temp >= 22 && !mustItems.some((it) => catOf(it.category).slot === 'outer');
  const tops = useSeparates ? S.top.slice(0, 10) : [], bottoms = S.bottom.slice(0, 10), shoes = S.shoes.length ? S.shoes.slice(0, 8) : [null];
  const wantLayer = forcedLayer || (r.temp != null && r.temp < 13);
  const layers = forcedLayer ? [forcedLayer] : wantLayer ? S.top.filter((t) => t.category === 'pulls').slice(0, 3) : [];

  const results = [];
  for (const top of tops) for (const bottom of bottoms) for (const sh of shoes) {
    let best = null;
    const layerOpts = top.category === 'pulls' ? [null] : [null, ...layers];
    const outers = forbidOuter ? [null] : [null, ...outerOptions];
    for (const layer of layerOpts) for (const outer of outers) {
      if (forcedLayer && !layer) continue;
      if (S.outer.length && mustItems.some((it) => catOf(it.category).slot === 'outer') && !outer) continue;
      const combo = { top, bottom, shoes: sh, outer, layer };
      const ev = evaluate(combo, r);
      if (!best || ev.score > best.ev.score) best = { combo, ev };
    }
    if (best) results.push(best);
  }
  if (useDresses) {
    for (const dress of S.dress.slice(0, 10)) for (const sh of shoes) {
      let best = null;
      const outers = forbidOuter ? [null] : [null, ...outerOptions];
      for (const outer of outers) {
        if (S.outer.length && mustItems.some((it) => catOf(it.category).slot === 'outer') && !outer) continue;
        const combo = { top: dress, bottom: null, shoes: sh, outer, layer: null, isDress: true };
        const ev = evaluate(combo, r);
        if (!best || ev.score > best.ev.score) best = { combo, ev };
      }
      if (best) results.push(best);
    }
  }
  results.sort((a, b) => b.ev.score - a.ev.score);

  const accessories = S.accessory;
  const mustAcc = mustItems.filter((it) => isAvailable(it) && catOf(it.category).slot === 'accessory');
  const outfits = results.slice(0, 40).map(({ combo, ev }) => {
    const acc = [...mustAcc];
    if (!acc.length && accessories.length) {
      const pick = accessories.find((a) => colorHarmony([combo.top, combo.bottom, combo.shoes, combo.outer, a]).penalty <= colorHarmony([combo.top, combo.bottom, combo.shoes, combo.outer]).penalty && a._s > 1.5);
      if (pick) acc.push(pick);
    }
    return buildOutfit(combo, acc, ev, r, S);
  });

  if (!S.shoes.length) warnings.push(missing.find((m) => m.slot === 'shoes')?.reason || 'Aucune paire de chaussures disponible.');
  if (wantOuter && !S.outer.length) warnings.push(r.temp != null ? `Il fait ${r.temp} °C mais aucune veste ou manteau n'est disponible.` : 'Aucune veste disponible pour la saison.');
  return { outfits, missing, warnings, request: r };
}

function buildOutfit(combo, acc, ev, r, S) {
  const parts = [];
  parts.push(ev.notes[0]);
  const rest = ev.notes.slice(1).filter(Boolean);
  if (rest.length) parts.push(rest[0]);
  if (combo.outer && r.temp != null) parts.push(`${combo.outer.name} ajoutée pour les ${r.temp} °C indiqués.`);
  else if (combo.outer) parts.push(`${combo.outer.name} pour la saison.`);
  if (combo.layer) parts.push(`${combo.layer.name} superposé pour la chaleur.`);
  if (r.occasionLabel) parts.push(`Niveau d'habillage pensé pour « ${r.occasionLabel} ».`);
  const coherence = ev.rating >= 8 ? 'Look très cohérent.' : ev.rating >= 6 ? 'Look cohérent, quelques compromis.' : 'Look possible, mais ton dressing disponible limite les options.';
  const slots = {
    top: combo.isDress ? null : combo.top?.id || null,
    dress: combo.isDress ? combo.top?.id : null,
    bottom: combo.bottom?.id || null,
    shoes: combo.shoes?.id || null,
    outer: combo.outer?.id || null,
    layer: combo.layer?.id || null,
    accessories: acc.map((a) => a.id),
  };
  return {
    slots,
    title: titleFor(combo, r),
    explanation: parts.join(' '),
    rating: ev.rating,
    coherence,
    score: ev.score,
    variants: variantsFor(combo, ev, r, S),
    key: `${slots.top || slots.dress}|${slots.bottom}|${slots.shoes}|${slots.outer}|${slots.layer}`,
  };
}

function titleFor(combo, r) {
  const accent = [combo.top, combo.bottom, combo.outer].filter(Boolean).map((p) => p.primaryColor).find((c) => !isNeutral(c));
  const base = r.style === 'streetwear' ? 'Street' : r.style === 'elegant' ? 'Élégant' : r.style === 'classe' ? 'Classe' : r.style === 'smart-casual' ? 'Smart' : r.style === 'casual' ? 'Casual' : 'Look';
  return accent ? `${base} touche ${colorLabel(accent)}` : `${base} neutre`;
}

function variantsFor(combo, ev, r, S) {
  const out = [];
  const slotList = combo.isDress ? [['dress', 'top', 'dress'], ['shoes', 'shoes', 'shoes'], ['outer', 'outer', 'outer']] : [['top', 'top', 'top'], ['bottom', 'bottom', 'bottom'], ['shoes', 'shoes', 'shoes'], ['outer', 'outer', 'outer']];
  for (const [slot, comboKey, pool] of slotList) {
    const cur = combo[comboKey];
    if (!cur) continue;
    let best = null;
    for (const alt of S[pool].slice(0, 12)) {
      if (alt.id === cur.id) continue;
      const e = evaluate({ ...combo, [comboKey]: alt }, r);
      if (!best || e.score > best.e.score) best = { alt, e };
    }
    if (best && best.e.score >= ev.score - 2.5) out.push({ slot, itemId: best.alt.id, note: `Remplace ${cur.name} par ${best.alt.name}`, rating: best.e.rating });
  }
  return out.sort((a, b) => b.rating - a.rating).slice(0, 3);
}

// Choisit une tenue pas encore montrée parmi les meilleures (avec un peu de hasard)
export function pickNext(outfits, shownKeys = [], rand = Math.random) {
  const fresh = outfits.filter((o) => !shownKeys.includes(o.key));
  const pool = (fresh.length ? fresh : outfits);
  if (!pool.length) return null;
  // évite de reproposer le même haut si possible
  const lastTops = shownKeys.map((k) => k.split('|')[0]);
  const diverse = pool.filter((o) => !lastTops.includes(String(o.slots.top || o.slots.dress)));
  const src = (diverse.length ? diverse : pool).slice(0, 3);
  return src[Math.floor(rand() * src.length)] || src[0];
}

export const _test = { itemScore, evaluate, hardExcluded, needsOuter };
