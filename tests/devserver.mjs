// Serveur de test local : sert public/ et le vrai code du Worker, avec un FAUX Gemini.
// Usage : node tests/devserver.mjs [port]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.argv[2] || 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const realFetch = globalThis.fetch;
export const stats = { gemini: 0 };

// Faux Gemini : répond de façon déterministe, et propose volontairement une pièce inventée
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
  stats.gemini++;
  const body = JSON.parse(init.body);
  const parts = body.contents[0].parts;
  if (body.generationConfig?.responseModalities?.includes('IMAGE')) {
    // Faux modèle d'image : on mémorise ce qui a été envoyé (pour vérifier la confidentialité) et on renvoie un PNG 1×1
    stats.avatar = { images: parts.filter((p) => p.inlineData).length, withFace: /same identity/.test(parts[0].text), prompt: parts[0].text };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } }] } }] }), { headers: { 'content-type': 'application/json' } });
  }
  let out;
  if (parts.some((p) => p.inlineData)) {
    out = { isClothing: true, name: 'Sweat à capuche gris', category: 'pulls', primaryColor: 'gris', secondaryColors: ['noir'], fit: 'oversize', style: 'streetwear', seasons: ['automne', 'hiver'], visibleBrand: null, confidence: 'haute', remark: 'Coupe estimée sur photo à plat.' };
  } else {
    const list = JSON.parse(parts[0].text.split('Pièces disponibles :\n')[1]);
    const of = (cats) => list.filter((i) => cats.includes(i.category));
    const tops = of(['hauts', 'chemises', 'polos', 'pulls']), bottoms = of(['pantalons', 'shorts', 'jogging']), shoes = of(['chaussures']);
    out = { missing: shoes.length ? [] : ['Aucune chaussure disponible.'], outfits: [
      { title: 'Look inventé', top: tops[0]?.id, bottom: 'jean-imaginaire', shoes: shoes[0]?.id || null, accessories: [], explanation: 'x', rating: 9, coherence: 'x', variants: [] },
      ...tops.slice(0, 2).map((t, i) => ({ title: `Street IA ${i + 1}`, top: t.id, bottom: bottoms[i % bottoms.length]?.id, shoes: shoes[0]?.id || null, outer: null, accessories: [], explanation: 'Base neutre et volumes équilibrés (réponse simulée pour les tests).', rating: 8, coherence: 'Cohérent.', variants: bottoms[1] ? [{ slot: 'bottom', itemId: bottoms[(i + 1) % bottoms.length].id, note: 'Autre bas' }] : [] })),
    ] };
  }
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { headers: { 'content-type': 'application/json' } });
};

const env = {
  GEMINI_API_KEY: 'fausse-cle-de-test',
  APP_PASSWORD: 'test',
  ASSETS: {
    async fetch(req) {
      let p = decodeURIComponent(new URL(req.url).pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT)) return new Response('Interdit', { status: 403 });
      try { return new Response(await readFile(file), { headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } }); }
      catch { return new Response('Not found', { status: 404 }); }
    },
  },
};

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (req.url === '/__stats') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(stats)); return; }
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const r = await worker.fetch(request, env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`DRIP test sur http://localhost:${PORT}`));
