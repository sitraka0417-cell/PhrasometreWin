const {
  app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell, Notification, protocol, net
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const config = require('./config.json');

const PORT = 8765;
const RACINE = path.join(__dirname, 'renderer');
let fenetre = null;
let tray = null;
let quitter = false;
const options = { fermerZone: false };

app.setAppUserModelId('mg.sitraka.phrasometre');
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => afficher());
}

function afficher() {
  if (!fenetre) return;
  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.show();
  fenetre.focus();
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: 'Phrasomètre',
    backgroundColor: '#F5F7F6',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#F5F7F6', symbolColor: '#171D1C', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  fenetre.once('ready-to-show', () => fenetre.show());
  fenetre.loadURL('app://phrasometre/index.html');
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  fenetre.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  fenetre.on('close', (e) => {
    if (!quitter && options.fermerZone) {
      e.preventDefault();
      fenetre.hide();
    }
  });
}

function assurerTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 20, height: 20 });
  tray = new Tray(img);
  tray.setToolTip('Phrasomètre');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir Phrasomètre', click: () => afficher() },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitter = true; app.quit(); } }
  ]));
  tray.on('click', () => afficher());
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const complet = path.normalize(path.join(RACINE, p));
    if (!complet.startsWith(RACINE)) return new Response('Interdit', { status: 403 });
    return net.fetch(pathToFileURL(complet).toString());
  });
  creerFenetre();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) creerFenetre(); });
});

app.on('before-quit', () => { quitter = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ───────── IPC ─────────

ipcMain.handle('version', () => app.getVersion());

ipcMain.handle('overlay', (_e, { color, symbolColor }) => {
  try {
    if (fenetre && fenetre.setTitleBarOverlay) fenetre.setTitleBarOverlay({ color, symbolColor, height: 44 });
    if (fenetre) fenetre.setBackgroundColor(color);
  } catch (e) { /* ignoré */ }
});

ipcMain.handle('options', (_e, o) => {
  options.fermerZone = !!o.fermerZone;
  if (options.fermerZone) assurerTray();
  try { app.setLoginItemSettings({ openAtLogin: !!o.demarrage }); } catch (e) { /* ignoré */ }
});

ipcMain.handle('notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') });
  n.on('click', () => afficher());
  n.show();
});

ipcMain.handle('save-file', async (_e, { nom, filtres, texte }) => {
  const r = await dialog.showSaveDialog(fenetre, { defaultPath: nom, filters: filtres });
  if (r.canceled || !r.filePath) return { ok: false, annule: true };
  try {
    fs.writeFileSync(r.filePath, texte, 'utf8');
    return { ok: true, chemin: r.filePath };
  } catch (e) {
    return { ok: false, erreur: String(e.message || e) };
  }
});

ipcMain.handle('export-pdf', async (_e, { nom, html }) => {
  const r = await dialog.showSaveDialog(fenetre, {
    defaultPath: nom,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (r.canceled || !r.filePath) return { ok: false, annule: true };
  const cache = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await cache.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await cache.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    });
    fs.writeFileSync(r.filePath, pdf);
    return { ok: true, chemin: r.filePath };
  } catch (e) {
    return { ok: false, erreur: String(e.message || e) };
  } finally {
    cache.destroy();
  }
});

// Connexion Google : navigateur système + retour sur 127.0.0.1
function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pageRetour(titre, texte) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Phrasomètre</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F7F6;color:#171D1C;font-family:"Segoe UI",system-ui,sans-serif}
.c{background:#fff;border:1px solid #C4CCCA;border-radius:24px;padding:40px 48px;max-width:420px;text-align:center;box-shadow:0 12px 40px rgba(14,107,104,.12)}
h1{margin:0 0 8px;font-size:22px;color:#0E6B68}p{margin:0;color:#3F4948;line-height:1.5}</style></head>
<body><div class="c"><h1>${titre}</h1><p>${texte}</p></div></body></html>`;
}

// Ouvre le navigateur et attend le retour sur http://127.0.0.1:PORT/callback
function attendreRetour(urlOuverture, state, champ) {
  const base = `http://127.0.0.1:${PORT}/callback`;
  return new Promise((resolve, reject) => {
    let timer = null;
    const serveur = http.createServer((req, res) => {
      const u = new URL(req.url, base);
      if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const err = u.searchParams.get('error');
      const valeur = u.searchParams.get(champ);
      const ok = !err && valeur && u.searchParams.get('state') === state;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok
        ? pageRetour('Connexion réussie', 'Vous pouvez fermer cet onglet et revenir à Phrasomètre.')
        : pageRetour('Connexion impossible', 'Retournez dans Phrasomètre et réessayez.'));
      clearTimeout(timer);
      serveur.close();
      if (err) reject(new Error(err));
      else if (!ok) reject(new Error('STATE'));
      else resolve(valeur);
    });
    serveur.on('error', (e) => { clearTimeout(timer); reject(e); });
    timer = setTimeout(() => { serveur.close(); reject(new Error('TIMEOUT')); }, 180000);
    serveur.listen(PORT, '127.0.0.1', () => { shell.openExternal(urlOuverture); });
  });
}

async function connexionGoogle() {
  const state = b64url(crypto.randomBytes(16));

  // Méthode 1 (sans code secret) : petite page hébergée (GitHub Pages) qui utilise Firebase Auth
  if (config.authPage) {
    const page = config.authPage;
    const url = `${page}${page.includes('?') ? '&' : '?'}port=${PORT}&state=${state}`;
    return attendreRetour(url, state, 'id_token');
  }

  // Méthode 2 : OAuth direct avec le client Web (code secret requis)
  const { clientId, clientSecret } = config.google || {};
  if (!clientId || !clientSecret || clientSecret === 'A_REMPLIR') throw new Error('CONFIG_GOOGLE');
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const redirect = `http://127.0.0.1:${PORT}/callback`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile',
    code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account'
  }).toString();
  const code = await attendreRetour(url, state, 'code');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect,
      grant_type: 'authorization_code', code_verifier: verifier
    })
  });
  const j = await r.json();
  if (!j.id_token) throw new Error(j.error_description || j.error || 'TOKEN');
  return j.id_token;
}

ipcMain.handle('google-login', async () => {
  try {
    const idToken = await connexionGoogle();
    afficher();
    return { ok: true, idToken };
  } catch (e) {
    afficher();
    return { ok: false, erreur: String(e.code === 'EADDRINUSE' ? 'EADDRINUSE' : e.message || e) };
  }
});
