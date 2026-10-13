// Serveur de Mon dressing (Cloudflare Worker, offre gratuite).
// - Sert l'application (fichiers du dossier public/)
// - Relaie les demandes d'IA vers Google Gemini : la clé API reste ICI, jamais dans le navigateur.
import { CATEGORIES, GENDERS, COLORS, FITS, STYLES, SEASONS, STATUSES, OCCASIONS, ids } from '../public/js/catalog.js';

// Chaque modèle a son propre quota gratuit : quand l'un est épuisé, on passe au suivant.
// Reconnaître un vêtement est simple : les modèles « lite » (quota gratuit plus large) passent en premier.
const MODELS_ANALYZE = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-flash-latest'];
const MODELS_STYLE = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];
const MAX_IMAGE_B64 = 7_000_000; // ~5 Mo
const MAX_ITEMS = 400;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (error, status, code) => json({ error, code }, status);

function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, url); }
      catch (e) { return fail('Erreur interne du serveur.', 500, 'internal'); }
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};

async function handleApi(request, env, url) {
  const configured = { password: !!env.APP_PASSWORD, ai: !!env.GEMINI_API_KEY };
  const authorized = configured.password && safeEqual(request.headers.get('x-drip-password') || '', env.APP_PASSWORD);

  if (url.pathname === '/api/health') {
    return json({ ok: true, configured, authorized });
  }
  if (request.method !== 'POST') return fail('Méthode non autorisée.', 405, 'method');
  if (!configured.password) return fail('Le mot de passe (APP_PASSWORD) n\'est pas configuré sur le serveur.', 503, 'no-password');
  if (!authorized) return fail('Mot de passe incorrect. Vérifie-le dans Réglages.', 401, 'unauthorized');
  if (!configured.ai) return fail('La clé Gemini (GEMINI_API_KEY) n\'est pas configurée sur le serveur.', 503, 'no-key');

  let body;
  try { body = await request.json(); } catch { return fail('Requête illisible.', 400, 'bad-json'); }

  if (url.pathname === '/api/analyze') return analyze(body, env);
  if (url.pathname === '/api/style') return style(body, env);
  return fail('Route inconnue.', 404, 'not-found');
}

// ---------------- Appel Gemini ----------------
const API = 'https://generativelanguage.googleapis.com/v1beta';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Liste les modèles « flash » réellement disponibles pour cette clé (secours si les noms par défaut ont changé).
async function discoverModels(env, exclude) {
  try {
    const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const { models = [] } = await res.json();
    const score = (n) => (/latest/.test(n) ? 1000 : 0) + (parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0])[1]) || 0) * 10 - (/lite/.test(n) ? 5 : 0);
    return models
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|embed|robotics|computer|thinking|exp|preview-\d)/.test(n) && !exclude.includes(n))
      .sort((x, y) => score(y) - score(x))
      .slice(0, 3);
  } catch { return []; }
}

export async function callGemini(env, parts, schema, { temperature = 0.4, models: preferred = MODELS_STYLE } = {}) {
  const configured = (env.GEMINI_MODEL ? String(env.GEMINI_MODEL).split(',') : preferred).map((m) => m.trim()).filter(Boolean);
  const t0 = Date.now();
  let limited = 0, daily = false;
  const log = []; // ex. « gemini-flash-latest : 503 (overloaded) » — affiché pour comprendre une panne
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema } });

  const post = async (model) => {
    try {
      return await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body, signal: AbortSignal.timeout(25000),
      });
    } catch (e) { return { status: 0, ok: false, timeout: true, text: async () => '' }; }
  };

  const run = async (models) => {
    for (const model of models) {
      if (Date.now() - t0 > 45000) { log.push('délai dépassé'); break; }
      let res = await post(model);
      if ([0, 500, 502, 503, 504].includes(res.status)) { await sleep(1200); res = await post(model); } // surcharge passagère : un 2e essai
      if (res.status === 404) { log.push(`${model} : introuvable`); continue; }
      if (res.status === 429) {
        let t = ''; try { t = await res.text(); } catch { /* ignore */ }
        if (/PerDay/i.test(t)) daily = true;
        log.push(`${model} : quota gratuit atteint`); limited++;
        continue; // chaque modèle a son quota : on essaie le suivant
      }
      if (res.status === 400 || res.status === 403) {
        const t = await res.text();
        if (/API key|API_KEY|permission/i.test(t)) throw new GeminiError('Clé Gemini refusée par Google. Vérifie la clé enregistrée sur le serveur.', 502, 'bad-key');
        if (/location|region|not supported/i.test(t)) throw new GeminiError('L\'offre gratuite Gemini n\'est pas disponible dans cette région.', 502, 'region');
        log.push(`${model} : ${res.status} ${t.replace(/\s+/g, ' ').slice(0, 120)}`);
        continue; // ce modèle n'accepte pas la requête : on tente le suivant
      }
      if (!res.ok) {
        let t = ''; try { t = (await res.text()).replace(/\s+/g, ' ').slice(0, 120); } catch { /* ignore */ }
        log.push(`${model} : ${res.timeout ? 'trop lent' : res.status}${t ? ' ' + t : ''}`);
        continue;
      }
      const data = await res.json();
      const cand = data.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text) throw new GeminiError(cand?.finishReason === 'SAFETY' ? 'L\'IA a refusé d\'analyser cette image.' : 'L\'IA n\'a pas renvoyé de réponse.', 502, 'empty');
      try { return { result: JSON.parse(text), model }; }
      catch { throw new GeminiError('Réponse de l\'IA illisible. Réessaie.', 502, 'bad-output'); }
    }
    return null;
  };

  const first = await run(configured);
  if (first) return first;
  if (!env.GEMINI_MODEL) {
    const extra = await discoverModels(env, configured);
    if (extra.length) { const second = await run(extra); if (second) return second; }
  }
  if (limited > 0 && log.every((l) => /quota|introuvable/.test(l))) {
    throw new GeminiError(daily
      ? 'Quota gratuit du jour épuisé chez Google pour tous les modèles. Il se renouvelle chaque jour vers 9 h (heure de Paris). En attendant, remplis les champs à la main : les stickers et le styliste local marchent sans IA.'
      : 'Limite gratuite de l\'IA atteinte pour le moment. Réessaie dans une minute.', 429, 'rate-limit');
  }
  throw new GeminiError(`Service Gemini indisponible pour le moment. Détail : ${log.slice(-4).join(' ; ') || 'aucune réponse'}.`, 502, 'gemini-down');
}

class GeminiError extends Error { constructor(m, status, code) { super(m); this.status = status; this.code = code; } }
const geminiFail = (e) => (e instanceof GeminiError ? fail(e.message, e.status, e.code) : fail('Impossible de joindre Google Gemini.', 502, 'gemini-network'));

const S = (extra = {}) => ({ type: 'STRING', ...extra });
const E = (values, extra = {}) => ({ type: 'STRING', enum: values, ...extra });
const A = (items) => ({ type: 'ARRAY', items });

// ---------------- Reconnaissance d'un vêtement ----------------
const analyzeSchema = (gender) => ({
  type: 'OBJECT',
  properties: {
    isClothing: { type: 'BOOLEAN' },
    name: S({ description: 'Nom court et descriptif en français, ex. "Sweat à capuche gris"' }),
    category: E(ids(categoriesForGender(gender))),
    primaryColor: E(ids(COLORS)),
    secondaryColors: A(E(ids(COLORS))),
    fit: E(ids(FITS)),
    style: E(ids(STYLES)),
    seasons: A(E(ids(SEASONS))),
    visibleBrand: S({ nullable: true, description: 'Marque UNIQUEMENT si un logo ou une étiquette est clairement lisible, sinon null' }),
    confidence: E(['haute', 'moyenne', 'faible']),
    remark: S({ description: 'Une phrase : ce qui est incertain sur la photo' }),
  },
  required: ['isClothing', 'name', 'category', 'primaryColor', 'secondaryColors', 'fit', 'style', 'seasons', 'confidence', 'remark'],
});
const categoriesForGender = (g) => CATEGORIES.filter((c) => c.genders.includes(GENDERS.some((x) => x.id === g) ? g : 'm'));

async function analyze(body, env) {
  const gender = body?.gender;
  const image = String(body?.image || '');
  const mimeType = ['image/jpeg', 'image/png', 'image/webp'].includes(body?.mimeType) ? body.mimeType : 'image/jpeg';
  if (!image) return fail('Aucune image reçue.', 400, 'no-image');
  if (image.length > MAX_IMAGE_B64) return fail('Image trop lourde.', 413, 'too-big');

  const prompt = `Tu es un expert en mode. Analyse UNIQUEMENT le vêtement, la paire de chaussures ou l'accessoire principal visible sur la photo.
Règles strictes :
- N'invente jamais la marque, la taille ou la matière. "visibleBrand" = null sauf si un logo ou une étiquette est clairement lisible sur la photo.
- "category" parmi : ${categoriesForGender(gender).map((c) => `${c.id} (${c.label})`).join(', ')}.
- "primaryColor" = couleur dominante ; "secondaryColors" = 0 à 2 autres couleurs vraiment présentes. Un jean bleu = "denim".
- "fit" = coupe apparente (si on ne la voit pas bien, choisis "regular" et dis-le dans "remark").
- "style" parmi : ${STYLES.map((s) => s.id).join(', ')}.
- "seasons" = saisons où la pièce se porte naturellement (toutes les 4 si polyvalente).
- Si la photo ne montre pas de vêtement, mets isClothing=false.
- "name" en français, 2 à 5 mots, sans marque inventée.`;

  try {
    const { result, model } = await callGemini(env, [{ text: prompt }, { inlineData: { mimeType, data: image } }], analyzeSchema(gender), { temperature: 0.2, models: MODELS_ANALYZE });
    return json({ suggestion: sanitizeAnalysis(result), model });
  } catch (e) { return geminiFail(e); }
}

export function sanitizeAnalysis(r = {}) {
  const pick = (v, list, d) => (ids(list).includes(v) ? v : d);
  const primary = pick(r.primaryColor, COLORS, null);
  return {
    isClothing: r.isClothing !== false,
    name: String(r.name || '').slice(0, 60).trim(),
    category: pick(r.category, CATEGORIES, null),
    primaryColor: primary,
    secondaryColors: [...new Set((r.secondaryColors || []).filter((c) => ids(COLORS).includes(c) && c !== primary))].slice(0, 3),
    fit: pick(r.fit, FITS, null),
    style: pick(r.style, STYLES, null),
    seasons: [...new Set((r.seasons || []).filter((s) => ids(SEASONS).includes(s)))],
    brand: r.visibleBrand && String(r.visibleBrand).trim().toLowerCase() !== 'null' ? String(r.visibleBrand).slice(0, 40).trim() : null,
    confidence: ['haute', 'moyenne', 'faible'].includes(r.confidence) ? r.confidence : 'moyenne',
    remark: String(r.remark || '').slice(0, 240),
  };
}

// ---------------- Styliste IA ----------------
const OUTFIT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    outfits: A({
      type: 'OBJECT',
      properties: {
        title: S(),
        top: S({ nullable: true }), bottom: S({ nullable: true }), dress: S({ nullable: true }), shoes: S({ nullable: true }), outer: S({ nullable: true }), layer: S({ nullable: true }),
        accessories: A(S()),
        explanation: S(),
        rating: { type: 'INTEGER' },
        coherence: S(),
        variants: A({ type: 'OBJECT', properties: { slot: E(['top', 'bottom', 'dress', 'shoes', 'outer']), itemId: S(), note: S() }, required: ['slot', 'itemId', 'note'] }),
      },
      required: ['title', 'accessories', 'explanation', 'rating', 'coherence', 'variants'],
    }),
    missing: A(S()),
  },
  required: ['outfits', 'missing'],
};

const SLOT_OF = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.slot]));
const AVAILABLE = new Set(STATUSES.filter((s) => s.available).map((s) => s.id));

async function style(body, env) {
  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const req = body?.request || {};
  const weather = body?.weather || null;
  const exclude = Array.isArray(body?.excludeKeys) ? body.excludeKeys.slice(0, 20) : [];

  const available = items
    .filter((it) => it && typeof it.id === 'string' && AVAILABLE.has(it.status) && SLOT_OF[it.category])
    .map((it) => ({
      id: it.id, name: String(it.name || '').slice(0, 60), category: it.category, primaryColor: it.primaryColor,
      secondaryColors: (it.secondaryColors || []).slice(0, 3), fit: it.fit || null, style: it.style || null,
      seasons: it.seasons || [], status: it.status,
    }));
  if (!available.length) return json({ outfits: [], missing: ['Aucune pièce disponible (tout est au sale ou au lavage).'], dropped: 0 });

  const occasion = OCCASIONS.find((o) => o.id === req.occasion)?.label || req.occasion || 'non précisée';
  const weatherLine = weather?.source === 'live'
    ? `Météo réelle mesurée : ${weather.temp} °C ressentis (${weather.label || ''}${weather.rain ? ', pluie' : ''}).`
    : req.temp != null && req.temp !== '' ? `Température indiquée par l'utilisateur : ${req.temp} °C.` : 'Température non précisée : base-toi sur la saison.';

  const prompt = `Tu es le styliste personnel de l'utilisateur. Compose jusqu'à 3 tenues DIFFÉRENTES en utilisant EXCLUSIVEMENT les pièces de la liste JSON ci-dessous (toutes sont propres ou portées mais disponibles).

Demande :
- Style : ${req.style === 'mix' ? `mélange personnalisé — ${String(req.customStyle || 'libre').slice(0, 120)}` : req.style || 'libre'}
- Occasion : ${occasion}
- ${weatherLine}
- Saison : ${req.season || 'non précisée'}
- Formalité souhaitée (1 = très décontracté, 5 = très habillé) : ${req.formality ?? 'déduis-la de l\'occasion'}
- Couleurs à privilégier : ${(req.preferColors || []).join(', ') || 'aucune'}
- Couleurs à éviter : ${(req.avoidColors || []).join(', ') || 'aucune'}
- Pièces à porter absolument (ids) : ${(req.mustItems || []).join(', ') || 'aucune'}
- Chaussures imposées (id) : ${req.shoesId || 'aucune'}
${exclude.length ? `- Évite de reproposer exactement ces combinaisons (top-ou-robe|bottom|shoes|outer|layer) : ${exclude.join(' ; ')}` : ''}

Règles :
- Chaque champ top/bottom/shoes/outer/layer/accessories contient un "id" de la liste, jamais un nom ni une pièce inventée.
- Soit top + bottom, soit une robe seule : si "dress" est renseigné (catégorie robes), top et bottom restent null. Sinon top et bottom sont obligatoires.
- top = catégorie hauts/chemises/polos/pulls ; layer = un pull optionnel porté par-dessus le top ; bottom = pantalons/shorts/jogging/jupes ; shoes = chaussures ; outer = vestes (seulement si utile) ; accessories = accessoires (0 à 2).
- S'il manque une catégorie indispensable, mets null (shoes/outer) et explique-le dans "missing". N'invente rien.
- Respecte harmonie des couleurs (max une à deux couleurs fortes), cohérence des niveaux de formalité, proportions (volumes haut/bas) et météo.
- "explanation" : 2 phrases max en français, sur les couleurs et les coupes. "rating" : cohérence de 1 à 10, honnête. "coherence" : une phrase.
- "variants" : 0 à 3 remplacements possibles d'UNE pièce par une autre pièce de la liste.

Pièces disponibles :
${JSON.stringify(available)}`;

  let result, model;
  try { ({ result, model } = await callGemini(env, [{ text: prompt }], OUTFIT_SCHEMA, { temperature: 0.8 })); }
  catch (e) { return geminiFail(e); }
  const { outfits, dropped } = validateOutfits(result, available);
  return json({ outfits, missing: (result.missing || []).map(String).slice(0, 5), dropped, model });
}

// Vérifie que chaque pièce existe, est disponible et dans le bon emplacement. Rejette les tenues invalides.
export function validateOutfits(result, available) {
  const byId = new Map(available.map((it) => [it.id, it]));
  const ok = (id, slots) => id && byId.has(id) && slots.includes(SLOT_OF[byId.get(id).category]);
  let dropped = 0;
  const outfits = [];
  for (const o of result?.outfits || []) {
    const isDress = !!o.dress;
    if (isDress ? !ok(o.dress, ['dress']) : (!ok(o.top, ['top']) || !ok(o.bottom, ['bottom']))) { dropped++; continue; }
    if (o.shoes && !ok(o.shoes, ['shoes'])) { dropped++; continue; }
    if (o.outer && !ok(o.outer, ['outer'])) { dropped++; continue; }
    const layer = o.layer && ok(o.layer, ['top']) && byId.get(o.layer).category === 'pulls' && o.layer !== o.top ? o.layer : null;
    const accessories = [...new Set((o.accessories || []).filter((id) => ok(id, ['accessory'])))].slice(0, 2);
    const slots = { top: isDress ? null : o.top, dress: isDress ? o.dress : null, bottom: isDress ? null : o.bottom, shoes: o.shoes || null, outer: o.outer || null, layer, accessories };
    const slotMap = { top: ['top'], bottom: ['bottom'], dress: ['dress'], shoes: ['shoes'], outer: ['outer'] };
    const variants = (o.variants || []).filter((v) => slotMap[v.slot] && ok(v.itemId, slotMap[v.slot]) && v.itemId !== slots[v.slot])
      .map((v) => ({ slot: v.slot, itemId: v.itemId, note: String(v.note || '').slice(0, 160) })).slice(0, 3);
    outfits.push({
      slots,
      title: String(o.title || 'Tenue').slice(0, 50),
      explanation: String(o.explanation || '').slice(0, 400),
      rating: Math.max(1, Math.min(10, Math.round(Number(o.rating) || 6))),
      coherence: String(o.coherence || '').slice(0, 200),
      variants,
      key: `${slots.top || slots.dress}|${slots.bottom}|${slots.shoes}|${slots.outer}|${slots.layer}`,
    });
  }
  return { outfits, dropped };
}
