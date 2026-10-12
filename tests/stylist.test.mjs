import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOutfits, pickNext, colorHarmony } from '../public/js/stylist.js';

const mk = (id, category, primaryColor, extra = {}) => ({ id, name: id, category, primaryColor, secondaryColors: [], fit: 'regular', style: 'casual', seasons: [], status: 'propre', ...extra });

const wardrobe = () => [
  mk('tee-blanc', 'hauts', 'blanc', { style: 'streetwear', fit: 'oversize' }),
  mk('tee-rouge', 'hauts', 'rouge'),
  mk('chemise', 'chemises', 'bleu-clair', { style: 'smart-casual' }),
  mk('pull', 'pulls', 'gris'),
  mk('jean', 'pantalons', 'denim', { fit: 'slim' }),
  mk('chino', 'pantalons', 'beige', { style: 'smart-casual' }),
  mk('short', 'shorts', 'noir'),
  mk('jog', 'jogging', 'gris', { style: 'sportif' }),
  mk('sneakers', 'chaussures', 'blanc', { style: 'streetwear' }),
  mk('derbies', 'chaussures', 'marron', { style: 'elegant' }),
  mk('veste', 'vestes', 'noir'),
  mk('casquette', 'accessoires', 'noir', { style: 'streetwear' }),
];
const allIds = (o) => [o.slots.top, o.slots.bottom, o.slots.shoes, o.slots.outer, o.slots.layer, ...o.slots.accessories].filter(Boolean);

test('ne recommande jamais une pièce sale ou au lavage', () => {
  const items = wardrobe();
  items.find((i) => i.id === 'tee-blanc').status = 'sale';
  items.find((i) => i.id === 'jean').status = 'lavage';
  items.find((i) => i.id === 'sneakers').status = 'sale';
  const res = generateOutfits(items, { style: 'streetwear', occasion: 'sortie', temp: 15 });
  assert.ok(res.outfits.length > 0);
  for (const o of res.outfits) for (const id of allIds(o)) {
    assert.ok(!['tee-blanc', 'jean', 'sneakers'].includes(id), `pièce indisponible utilisée : ${id}`);
  }
});

test('n\'utilise que des pièces enregistrées', () => {
  const items = wardrobe();
  const known = new Set(items.map((i) => i.id));
  const res = generateOutfits(items, { style: 'casual', occasion: 'quotidien', temp: 20 });
  for (const o of res.outfits) for (const id of allIds(o)) assert.ok(known.has(id));
});

test('signale clairement une catégorie manquante', () => {
  const items = wardrobe().filter((i) => !['pantalons', 'shorts', 'jogging'].includes(i.category));
  const res = generateOutfits(items, { style: 'casual', occasion: 'quotidien', temp: 20 });
  assert.equal(res.outfits.length, 0);
  assert.ok(res.missing.some((m) => m.slot === 'bottom' && /Aucun bas/.test(m.reason)));
});

test('distingue « tout est au sale » de « rien d\'enregistré »', () => {
  const items = wardrobe().map((i) => (i.category === 'chaussures' ? { ...i, status: 'sale' } : i));
  const res = generateOutfits(items, { style: 'casual', temp: 20 });
  assert.ok(res.missing.some((m) => m.slot === 'shoes' && /au sale/.test(m.reason)));
  assert.ok(res.outfits.length > 0, 'une tenue sans chaussures reste proposée');
  assert.ok(res.outfits.every((o) => o.slots.shoes === null));
});

test('respecte la météo : pas de short à 8 °C, veste ajoutée', () => {
  const res = generateOutfits(wardrobe(), { style: 'casual', occasion: 'quotidien', temp: 8 });
  for (const o of res.outfits) assert.notEqual(o.slots.bottom, 'short');
  assert.equal(res.outfits[0].slots.outer, 'veste');
});

test('respecte les pièces et chaussures imposées', () => {
  const res = generateOutfits(wardrobe(), { style: 'elegant', occasion: 'mariage', mustItems: ['chemise'], shoesId: 'derbies', temp: 20 });
  for (const o of res.outfits) { assert.equal(o.slots.top, 'chemise'); assert.equal(o.slots.shoes, 'derbies'); }
});

test('couleurs à éviter exclues', () => {
  const res = generateOutfits(wardrobe(), { style: 'casual', avoidColors: ['rouge', 'denim'], temp: 20 });
  for (const o of res.outfits) { assert.notEqual(o.slots.top, 'tee-rouge'); assert.notEqual(o.slots.bottom, 'jean'); }
});

test('formalité : un mariage évite jogging et baskets si possible', () => {
  const res = generateOutfits(wardrobe(), { style: 'elegant', occasion: 'mariage', temp: 20 });
  const best = res.outfits[0];
  assert.notEqual(best.slots.bottom, 'jog');
  assert.equal(best.slots.shoes, 'derbies');
});

test('harmonie : rouge + rose pénalisé, base neutre favorisée', () => {
  const clash = colorHarmony([{ primaryColor: 'rouge' }, { primaryColor: 'rose' }]);
  const neutral = colorHarmony([{ primaryColor: 'noir' }, { primaryColor: 'blanc' }]);
  assert.ok(clash.score < neutral.score);
});

test('« autre proposition » change de tenue', () => {
  const res = generateOutfits(wardrobe(), { style: 'casual', temp: 20 });
  const a = pickNext(res.outfits, [], () => 0);
  const b = pickNext(res.outfits, [a.key], () => 0);
  assert.notEqual(a.key, b.key);
});

test('chaque tenue a une explication, une note et des variantes valides', () => {
  const items = wardrobe();
  const res = generateOutfits(items, { style: 'streetwear', occasion: 'sortie', temp: 16 });
  const o = res.outfits[0];
  assert.ok(o.explanation.length > 20);
  assert.ok(o.rating >= 1 && o.rating <= 10);
  for (const v of o.variants) assert.ok(items.some((i) => i.id === v.itemId && i.status === 'propre'));
});

test('profil féminin : une robe forme une tenue complète (robe + chaussures)', () => {
  const items = [
    mk('robe-noire', 'robes', 'noir', { style: 'chic' }),
    mk('robe-rouge', 'robes', 'rouge', { style: 'elegant' }),
    mk('talons', 'chaussures', 'noir', { style: 'elegant' }),
    mk('manteau', 'vestes', 'camel'),
  ];
  const res = generateOutfits(items, { style: 'elegant', occasion: 'mariage', temp: 8 });
  assert.ok(res.outfits.length > 0);
  for (const o of res.outfits) {
    assert.ok(o.slots.dress && !o.slots.top && !o.slots.bottom);
    assert.equal(o.slots.shoes, 'talons');
  }
  assert.equal(res.outfits[0].slots.outer, 'manteau');
});

test('robe sale : aucune robe proposée, pas de tenue inventée', () => {
  const items = [mk('robe', 'robes', 'noir', { status: 'sale' }), mk('talons', 'chaussures', 'noir')];
  const res = generateOutfits(items, { style: 'chic', temp: 20 });
  assert.equal(res.outfits.length, 0);
});

test('jupe + haut : jupe traitée comme un bas', () => {
  const items = [mk('top', 'hauts', 'blanc'), mk('jupe', 'jupes', 'noir'), mk('baskets', 'chaussures', 'blanc')];
  const res = generateOutfits(items, { style: 'casual', temp: 22 });
  assert.equal(res.outfits[0].slots.bottom, 'jupe');
});

test('robe et hauts/bas mélangés : les deux types de tenues sont proposés', () => {
  const items = [...wardrobe(), mk('robe', 'robes', 'noir', { style: 'casual' })];
  const res = generateOutfits(items, { style: 'casual', temp: 22 });
  assert.ok(res.outfits.some((o) => o.slots.dress) && res.outfits.some((o) => o.slots.top));
});
