// Avatar généré par IA : extraction de l'image dans la réponse de Gemini (le serveur la transmet telle quelle).

/** Retourne { mime, data } ou lève une erreur lisible (refus de sécurité, texte sans image…). */
export function extractImage(res) {
  const block = res?.promptFeedback?.blockReason;
  if (block) throw new Error('Google a refusé cette demande (règles de sécurité). Essaie sans photo de visage ou avec une autre tenue.');
  const cand = res?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  for (const p of parts) {
    const d = p.inlineData || p.inline_data;
    if (d?.data && /^image\//.test(d.mimeType || d.mime_type || '')) return { mime: d.mimeType || d.mime_type, data: d.data };
  }
  if (/SAFETY|PROHIBITED|BLOCK/i.test(cand?.finishReason || '')) throw new Error('L\'IA a refusé de générer cette image (règles de sécurité de Google). Essaie sans photo de visage ou avec une autre tenue.');
  const text = parts.map((p) => p.text || '').join(' ').replace(/\s+/g, ' ').trim();
  throw new Error(text ? `L'IA n'a pas produit d'image : « ${text.slice(0, 160)} »` : 'L\'IA n\'a pas renvoyé d\'image. Réessaie.');
}

export function b64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
