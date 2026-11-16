const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('natif', {
  googleLogin: () => ipcRenderer.invoke('google-login'),
  sauverFichier: (o) => ipcRenderer.invoke('save-file', o),
  exporterPdf: (o) => ipcRenderer.invoke('export-pdf', o),
  notifier: (o) => ipcRenderer.invoke('notify', o),
  options: (o) => ipcRenderer.invoke('options', o),
  barreTitre: (o) => ipcRenderer.invoke('overlay', o),
  version: () => ipcRenderer.invoke('version'),
  surMasquage: (cb) => ipcRenderer.on('fenetre-masquee', () => cb())
});
