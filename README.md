# Phrasomètre pour Windows

Même application que la version Android, même compte Google, mêmes données Firestore (`users/{uid}`).
Livrée avec un **installateur Windows** (`Phrasometre-Setup-1.0.0.exe`).

## 1. Configuration (sans code secret)
La connexion Google passe par une petite page (dossier `docs/`) hébergée sur GitHub Pages.
1. Envoyer ce projet sur GitHub dans un dépôt nommé **PhrasometreWin**.
2. GitHub → dépôt → **Settings → Pages** → Source : *Deploy from a branch*, branche `main`, dossier **/docs** → Save.
   La page sera : `https://sitraka0417-cell.github.io/PhrasometreWin/` (déjà indiquée dans `config.json`, champ `authPage`).
3. Firebase → **Authentication → Paramètres → Domaines autorisés** → *Ajouter un domaine* : `sitraka0417-cell.github.io`.

## 2. Compiler l'installateur
1. Envoyer ce dossier sur GitHub.
2. Onglet **Actions** → « Installateur Windows Phrasomètre » → Run workflow.
3. Télécharger l'artefact **Phrasometre-Windows-Setup** : le fichier `.exe` est l'installateur.

Test local (Windows) : `npm install` puis `npm start`.
