// Appels réseau : serveur (IA Gemini, clé cachée côté serveur) et météo Open-Meteo.

const PASS_KEY = 'drip.password';

export const settings = {
  get password() { try { return localStorage.getItem(PASS_KEY) || ''; } catch { return ''; } },
  set password(v) { try { v ? localStorage.setItem(PASS_KEY, v) : localStorage.removeItem(PASS_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function call(path, body, { timeout = 45000 } = {}) {
  if (!navigator.onLine) throw new ApiError('Pas de connexion internet. L\'IA a besoin du réseau.', 'offline');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-drip-password': settings.password },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'L\'IA met trop de temps à répondre. Réessaie.' : 'Serveur injoignable. Vérifie ta connexion.', 'network');
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* réponse non JSON */ }
  if (!res.ok) {
    if (res.status === 404 && !data) throw new ApiError('Serveur IA absent : l\'application tourne sans son serveur (voir le guide).', 'no-server');
    throw new ApiError(data?.error || `Erreur serveur (${res.status}).`, data?.code || String(res.status));
  }
  return data;
}

export const api = {
  health: () => call('/api/health'),
  analyze: (image, mimeType, gender) => call('/api/analyze', { image, mimeType, gender }),
  style: (payload) => call('/api/style', payload, { timeout: 60000 }),
};

// ---------- Images ----------
export async function loadImage(file) {
  if ('createImageBitmap' in self) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* repli */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Format d\'image non lisible. Essaie une autre photo.')); };
    img.src = url;
  });
}

export function resizeTo(img, max, quality = 0.82) {
  const w = img.width, h = img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression de l\'image impossible.'))), 'image/jpeg', quality));
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ---------- Météo réelle (Open-Meteo, gratuit, sans clé) ----------
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Localisation indisponible sur cet appareil.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (e) => reject(new Error(e.code === 1 ? 'Localisation refusée. Autorise-la dans Réglages › Safari › Localisation, ou saisis la température.' : 'Position introuvable pour le moment.')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 15 * 60 * 1000 },
    );
  });
}

const WMO = { 0: 'Ciel dégagé', 1: 'Peu nuageux', 2: 'Nuageux', 3: 'Couvert', 45: 'Brouillard', 48: 'Brouillard', 51: 'Bruine', 53: 'Bruine', 55: 'Bruine', 61: 'Pluie faible', 63: 'Pluie', 65: 'Forte pluie', 71: 'Neige', 73: 'Neige', 75: 'Forte neige', 80: 'Averses', 81: 'Averses', 82: 'Fortes averses', 95: 'Orage', 96: 'Orage', 99: 'Orage' };

export async function fetchWeather() {
  const c = await getPosition();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.latitude.toFixed(3)}&longitude=${c.longitude.toFixed(3)}&current=temperature_2m,apparent_temperature,weather_code,precipitation&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`;
  let res;
  try { res = await fetch(url); } catch { throw new Error('Service météo injoignable.'); }
  if (!res.ok) throw new Error('Service météo indisponible pour le moment.');
  const d = await res.json();
  const cur = d.current || {};
  return {
    temp: Math.round(cur.apparent_temperature ?? cur.temperature_2m),
    actual: Math.round(cur.temperature_2m),
    min: Math.round(d.daily?.temperature_2m_min?.[0]),
    max: Math.round(d.daily?.temperature_2m_max?.[0]),
    rain: (cur.precipitation || 0) > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(cur.weather_code),
    label: WMO[cur.weather_code] || 'Conditions actuelles',
    at: new Date().toISOString(),
  };
}
