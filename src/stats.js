// Calculs de statistiques (équivalent de Stats.kt côté Android)

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export const PERIODES = [['JOUR', 'Jour'], ['SEMAINE', 'Semaine'], ['MOIS', 'Mois'], ['ANNEE', 'Année']];

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const jourStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseJour = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const moisCourant = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const moisLibelle = (m) => { const [y, mm] = m.split('-').map(Number); return `${cap(MOIS[mm - 1])} ${y}`; };
export const nomMoisCourt = (n) => MOIS_COURT[n - 1];
export function ajouterMois(m, n) {
  const [y, mm] = m.split('-').map(Number);
  const t = y * 12 + (mm - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export const moisNum = (m) => parseInt(m.slice(5, 7), 10);

export function plage(periode, ancre) {
  const a = new Date(ancre.getFullYear(), ancre.getMonth(), ancre.getDate());
  if (periode === 'JOUR') return { debut: a, fin: a };
  if (periode === 'SEMAINE') {
    const dow = (a.getDay() + 6) % 7;
    const d = new Date(a); d.setDate(a.getDate() - dow);
    const f = new Date(d); f.setDate(d.getDate() + 6);
    return { debut: d, fin: f };
  }
  if (periode === 'MOIS') {
    return { debut: new Date(a.getFullYear(), a.getMonth(), 1), fin: new Date(a.getFullYear(), a.getMonth() + 1, 0) };
  }
  return { debut: new Date(a.getFullYear(), 0, 1), fin: new Date(a.getFullYear(), 11, 31) };
}

export function decaler(periode, ancre, n) {
  const a = new Date(ancre.getFullYear(), ancre.getMonth(), ancre.getDate());
  if (periode === 'JOUR') { a.setDate(a.getDate() + n); return a; }
  if (periode === 'SEMAINE') { a.setDate(a.getDate() + 7 * n); return a; }
  const j = a.getDate();
  a.setDate(1);
  if (periode === 'MOIS') a.setMonth(a.getMonth() + n); else a.setFullYear(a.getFullYear() + n);
  const max = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
  a.setDate(Math.min(j, max));
  return a;
}

export function libellePeriode(periode, ancre) {
  const r = plage(periode, ancre);
  if (periode === 'JOUR') return `${cap(JOURS[ancre.getDay()])} ${ancre.getDate()} ${MOIS[ancre.getMonth()]} ${ancre.getFullYear()}`;
  if (periode === 'SEMAINE') {
    return `${r.debut.getDate()} ${MOIS_COURT[r.debut.getMonth()]} – ${r.fin.getDate()} ${MOIS_COURT[r.fin.getMonth()]} ${r.fin.getFullYear()}`;
  }
  if (periode === 'MOIS') return moisLibelle(`${ancre.getFullYear()}-${pad(ancre.getMonth() + 1)}`);
  return String(ancre.getFullYear());
}

export function clicsDans(clics, periode, ancre, moisSel) {
  const r = plage(periode, ancre);
  const d0 = jourStr(r.debut);
  const d1 = jourStr(r.fin);
  return clics.filter((c) =>
    c.jour >= d0 && c.jour <= d1 && (periode !== 'ANNEE' || moisSel.has(moisNum(c.mois)))
  );
}

export function serieActuelle(clics) {
  const jours = new Set(clics.map((c) => c.jour));
  const j = new Date();
  j.setHours(0, 0, 0, 0);
  if (!jours.has(jourStr(j))) j.setDate(j.getDate() - 1);
  let n = 0;
  while (jours.has(jourStr(j))) { n++; j.setDate(j.getDate() - 1); }
  return n;
}

export function meilleureSerie(clics) {
  const jours = [...new Set(clics.map((c) => c.jour))].sort();
  let best = 0, cur = 0, prev = null;
  for (const s of jours) {
    const d = parseJour(s);
    if (prev) {
      const suivant = new Date(prev); suivant.setDate(prev.getDate() + 1);
      cur = jourStr(suivant) === s ? cur + 1 : 1;
    } else cur = 1;
    if (cur > best) best = cur;
    prev = d;
  }
  return best;
}

function compterPar(liste, cle) {
  const m = new Map();
  for (const x of liste) { const k = cle(x); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

export function calculer(d, periode, mode, ancre, moisSel, filtre) {
  const r = plage(periode, ancre);
  const tous = clicsDans(d.clics, periode, ancre, moisSel);
  const garde = (c) => filtre == null || (mode === 'PHRASES' ? c.phraseId === filtre : c.mois === filtre);
  const sel = tous.filter(garde);

  let moisPlage = [];
  if (periode === 'ANNEE') {
    moisPlage = [...moisSel].sort((a, b) => a - b).map((m) => `${r.debut.getFullYear()}-${pad(m)}`);
  } else {
    let m = `${r.debut.getFullYear()}-${pad(r.debut.getMonth() + 1)}`;
    const fin = `${r.fin.getFullYear()}-${pad(r.fin.getMonth() + 1)}`;
    moisPlage.push(m);
    while (m < fin) { m = ajouterMois(m, 1); moisPlage.push(m); }
  }

  const comptes = compterPar(tous, (c) => c.phraseId);
  let lignes;
  if (mode === 'PHRASES') {
    lignes = d.phrases
      .filter((p) => moisPlage.includes(p.mois) || (comptes.get(p.id) || 0) > 0)
      .map((p) => ({ cle: p.id, libelle: p.texte, valeur: comptes.get(p.id) || 0, detail: moisLibelle(p.mois) }))
      .filter((l) => periode !== 'ANNEE' || l.valeur > 0)
      .sort((a, b) => b.valeur - a.valeur);
  } else {
    const ens = new Set([
      ...moisPlage.filter((m) => d.groupes.some((g) => g.mois === m)),
      ...tous.map((c) => c.mois)
    ]);
    lignes = [...ens].sort().map((m) => {
      const nb = d.phrases.filter((p) => p.mois === m).length;
      return {
        cle: m, libelle: moisLibelle(m), valeur: tous.filter((c) => c.mois === m).length,
        detail: nb > 1 ? `${nb} phrases` : `${nb} phrase`
      };
    });
  }

  let barres, titre;
  if (periode === 'JOUR') {
    const m = compterPar(sel, (c) => new Date(c.ts).getHours());
    barres = Array.from({ length: 24 }, (_, h) => ({ etiquette: `${h}h`, valeur: m.get(h) || 0 }));
    titre = 'Clics par heure';
  } else if (periode === 'SEMAINE') {
    const m = compterPar(sel, (c) => c.jour);
    barres = Array.from({ length: 7 }, (_, i) => {
      const j = new Date(r.debut); j.setDate(j.getDate() + i);
      return { etiquette: JOURS_COURT[i].replace('.', ''), valeur: m.get(jourStr(j)) || 0 };
    });
    titre = 'Clics par jour';
  } else if (periode === 'MOIS') {
    const m = compterPar(sel, (c) => c.jour);
    const nb = r.fin.getDate();
    barres = Array.from({ length: nb }, (_, i) => {
      const j = new Date(r.debut.getFullYear(), r.debut.getMonth(), i + 1);
      return { etiquette: String(i + 1), valeur: m.get(jourStr(j)) || 0 };
    });
    titre = 'Clics par jour';
  } else {
    const m = compterPar(sel, (c) => parseJour(c.jour).getMonth() + 1);
    barres = [...moisSel].sort((a, b) => a - b).map((n) => ({ etiquette: MOIS_COURT[n - 1].replace('.', ''), valeur: m.get(n) || 0 }));
    titre = 'Clics par mois';
  }

  const parJour = compterPar(sel, (c) => c.jour);
  let meilleur = null;
  for (const [k, v] of parJour) if (!meilleur || v > meilleur[1]) meilleur = [k, v];
  const precedent = clicsDans(d.clics, periode, decaler(periode, ancre, -1), moisSel).filter(garde).length;

  return {
    total: sel.length,
    precedent,
    joursActifs: parJour.size,
    moyenneJourActif: parJour.size ? sel.length / parJour.size : 0,
    meilleurJour: meilleur ? parseJour(meilleur[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
    meilleurJourValeur: meilleur ? meilleur[1] : 0,
    lignes, barres, titreBarres: titre,
    serieActuelle: serieActuelle(d.clics),
    meilleureSerie: meilleureSerie(d.clics)
  };
}

export function genererCsv(d) {
  const phrases = new Map(d.phrases.map((p) => [p.id, p]));
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const lignes = ['Date;Heure;Groupe;Phrase'];
  [...d.clics].sort((a, b) => a.ts - b.ts).forEach((c) => {
    const t = new Date(c.ts);
    const p = phrases.get(c.phraseId);
    lignes.push(`${c.jour};${pad(t.getHours())}:${pad(t.getMinutes())};${q(moisLibelle(c.mois))};${q(p ? p.texte : '')}`);
  });
  return '\uFEFF' + lignes.join('\n') + '\n';
}
