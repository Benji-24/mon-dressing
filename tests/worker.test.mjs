// Teste le serveur avec un faux Gemini (aucun appel réel à Google).
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validateOutfits, sanitizeAnalysis } from '../src/worker.js';

const ENV = { GEMINI_API_KEY: 'cle-secrete-test', APP_PASSWORD: 'motdepasse', ASSETS: { fetch: () => new Response('asset') } };
const post = (path, body, pw = 'motdepasse') => new Request(`https://drip.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-drip-password': pw }, body: JSON.stringify(body) });

function mockGemini(payload, { status = 200, capture } = {}) {
  globalThis.fetch = async (url, init) => {
    capture?.push({ url, init });
    if (typeof payload === 'function') return payload(url, init);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status });
  };
}

test('health indique la configuration sans exposer la clé', async () => {
  const res = await worker.fetch(new Request('https://drip.example/api/health', { headers: { 'x-drip-password': 'motdepasse' } }), ENV);
  const text = await res.text();
  assert.ok(!text.includes('cle-secrete-test'));
  const j = JSON.parse(text);
  assert.deepEqual(j.configured, { password: true, ai: true });
  assert.equal(j.authorized, true);
});

test('mauvais mot de passe refusé', async () => {
  const res = await worker.fetch(post('/api/analyze', { image: 'aaa' }, 'faux'), ENV);
  assert.equal(res.status, 401);
});

test('pas de clé configurée : message clair', async () => {
  const res = await worker.fetch(post('/api/analyze', { image: 'aaa' }), { ...ENV, GEMINI_API_KEY: '' });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /GEMINI_API_KEY/);
});

test('analyse : la clé part dans un en-tête vers Google, résultat nettoyé', async () => {
  const calls = [];
  mockGemini({ isClothing: true, name: 'Sweat gris', category: 'pulls', primaryColor: 'gris', secondaryColors: ['gris', 'inconnu', 'noir'], fit: 'oversize', style: 'streetwear', seasons: ['automne', 'hiver'], visibleBrand: null, confidence: 'haute', remark: 'ok' }, { capture: calls });
  const res = await worker.fetch(post('/api/analyze', { image: 'QUJD', mimeType: 'image/jpeg' }), ENV);
  assert.equal(res.status, 200);
  const { suggestion } = await res.json();
  assert.equal(suggestion.category, 'pulls');
  assert.deepEqual(suggestion.secondaryColors, ['noir']);
  assert.equal(suggestion.brand, null);
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'cle-secrete-test');
  assert.ok(!calls[0].url.includes('cle-secrete-test'));
});

test('modèle introuvable (404) : bascule sur le modèle suivant', async () => {
  let n = 0;
  mockGemini((url) => {
    n++;
    if (n === 1) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ isClothing: true, name: 'x', category: 'hauts', primaryColor: 'noir', secondaryColors: [], fit: 'regular', style: 'casual', seasons: [], confidence: 'moyenne', remark: '' }) }] } }] }));
  });
  const res = await worker.fetch(post('/api/analyze', { image: 'QUJD' }), ENV);
  assert.equal(res.status, 200);
  assert.equal(n, 2);
});

test('quota gratuit dépassé (429) : message compréhensible', async () => {
  mockGemini(() => new Response('{}', { status: 429 }));
  const res = await worker.fetch(post('/api/analyze', { image: 'QUJD' }), ENV);
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /Limite gratuite/);
});

test('styliste : les pièces inventées ou sales sont rejetées', async () => {
  const items = [
    { id: 'a', name: 'Tee', category: 'hauts', primaryColor: 'blanc', status: 'propre' },
    { id: 'b', name: 'Jean', category: 'pantalons', primaryColor: 'denim', status: 'propre' },
    { id: 'c', name: 'Baskets', category: 'chaussures', primaryColor: 'blanc', status: 'propre' },
    { id: 'd', name: 'Chino sale', category: 'pantalons', primaryColor: 'beige', status: 'sale' },
  ];
  const calls = [];
  mockGemini({ missing: [], outfits: [
    { title: 'OK', top: 'a', bottom: 'b', shoes: 'c', outer: null, accessories: ['zzz'], explanation: 'e', rating: 8, coherence: 'c', variants: [{ slot: 'bottom', itemId: 'd', note: 'sale' }] },
    { title: 'Inventée', top: 'a', bottom: 'pantalon-imaginaire', shoes: 'c', accessories: [], explanation: 'e', rating: 9, coherence: 'c', variants: [] },
    { title: 'Sale', top: 'a', bottom: 'd', shoes: 'c', accessories: [], explanation: 'e', rating: 9, coherence: 'c', variants: [] },
    { title: 'Mauvais emplacement', top: 'b', bottom: 'a', shoes: 'c', accessories: [], explanation: 'e', rating: 9, coherence: 'c', variants: [] },
  ] }, { capture: calls });
  const res = await worker.fetch(post('/api/style', { request: { style: 'casual', occasion: 'cours', temp: 18 }, items }), ENV);
  const j = await res.json();
  assert.equal(j.outfits.length, 1);
  assert.equal(j.dropped, 3);
  assert.deepEqual(j.outfits[0].slots.accessories, []);
  assert.equal(j.outfits[0].variants.length, 0);
  const prompt = JSON.parse(calls[0].init.body).contents[0].parts[0].text;
  assert.ok(!prompt.includes('Chino sale'), 'les pièces sales ne sont même pas envoyées à l\'IA');
  assert.match(prompt, /Température indiquée par l'utilisateur : 18/);
});

test('styliste : météo réelle mentionnée seulement si fournie', async () => {
  const calls = [];
  mockGemini({ missing: [], outfits: [] }, { capture: calls });
  const items = [{ id: 'a', name: 'Tee', category: 'hauts', primaryColor: 'blanc', status: 'propre' }];
  await worker.fetch(post('/api/style', { request: { temp: 12 }, items, weather: { source: 'live', temp: 9, label: 'Pluie', rain: true } }), ENV);
  const prompt = JSON.parse(calls[0].init.body).contents[0].parts[0].text;
  assert.match(prompt, /Météo réelle mesurée : 9 °C/);
});

test('sanitizeAnalysis ignore les valeurs hors liste', () => {
  const s = sanitizeAnalysis({ category: 'robe-de-soiree', primaryColor: 'fuchsia', visibleBrand: 'null' });
  assert.equal(s.category, null); assert.equal(s.primaryColor, null); assert.equal(s.brand, null);
});

test('les fichiers de l\'app sont servis par ASSETS', async () => {
  const res = await worker.fetch(new Request('https://drip.example/index.html'), ENV);
  assert.equal(await res.text(), 'asset');
});

test('styliste IA : une robe valide est acceptée, une robe utilisée comme haut est rejetée', () => {
  const available = [
    { id: 'r', name: 'Robe', category: 'robes', status: 'propre' },
    { id: 's', name: 'Talons', category: 'chaussures', status: 'propre' },
    { id: 't', name: 'Top', category: 'hauts', status: 'propre' },
    { id: 'j', name: 'Jupe', category: 'jupes', status: 'propre' },
  ];
  const { outfits, dropped } = validateOutfits({ outfits: [
    { title: 'Robe', dress: 'r', shoes: 's', accessories: [], explanation: 'e', rating: 8, coherence: 'c', variants: [] },
    { title: 'Faux', top: 'r', bottom: 'j', shoes: 's', accessories: [], explanation: 'e', rating: 8, coherence: 'c', variants: [] },
    { title: 'Jupe', top: 't', bottom: 'j', shoes: 's', accessories: [], explanation: 'e', rating: 8, coherence: 'c', variants: [] },
  ] }, available);
  assert.equal(outfits.length, 2); assert.equal(dropped, 1);
  assert.equal(outfits[0].slots.dress, 'r');
});

test('analyse : le profil masculin n\'autorise pas les robes dans le schéma envoyé', async () => {
  const calls = [];
  mockGemini({ isClothing: true, name: 'x', category: 'hauts', primaryColor: 'noir', secondaryColors: [], fit: 'regular', style: 'casual', seasons: [], confidence: 'haute', remark: '' }, { capture: calls });
  await worker.fetch(post('/api/analyze', { image: 'QUJD', gender: 'm' }), ENV);
  const enumM = JSON.parse(calls[0].init.body).generationConfig.responseSchema.properties.category.enum;
  assert.ok(!enumM.includes('robes') && enumM.includes('hauts'));
  await worker.fetch(post('/api/analyze', { image: 'QUJD', gender: 'f' }), ENV);
  const enumF = JSON.parse(calls[1].init.body).generationConfig.responseSchema.properties.category.enum;
  assert.ok(enumF.includes('robes') && enumF.includes('jupes'));
});

const OK_ANALYSIS = { isClothing: true, name: 'x', category: 'hauts', primaryColor: 'noir', secondaryColors: [], fit: 'regular', style: 'casual', seasons: [], confidence: 'haute', remark: '' };
const okBody = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(OK_ANALYSIS) }] } }] }));

test('surcharge passagère (503) : un second essai réussit', async () => {
  let n = 0;
  mockGemini(() => (++n === 1 ? new Response('overloaded', { status: 503 }) : okBody()));
  const res = await worker.fetch(post('/api/analyze', { image: 'QUJD' }), ENV);
  assert.equal(res.status, 200); assert.equal(n, 2);
});

test('noms de modèles périmés : découverte automatique d\'un modèle flash disponible', async () => {
  const used = [];
  mockGemini((url) => {
    if (String(url).includes('/models?')) return new Response(JSON.stringify({ models: [
      { name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-9-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/embedding-1', supportedGenerationMethods: ['embedContent'] },
    ] }));
    used.push(String(url));
    return String(url).includes('gemini-9-flash:') ? okBody() : new Response('nf', { status: 404 });
  });
  const res = await worker.fetch(post('/api/analyze', { image: 'QUJD' }), ENV);
  assert.equal(res.status, 200);
  assert.ok(used.some((u) => u.includes('gemini-9-flash:')) && !used.some((u) => u.includes('image')));
});

test('panne Google persistante : le message donne le détail', async () => {
  mockGemini((url) => (String(url).includes('/models?') ? new Response('{}', { status: 500 }) : new Response('{"error":{"message":"The model is overloaded"}}', { status: 503 })));
  const res = await worker.fetch(post('/api/analyze', { image: 'QUJD' }), ENV);
  assert.equal(res.status, 502);
  const j = await res.json();
  assert.match(j.error, /503/); assert.match(j.error, /overloaded/);
});
