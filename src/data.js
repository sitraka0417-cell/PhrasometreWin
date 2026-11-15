// Source unique des données : local hors connexion, Firestore une fois connecté.
// Même structure que l'application Android : users/{uid}/groupes | phrases | clics
import { db } from './firebase.js';
import { collection, doc, setDoc, deleteDoc, writeBatch, onSnapshot, getDocs } from 'firebase/firestore';
import { jourStr } from './stats.js';

export const MAX_DEFAUT = 30;
const CLE = 'phrasometre.donnees';
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const erreur = (e) => console.error('Firestore :', e);

function charger() {
  try {
    const o = JSON.parse(localStorage.getItem(CLE) || 'null');
    if (o) return { groupes: o.groupes || [], phrases: o.phrases || [], clics: o.clics || [] };
  } catch (e) { /* ignoré */ }
  return { groupes: [], phrases: [], clics: [] };
}

class Depot {
  constructor() {
    this.etat = charger();
    this.abonnes = new Set();
    this.uid = null;
    this.ecouteurs = [];
    this._t = null;
  }

  abonner(fn) { this.abonnes.add(fn); return () => this.abonnes.delete(fn); }

  _change() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      try { localStorage.setItem(CLE, JSON.stringify(this.etat)); } catch (e) { /* ignoré */ }
    }, 250);
    this.abonnes.forEach((f) => f(this.etat));
  }

  get cloud() { return this.uid !== null; }
  _ref(nom) { return collection(db, 'users', this.uid, nom); }
  _doc(nom, id) { return doc(db, 'users', this.uid, nom, id); }

  // ── Connexion ──
  connecter(uid, migrer) {
    if (this.uid === uid) return;
    this._arreter();
    this.uid = uid;
    if (migrer) this._migrer();
    this._demarrer();
  }

  deconnecter() {
    this._arreter();
    this.uid = null;
    this.etat = { groupes: [], phrases: [], clics: [] };
    try { localStorage.removeItem(CLE); } catch (e) { /* ignoré */ }
    this.abonnes.forEach((f) => f(this.etat));
  }

  _arreter() { this.ecouteurs.forEach((u) => u()); this.ecouteurs = []; }

  _migrer() {
    const d = this.etat;
    if (!d.groupes.length && !d.phrases.length && !d.clics.length) return;
    const docs = [];
    d.phrases.forEach((p) => docs.push([this._doc('phrases', p.id), { mois: p.mois, texte: p.texte, ordre: p.ordre, objectif: p.objectif }]));
    d.clics.forEach((c) => docs.push([this._doc('clics', c.id), { phraseId: c.phraseId, mois: c.mois, jour: c.jour, ts: c.ts }]));
    for (let i = 0; i < docs.length; i += 400) {
      const b = writeBatch(db);
      docs.slice(i, i + 400).forEach(([r, m]) => b.set(r, m));
      b.commit().catch(erreur);
    }
    const uid = this.uid;
    getDocs(this._ref('groupes'))
      .then((snap) => {
        const existants = new Set(snap.docs.map((x) => x.id));
        d.groupes.filter((g) => !existants.has(g.mois)).forEach((g) => setDoc(doc(db, 'users', uid, 'groupes', g.mois), { max: g.max }).catch(erreur));
      })
      .catch(() => d.groupes.forEach((g) => setDoc(doc(db, 'users', uid, 'groupes', g.mois), { max: g.max }).catch(erreur)));
  }

  _demarrer() {
    const premier = [true, true, true];
    const ecoute = (nom, i, convertir, appliquer) => onSnapshot(this._ref(nom), (snap) => {
      if (premier[i]) {
        premier[i] = false;
        if (snap.metadata.fromCache && snap.empty) return;
      }
      appliquer(snap.docs.map(convertir).filter(Boolean));
      this._change();
    }, erreur);

    this.ecouteurs = [
      ecoute('groupes', 0, (x) => ({ mois: x.id, max: Number(x.get('max')) || MAX_DEFAUT }), (l) => { this.etat.groupes = l; }),
      ecoute('phrases', 1, (x) => {
        const mois = x.get('mois');
        return mois ? { id: x.id, mois, texte: x.get('texte') || '', ordre: Number(x.get('ordre')) || 0, objectif: Number(x.get('objectif')) || 0 } : null;
      }, (l) => { this.etat.phrases = l; }),
      ecoute('clics', 2, (x) => {
        const jour = x.get('jour'); const mois = x.get('mois');
        return jour && mois ? { id: x.id, phraseId: x.get('phraseId') || '', mois, jour, ts: Number(x.get('ts')) || 0 } : null;
      }, (l) => { this.etat.clics = l; })
    ];
  }

  // ── Écritures de base ──
  _putGroupe(g) {
    this.etat.groupes = this.etat.groupes.filter((x) => x.mois !== g.mois).concat(g);
    if (this.cloud) setDoc(this._doc('groupes', g.mois), { max: g.max }).catch(erreur);
    this._change();
  }

  _putPhrase(p) {
    this.etat.phrases = this.etat.phrases.filter((x) => x.id !== p.id).concat(p);
    if (this.cloud) setDoc(this._doc('phrases', p.id), { mois: p.mois, texte: p.texte, ordre: p.ordre, objectif: p.objectif }).catch(erreur);
    this._change();
  }

  _putClic(c) {
    this.etat.clics = this.etat.clics.concat(c);
    if (this.cloud) setDoc(this._doc('clics', c.id), { phraseId: c.phraseId, mois: c.mois, jour: c.jour, ts: c.ts }).catch(erreur);
    this._change();
  }

  _supprDocs(nom, ids) {
    if (!this.cloud) return;
    for (let i = 0; i < ids.length; i += 400) {
      const b = writeBatch(db);
      ids.slice(i, i + 400).forEach((id) => b.delete(this._doc(nom, id)));
      b.commit().catch(erreur);
    }
  }

  _nouveauClic(p) { return { id: uuid(), phraseId: p.id, mois: p.mois, jour: jourStr(new Date()), ts: Date.now() }; }

  // ── Opérations ──
  maxDuGroupe(mois) { const g = this.etat.groupes.find((x) => x.mois === mois); return g ? g.max : MAX_DEFAUT; }

  ajouterPhrase(mois, texte) {
    const propre = String(texte).trim();
    if (!propre) return false;
    const max = this.maxDuGroupe(mois);
    const existantes = this.etat.phrases.filter((p) => p.mois === mois);
    if (existantes.length >= max) return false;
    if (!this.etat.groupes.some((g) => g.mois === mois)) this._putGroupe({ mois, max });
    const ordre = existantes.reduce((m, p) => Math.max(m, p.ordre), 0) + 1;
    this._putPhrase({ id: uuid(), mois, texte: propre, ordre, objectif: 0 });
    return true;
  }

  ajouterPlusieurs(mois, lignes) {
    let n = 0;
    for (const l of lignes) {
      if (!String(l).trim()) continue;
      if (this.ajouterPhrase(mois, l)) n++; else break;
    }
    return n;
  }

  modifierPhrase(id, texte, objectif) {
    const p = this.etat.phrases.find((x) => x.id === id);
    if (p) this._putPhrase({ ...p, texte: String(texte).trim(), objectif: Math.max(0, objectif | 0) });
  }

  supprimerPhrase(id) {
    const ids = this.etat.clics.filter((c) => c.phraseId === id).map((c) => c.id);
    this.etat.phrases = this.etat.phrases.filter((p) => p.id !== id);
    this.etat.clics = this.etat.clics.filter((c) => c.phraseId !== id);
    if (this.cloud) deleteDoc(this._doc('phrases', id)).catch(erreur);
    this._supprDocs('clics', ids);
    this._change();
  }

  definirMax(mois, max) { this._putGroupe({ mois, max: Math.min(500, Math.max(1, max | 0)) }); }

  supprimerGroupe(mois) {
    const idsP = this.etat.phrases.filter((p) => p.mois === mois).map((p) => p.id);
    const idsC = this.etat.clics.filter((c) => c.mois === mois).map((c) => c.id);
    this.etat.groupes = this.etat.groupes.filter((g) => g.mois !== mois);
    this.etat.phrases = this.etat.phrases.filter((p) => p.mois !== mois);
    this.etat.clics = this.etat.clics.filter((c) => c.mois !== mois);
    if (this.cloud) deleteDoc(this._doc('groupes', mois)).catch(erreur);
    this._supprDocs('phrases', idsP);
    this._supprDocs('clics', idsC);
    this._change();
  }

  copierDepuis(source, cible) {
    const sources = this.etat.phrases.filter((p) => p.mois === source).sort((a, b) => a.ordre - b.ordre);
    if (!sources.length) return 0;
    if (!this.etat.groupes.some((g) => g.mois === cible)) this._putGroupe({ mois: cible, max: Math.max(this.maxDuGroupe(source), sources.length) });
    const deja = new Set(this.etat.phrases.filter((p) => p.mois === cible).map((p) => p.texte.toLowerCase()));
    let n = 0;
    for (const p of sources) {
      if (deja.has(p.texte.toLowerCase())) continue;
      if (this.ajouterPhrase(cible, p.texte)) n++; else break;
    }
    return n;
  }

  cliquer(phraseId) {
    const p = this.etat.phrases.find((x) => x.id === phraseId);
    if (!p) return null;
    const c = this._nouveauClic(p);
    this._putClic(c);
    return c.id;
  }

  annulerClic(id) {
    this.etat.clics = this.etat.clics.filter((c) => c.id !== id);
    this._supprDocs('clics', [id]);
    this._change();
  }

  definirCompteur(phraseId, n) {
    const p = this.etat.phrases.find((x) => x.id === phraseId);
    if (!p) return;
    const actuels = this.etat.clics.filter((c) => c.phraseId === phraseId).sort((a, b) => a.ts - b.ts);
    const cible = Math.min(99999, Math.max(0, n | 0));
    if (cible > actuels.length) {
      for (let i = 0; i < cible - actuels.length; i++) this._putClic(this._nouveauClic(p));
    } else if (cible < actuels.length) {
      const ids = actuels.slice(cible).map((c) => c.id);
      const set = new Set(ids);
      this.etat.clics = this.etat.clics.filter((c) => !set.has(c.id));
      this._supprDocs('clics', ids);
      this._change();
    }
  }

  toutSupprimer() {
    const d = this.etat;
    this.etat = { groupes: [], phrases: [], clics: [] };
    this._supprDocs('clics', d.clics.map((c) => c.id));
    this._supprDocs('phrases', d.phrases.map((p) => p.id));
    this._supprDocs('groupes', d.groupes.map((g) => g.mois));
    this._change();
  }
}

export const depot = new Depot();
