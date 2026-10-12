# Mon dressing — mode d'emploi

Mon dressing est ton dressing intelligent : une application web installable sur l'écran d'accueil de ton iPhone (pas besoin de Mac ni de l'App Store).

---

## 1. Comment c'est construit (et pourquoi)

| Élément | Choix | Pourquoi |
|---|---|---|
| Application | PWA en HTML/CSS/JavaScript, **sans étape de compilation** | Moins de choses qui peuvent casser, rien à « construire » avant de publier |
| Données + photos | **IndexedDB**, directement sur ton iPhone | Gratuit, rapide, fonctionne hors connexion. Les photos sont compressées (~150–300 Ko) |
| Sauvegarde | Export / import d'un fichier `.json` (photos incluses) | À ranger dans Fichiers ou iCloud Drive |
| Serveur | **Cloudflare Workers, offre gratuite** (100 000 requêtes/jour) | Héberge l'app en HTTPS et **cache la clé IA** : elle ne va jamais dans le navigateur |
| Reconnaissance photo + styliste | **Google Gemini** (modèles Flash, offre gratuite) | Analyse d'image de bonne qualité, gratuite dans des limites raisonnables |
| Styliste sans IA | Algorithme local (couleurs, formalité, météo, coupes) | Fonctionne hors ligne et sert de secours si l'IA ne répond pas |
| Météo | **Open-Meteo** (gratuit, sans clé) | Vraie météo, uniquement si tu appuies sur « Météo réelle » |

Pas de Supabase ni Firebase : la synchronisation entre appareils n'est pas utile pour un usage sur un seul iPhone, et cela évite un compte, une base distante et des limites supplémentaires. L'export/import couvre la sauvegarde.

### Ce qui est gratuit / ce qui dépend d'un service externe

- **Entièrement gratuit, sans internet** : dressing, photos, statuts du linge, filtres, favoris, styliste local, sauvegarde.
- **Service externe gratuit (Cloudflare)** : la mise en ligne de l'app.
- **Service externe gratuit avec limites (Google Gemini)** : reconnaissance des photos et styliste IA. L'offre gratuite autorise quelques requêtes par minute et un quota quotidien ; largement suffisant pour un usage personnel. Si la limite est atteinte, l'app l'affiche et propose l'algorithme local.
- ⚠️ Sur l'offre gratuite, Google peut utiliser les données envoyées (ici : photos de vêtements et noms de pièces) pour améliorer ses produits. N'envoie pas de photos où l'on voit ton visage ou des documents.
- La disponibilité de l'offre gratuite peut varier selon le pays. Si Google la refuse, DRIP affiche le message et le styliste local continue de fonctionner.

---

## 2. Ce qu'il te faut

- Un **ordinateur** (Windows ou Mac) pour la mise en ligne — une seule fois, ~20 minutes.
- Un **compte Google** (pour la clé Gemini).
- Un **compte Cloudflare** gratuit.
- Ton iPhone.

---

## 3. Mise en ligne (une seule fois)

### Étape A — Installer Node.js
1. Va sur **https://nodejs.org**.
2. Clique sur le gros bouton **« LTS »** et installe le fichier téléchargé (Suivant, Suivant… Terminer).

### Étape B — Préparer le dossier
1. Dézippe `drip.zip` (double-clic). Tu obtiens un dossier `drip`.
2. Ouvre un terminal **dans ce dossier** :
   - **Mac** : clic droit sur le dossier `drip` → **Services** → **Nouveau terminal au dossier**.
   - **Windows** : ouvre le dossier `drip`, clique dans la barre d'adresse en haut, tape `cmd` puis **Entrée**.
3. Copie-colle cette commande puis **Entrée** :
   ```
   npm install
   ```
   (Elle installe l'outil Cloudflare ; ça prend une minute.)

### Étape C — Créer ta clé Gemini (gratuite)
1. Va sur **https://aistudio.google.com** et connecte-toi avec ton compte Google.
2. Clique sur **« Get API key »** (ou « Obtenir une clé API ») → **« Create API key »**.
3. Copie la clé (une longue suite de caractères). **Ne la partage avec personne.**

### Étape D — Publier sur Cloudflare
1. Crée un compte sur **https://dash.cloudflare.com/sign-up** (offre gratuite).
2. Dans le terminal, connecte-toi :
   ```
   npx wrangler login
   ```
   Une page s'ouvre : clique sur **« Allow »**.
3. Publie l'application :
   ```
   npx wrangler deploy
   ```
   Si on te demande de choisir un sous-domaine `workers.dev`, tape un nom (ex. `benji`).
   À la fin, une adresse s'affiche, du type **`https://drip.benji.workers.dev`**. Note-la.
4. Enregistre la clé Gemini sur le serveur (elle reste secrète) :
   ```
   npx wrangler secret put GEMINI_API_KEY
   ```
   Colle ta clé quand on te la demande, puis **Entrée** (rien ne s'affiche quand tu colles : c'est normal).
5. Choisis un mot de passe DRIP (pour que personne d'autre n'utilise ton quota d'IA) :
   ```
   npx wrangler secret put APP_PASSWORD
   ```
   Tape le mot de passe de ton choix, puis **Entrée**.

C'est en ligne. 🎉

> Pour publier une future mise à jour du code : ouvre un terminal dans le dossier et refais `npx wrangler deploy`. Les secrets et tes données ne sont pas touchés.

---

## 4. Installer DRIP sur l'iPhone

1. Ouvre **Safari** (pas Chrome) et va à ton adresse `https://drip.….workers.dev`.
2. Appuie sur le bouton **Partager** (carré avec une flèche vers le haut).
3. Fais défiler et choisis **« Sur l'écran d'accueil »** → **Ajouter**.
4. **Ouvre l'app depuis l'icône** de l'écran d'accueil (c'est important, voir section 5).
5. Va dans **Réglages** (roue dentée en haut à droite de l'accueil) → saisis ton mot de passe DRIP → **Enregistrer et tester**. Les trois voyants doivent être verts.

Tu peux maintenant ajouter ta première pièce : **+** → **Prendre une photo**.

---

## 5. Garder ses données en sécurité (à lire !)

- **Les données sont sur ton iPhone, pas sur internet.** Le serveur ne stocke rien.
- **Utilise toujours l'icône de l'écran d'accueil.** Safari et l'app installée ont des stockages **séparés** : ce que tu ajoutes dans un onglet Safari n'apparaît pas dans l'app installée.
- **Supprimer l'icône DRIP supprime ses données.** Exporte une sauvegarde avant.
- Une app installée sur l'écran d'accueil n'est pas soumise à l'effacement automatique de Safari après 7 jours sans visite. iOS peut néanmoins libérer de l'espace si l'iPhone est presque plein.
- **Sauvegarde régulièrement** : Réglages → **Exporter** → **Enregistrer dans Fichiers** → choisis iCloud Drive. L'app te le rappelle sur l'accueil tous les 14 jours.
- **Restaurer** (nouvel iPhone, app réinstallée…) : Réglages → **Importer** → choisis le fichier → **Fusionner** ou **Remplacer tout**.
- La navigation privée de Safari bloque le stockage : n'utilise pas DRIP en navigation privée.

---

## 6. Utilisation au quotidien

- **Ajouter** : bouton **+** → photo ou galerie → l'IA pré-remplit (champs marqués « IA · à vérifier ») → corrige → **Enregistrer**. Sans IA, remplis à la main : seuls nom, catégorie et couleur sont obligatoires.
- **Linge en un geste** : sur une carte du dressing, touche l'étiquette de statut : Propre → Porté → Au sale → Au lavage → Propre. « Annuler » apparaît en cas d'erreur.
- **Jour de lessive** : Dressing → onglet **Au sale** → **Tout mettre au lavage**, puis onglet **Lavage** → **Lavage terminé**.
- **Styliste** : choisis style, occasion, météo (« Météo réelle » utilise ta position), puis **Créer ma tenue**. Les pièces au sale ou au lavage ne sont jamais proposées. **Autre** pour une nouvelle proposition, **Favori** pour l'enregistrer, **Je porte cette tenue** pour marquer les pièces comme portées.
- **Favoris** : chaque tenue indique si elle est portable maintenant ou quelle pièce est indisponible.

---

## 7. En cas de problème

| Message | Solution |
|---|---|
| « Mot de passe DRIP incorrect » | Réglages → ressaisis le mot de passe choisi à l'étape D5 |
| « La clé Gemini n'est pas configurée » | Refais `npx wrangler secret put GEMINI_API_KEY` |
| « Clé Gemini refusée par Google » | Crée une nouvelle clé sur aistudio.google.com et refais l'étape D4 |
| « Limite gratuite de l'IA atteinte » | Attends une minute (ou le lendemain). Le styliste local reste disponible |
| « Aucun modèle Gemini configuré n'est disponible » | Google a renommé ses modèles : `npx wrangler secret put GEMINI_MODEL` puis tape le nom d'un modèle Flash listé sur ai.google.dev (ex. `gemini-flash-latest`) |
| « Localisation refusée » | Réglages iPhone → Confidentialité → Service de localisation → Sites Safari → « Lorsque l'app est active ». Ou saisis la température |
| L'IA ne répond pas | L'app bascule seule sur l'algorithme local et le dit |

---

## 8. Pour les curieux : fichiers du projet

```
drip/
├── public/                 ← l'application (ce que voit l'iPhone)
│   ├── index.html
│   ├── app.css             ← design
│   ├── manifest.webmanifest, sw.js, icons/   ← installation + hors ligne
│   └── js/
│       ├── app.js          ← écrans et interactions
│       ├── catalog.js      ← catégories, couleurs, styles, statuts
│       ├── db.js           ← stockage, export / import
│       ├── api.js          ← appels IA et météo, compression des photos
│       └── stylist.js      ← styliste local (règles)
├── src/worker.js           ← serveur : clé secrète, appels Gemini, vérification des tenues
├── wrangler.jsonc          ← configuration Cloudflare
└── tests/                  ← tests automatiques
```

Lancer les tests (facultatif) : `npm test` (styliste + serveur).
Tester l'app sur l'ordinateur avec un faux Gemini : `node tests/devserver.mjs` puis ouvrir http://localhost:8787 (mot de passe : `test`).


---

## 9. Profils

Au premier lancement, l'app demande si le dressing est **masculin** ou **féminin**. Le profil féminin ajoute les catégories Robes, Jupes et Sacs, et un accent rose. Le choix se change dans Réglages sans rien supprimer. L'option « LGBTQQIA2SNBP+ » est affichée barrée : elle n'est pas encore disponible.
