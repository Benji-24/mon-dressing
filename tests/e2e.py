"""Parcours complet dans Chromium au format iPhone (via tests/devserver.mjs, faux Gemini)."""
import json, os, sys, time, subprocess, pathlib
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'tests' / 'shots')
SHOTS.mkdir(parents=True, exist_ok=True)
PORT = 8799
URL = f'http://localhost:{PORT}/'
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail and not cond else ''))

server = subprocess.Popen(['node', str(ROOT / 'tests' / 'devserver.mjs'), str(PORT)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
time.sleep(1.2)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 402, 'height': 874}, device_scale_factor=3, is_mobile=True, has_touch=True,
                                  locale='fr-FR', geolocation={'latitude': 48.8566, 'longitude': 2.3522}, permissions=['geolocation'], accept_downloads=True)
        SPLASH_OFF = "document.addEventListener('DOMContentLoaded', () => document.getElementById('splash')?.remove());"
        ctx.add_init_script(SPLASH_OFF)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        page.route('https://api.open-meteo.com/**', lambda r: r.fulfill(json={'current': {'temperature_2m': 11.2, 'apparent_temperature': 9.4, 'weather_code': 61, 'precipitation': 0.4}, 'daily': {'temperature_2m_min': [7], 'temperature_2m_max': [13]}}))
        page.route('https://cdn.jsdelivr.net/**', lambda r: r.abort())  # détourage IA injoignable → on teste le secours
        S = lambda: page.evaluate('window.__drip.state')
        shot = lambda n: page.screenshot(path=str(SHOTS / f'{n}.png'))

        def toast_has(text):
            try:
                page.locator('.toast', has_text=text).first.wait_for(timeout=4000); return True
            except Exception: return False

        def close_sheets():
            page.evaluate("document.querySelectorAll('.sheet,.backdrop').forEach(e=>e.remove())")

        # 1. Premier lancement : dressing vide
        page.goto(URL); page.wait_for_selector('.welcome')
        check('Premier lancement : choix du profil', page.locator('.gender-card').count() == 3)
        disabled = page.locator('.gender-card.disabled')
        check('Non-binaire · LGBTQ+ visible, barré et désactivé', disabled.is_disabled() and 'line-through' in disabled.locator('.strike').evaluate('e => getComputedStyle(e).textDecorationLine'))
        check('Tab bar masquée pendant le choix', page.locator('#tabbar').is_hidden())
        shot('00-choix-profil')
        page.click('[data-act="pick-gender"][data-v="m"]'); page.wait_for_selector('.stats')
        check('Accueil vide affiché', page.locator('text=Ton dressing est vide').count() == 1)
        check('Nom de l\'app : Mon dressing', 'Mon dressing' in page.locator('.logo').inner_text() and page.title() == 'Mon dressing')
        check('Profil masculin : pas de robes', page.evaluate("[...document.querySelectorAll('[data-act=w-cat]')].every(b => !/Robes|Jupes/.test(b.textContent))") if page.goto(URL + '#/dressing') or True else False)
        page.goto(URL + '#/home'); page.wait_for_selector('.logo')
        shot('01-accueil-vide')

        # 2. Connexion IA
        page.goto(URL + '#/reglages'); page.wait_for_selector('#pw')
        page.fill('#pw', 'test'); page.click('[data-act="save-password"]')
        check('Mot de passe accepté, IA connectée', toast_has('IA connectée'))
        page.wait_for_selector('text=Mot de passe correct')
        check('Clé non exposée au navigateur', 'fausse-cle-de-test' not in page.content())

        # 3. Ajout par photo + reconnaissance IA
        page.goto(URL + '#/home'); page.wait_for_selector('.logo')
        page.click('.action-tile.accent')
        page.set_input_files('input[capture]', str(ROOT / 'tests' / 'fixtures' / 'sweat.jpg'))
        page.wait_for_selector('text=Proposition de l\'IA', timeout=15000)
        check('Catégorie proposée par l\'IA', page.locator('[data-k="category"][data-v="pulls"][aria-pressed="true"]').count() == 1)
        check('Champs IA signalés « à vérifier »', page.locator('.ai-tag').count() >= 5)
        check('Marque non inventée', page.input_value('#f-brand') == '')
        shot('02-ajout-ia')
        # Sticker : le détourage IA (CDN) est volontairement injoignable ici → secours « fond uni »
        page.wait_for_selector('text=Sticker prêt', timeout=30000)
        check('Sticker créé à l\'ajout (secours fond uni)', page.locator('.sticker-row').count() == 1 and 'découpe simple' in page.locator('.sticker-row').inner_text())
        shot('02b-sticker')
        page.fill('#f-name', 'Hoodie gris oversize')
        page.fill('#f-size', 'L')
        page.click('[data-k="style"][data-v="casual"]')  # correction d'un champ
        page.click('[data-save]')
        check('Pièce photo enregistrée', toast_has('ajouté à ton dressing'))
        page.wait_for_timeout(400)
        sticker_id = page.evaluate("window.__drip.state.items[0].sticker")
        check('Sticker enregistré avec la pièce', bool(sticker_id))
        px = page.evaluate('''async (id) => {
          const { db } = await import('/js/db.js');
          const rec = await db.get('photos', id);
          const bmp = await createImageBitmap(new Blob([rec.data], { type: rec.type }));
          const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
          const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
          const a = (x, y) => g.getImageData(x, y, 1, 1).data[3];
          return { type: rec.type, w: bmp.width, h: bmp.height, corner: a(2, 2), center: a(bmp.width >> 1, bmp.height >> 1) };
        }''', sticker_id)
        check('Sticker = PNG transparent aux coins, opaque au centre', px['type'] == 'image/png' and px['corner'] == 0 and px['center'] == 255, px)

        # 4. Ajout manuel + validation
        def add_manual(name, cat, color, status=None, fit=None, style=None):
            page.click('.tab-add'); page.wait_for_selector('#f-name')
            page.fill('#f-name', name)
            page.click(f'[data-k="category"][data-v="{cat}"]')
            page.click(f'[data-k="primaryColor"][data-v="{color}"]')
            if fit: page.click(f'[data-k="fit"][data-v="{fit}"]')
            if style: page.click(f'[data-k="style"][data-v="{style}"]')
            if status: page.click(f'[data-k="status"][data-v="{status}"]')
            page.click('[data-save]'); page.wait_for_selector('.sheet', state='detached', timeout=4000); page.wait_for_timeout(200)

        page.click('.tab-add'); page.wait_for_selector('#f-name')
        page.click('[data-save]')
        check('Validation : champs obligatoires signalés', page.locator('.err-text').count() == 3)
        page.click('[data-cancel]'); page.wait_for_timeout(400)

        add_manual('T-shirt blanc', 'hauts', 'blanc', fit='oversize', style='streetwear')
        add_manual('Jean brut', 'pantalons', 'denim', fit='slim', style='casual')
        add_manual('Baskets blanches', 'chaussures', 'blanc', style='streetwear')
        add_manual('Chino beige', 'pantalons', 'beige', style='smart-casual')
        add_manual('Veste noire', 'vestes', 'noir', style='casual')
        add_manual('Chemise bleu clair', 'chemises', 'bleu-clair', style='smart-casual', status='sale')
        check('7 pièces enregistrées', len(S()['items']) == 7, len(S()['items']))

        # 5. Accueil compteurs
        page.goto(URL + '#/home'); page.wait_for_selector('.stats')
        stats = page.locator('.stat b').all_inner_texts()
        check('Compteurs total/propres/sale', stats == ['7', '6', '1'], stats)
        shot('03-accueil-rempli')

        # 6. Dressing : filtres, recherche, tri
        page.goto(URL + '#/dressing'); page.wait_for_selector('.grid')
        check('Grille : 7 cartes', page.locator('.item-card').count() == 7)
        page.click('[data-act="w-cat"][data-v="pantalons"]'); check('Filtre catégorie', page.locator('.item-card').count() == 2)
        page.click('[data-act="w-cat"][data-v="all"]')
        page.fill('#w-search', 'jean'); page.wait_for_timeout(350)
        check('Recherche', page.locator('.item-card').count() == 1 and 'Jean brut' in page.locator('.item-card').first.inner_text(), page.locator('.item-card .meta strong').all_inner_texts())
        check('Le champ de recherche garde le focus', page.evaluate("document.activeElement.id") == 'w-search')
        page.click('[data-act="clear-search"]')
        page.click('[data-act="w-status"][data-v="sale"]'); check('Vue « au sale »', page.locator('.item-card').count() == 1)
        page.click('[data-act="w-status"][data-v="propre"]'); check('Vue « propres »', page.locator('.item-card').count() == 6)
        page.click('[data-act="w-status"][data-v="all"]')
        page.click('[data-act="open-filters"]'); page.wait_for_selector('.sheet')
        page.click('[data-f="colors"][data-v="blanc"]'); page.click('[data-f="sort"][data-v="nom"]'); page.click('[data-f-apply]')
        page.wait_for_timeout(300)
        names = page.locator('.item-card .meta strong').all_inner_texts()
        check('Filtre couleur + tri par nom', names == ['Baskets blanches', 'T-shirt blanc'], names)
        page.click('[data-act="open-filters"]'); page.click('[data-f-reset]'); page.click('[data-f-apply]'); page.wait_for_timeout(300)
        page.click('[data-act="open-filters"]'); page.click('[data-f="styles"][data-v="smart-casual"]'); page.click('[data-f-apply]'); page.wait_for_timeout(300)
        check('Filtre style', page.locator('.item-card').count() == 2)
        page.click('[data-act="reset-filters"]') if page.locator('[data-act="reset-filters"]').count() else None
        page.click('[data-act="open-filters"]'); page.click('[data-f-reset]'); page.click('[data-f-apply]'); page.wait_for_timeout(300)
        shot('04-dressing')

        # 7. Statut en un geste + persistance
        tee = next(i for i in S()['items'] if i['name'] == 'T-shirt blanc')
        page.click(f'[data-act="cycle-status"][data-id="{tee["id"]}"]')  # propre -> porté
        page.click(f'[data-act="cycle-status"][data-id="{tee["id"]}"]')  # porté -> sale
        page.wait_for_timeout(300)
        page.reload(); page.wait_for_selector('.grid')
        tee = next(i for i in S()['items'] if i['name'] == 'T-shirt blanc')
        check('Statut « au sale » conservé après rechargement', tee['status'] == 'sale', tee['status'])

        # 8. Modification + suppression
        chino = next(i for i in S()['items'] if i['name'].startswith('Chino beige'))
        page.click(f'[data-act="open-item"][data-id="{chino["id"]}"]'); page.wait_for_selector('.detail-title')
        page.click('[data-edit]'); page.wait_for_selector('#f-name >> nth=0')
        page.locator('#f-name').last.fill('Chino beige droit')
        page.locator('[data-save]').last.click(); page.wait_for_timeout(500)
        check('Modification enregistrée', any(i['name'] == 'Chino beige droit' for i in S()['items']))
        check('Fiche mise à jour', page.locator('.detail-title', has_text='Chino beige droit').count() == 1)
        page.click('[data-del]'); page.click('.dialog .btn-danger'); page.wait_for_timeout(500)
        check('Suppression', not any(i['name'].startswith('Chino') for i in S()['items']))

        # 9. Styliste local : jamais de pièce sale
        page.goto(URL + '#/styliste'); page.wait_for_selector('.mode-switch')
        page.click('[data-act="st-mode"][data-v="local"]')
        page.click('[data-act="st-generate"]'); page.wait_for_selector('.result')
        dirty = {i['id'] for i in S()['items'] if i['status'] in ('sale', 'lavage')}
        known = {i['id'] for i in S()['items']}
        bad = []
        for _ in range(6):
            r = S()['st']['result']; o = r['outfit']; sl = o['slots']
            ids = [x for x in [sl['top'], sl['bottom'], sl['shoes'], sl['outer'], sl['layer'], *sl['accessories']] if x]
            if any(i in dirty or i not in known for i in ids): bad.append(ids)
            page.click('[data-act="st-another"]'); page.wait_for_timeout(150)
        check('Local : aucune pièce sale ni inventée (6 tenues)', not bad, bad)
        check('Local : source indiquée « sans IA »', page.locator('text=algorithme local (sans IA)').count() >= 1)
        check('Local : température saisie signalée (pas de fausse météo)', page.locator('text=pas de météo en temps réel').count() >= 1)

        # 10. Météo réelle
        page.click('[data-act="st-live"]'); page.wait_for_selector('text=Météo réelle (ressenti)')
        check('Météo réelle Open-Meteo affichée', page.locator('.weather .temp').inner_text().startswith('9'))

        # 11. Styliste IA (faux Gemini) : rejet de la pièce inventée
        page.click('[data-act="st-mode"][data-v="ai"]')
        page.click('[data-act="st-generate"]'); page.wait_for_selector('.source-tag.ai', timeout=15000)
        r = S()['st']['result']
        sl = r['outfit']['slots']
        ids = [x for x in [sl['top'], sl['bottom'], sl['shoes'], sl['outer'], sl['layer'], *sl['accessories']] if x]
        check('IA : tenue composée uniquement de pièces disponibles', all(i in known and i not in dirty for i in ids), ids)
        check('IA : proposition inventée rejetée et signalée', any('rejetée' in w for w in r['warnings']), r['warnings'])
        check('IA : météo réelle citée', page.locator('text=météo réelle').count() >= 1)
        shot('05-styliste-ia')
        page.locator('.result').scroll_into_view_if_needed(); page.wait_for_timeout(300); shot('06-resultat')
        page.click('[data-act="st-save"]'); check('Tenue enregistrée en favori', toast_has('favoris'))
        page.click('[data-act="st-another"]'); page.wait_for_timeout(300)
        check('Autre proposition IA différente', S()['st']['result']['outfit']['key'] != r['outfit']['key'])

        # 12. Catégorie manquante
        jean = next(i for i in S()['items'] if i['name'] == 'Jean brut')
        page.evaluate(f"""async () => {{ }}""")
        page.goto(URL + '#/dressing'); page.wait_for_selector('.grid')
        page.click(f'[data-act="cycle-status"][data-id="{jean["id"]}"]'); page.click(f'[data-act="cycle-status"][data-id="{jean["id"]}"]'); page.wait_for_timeout(200)
        page.goto(URL + '#/styliste'); page.wait_for_selector('.mode-switch')
        page.click('[data-act="st-generate"]'); page.wait_for_selector('.result')
        check('Aucun bas dispo : message clair, rien d\'inventé', page.locator('text=Tous tes bas sont au sale').count() == 1 and S()['st']['result']['outfit'] is None)
        shot('07-manque')

        # 13. Favoris : tenue incomplète signalée
        page.goto(URL + '#/favoris'); page.wait_for_selector('.fav')
        check('Favori listé', page.locator('.fav').count() == 1)
        fav_txt = page.locator('.fav').inner_text()
        check('Favori : indisponibilité signalée', 'Incomplète' in fav_txt or 'Portable' in fav_txt, fav_txt)
        page.click('.fav'); page.wait_for_selector('.sheet .board')
        shot('08-favori')
        page.click('[data-preview]'); page.wait_for_selector('.preview-img', timeout=15000)
        dims = page.evaluate("(() => { const i = document.querySelector('.preview-img'); return [i.naturalWidth, i.naturalHeight]; })()")
        check('Aperçu de tenue : image 1080×1350 générée', dims == [1080, 1350], dims)
        check('Aperçu : bouton enregistrer/partager', page.locator('[data-save-img]').count() == 1)
        shot('08b-apercu')
        close_sheets()
        # Collage : un vrai sticker est dessiné avec son liseré blanc
        white = page.evaluate('''async () => {
          const { db } = await import('/js/db.js');
          const { renderOutfitImage } = await import('/js/collage.js');
          const it = window.__drip.state.items.find((i) => i.sticker);
          const rec = await db.get('photos', it.sticker);
          const img = await createImageBitmap(new Blob([rec.data], { type: rec.type }));
          const blob = await renderOutfitImage({ title: 'Test', pieces: [
            { id: 'a', role: 'top', img, kind: 'sticker' }, { id: 'b', role: 'bottom', img: null, kind: 'color', color: '#2a4d8f' }] });
          const bmp = await createImageBitmap(blob);
          const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
          const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
          const d = g.getImageData(0, 170, c.width, 600).data; let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) n++;
          return n;
        }''')
        check('Collage : sticker dessiné avec liseré blanc', white > 2000, white)
        page.goto(URL + '#/dressing'); page.wait_for_selector('.grid')
        page.click('[data-act="w-status"][data-v="sale"]')
        page.click('[data-act="bulk"]'); page.wait_for_timeout(300)
        check('Action groupée : tout au lavage', sum(1 for i in S()['items'] if i['status'] == 'sale') == 0)
        page.click('[data-act="w-status"][data-v="lavage"]'); page.click('[data-act="bulk"]'); page.wait_for_timeout(300)
        check('Action groupée : lavage terminé', all(i['status'] in ('propre', 'porte') for i in S()['items']))
        page.goto(URL + '#/favoris'); page.wait_for_selector('.fav')
        check('Favori à nouveau portable', 'Portable maintenant' in page.locator('.fav').inner_text())

        # 13b. Mon profil : mesures, style, visage, avatar, courbe
        page.evaluate("window.__drip.state.items.forEach(i => { i.status = 'propre'; })")  # remet tout en dispo (test en mémoire)
        page.goto(URL + '#/profil'); page.wait_for_selector('#me-height')
        page.wait_for_selector('#me-avatar-img:not([hidden])', timeout=10000)
        check('Profil : avatar de base affiché', page.evaluate("document.querySelector('#me-avatar-img').naturalWidth") == 1080)
        shot('13a-profil-vide')
        page.fill('#me-height', '178'); page.press('#me-height', 'Tab')
        page.fill('#me-weight', '72'); page.press('#me-weight', 'Tab')
        page.fill('#me-note', 'oversize, tons terre'); page.press('#me-note', 'Tab')
        page.click('[data-act="me-style"][data-v="streetwear"]'); page.wait_for_timeout(200)
        page.click('[data-act="me-skin"][data-v="hale"]'); page.wait_for_timeout(200)
        me = S()['me']
        check('Profil enregistré (taille, poids, note, style, teint)', me['height'] == 178 and me['weight'] == 72 and me['styleNote'] == 'oversize, tons terre' and me['prefStyles'] == ['streetwear'] and me['skin'] == 'hale', me)
        page.fill('#me-height', '999'); page.press('#me-height', 'Tab'); page.wait_for_timeout(200)
        check('Taille absurde refusée', S()['me']['height'] == 178 and page.input_value('#me-height') == '178')
        page.set_input_files('[data-me-face] >> nth=1', str(ROOT / 'tests' / 'fixtures' / 'sweat.jpg'))
        page.wait_for_function("window.__drip.state.me && window.__drip.state.me.face", timeout=8000)
        page.wait_for_selector('#me-avatar-img:not([hidden])'); page.wait_for_timeout(600)
        check('Visage enregistré localement', bool(S()['me']['face']))
        # Retourner (effet miroir) : photo de test rouge à gauche / bleue à droite
        from PIL import Image
        im = Image.new('RGB', (600, 800), (220, 30, 30)); im.paste((30, 30, 220), (300, 0, 600, 800)); half = SHOTS / 'moitie.jpg'; im.save(half, quality=95)
        px_face = """async () => { const { db } = await import('/js/db.js'); const rec = await db.get('photos', window.__drip.state.me.face);
          const b = await createImageBitmap(new Blob([rec.data], { type: rec.type })); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
          const g = c.getContext('2d'); g.drawImage(b, 0, 0); return [Array.from(g.getImageData(40, 400, 1, 1).data), Array.from(g.getImageData(560, 400, 1, 1).data)]; }"""
        before_id = S()['me']['face']
        page.set_input_files('[data-me-face="cam"]', str(half)); page.wait_for_function("window.__drip.state.me.face !== %r" % before_id, timeout=8000)
        l0, r0 = page.evaluate(px_face)
        check('Photo prise à l\'appareil : sens d\'origine conservé (gauche rouge)', l0[0] > 150 and r0[2] > 150, (l0, r0))
        page.click('[data-act="me-face-flip"]'); page.wait_for_function("window.__drip.state.me.flipCamera === true", timeout=8000); page.wait_for_timeout(300)
        l1, r1 = page.evaluate(px_face)
        check('Bouton « Retourner » : image inversée gauche/droite', l1[2] > 150 and r1[0] > 150, (l1, r1))
        id_after_flip = S()['me']['face']
        page.set_input_files('[data-me-face="cam"]', str(half)); page.wait_for_function("window.__drip.state.me.face !== %r" % id_after_flip, timeout=8000)
        l2, r2 = page.evaluate(px_face)
        check('Choix retenu : la photo suivante prise à l\'appareil est retournée d\'office', l2[2] > 150 and r2[0] > 150, (l2, r2))
        page.set_input_files('[data-me-face="gallery"]', str(half)); page.wait_for_function("window.__drip.state.me.faceSource === 'gallery'", timeout=8000); page.wait_for_timeout(300)
        l3, r3 = page.evaluate(px_face)
        check('Photo de la galerie : jamais retournée automatiquement', l3[0] > 150 and r3[2] > 150, (l3, r3))
        shot('13b-profil')
        # courbe : un point par tenue IA créée
        n_ai = sum(1 for h in S()['history'] if h['source'] == 'ai')
        check('Historique alimenté par les générations', len(S()['history']) >= 3 and n_ai >= 1, S()['history'][:2])
        page.wait_for_selector('.chart')
        check('Courbe : un point par tenue IA', page.locator('.chart .ch-dot').count() == min(n_ai, 60), page.locator('.chart .ch-dot').count())
        page.locator('.chart .ch-hit').last.click(force=True)
        check('Courbe : toucher un point affiche la tenue', '/10' in page.inner_text('#pf-tip'), page.inner_text('#pf-tip'))
        page.click('[data-act="me-table"]')
        page.wait_for_selector('.pf-table')
        check('Courbe : vue en tableau', page.locator('.pf-table tbody tr').count() >= 1)
        page.click('[data-act="me-table"]'); page.click('[data-act="me-pf"][data-v="all"]'); page.wait_for_selector('.chart')
        check('Courbe : filtre « Toutes » (IA + locales)', page.locator('.chart .ch-dot').count() == min(len(S()['history']), 60))
        shot('13c-progression')
        # le profil part bien vers l'IA (taille/poids/style), jamais le visage
        sent = []
        page.on('request', lambda r: sent.append(r.post_data) if r.url.endswith('/api/style') else None)
        page.goto(URL + '#/styliste'); page.wait_for_selector('.mode-switch')
        page.click('[data-act="st-mode"][data-v="ai"]'); page.click('[data-act="st-generate"]'); page.wait_for_selector('.result .source-tag', timeout=20000); page.wait_for_timeout(500)
        body = json.loads(sent[-1]) if sent else {}
        pr = body.get('profile', {})
        check('Profil envoyé à l\'IA (taille, poids, style) sans le visage', pr.get('heightCm') == 178 and pr.get('weightKg') == 72 and pr.get('prefStyles') == ['streetwear'] and 'face' not in json.dumps(body), pr)
        page.goto(URL + '#/profil'); page.wait_for_selector('#me-share'); page.uncheck('#me-share'); page.wait_for_timeout(200)
        sent.clear(); page.goto(URL + '#/styliste'); page.wait_for_selector('.mode-switch'); page.click('[data-act="st-generate"]'); page.wait_for_timeout(1500)
        pr2 = json.loads(sent[-1]).get('profile', {}) if sent else {}
        check('Option « adapter à ma morphologie » décochée : ni taille ni poids envoyés', 'heightCm' not in pr2 and 'weightKg' not in pr2 and pr2.get('prefStyles') == ['streetwear'], pr2)
        # aperçu sur l'avatar
        page.goto(URL + '#/favoris'); page.wait_for_selector('.fav'); page.click('.fav'); page.wait_for_selector('.sheet [data-preview]')
        page.click('[data-preview]'); page.wait_for_selector('.preview-img', timeout=15000)
        src1 = page.get_attribute('.preview-img', 'src')
        page.click('[data-pv="avatar"]'); page.wait_for_function("document.querySelector('.preview-img') && document.querySelector('.preview-img').src !== %r" % src1, timeout=15000)
        page.wait_for_timeout(300)
        dims = page.evaluate("(() => { const i = document.querySelector('.preview-img'); return [i.naturalWidth, i.naturalHeight]; })()")
        check('Aperçu avatar : image 1080×1350', dims == [1080, 1350], dims)
        check('Aperçu avatar : onglet actif', page.locator('[data-pv="avatar"][aria-pressed="true"]').count() == 1)
        shot('13d-avatar-tenue')
        close_sheets()

        # 13c. Avatar IA : consentement pour le visage + image reçue
        import urllib.request
        stats = lambda: json.loads(urllib.request.urlopen(URL + '__stats').read())
        page.goto(URL + '#/favoris'); page.wait_for_selector('.fav'); page.click('.fav'); page.wait_for_selector('.sheet [data-preview]')
        page.click('[data-preview]'); page.wait_for_selector('.preview-img', timeout=15000)
        page.click('[data-pv="ai"]'); page.wait_for_selector('[data-ai-go]')
        check('Avatar IA : avertissement sur le quota et la fiabilité', 'quota' in page.locator('.sheet-body').last.inner_text().lower() and 'écarter' in page.locator('.sheet-body').last.inner_text(), page.locator('.sheet-body').last.inner_text()[:300])
        shot('13e-avatar-ia-intro')
        page.evaluate("window.__drip.state.me.faceToAI = false")  # pas encore de consentement
        page.click('[data-ai-go]'); page.wait_for_selector('.dialog')
        check('Avatar IA : demande de consentement avant d\'envoyer le visage', 'photo' in page.inner_text('.dialog').lower() and page.locator('.dialog .btn').count() == 3)
        page.click('.dialog >> text=Sans ma photo')
        page.wait_for_selector('.preview-img', timeout=20000)
        st_ = stats()['avatar']
        check('Sans accord : aucune photo de visage envoyée (seulement les vêtements)', st_['withFace'] is False, st_)
        check('Avatar IA : image affichée et mention « générée par IA »', page.evaluate("document.querySelector('.preview-img').naturalWidth") >= 1 and 'générée par IA' in page.locator('.sheet-body').last.inner_text(), page.locator('.sheet-body').last.inner_text()[:300])
        check('Avatar IA : enregistrer/partager disponible', page.locator('[data-save-img]').count() == 1)
        check('Sans accord, le consentement n\'est pas mémorisé', S()['me'].get('faceToAI') in (False, None))
        close_sheets()
        # avec accord
        page.goto(URL + '#/favoris'); page.wait_for_selector('.fav'); page.click('.fav'); page.wait_for_selector('.sheet [data-preview]')
        page.click('[data-preview]'); page.wait_for_selector('.preview-img'); page.click('[data-pv="ai"]'); page.wait_for_selector('[data-ai-go]')
        page.click('[data-ai-go]'); page.wait_for_selector('.dialog'); page.click('.dialog >> text=Envoyer ma photo')
        page.wait_for_selector('.preview-img', timeout=20000)
        st2 = stats()['avatar']
        check('Avec accord : visage + vêtements envoyés, accord mémorisé', st2['withFace'] is True and S()['me']['faceToAI'] is True, st2)
        shot('13f-avatar-ia')
        close_sheets()

        # 13d. Réglage par vêtement dans le styliste
        page.evaluate("Object.assign(window.__drip.state.w, { status: 'all', cat: 'all', q: '' })")
        page.goto(URL + '#/dressing'); page.wait_for_selector('.grid')
        jean = next(i for i in S()['items'] if i['name'] == 'Jean brut')
        page.click(f'[data-act="open-item"][data-id="{jean["id"]}"]'); page.wait_for_selector('[data-wp]')
        page.click('[data-wp="never"]'); page.wait_for_timeout(300)
        check('Pièce réglée sur « Jamais » (enregistré)', next(i for i in S()['items'] if i['id'] == jean['id'])['wearPref'] == 'never')
        check('Pastille « jamais » visible sur la carte', page.evaluate("document.querySelector('.pref-tag') !== null"))
        close_sheets()
        page.evaluate("window.__drip.state.items.forEach(i => { i.status = 'propre'; })")
        page.goto(URL + '#/styliste'); page.wait_for_selector('.mode-switch')
        page.click('[data-act="st-mode"][data-v="local"]'); page.click('[data-act="st-generate"]'); page.wait_for_timeout(800)
        txt = page.locator('main').inner_text()
        check('Styliste local : le jean « Jamais » n\'est pas proposé, et l\'app explique pourquoi', 'Jamais' in txt and 'Impossible de composer' in txt, txt[-300:])
        page.click('[data-act="st-mode"][data-v="ai"]'); page.click('[data-act="st-generate"]'); page.wait_for_timeout(1500)
        o = S()['st']['result']['outfit']
        check('Styliste IA : pas de pièce « Jamais » non plus', o is None or o['slots']['bottom'] != jean['id'])
        # formulaire : raison
        page.goto(URL + '#/dressing'); page.wait_for_selector('.grid')
        chino = next(i for i in S()['items'] if i['id'] != jean['id'])
        page.click(f'[data-act="open-item"][data-id="{chino["id"]}"]'); page.wait_for_selector('[data-edit]'); page.click('[data-edit]'); page.wait_for_selector('#f-wearnote')
        page.click('[data-k="wearPref"][data-v="rare"]'); page.fill('#f-wearnote', 'trop fin'); page.click('[data-save]'); page.wait_for_selector('#f-wearnote', state='detached', timeout=5000)
        it_ = next(i for i in S()['items'] if i['id'] == chino['id'])
        check('Formulaire : « Rarement » + raison enregistrés', it_['wearPref'] == 'rare' and it_['wearNote'] == 'trop fin', (it_.get('wearPref'), it_.get('wearNote')))
        close_sheets()

        # 14. Persistance après fermeture totale du navigateur (même profil)
        n_items, n_out = len(S()['items']), len(S()['outfits'])
        state_dump = ctx.storage_state()
        # 15. Export / effacement / import
        page.goto(URL + '#/reglages'); page.wait_for_selector('[data-act="export"]')
        with page.expect_download() as dl:
            page.click('[data-act="export"]')
        path = SHOTS / 'sauvegarde.json'; dl.value.save_as(str(path))
        data = json.loads(path.read_text())
        check('Export : pièces, tenues et photos', len(data['items']) == n_items and len(data['outfits']) == n_out and len(data['photos']) == 3 and any(i.get('sticker') for i in data['items']) and data['me']['height'] == 178 and len(data['history']) >= 3)
        page.click('[data-act="wipe"]'); page.click('.dialog .btn-danger'); page.wait_for_timeout(200); page.click('.dialog .btn-danger'); page.wait_for_timeout(500)
        check('Effacement', len(S()['items']) == 0)
        page.goto(URL + '#/reglages'); page.wait_for_selector('#import-file')
        page.set_input_files('#import-file', str(path)); page.click('.dialog .btn-danger')  # Remplacer tout
        check('Import réussi', toast_has('Import réussi'))
        check('Import : données restaurées', len(S()['items']) == n_items and len(S()['outfits']) == n_out)
        page.goto(URL + '#/dressing'); page.wait_for_selector('.segmented'); page.click('[data-act="w-status"][data-v="all"]'); page.wait_for_selector('.grid'); page.wait_for_timeout(500)
        has_photo = page.evaluate("[...document.querySelectorAll('[data-photo]')].some(e => e.style.backgroundImage.includes('blob:'))")
        check('Import : photo restaurée et affichée', has_photo)

        page.close()
        page2 = ctx.new_page(); page2.on('pageerror', lambda e: errors.append(str(e)))
        page2.goto(URL + '#/dressing'); page2.wait_for_selector('.topbar'); page2.wait_for_timeout(500)
        n2 = page2.evaluate('window.__drip ? window.__drip.state.items.length : -1')
        check('Données présentes dans un nouvel onglet', n2 == n_items, f'{n2} / {page2.inner_text("main")[:200]}')

        # 16. Hors connexion (service worker)
        page2.wait_for_timeout(800); page2.reload(); page2.wait_for_timeout(800)
        ctx.set_offline(True)
        page2.reload(); page2.wait_for_selector('.logo, .topbar', timeout=5000)
        check('App ouvrable hors connexion', page2.locator('.topbar').count() >= 1)
        ctx.set_offline(False)

        # 17. Pas de débordement horizontal
        for r_ in ['home', 'dressing', 'styliste', 'favoris', 'reglages', 'profil']:
            page2.goto(URL + '#/' + r_); page2.wait_for_timeout(250)
            w = page2.evaluate('document.documentElement.scrollWidth')
            check(f'Pas de défilement horizontal ({r_})', w <= 402, w)
        page2.goto(URL + '#/home'); page2.wait_for_timeout(300); shot_p = page2.screenshot(path=str(SHOTS / '09-accueil-final.png'))

        real_errors = [e for e in errors if 'ERR_INTERNET_DISCONNECTED' not in e and 'Failed to fetch' not in e and 'ERR_FAILED' not in e]
        check('Aucune erreur JavaScript', not real_errors, real_errors[:5])

        # 18. Profil féminin (nouveau contexte = nouvel appareil)
        ctx2 = browser.new_context(viewport={'width': 402, 'height': 874}, device_scale_factor=3, is_mobile=True, has_touch=True, locale='fr-FR')
        ctx2.add_init_script(SPLASH_OFF)
        pf = ctx2.new_page(); pf.on('pageerror', lambda e: errors.append(str(e)))
        pf.goto(URL); pf.wait_for_selector('.welcome')
        pf.click('[data-act="pick-gender"][data-v="f"]'); pf.wait_for_selector('.stats')
        accent = pf.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")
        check('Profil féminin : accent rose', accent.lower() == '#ff8fc7', accent)
        S2 = lambda: pf.evaluate('window.__drip.state')
        def add_f(name, cat, color, style=None):
            pf.click('.tab-add'); pf.wait_for_selector('#f-name')
            pf.fill('#f-name', name); pf.click(f'[data-k="category"][data-v="{cat}"]'); pf.click(f'[data-k="primaryColor"][data-v="{color}"]')
            if style: pf.click(f'[data-k="style"][data-v="{style}"]')
            pf.click('[data-save]'); pf.wait_for_selector('.sheet', state='detached', timeout=4000); pf.wait_for_timeout(200)
        pf.click('.tab-add'); pf.wait_for_selector('#f-name')
        cats = pf.evaluate("[...document.querySelectorAll('[data-k=category]')].map(b => b.textContent)")
        check('Profil féminin : robes, jupes et sacs proposés', any('Robes' in c for c in cats) and any('Jupes' in c for c in cats) and any('Sacs' in c for c in cats), cats)
        shot_f = pf.screenshot(path=str(SHOTS / '10-feminin-ajout.png'))
        pf.click('[data-cancel]'); pf.wait_for_timeout(400)
        add_f('Robe noire', 'robes', 'noir', 'chic'); add_f('Escarpins noirs', 'chaussures', 'noir', 'elegant'); add_f('Jupe plissée', 'jupes', 'beige', 'casual'); add_f('Top blanc', 'hauts', 'blanc', 'casual')
        pf.goto(URL + '#/styliste'); pf.wait_for_selector('.mode-switch')
        pf.click('[data-act="st-mode"][data-v="local"]'); pf.click('[data-act="st-set"][data-k="style"][data-v="classe"]')
        kinds = set()
        pf.click('[data-act="st-generate"]'); pf.wait_for_selector('.result')
        for _ in range(6):
            sl = S2()['st']['result']['outfit']['slots']
            kinds.add('robe' if sl['dress'] else 'separes')
            pf.click('[data-act="st-another"]'); pf.wait_for_timeout(150)
        check('Profil féminin : tenues robe et jupe+haut proposées', kinds == {'robe', 'separes'}, kinds)
        pf.screenshot(path=str(SHOTS / '11-feminin-tenue.png'))
        pf.goto(URL + '#/reglages'); pf.wait_for_selector('[data-act="set-gender"]')
        pf.click('[data-act="set-gender"][data-v="m"]'); pf.wait_for_timeout(300)
        pf.goto(URL + '#/dressing'); pf.wait_for_selector('.segmented')
        chips = pf.evaluate("[...document.querySelectorAll('[data-act=w-cat]')].map(b => b.textContent)")
        check('Changer de profil ne supprime pas les pièces (robes toujours visibles)', any('Robes' in c for c in chips) and len(S2()['items']) == 4, chips)

        # 19. Animation d'ouverture (contexte sans neutralisation du splash)
        ctx3 = browser.new_context(viewport={'width': 402, 'height': 874}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='fr-FR')
        ps = ctx3.new_page(); ps.on('pageerror', lambda e: errors.append(str(e)))
        ps.goto(URL); ps.wait_for_selector('#splash')
        ps.wait_for_timeout(1700)
        ps.screenshot(path=str(SHOTS / '12-splash.png'))
        check('Animation d\'ouverture affichée', ps.locator('#splash').count() == 1 and ps.locator('.splash-mark').count() == 1)
        word_visible = ps.evaluate("getComputedStyle(document.querySelector('.splash-word span')).opacity")
        check('Animation : le nom apparaît', float(word_visible) > 0.9, word_visible)
        ps.wait_for_selector('#splash', state='detached', timeout=6000)
        check('Animation : disparaît toute seule', ps.locator('#splash').count() == 0)
        browser.close()
finally:
    server.terminate()

failed = [r for r in results if not r[1]]
print(f'\n{len(results) - len(failed)}/{len(results)} vérifications réussies')
sys.exit(1 if failed else 0)
