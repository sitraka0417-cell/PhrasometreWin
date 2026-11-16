# Phrasomètre pour Windows (v1.1.1)

Même application que la version Android, même compte Google, mêmes données Firestore (`users/{uid}`).
Livrée avec un **installateur Windows** (`Phrasometre-Setup.exe`).

## Mise à jour sans perte de données
Lancez simplement le nouvel installateur : il remplace l'ancienne version (même dossier).
Vos phrases, clics, réglages et votre connexion Google sont conservés (ils sont dans `%APPDATA%`, jamais touchés par l'installateur).

## Nouveautés 1.1.0
- Correction : la liste (Saisie, Statistiques, Paramètres) défile maintenant correctement.
- Verrouillage par code PIN (4 à 8 chiffres) : Paramètres → Sécurité. Raccourci Ctrl+L.
- Verrouillage automatique : inactivité, fenêtre réduite, verrouillage de la session Windows.

## Configuration de la connexion Google (déjà faite si la v1.0 fonctionne)
1. Dépôt GitHub public + GitHub Pages sur le dossier `/docs` (`authPage` dans `config.json`).
2. Firebase → Authentication → Paramètres → Domaines autorisés : `sitraka0417-cell.github.io`.

## Compiler l'installateur
GitHub → Actions → « Installateur Windows Phrasomètre » → Run workflow → artefact **Phrasometre-Windows-Setup**.

## Lien de téléchargement à partager
Après chaque « Run workflow », l'installateur est publié automatiquement dans les **Releases** :
- Téléchargement direct : https://github.com/sitraka0417-cell/PhrasometreWin/releases/latest/download/Phrasometre-Setup.exe
- Page de téléchargement : https://sitraka0417-cell.github.io/PhrasometreWin/telecharger.html
