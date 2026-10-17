// Référentiel partagé par l'application et le serveur (catégories, couleurs, styles…)

const MF = ['m', 'f'];
export const CATEGORIES = [
  { id: 'hauts', label: 'T-shirts et hauts', short: 'Hauts', slot: 'top', genders: MF },
  { id: 'chemises', label: 'Chemises', short: 'Chemises', slot: 'top', genders: MF },
  { id: 'polos', label: 'Polos', short: 'Polos', slot: 'top', genders: MF },
  { id: 'pulls', label: 'Pulls et sweats', short: 'Pulls', slot: 'top', genders: MF },
  { id: 'vestes', label: 'Vestes et manteaux', short: 'Vestes', slot: 'outer', genders: MF },
  { id: 'pantalons', label: 'Pantalons et jeans', short: 'Pantalons', slot: 'bottom', genders: MF },
  { id: 'shorts', label: 'Shorts', short: 'Shorts', slot: 'bottom', genders: MF },
  { id: 'jogging', label: 'Jogging', short: 'Jogging', slot: 'bottom', genders: MF },
  { id: 'chaussures', label: 'Chaussures et baskets', short: 'Chaussures', slot: 'shoes', genders: MF },
  { id: 'accessoires', label: 'Accessoires', short: 'Accessoires', slot: 'accessory', genders: MF },
  { id: 'sacs', label: 'Sacs', short: 'Sacs', slot: 'accessory', genders: MF },
  { id: 'robes', label: 'Robes et combinaisons', short: 'Robes', slot: 'dress', genders: ['f'] },
  { id: 'jupes', label: 'Jupes', short: 'Jupes', slot: 'bottom', genders: ['f'] },
];

export const GENDERS = [
  { id: 'm', label: 'Masculin' },
  { id: 'f', label: 'Féminin' },
];
// Catégories affichées pour un profil (+ celles qui contiennent déjà des pièces)
export const categoriesFor = (gender, items = []) =>
  CATEGORIES.filter((c) => c.genders.includes(gender) || items.some((i) => i.category === c.id));

export const COLORS = [
  { id: 'noir', label: 'Noir', hex: '#111111', neutral: true },
  { id: 'blanc', label: 'Blanc', hex: '#F5F5F2', neutral: true },
  { id: 'creme', label: 'Crème', hex: '#EDE4CF', neutral: true },
  { id: 'gris', label: 'Gris', hex: '#8A8A8E', neutral: true },
  { id: 'gris-clair', label: 'Gris clair', hex: '#C9C9CC', neutral: true },
  { id: 'beige', label: 'Beige', hex: '#D6C2A1', neutral: true },
  { id: 'camel', label: 'Camel', hex: '#B5844E', neutral: true },
  { id: 'marron', label: 'Marron', hex: '#6B4430', neutral: true },
  { id: 'marine', label: 'Bleu marine', hex: '#1E2A47', neutral: true },
  { id: 'denim', label: 'Denim', hex: '#4A6A93', neutral: true },
  { id: 'kaki', label: 'Kaki', hex: '#7A7454', neutral: true },
  { id: 'olive', label: 'Olive', hex: '#5A6332', neutral: true },
  { id: 'bleu', label: 'Bleu', hex: '#2F6FE0', neutral: false },
  { id: 'bleu-clair', label: 'Bleu clair', hex: '#9CC3EC', neutral: false },
  { id: 'vert', label: 'Vert', hex: '#2E8B57', neutral: false },
  { id: 'rouge', label: 'Rouge', hex: '#D0342C', neutral: false },
  { id: 'bordeaux', label: 'Bordeaux', hex: '#6E1F2E', neutral: false },
  { id: 'rose', label: 'Rose', hex: '#E8A3B8', neutral: false },
  { id: 'violet', label: 'Violet', hex: '#6D4AA8', neutral: false },
  { id: 'jaune', label: 'Jaune', hex: '#F2C230', neutral: false },
  { id: 'orange', label: 'Orange', hex: '#E8792B', neutral: false },
  { id: 'multicolore', label: 'Multicolore', hex: 'conic-gradient(#D0342C,#F2C230,#2E8B57,#2F6FE0,#6D4AA8,#D0342C)', neutral: false },
];

export const FITS = [
  { id: 'slim', label: 'Slim' },
  { id: 'regular', label: 'Regular' },
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'oversize', label: 'Oversize' },
  { id: 'cropped', label: 'Cropped' },
  { id: 'droite', label: 'Coupe droite' },
  { id: 'large', label: 'Large / baggy' },
];

// formalité : 1 = très décontracté, 5 = très habillé
export const STYLES = [
  { id: 'sportif', label: 'Sportif', formality: 1 },
  { id: 'streetwear', label: 'Streetwear', formality: 2 },
  { id: 'casual', label: 'Casual', formality: 2.5 },
  { id: 'smart-casual', label: 'Smart casual', formality: 3.5 },
  { id: 'chic', label: 'Chic', formality: 4 },
  { id: 'elegant', label: 'Élégant', formality: 5 },
];

export const SEASONS = [
  { id: 'printemps', label: 'Printemps' },
  { id: 'ete', label: 'Été' },
  { id: 'automne', label: 'Automne' },
  { id: 'hiver', label: 'Hiver' },
];

export const STATUSES = [
  { id: 'propre', label: 'Propre', long: 'Propre et disponible', available: true },
  { id: 'porte', label: 'Porté', long: 'Porté — à remettre au sale ?', available: true },
  { id: 'sale', label: 'Au sale', long: 'Au sale', available: false },
  { id: 'lavage', label: 'Au lavage', long: 'En cours de lavage', available: false },
];

// Réglage « dans le styliste » : à quelle fréquence tu veux que cette pièce soit proposée
export const WEAR_PREFS = [
  { id: 'often', label: 'Souvent' },
  { id: 'normal', label: 'Normal' },
  { id: 'rare', label: 'Rarement' },
  { id: 'never', label: 'Jamais' },
];

export const OCCASIONS = [
  { id: 'quotidien', label: 'Quotidien', formality: 2.5 },
  { id: 'cours', label: 'Cours', formality: 2.5 },
  { id: 'travail', label: 'Travail', formality: 3.5 },
  { id: 'sortie', label: 'Sortie', formality: 3 },
  { id: 'rendez-vous', label: 'Rendez-vous', formality: 3.5 },
  { id: 'soiree', label: 'Soirée', formality: 3.5 },
  { id: 'mariage', label: 'Mariage', formality: 5 },
];

export const STYLE_REQUESTS = [
  { id: 'streetwear', label: 'Streetwear' },
  { id: 'elegant', label: 'Élégant' },
  { id: 'classe', label: 'Classe' },
  { id: 'casual', label: 'Casual' },
  { id: 'smart-casual', label: 'Smart casual' },
  { id: 'mix', label: 'Mélange perso' },
];

export const ids = (list) => list.map((x) => x.id);
export const byId = (list, id) => list.find((x) => x.id === id);
export const catOf = (id) => byId(CATEGORIES, id);
export const colorOf = (id) => byId(COLORS, id);
export const statusOf = (id) => byId(STATUSES, id);
export const isAvailable = (item) => !!(item && statusOf(item.status)?.available);

export function seasonForDate(d = new Date()) {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'printemps';
  if (m >= 6 && m <= 8) return 'ete';
  if (m >= 9 && m <= 11) return 'automne';
  return 'hiver';
}
