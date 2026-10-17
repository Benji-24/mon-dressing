import test from 'node:test';
import assert from 'node:assert/strict';
import { addHistory, filterHistory, summary, chartSVG } from '../public/js/progress.js';
import { bodyMetrics, slotBox, skinHex, AVATAR } from '../public/js/avatar.js';
import { generateOutfits } from '../public/js/stylist.js';

test('historique : ajout, plafond, notes bornées', () => {
  let h = [];
  for (let i = 0; i < 450; i++) h = addHistory(h, { rating: 7, source: 'ai', title: 't' + i, at: new Date(2026, 0, 1, 0, i).toISOString() });
  assert.equal(h.length, 400);
  assert.equal(addHistory([], { rating: 0 }).length, 0);
  assert.equal(addHistory([], { rating: 99 })[0].rating, 10);
});

test('résumé et tendance', () => {
  const mk = (r, src = 'ai') => ({ at: '2026-10-01T00:00:00Z', source: src, rating: r, title: 'x' });
  const list = [5, 5, 5, 5, 5, 8, 8, 8, 8, 8].map((r) => mk(r));
  const s = summary(list);
  assert.equal(s.count, 10); assert.equal(s.best, 8); assert.equal(s.avg, 6.5); assert.equal(s.trend, 3);
  assert.equal(summary([]).count, 0);
  assert.equal(filterHistory([mk(5, 'ai'), mk(6, 'local')], 'ai').length, 1);
  assert.equal(filterHistory([mk(5, 'ai'), mk(6, 'local')], 'all').length, 2);
});

test('courbe SVG : un point par tenue, échelle 1 → 10, vide sans erreur', () => {
  const list = [3, 7, 10].map((r, i) => ({ at: `2026-10-0${i + 1}T00:00:00Z`, source: 'ai', rating: r, title: 'T' + i }));
  const svg = chartSVG(list);
  assert.equal((svg.match(/class="ch-dot"/g) || []).length, 3);
  assert.equal((svg.match(/class="ch-hit"/g) || []).length, 3);
  assert.match(svg, /moy\. 6,7/);
  assert.ok(chartSVG([]).startsWith('<svg'));
  assert.ok(chartSVG([list[0]]).includes('ch-dot'));
});

test('avatar : les proportions suivent la taille et le poids', () => {
  const slim = bodyMetrics({ height: 180, weight: 60 });
  const big = bodyMetrics({ height: 180, weight: 110 });
  assert.ok(big.sw > slim.sw && big.hw > slim.hw && big.u === slim.u);
  assert.ok(bodyMetrics({ height: 195 }).u > bodyMetrics({ height: 155 }).u);
  assert.ok(bodyMetrics({ height: 195 }).u <= AVATAR.MAXH);
  assert.ok(Number.isFinite(bodyMetrics({}).sw), 'valeurs par défaut sans données');
  assert.notEqual(skinHex('fonce'), skinHex('tres-clair'));
});

test('avatar : chaque pièce a une zone cohérente avec son rôle', () => {
  const m = bodyMetrics({ height: 175, weight: 70 });
  const top = slotBox({ role: 'top' }, m), bottom = slotBox({ role: 'bottom', category: 'pantalons' }, m), shoes = slotBox({ role: 'shoes' }, m);
  assert.ok(top.y < bottom.y && bottom.y < shoes.y);
  assert.ok(Math.abs(shoes.y + shoes.h - AVATAR.FEET) < 1, 'les chaussures touchent le sol');
  const cap = slotBox({ role: 'accessory', name: 'Casquette NY' }, m);
  assert.ok(cap.y < top.y, 'la casquette est sur la tête');
  assert.ok(slotBox({ role: 'accessory', name: 'Montre' }, m).x < m.cx - m.sw, 'la montre est au poignet');
  assert.ok(slotBox({ role: 'bottom', category: 'shorts' }, m).h < bottom.h, 'un short est plus court qu\'un pantalon');
});

test('styliste local : le style préféré du profil départage à égalité', () => {
  const mk = (id, cat, style) => ({ id, name: id, category: cat, primaryColor: 'noir', style, status: 'propre', seasons: ['automne'], fit: 'regular' });
  const items = [mk('t1', 'hauts', 'casual'), mk('t2', 'hauts', 'sportif'), mk('p1', 'pantalons', 'casual'), mk('s1', 'chaussures', 'casual')];
  const a = generateOutfits(items, { occasion: 'quotidien', season: 'automne', prefStyles: ['sportif'] });
  const b = generateOutfits(items, { occasion: 'quotidien', season: 'automne', prefStyles: ['casual'] });
  assert.ok(a.outfits.length && b.outfits.length);
  assert.equal(b.outfits[0].slots.top, 't1');
});

const mkItem = (id, cat, extra = {}) => ({ id, name: id, category: cat, primaryColor: 'noir', style: 'casual', status: 'propre', seasons: ['automne'], fit: 'regular', ...extra });

test('styliste local : une pièce « jamais » n\'est jamais proposée (sauf imposée)', () => {
  const items = [mkItem('t', 'hauts'), mkItem('jogging', 'jogging', { wearPref: 'never' }), mkItem('jean', 'pantalons'), mkItem('s', 'chaussures')];
  for (let i = 0; i < 5; i++) {
    const r = generateOutfits(items, { occasion: 'quotidien', season: 'automne' });
    assert.equal(r.outfits[0].slots.bottom, 'jean');
  }
  const forced = generateOutfits(items, { occasion: 'quotidien', season: 'automne', mustItems: ['jogging'] });
  assert.equal(forced.outfits[0].slots.bottom, 'jogging');
  assert.ok(forced.warnings.some((w) => /Jamais/.test(w)));
});

test('styliste local : « jamais » sur tous les bas → message explicite, rien d\'inventé', () => {
  const items = [mkItem('t', 'hauts'), mkItem('jogging', 'jogging', { wearPref: 'never' }), mkItem('s', 'chaussures')];
  const r = generateOutfits(items, { occasion: 'quotidien', season: 'automne' });
  assert.equal(r.outfits.length, 0);
  assert.ok(r.missing.some((m) => /Jamais/.test(m.reason)));
});

test('styliste local : « rarement » passe après, « souvent » avant', () => {
  const base = [mkItem('t', 'hauts'), mkItem('s', 'chaussures')];
  const a = generateOutfits([...base, mkItem('jogging', 'jogging', { wearPref: 'rare' }), mkItem('jean', 'pantalons')], { occasion: 'quotidien', season: 'automne' });
  assert.equal(a.outfits[0].slots.bottom, 'jean');
  const b = generateOutfits([...base, mkItem('jogging', 'jogging', { wearPref: 'often' }), mkItem('jean', 'pantalons')], { occasion: 'quotidien', season: 'automne' });
  assert.equal(b.outfits[0].slots.bottom, 'jogging');
});
