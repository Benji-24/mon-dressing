// Stockage persistant sur l'appareil (IndexedDB) : vêtements, photos, tenues.
// Les photos sont stockées en ArrayBuffer (format le plus fiable sur Safari iOS).

const DB_NAME = 'drip';
const DB_VERSION = 1;
const STORES = ['items', 'photos', 'outfits', 'meta'];
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('Stockage indisponible sur ce navigateur.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('outfits')) d.createObjectStore('outfits', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => d.close();
      resolve(d);
    };
    req.onerror = () => reject(req.error || new Error('Impossible d\'ouvrir la base de données.'));
    req.onblocked = () => reject(new Error('Base de données bloquée : ferme les autres onglets de l\'app.'));
  });
  return dbPromise;
}

function run(storeNames, mode, fn) {
  return openDB().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error || new Error('Erreur de stockage.'));
    t.onabort = () => reject(t.error || new Error('Écriture annulée (espace de stockage plein ?).'));
    const stores = Array.isArray(storeNames) ? storeNames.map((n) => t.objectStore(n)) : [t.objectStore(storeNames)];
    Promise.resolve(fn(...stores)).then((r) => { result = r; }).catch(reject);
  }));
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  all: (store) => run(store, 'readonly', (s) => reqP(s.getAll())),
  get: (store, id) => run(store, 'readonly', (s) => reqP(s.get(id))),
  put: (store, value) => run(store, 'readwrite', (s) => { s.put(value); return value; }),
  putMany: (store, values) => run(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); return values.length; }),
  del: (store, id) => run(store, 'readwrite', (s) => { s.delete(id); }),
  delMany: (store, keys) => run(store, 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); }),
  clearAll: () => run(STORES, 'readwrite', (...stores) => { stores.forEach((s) => s.clear()); }),
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- Photos ----------
const urlCache = new Map();

export async function savePhoto(blob) {
  const id = uid();
  const data = await blob.arrayBuffer();
  await db.put('photos', { id, type: blob.type || 'image/jpeg', data });
  return id;
}

export async function photoURL(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await db.get('photos', id);
  if (!rec) return null;
  const url = URL.createObjectURL(new Blob([rec.data], { type: rec.type }));
  urlCache.set(id, url);
  return url;
}

export async function deletePhotos(ids) {
  if (!ids?.length) return;
  ids.forEach((id) => { const u = urlCache.get(id); if (u) URL.revokeObjectURL(u); urlCache.delete(id); });
  await db.delMany('photos', ids);
}

// ---------- Sauvegarde / restauration ----------
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function exportAll() {
  const [items, outfits, photos, profile, me, history] = await Promise.all([db.all('items'), db.all('outfits'), db.all('photos'), getMeta('profile'), getMeta('me'), getMeta('history')]);
  const payload = {
    profile,
    me: me || null,
    history: history || [],
    app: 'DRIP',
    format: 1,
    exportedAt: new Date().toISOString(),
    items,
    outfits,
    photos: photos.map((p) => ({ id: p.id, type: p.type, data: bufToB64(p.data) })),
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function importAll(text, mode = 'merge') {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Ce fichier n\'est pas une sauvegarde valide (JSON illisible).'); }
  if (!data || data.app !== 'DRIP' || !Array.isArray(data.items)) throw new Error('Ce fichier n\'est pas une sauvegarde DRIP.');
  const photos = (data.photos || []).map((p) => ({ id: p.id, type: p.type || 'image/jpeg', data: b64ToBuf(p.data) }));
  if (mode === 'replace') {
    urlCache.forEach((u) => URL.revokeObjectURL(u)); urlCache.clear();
    await db.clearAll();
  }
  await db.putMany('photos', photos);
  await db.putMany('items', data.items);
  await db.putMany('outfits', data.outfits || []);
  if (data.profile && (mode === 'replace' || !(await getMeta('profile')))) await setMeta('profile', data.profile);
  if (data.me && (mode === 'replace' || !(await getMeta('me')))) await setMeta('me', data.me);
  if (Array.isArray(data.history) && data.history.length) {
    const have = mode === 'replace' ? [] : (await getMeta('history')) || [];
    const seen = new Set(have.map((h) => h.at));
    await setMeta('history', [...have, ...data.history.filter((h) => !seen.has(h.at))].sort((a, b) => a.at.localeCompare(b.at)).slice(-400));
  }
  return { items: data.items.length, outfits: (data.outfits || []).length, photos: photos.length };
}

export async function storageInfo() {
  const info = { persisted: null, usage: null, quota: null };
  try {
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); info.usage = e.usage; info.quota = e.quota; }
  } catch { /* non supporté */ }
  return info;
}

export async function requestPersist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}

export async function getMeta(key, fallback = null) {
  const r = await db.get('meta', key);
  return r ? r.value : fallback;
}
export const setMeta = (key, value) => db.put('meta', { key, value });
