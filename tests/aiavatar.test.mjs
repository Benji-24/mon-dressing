import test from 'node:test';
import assert from 'node:assert/strict';
import { extractImage } from '../public/js/aiavatar.js';

test('extractImage : trouve l\'image même après du texte', () => {
  const r = extractImage({ candidates: [{ content: { parts: [{ text: 'Voilà' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] });
  assert.deepEqual(r, { mime: 'image/png', data: 'AAAA' });
  assert.equal(extractImage({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: 'BB' } }] } }] }).mime, 'image/jpeg');
});

test('extractImage : refus de sécurité, texte seul, réponse vide → messages clairs', () => {
  assert.throws(() => extractImage({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }), /règles de sécurité/);
  assert.throws(() => extractImage({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }), /refusé/);
  assert.throws(() => extractImage({ candidates: [{ content: { parts: [{ text: 'Je ne peux pas créer cette image.' }] } }] }), /n'a pas produit d'image.*Je ne peux pas/);
  assert.throws(() => extractImage({}), /n'a pas renvoyé d'image/);
  assert.throws(() => extractImage({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'text/html', data: 'x' } }] } }] }), /n'a pas/);
});
