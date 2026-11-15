import { auth } from './firebase.js';
import { GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth';
import { depot, MAX_DEFAUT } from './data.js';
import * as S from './stats.js';
import { ico, LOGO, GOOGLE_G } from './icons.js';

const natif = window.natif || {
  googleLogin: async () => ({ ok: false, erreur: 'HORS_ELECTRON' }),
  sauverFichier: async () => ({ ok: false }), exporterPdf: async () => ({ ok: false }),
  notifier: async () => {}, options: async () => {}, barreTitre: async () => {}, version: async () => '1.0.0'
};

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const plur = (n, a, b) => (n > 1 ? b : a);

// ───────── Réglages ─────────
const CLE_REGLAGES = 'phrasometre.reglages';
const DEFAUT = {
  theme: 'auto', echelle: 1, rappelActif: false, rappelHeure: '20:00',
  zoneNotification: false, demarrage: false, bandeauMasque: false, dernierRappel: ''
};
function chargerReglages() {
  try { return { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE_REGLAGES) || '{}') }; } catch (e) { return { ...DEFAUT }; }
}

const E = {
  ecran: 'accueil',
  moisAccueil: S.moisCourant(),
  moisSaisie: S.moisCourant(),
  user: null,
  enCours: false,
  migration: false,
  brouillon: '',
  dernier: null,
  menuExport: false,
  stats: { periode: 'MOIS', mode: 'PHRASES', ancre: new Date(), moisSel: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), filtre: null },
  reglages: chargerReglages()
};

function sauverReglages() {
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(E.reglages)); } catch (e) { /* ignoré */ }
}

function appliquerTheme() {
  const r = E.reglages;
  document.documentElement.dataset.theme = r.theme;
  document.documentElement.style.fontSize = `${16 * r.echelle}px`;
  requestAnimationFrame(() => {
    const cs = getComputedStyle(document.documentElement);
    natif.barreTitre({ color: cs.getPropertyValue('--bg').trim(), symbolColor: cs.getPropertyValue('--on-bg').trim() });
  });
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', appliquerTheme);

function synchroniserOptions() {
  natif.options({ fermerZone: E.reglages.zoneNotification, demarrage: E.reglages.demarrage });
}

// ───────── Composants ─────────
const TITRES = { accueil: 'Accueil', saisie: 'Saisie des phrases', stats: 'Statistiques', reglages: 'Paramètres' };

function boutonGoogle(bloc) {
  return `<button class="btn-google ${bloc ? 'bloc' : ''}" data-action="connexion" ${E.enCours ? 'disabled' : ''}>
    ${E.enCours ? '<span class="spinner"></span>' : GOOGLE_G}<span>${E.enCours ? 'Connexion…' : 'Se connecter avec Google'}</span></button>`;
}

let tTimer = null;
function toast(msg, opt = {}) {
  const racine = $('#toasts');
  racine.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${opt.action ? `<button class="toast-action">${esc(opt.action)}</button>` : ''}</div>`;
  clearTimeout(tTimer);
  const btn = racine.querySelector('.toast-action');
  if (btn) btn.onclick = () => { clearTimeout(tTimer); racine.innerHTML = ''; opt.onAction && opt.onAction(); };
  tTimer = setTimeout(() => { racine.innerHTML = ''; }, opt.duree || 4500);
}

function modal({ titre, corps, boutons, large }) {
  const racine = $('#modal-root');
  racine.innerHTML = `<div class="voile"><div class="dialogue ${large ? 'large' : ''}" role="dialog" aria-label="${esc(titre)}">
    <h2>${esc(titre)}</h2><div class="dialogue-corps">${corps}</div>
    <div class="dialogue-actions">${boutons.map((b, i) => `<button class="btn ${b.classe || 'texte'}" data-i="${i}">${esc(b.libelle)}</button>`).join('')}</div></div></div>`;
  const fermer = () => { racine.innerHTML = ''; document.removeEventListener('keydown', surTouche, true); };
  const valider = () => { const b = racine.querySelector('.btn.plein, .btn.tonal'); if (b) b.click(); };
  function surTouche(e) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); valider(); }
  }
  document.addEventListener('keydown', surTouche, true);
  racine.querySelector('.voile').addEventListener('mousedown', (e) => { if (e.target.classList.contains('voile')) fermer(); });
  racine.querySelectorAll('[data-i]').forEach((btn) => {
    btn.onclick = () => {
      const b = boutons[Number(btn.dataset.i)];
      const r = b.onClick ? b.onClick(racine) : undefined;
      if (r !== false) fermer();
    };
  });
  const premier = racine.querySelector('input, textarea');
  if (premier) { premier.focus(); if (premier.select) premier.select(); }
  return fermer;
}

function confirmer(titre, texte, libelle, onOk, danger = true) {
  modal({
    titre, corps: `<p>${texte}</p>`,
    boutons: [
      { libelle: 'Annuler', classe: 'texte' },
      { libelle, classe: danger ? 'plein danger' : 'plein', onClick: () => { onOk(); } }
    ]
  });
}

function selecteurMois(cible) {
  const m = cible === 'accueil' ? E.moisAccueil : E.moisSaisie;
  return `<div class="mois">
    <button class="btn icone" data-action="mois" data-cible="${cible}" data-delta="-1" aria-label="Mois précédent">${ico('left')}</button>
    <button class="btn texte" data-action="choisir-mois" data-cible="${cible}">${ico('calendar')}<span>${S.moisLibelle(m)}</span></button>
    <button class="btn icone" data-action="mois" data-cible="${cible}" data-delta="1" aria-label="Mois suivant">${ico('right')}</button></div>`;
}

function dialogueMois(cible) {
  const courant = cible === 'accueil' ? E.moisAccueil : E.moisSaisie;
  let annee = parseInt(courant.slice(0, 4), 10);
  const corps = () => `<div class="annee"><button class="btn icone" data-an="-1">${ico('left')}</button><span>${annee}</span><button class="btn icone" data-an="1">${ico('right')}</button></div>
    <div class="grille-mois">${Array.from({ length: 12 }, (_, i) => {
      const m = `${annee}-${pad(i + 1)}`;
      return `<button class="puce ${m === courant ? 'actif' : ''}" data-m="${m}">${S.nomMoisCourt(i + 1)}</button>`;
    }).join('')}</div>`;
  const fermer = modal({ titre: 'Choisir un mois', corps: corps(), boutons: [{ libelle: 'Fermer' }] });
  const racine = $('#modal-root');
  const lier = () => {
    racine.querySelectorAll('[data-an]').forEach((b) => b.onclick = () => {
      annee += Number(b.dataset.an);
      racine.querySelector('.dialogue-corps').innerHTML = corps();
      lier();
    });
    racine.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
      if (cible === 'accueil') E.moisAccueil = b.dataset.m; else E.moisSaisie = b.dataset.m;
      fermer();
      rendreContenu();
    });
  };
  lier();
}

// ───────── Écrans ─────────
function comptesParPhrase() {
  const m = new Map();
  depot.etat.clics.forEach((c) => m.set(c.phraseId, (m.get(c.phraseId) || 0) + 1));
  return m;
}

function ecranAccueil() {
  const d = depot.etat;
  const mois = E.moisAccueil;
  const phrases = d.phrases.filter((p) => p.mois === mois).sort((a, b) => a.ordre - b.ordre);
  const comptes = comptesParPhrase();
  const jour = S.jourStr(new Date());
  const totalJour = d.clics.filter((c) => c.jour === jour).length;
  const totalMois = phrases.reduce((s, p) => s + (comptes.get(p.id) || 0), 0);
  const serie = S.serieActuelle(d.clics);

  const resume = `<section class="resume">
    <div class="stat"><div class="valeur">${totalJour}</div><div class="libelle">Aujourd'hui</div></div>
    <div class="stat"><div class="valeur">${totalMois}</div><div class="libelle">${mois === S.moisCourant() ? 'Ce mois' : 'Ce groupe'}</div></div>
    <div class="stat"><div class="valeur">${serie} ${plur(serie, 'jour', 'jours')}</div><div class="libelle">Série</div></div></section>`;

  const bandeau = (!E.user && !E.reglages.bandeauMasque) ? `<section class="carte bandeau">
    <div class="txt"><h2>Gardez vos phrases en sécurité</h2><p class="aide">Connectez-vous pour sauvegarder vos données et les retrouver sur votre téléphone ou un autre ordinateur.</p></div>
    ${boutonGoogle(false)}<button class="btn texte" data-action="plus-tard">Plus tard</button></section>` : '';

  let liste;
  if (!phrases.length) {
    liste = `<section class="carte vide"><h2>Aucune phrase pour ${S.moisLibelle(mois)}</h2>
      <p>Ajoutez les phrases de ce mois dans la section Saisie, puis cliquez dessus ici pour les compter.</p>
      <button class="btn plein" data-action="nav" data-ecran="saisie">Saisir des phrases</button></section>`;
  } else {
    liste = `<div class="grille">${phrases.map((p) => {
      const n = comptes.get(p.id) || 0;
      const prog = p.objectif > 0 ? `<div class="progression"><i style="width:${Math.min(100, (n / p.objectif) * 100)}%"></i></div>
        <div class="progression-txt">${n >= p.objectif ? 'Objectif atteint : ' : ''}${n} / ${p.objectif}</div>` : '';
      return `<button class="phrase" data-action="compter" data-id="${p.id}"><div class="phrase-corps"><div class="phrase-texte">${esc(p.texte)}</div>${prog}</div>
        <div class="badge ${E.dernier === p.id ? 'pop' : ''}">${n}</div></button>`;
    }).join('')}</div>`;
  }
  return `<div class="page">${resume}${bandeau}${liste}</div>`;
}

function ecranSaisie() {
  const d = depot.etat;
  const mois = E.moisSaisie;
  const phrases = d.phrases.filter((p) => p.mois === mois).sort((a, b) => a.ordre - b.ordre);
  const comptes = comptesParPhrase();
  const max = depot.maxDuGroupe(mois);
  const complet = phrases.length >= max;
  const precedent = S.ajouterMois(mois, -1);
  const precedentDispo = d.phrases.some((p) => p.mois === precedent);
  const groupeExiste = phrases.length > 0 || d.groupes.some((g) => g.mois === mois);

  return `<div class="page">
    <section class="capacite">
      <div style="font-weight:600;font-size:.85rem">Phrases du groupe</div>
      <div class="ligne">
        <div class="nombre">${phrases.length} / ${max}</div>
        <button class="btn icone" data-action="max" data-delta="-1" ${max <= Math.max(phrases.length, 1) ? 'disabled' : ''} aria-label="Diminuer le maximum">${ico('minus')}</button>
        <button class="btn tonal" data-action="max-saisie">Maximum : ${max}</button>
        <button class="btn icone" data-action="max" data-delta="1" ${max >= 500 ? 'disabled' : ''} aria-label="Augmenter le maximum">${ico('plus')}</button>
      </div>
      <div class="progression"><i style="width:${max ? Math.min(100, (phrases.length / max) * 100) : 0}%"></i></div>
    </section>
    <section>
      <label class="etiquette" for="nouvelle-phrase">Nouvelle phrase</label>
      <div class="champ-ligne">
        <input id="nouvelle-phrase" class="champ" type="text" autocomplete="off" placeholder="${complet ? 'Groupe complet : augmentez le maximum' : 'Saisissez une phrase puis Entrée'}" value="${esc(E.brouillon)}" ${complet ? 'disabled' : ''}>
        <button class="btn plein" data-action="ajouter" ${complet ? 'disabled' : ''}>${ico('plus')}<span>Ajouter</span></button>
      </div>
      <div class="rangee" style="margin-top:8px">
        <button class="btn texte" data-action="liste" ${complet ? 'disabled' : ''}>${ico('file')}<span>Ajouter une liste</span></button>
        ${precedentDispo ? `<button class="btn texte" data-action="copier" data-source="${precedent}">${ico('copy')}<span>Copier le mois précédent</span></button>` : ''}
      </div>
    </section>
    ${phrases.length ? `<div class="liste">${phrases.map((p) => {
      const n = comptes.get(p.id) || 0;
      return `<div class="item"><div class="corps"><div>${esc(p.texte)}</div>
        <div class="sous">${n} ${plur(n, 'clic', 'clics')}${p.objectif > 0 ? `, objectif ${p.objectif}` : ''}</div></div>
        <button class="btn icone" data-action="edit" data-id="${p.id}" aria-label="Modifier">${ico('edit')}</button>
        <button class="btn icone danger" data-action="suppr" data-id="${p.id}" aria-label="Supprimer">${ico('trash')}</button></div>`;
    }).join('')}</div>` : `<p class="rien">Aucune phrase pour ${S.moisLibelle(mois)}.</p>`}
    ${groupeExiste ? `<button class="btn danger bloc" data-action="suppr-groupe">${ico('trash')}<span>Supprimer tout le groupe de ${S.moisLibelle(mois)}</span></button>` : ''}
  </div>`;
}

function kpi(icone, titre, valeur, detail, classe = '') {
  return `<div class="kpi"><div class="t">${ico(icone)}<span>${titre}</span></div><div class="v">${valeur}</div><div class="d ${classe}">${detail || ''}</div></div>`;
}

function calculStats() {
  const s = E.stats;
  return S.calculer(depot.etat, s.periode, s.mode, s.ancre, s.moisSel, s.filtre);
}

function ecranStats() {
  const s = E.stats;
  const res = calculStats();
  const libelle = S.libellePeriode(s.periode, s.ancre);
  const suivantOk = S.jourStr(S.plage(s.periode, s.ancre).fin) < S.jourStr(new Date());
  const variation = res.precedent > 0 ? Math.round(((res.total - res.precedent) * 100) / res.precedent) : null;
  const detailTotal = variation == null ? (res.total > 0 ? 'Aucune donnée avant' : '') : `${variation >= 0 ? '+' : ''}${variation} % vs précédent`;
  const max = res.lignes.reduce((m, l) => Math.max(m, l.valeur), 0);
  const maxBarre = Math.max(1, ...res.barres.map((b) => b.valeur));
  const nomFiltre = s.filtre ? (res.lignes.find((l) => l.cle === s.filtre) || {}).libelle || 'Sélection' : '';

  const moisPuces = s.periode === 'ANNEE' ? `<div class="puces">
    <button class="puce" data-action="mois-tous">Tous les mois</button><button class="puce" data-action="mois-aucun">Aucun</button>
    ${Array.from({ length: 12 }, (_, i) => `<button class="puce ${s.moisSel.has(i + 1) ? 'actif' : ''}" data-action="mois-sel" data-m="${i + 1}">${S.nomMoisCourt(i + 1)}</button>`).join('')}</div>` : '';

  return `<div class="page">
    <div class="barre-outils">
      <div class="seg">${S.PERIODES.map(([k, l]) => `<button class="${s.periode === k ? 'actif' : ''}" data-action="periode" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="seg">${[['PHRASES', 'Phrases une à une'], ['GROUPES', 'Groupes par mois']].map(([k, l]) => `<button class="${s.mode === k ? 'actif' : ''}" data-action="mode" data-v="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="navigateur" style="justify-content:center">
      <button class="btn icone" data-action="periode-delta" data-delta="-1" aria-label="Période précédente">${ico('left')}</button>
      <div class="libelle">${esc(libelle)}</div>
      <button class="btn icone" data-action="periode-delta" data-delta="1" ${suivantOk ? '' : 'disabled'} aria-label="Période suivante">${ico('right')}</button>
    </div>
    ${moisPuces}
    <div class="kpis">
      ${kpi('touch', 'Total des clics', res.total, detailTotal, variation == null ? '' : variation >= 0 ? 'pos' : 'neg')}
      ${kpi('today', 'Jours actifs', res.joursActifs, res.joursActifs ? `${res.moyenneJourActif.toFixed(1).replace('.', ',')} clics / jour actif` : '')}
      ${kpi('chart', 'Meilleur jour', res.meilleurJour ? res.meilleurJourValeur : '—', res.meilleurJour || '')}
      ${kpi('flame', 'Série en cours', `${res.serieActuelle} j`, `Record : ${res.meilleureSerie} j`)}
    </div>
    <section class="carte">
      <h2>${res.titreBarres}</h2>
      ${s.filtre ? `<div class="etiquette-filtre"><span>${esc(nomFiltre)}</span><button data-action="filtre" data-cle="${esc(s.filtre)}" aria-label="Retirer le filtre">${ico('close')}</button></div>` : ''}
      ${res.total === 0 ? '<p class="rien">Aucun clic sur cette période.</p>' : `<div class="graphe">${res.barres.map((b) => `
        <div class="col"><span class="val">${b.valeur || ''}</span><div class="b ${b.valeur ? '' : 'nul'}" style="height:${b.valeur ? Math.max(4, (b.valeur / maxBarre) * 170) : 2}px"></div><span class="lab">${esc(b.etiquette)}</span></div>`).join('')}</div>`}
    </section>
    <section class="carte">
      <h2>${s.mode === 'PHRASES' ? 'Clics par phrase' : 'Clics par groupe'}</h2>
      <p class="aide" style="margin-bottom:8px">Cliquez sur une ligne pour filtrer le graphique.</p>
      ${res.lignes.length ? res.lignes.map((l) => `<button class="rang ${s.filtre === l.cle ? 'actif' : ''}" data-action="filtre" data-cle="${esc(l.cle)}">
        <div class="l1"><div class="nom"><div>${esc(l.libelle)}</div><div class="det">${esc(l.detail)}</div></div><div class="n">${l.valeur}</div></div>
        <div class="piste"><i style="width:${max ? (l.valeur / max) * 100 : 0}%"></i></div></button>`).join('') : '<p class="rien">Aucune donnée à afficher.</p>'}
    </section>
  </div>`;
}

function ecranReglages() {
  const r = E.reglages;
  const u = E.user;
  const compte = u ? `<div class="rangee" style="flex-wrap:nowrap;gap:14px">
      <div class="avatar" style="width:52px;height:52px;font-size:1.3rem">${esc((u.nom || u.email || '?').slice(0, 1).toUpperCase())}</div>
      <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(u.nom || 'Compte Google')}</div><div class="aide">${esc(u.email)}</div></div></div>
    <div class="reglage" style="margin-top:6px">${ico('cloud')}<div class="txt"><div class="aide">Synchronisation active : chaque ajout, modification ou suppression est sauvegardé automatiquement et partagé avec l'application Android.</div></div></div>
    <button class="btn contour bloc" data-action="deconnexion">${ico('logout')}<span>Se déconnecter</span></button>`
    : `<p class="aide" style="margin-bottom:14px">Mode local : vos données restent sur cet ordinateur. Connectez-vous pour les sauvegarder et les retrouver sur votre téléphone ou un autre ordinateur.</p>${boutonGoogle(true)}`;
  const tuile = (cle, lib, fond) => `<button class="tuile ${r.theme === cle ? 'actif' : ''}" data-action="theme" data-v="${cle}"><span class="rond" style="background:${fond}"></span>${lib}</button>`;
  const interrupteur = (icone, titre, aide, cle, coche) => `<div class="reglage">${ico(icone)}<div class="txt"><div class="titre">${titre}</div>${aide ? `<div class="aide">${aide}</div>` : ''}</div>
    <label class="switch"><input type="checkbox" data-change="${cle}" ${coche ? 'checked' : ''}><span></span></label></div>`;

  return `<div class="page">
    <section class="carte"><h2 style="margin-bottom:14px">Compte et synchronisation</h2>${compte}</section>
    <section class="carte"><h2 style="margin-bottom:14px">Apparence</h2>
      <div class="tuiles">
        ${tuile('auto', 'Automatique', 'linear-gradient(135deg,#F5F7F6 50%,#0E1413 50%)')}
        ${tuile('clair', 'Clair', 'linear-gradient(135deg,#F5F7F6 50%,#0E6B68 50%)')}
        ${tuile('sombre', 'Sombre', 'linear-gradient(135deg,#0E1413 50%,#7FD6D1 50%)')}
        ${tuile('special', 'Spécial', 'linear-gradient(135deg,#150F26 50%,#D0A8FF 50%)')}
      </div>
      <div class="reglage" style="margin-top:14px">${ico('text')}<div class="txt"><div class="titre">Taille du texte</div></div><b id="echelle-val">${Math.round(r.echelle * 100)} %</b></div>
      <input type="range" min="0.8" max="1.4" step="0.1" value="${r.echelle}" data-input="echelle" aria-label="Taille du texte">
      <div class="apercu">Exemple : voici une phrase à compter.</div></section>
    <section class="carte"><h2>Rappel quotidien</h2>
      ${interrupteur('bell', 'Me rappeler de compter', "Notification Windows si aucun clic n'a été fait aujourd'hui (l'application doit rester ouverte ou réduite dans la zone de notification).", 'rappel', r.rappelActif)}
      ${r.rappelActif ? `<div class="reglage"><div class="txt"><div class="titre">Heure du rappel</div></div><input class="champ" type="time" data-change="rappel-heure" value="${r.rappelHeure}"></div>` : ''}</section>
    <section class="carte"><h2>Windows</h2>
      ${interrupteur('power', 'Lancer au démarrage de Windows', '', 'demarrage', r.demarrage)}
      ${interrupteur('download', 'Réduire dans la zone de notification', "À la fermeture, l'application continue en arrière-plan (utile pour le rappel).", 'zone', r.zoneNotification)}</section>
    <section class="carte"><h2 style="margin-bottom:14px">Données</h2>
      <div class="rangee"><button class="btn contour" data-action="export-csv">${ico('download')}<span>Exporter toutes les données (CSV)</span></button>
      <button class="btn danger" data-action="tout-suppr">${ico('trash')}<span>Supprimer toutes les données</span></button></div></section>
    <p class="aide" style="text-align:center" id="version-txt">Phrasomètre</p>
  </div>`;
}

// ───────── Rendu ─────────
function compteHtml() {
  const u = E.user;
  if (u) {
    return `<div class="compte"><div class="avatar">${esc((u.nom || u.email || '?').slice(0, 1).toUpperCase())}</div>
      <div class="compte-txt"><div class="compte-nom">${esc(u.nom || 'Compte Google')}</div><div class="compte-etat">${ico('cloud')}Synchronisé</div></div></div>`;
  }
  return `<div class="local-note">Mode local : données non synchronisées.</div>${boutonGoogle(true)}`;
}

function rendreNav() {
  const items = [['accueil', 'home'], ['saisie', 'edit'], ['stats', 'chart'], ['reglages', 'sliders']];
  $('#nav').innerHTML = `<div class="marque">${LOGO}<div><div class="marque-nom">Phrasomètre</div><div class="marque-sous">Compteur de phrases</div></div></div>
    ${items.map(([k, i]) => `<button class="nav-item ${E.ecran === k ? 'actif' : ''}" data-action="nav" data-ecran="${k}">${ico(i)}<span>${TITRES[k]}</span></button>`).join('')}
    <div class="nav-bas">${compteHtml()}</div>`;
}

function rendreTopbar() {
  let droite = '';
  if (E.ecran === 'accueil') droite = selecteurMois('accueil');
  else if (E.ecran === 'saisie') droite = selecteurMois('saisie');
  else if (E.ecran === 'stats') {
    droite = `<div class="menu-wrap"><button class="btn contour" data-action="menu-export">${ico('download')}<span>Exporter</span></button>
      ${E.menuExport ? `<div class="menu"><button data-action="export-csv">${ico('file')}<span>Tout exporter en CSV</span></button>
      <button data-action="export-pdf">${ico('file')}<span>Exporter la vue en PDF</span></button></div>` : ''}</div>`;
  }
  $('#topbar').innerHTML = `<h1>${TITRES[E.ecran]}</h1>${droite}`;
}

function rendreContenu() {
  const conteneur = $('#contenu');
  const actif = document.activeElement;
  const id = actif && actif.id;
  const debut = actif && actif.selectionStart;
  const fin = actif && actif.selectionEnd;
  const defil = conteneur.scrollTop;
  rendreTopbar();
  conteneur.innerHTML = { accueil: ecranAccueil, saisie: ecranSaisie, stats: ecranStats, reglages: ecranReglages }[E.ecran]();
  conteneur.scrollTop = defil;
  if (id) {
    const el = document.getElementById(id);
    if (el) { el.focus(); if (el.setSelectionRange && debut != null) try { el.setSelectionRange(debut, fin); } catch (e) { /* ignoré */ } }
  }
  E.dernier = null;
  if (E.ecran === 'reglages') natif.version().then((v) => { const el = $('#version-txt'); if (el) el.textContent = `Phrasomètre ${v}`; });
}

function rendreTout() { rendreNav(); rendreContenu(); }
let rafPlan = false;
function planifierRendu() {
  if (rafPlan) return;
  rafPlan = true;
  requestAnimationFrame(() => { rafPlan = false; rendreContenu(); });
}

// ───────── Export ─────────
function dateFichier() { return S.jourStr(new Date()); }

async function exporterCsv() {
  const r = await natif.sauverFichier({
    nom: `phrasometre-donnees-${dateFichier()}.csv`,
    filtres: [{ name: 'CSV', extensions: ['csv'] }],
    texte: S.genererCsv(depot.etat)
  });
  if (r.ok) toast('Export CSV enregistré.'); else if (!r.annule) toast("Échec de l'export CSV.");
}

function rapportHtml(res, libelle, modeLib) {
  const max = Math.max(1, ...res.barres.map((b) => b.valeur));
  const maxL = Math.max(1, ...res.lignes.map((l) => l.valeur));
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{font-family:"Segoe UI",sans-serif;color:#171D1C;margin:0}
    h1{color:#0B5C59;font-size:24px;margin:0 0 2px} .sous{color:#55615F;margin-bottom:18px}
    .k{display:flex;gap:10px;margin-bottom:20px}.k div{flex:1;border:1px solid #C4CCCA;border-radius:12px;padding:10px 12px}
    .k b{display:block;font-size:22px;color:#0E6B68}.k span{font-size:11px;color:#55615F}
    h2{font-size:15px;margin:18px 0 8px}
    .g{display:flex;align-items:flex-end;gap:3px;height:150px;border-bottom:1px solid #C4CCCA}
    .g div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:9px;color:#55615F;height:100%}
    .g i{display:block;width:70%;background:#0E6B68;border-radius:4px 4px 0 0}
    .e{display:flex;gap:3px;font-size:9px;color:#55615F;margin-top:3px}.e span{flex:1;text-align:center}
    table{width:100%;border-collapse:collapse;font-size:12px}td{padding:7px 4px;border-bottom:1px solid #E1E7E5}
    td.n{text-align:right;font-weight:700;color:#0E6B68;width:60px}.p{height:5px;background:#E1E7E5;border-radius:3px;margin-top:4px}.p i{display:block;height:5px;background:#B8650A;border-radius:3px}
  </style></head><body>
    <h1>Phrasomètre : statistiques</h1><div class="sous">${esc(libelle)} · ${esc(modeLib)}</div>
    <div class="k"><div><b>${res.total}</b><span>Total des clics</span></div><div><b>${res.joursActifs}</b><span>Jours actifs</span></div>
    <div><b>${res.serieActuelle} j</b><span>Série en cours (record ${res.meilleureSerie} j)</span></div></div>
    <h2>${res.titreBarres}</h2>
    <div class="g">${res.barres.map((b) => `<div>${b.valeur || ''}<i style="height:${(b.valeur / max) * 120}px"></i></div>`).join('')}</div>
    <div class="e">${res.barres.map((b) => `<span>${esc(b.etiquette)}</span>`).join('')}</div>
    <h2>${modeLib === 'Phrases une à une' ? 'Clics par phrase' : 'Clics par groupe'}</h2>
    <table>${res.lignes.filter((l) => l.valeur > 0).map((l) => `<tr><td>${esc(l.libelle)}<div class="p"><i style="width:${(l.valeur / maxL) * 100}%"></i></div></td><td class="n">${l.valeur}</td></tr>`).join('')}</table>
  </body></html>`;
}

async function exporterPdf() {
  const s = E.stats;
  const res = calculStats();
  const modeLib = s.mode === 'PHRASES' ? 'Phrases une à une' : 'Groupes par mois';
  const r = await natif.exporterPdf({ nom: `phrasometre-stats-${dateFichier()}.pdf`, html: rapportHtml(res, `${S.PERIODES.find((p) => p[0] === s.periode)[1]} : ${S.libellePeriode(s.periode, s.ancre)}`, modeLib) });
  if (r.ok) toast('Export PDF enregistré.'); else if (!r.annule) toast("Échec de l'export PDF.");
}

// ───────── Connexion Google ─────────
function messageErreur(code) {
  if (code === 'CONFIG_GOOGLE') return 'Configuration Google incomplète (voir le guide).';
  if (code === 'TIMEOUT') return 'Connexion expirée. Réessayez.';
  if (code === 'access_denied') return 'Connexion annulée.';
  if (code === 'EADDRINUSE') return 'Le port 8765 est occupé. Fermez l\'autre programme et réessayez.';
  if (code === 'redirect_uri_mismatch') return 'URI de redirection non autorisée dans Google Cloud (voir le guide).';
  return `Échec de la connexion Google (${code}).`;
}

async function connecterGoogle() {
  if (E.enCours) return;
  E.enCours = true; rendreTout();
  try {
    const r = await natif.googleLogin();
    if (!r.ok) { toast(messageErreur(r.erreur), { duree: 7000 }); return; }
    E.migration = true;
    await signInWithCredential(auth, GoogleAuthProvider.credential(r.idToken));
    toast('Connecté : synchronisation activée.');
  } catch (e) {
    E.migration = false;
    console.error(e);
    toast(`Échec de la connexion (${e.code || e.message}).`, { duree: 7000 });
  } finally {
    E.enCours = false; rendreTout();
  }
}

onAuthStateChanged(auth, (user) => {
  E.user = user ? { uid: user.uid, nom: user.displayName || '', email: user.email || '' } : null;
  if (user) { depot.connecter(user.uid, E.migration); E.migration = false; }
  else if (depot.uid) depot.deconnecter();
  rendreTout();
});

// ───────── Actions ─────────
const ACTIONS = {
  nav: (d) => { E.ecran = d.ecran; E.menuExport = false; rendreTout(); },
  mois: (d) => {
    const cle = d.cible === 'accueil' ? 'moisAccueil' : 'moisSaisie';
    E[cle] = S.ajouterMois(E[cle], Number(d.delta));
    rendreContenu();
  },
  'choisir-mois': (d) => dialogueMois(d.cible),
  compter: (d) => {
    const p = depot.etat.phrases.find((x) => x.id === d.id);
    if (!p) return;
    E.dernier = p.id;
    const id = depot.cliquer(p.id);
    if (id) toast(`+1 sur « ${p.texte} »`, { action: 'Annuler', duree: 10000, onAction: () => depot.annulerClic(id) });
  },
  connexion: () => connecterGoogle(),
  'plus-tard': () => { E.reglages.bandeauMasque = true; sauverReglages(); rendreContenu(); },
  max: (d) => depot.definirMax(E.moisSaisie, depot.maxDuGroupe(E.moisSaisie) + Number(d.delta)),
  'max-saisie': () => {
    const mois = E.moisSaisie;
    const min = Math.max(1, depot.etat.phrases.filter((p) => p.mois === mois).length);
    modal({
      titre: 'Nombre maximum de phrases',
      corps: `<div><label class="etiquette" for="m-max">Entre ${min} et 500, modifiable à tout moment</label><input id="m-max" class="champ" type="number" min="${min}" max="500" value="${depot.maxDuGroupe(mois)}"></div>`,
      boutons: [{ libelle: 'Annuler' }, {
        libelle: 'Enregistrer', classe: 'plein',
        onClick: (r) => {
          const v = parseInt(r.querySelector('#m-max').value, 10);
          if (!(v >= min && v <= 500)) { toast(`Saisissez un nombre entre ${min} et 500.`); return false; }
          depot.definirMax(mois, v);
        }
      }]
    });
  },
  ajouter: () => ajouterDepuisChamp(),
  liste: () => {
    const mois = E.moisSaisie;
    modal({
      titre: 'Ajouter une liste', large: true,
      corps: '<div><label class="etiquette" for="m-liste">Une phrase par ligne</label><textarea id="m-liste" class="champ" rows="8"></textarea></div>',
      boutons: [{ libelle: 'Annuler' }, {
        libelle: 'Ajouter', classe: 'plein',
        onClick: (r) => {
          const lignes = r.querySelector('#m-liste').value.split('\n').map((x) => x.trim()).filter(Boolean);
          if (!lignes.length) return false;
          const n = depot.ajouterPlusieurs(mois, lignes);
          toast(n < lignes.length ? `${n} phrase(s) ajoutée(s) : maximum atteint.` : `${n} phrase(s) ajoutée(s).`);
        }
      }]
    });
  },
  copier: (d) => {
    const n = depot.copierDepuis(d.source, E.moisSaisie);
    toast(n > 0 ? `${n} phrase(s) copiée(s) depuis ${S.moisLibelle(d.source)}.` : 'Rien à copier.');
  },
  edit: (d) => {
    const p = depot.etat.phrases.find((x) => x.id === d.id);
    if (!p) return;
    const n = depot.etat.clics.filter((c) => c.phraseId === p.id).length;
    modal({
      titre: 'Modifier la phrase',
      corps: `<div><label class="etiquette" for="e-texte">Phrase</label><input id="e-texte" class="champ" value="${esc(p.texte)}"></div>
        <div><label class="etiquette" for="e-cpt">Nombre de clics</label><input id="e-cpt" class="champ" type="number" min="0" max="99999" value="${n}"></div>
        <div><label class="etiquette" for="e-obj">Objectif (facultatif)</label><input id="e-obj" class="champ" type="number" min="0" max="99999" value="${p.objectif || ''}"></div>`,
      boutons: [{ libelle: 'Annuler' }, {
        libelle: 'Enregistrer', classe: 'plein',
        onClick: (r) => {
          const t = r.querySelector('#e-texte').value.trim();
          if (!t) return false;
          depot.modifierPhrase(p.id, t, parseInt(r.querySelector('#e-obj').value, 10) || 0);
          const c = parseInt(r.querySelector('#e-cpt').value, 10);
          if (!Number.isNaN(c) && c !== n) depot.definirCompteur(p.id, c);
        }
      }]
    });
  },
  suppr: (d) => {
    const p = depot.etat.phrases.find((x) => x.id === d.id);
    if (p) confirmer('Supprimer la phrase ?', `« ${esc(p.texte)} » et tous ses clics seront supprimés.`, 'Supprimer', () => depot.supprimerPhrase(p.id));
  },
  'suppr-groupe': () => {
    const mois = E.moisSaisie;
    const n = depot.etat.phrases.filter((p) => p.mois === mois).length;
    confirmer('Supprimer le groupe ?', `Les ${n} phrases de ${S.moisLibelle(mois)} et tous leurs clics seront supprimés. Action définitive.`, 'Tout supprimer', () => depot.supprimerGroupe(mois));
  },
  periode: (d) => { E.stats.periode = d.v; E.stats.ancre = new Date(); rendreContenu(); },
  mode: (d) => { E.stats.mode = d.v; E.stats.filtre = null; rendreContenu(); },
  'periode-delta': (d) => { E.stats.ancre = S.decaler(E.stats.periode, E.stats.ancre, Number(d.delta)); rendreContenu(); },
  'mois-tous': () => { E.stats.moisSel = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); rendreContenu(); },
  'mois-aucun': () => { E.stats.moisSel = new Set(); rendreContenu(); },
  'mois-sel': (d) => {
    const m = Number(d.m);
    if (E.stats.moisSel.has(m)) E.stats.moisSel.delete(m); else E.stats.moisSel.add(m);
    rendreContenu();
  },
  filtre: (d) => { E.stats.filtre = E.stats.filtre === d.cle ? null : d.cle; rendreContenu(); },
  'menu-export': () => { E.menuExport = !E.menuExport; rendreTopbar(); },
  'export-csv': () => { E.menuExport = false; rendreTopbar(); exporterCsv(); },
  'export-pdf': () => { E.menuExport = false; rendreTopbar(); exporterPdf(); },
  theme: (d) => { E.reglages.theme = d.v; sauverReglages(); appliquerTheme(); rendreContenu(); },
  deconnexion: () => confirmer('Se déconnecter ?',
    'Les données seront retirées de cet ordinateur mais restent sauvegardées dans votre compte Google. Reconnectez-vous pour les retrouver.',
    'Se déconnecter', async () => { await signOut(auth); depot.deconnecter(); toast('Déconnecté.'); }, false),
  'tout-suppr': () => confirmer('Tout supprimer ?',
    `Toutes les phrases, tous les groupes et tous les clics seront supprimés${E.user ? ', y compris dans votre compte synchronisé' : ''}. Action définitive.`,
    'Tout supprimer', () => depot.toutSupprimer())
};

function ajouterDepuisChamp() {
  const champ = $('#nouvelle-phrase');
  const texte = champ ? champ.value : E.brouillon;
  if (!texte.trim()) return;
  if (depot.ajouterPhrase(E.moisSaisie, texte)) { E.brouillon = ''; }
  else toast('Maximum atteint : augmentez le nombre de phrases autorisées.');
  rendreContenu();
  const c = $('#nouvelle-phrase'); if (c) c.focus();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) {
    if (E.menuExport) { E.menuExport = false; rendreTopbar(); }
    return;
  }
  const f = ACTIONS[el.dataset.action];
  if (f) f(el.dataset, el, e);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'nouvelle-phrase') E.brouillon = t.value;
  if (t.dataset && t.dataset.input === 'echelle') {
    E.reglages.echelle = parseFloat(t.value);
    sauverReglages();
    document.documentElement.style.fontSize = `${16 * E.reglages.echelle}px`;
    const v = $('#echelle-val'); if (v) v.textContent = `${Math.round(E.reglages.echelle * 100)} %`;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'nouvelle-phrase') { e.preventDefault(); ajouterDepuisChamp(); }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  const c = t.dataset && t.dataset.change;
  if (!c) return;
  const r = E.reglages;
  if (c === 'rappel') r.rappelActif = t.checked;
  else if (c === 'rappel-heure') r.rappelHeure = t.value || '20:00';
  else if (c === 'demarrage') r.demarrage = t.checked;
  else if (c === 'zone') r.zoneNotification = t.checked;
  sauverReglages();
  synchroniserOptions();
  rendreContenu();
});

// ───────── Rappel quotidien ─────────
setInterval(() => {
  const r = E.reglages;
  if (!r.rappelActif) return;
  const n = new Date();
  const aujourdhui = S.jourStr(n);
  if (r.dernierRappel === aujourdhui) return;
  const [h, m] = r.rappelHeure.split(':').map(Number);
  const ecart = n.getHours() * 60 + n.getMinutes() - (h * 60 + m);
  if (ecart < 0 || ecart > 180) return;
  const d = depot.etat;
  if (!d.phrases.some((p) => p.mois === S.moisCourant())) return;
  if (d.clics.some((c) => c.jour === aujourdhui)) return;
  r.dernierRappel = aujourdhui;
  sauverReglages();
  natif.notifier({ title: 'Phrasomètre', body: "Pensez à compter vos phrases d'aujourd'hui." });
}, 30000);

// ───────── Démarrage ─────────
depot.abonner(() => planifierRendu());
appliquerTheme();
synchroniserOptions();
rendreTout();
