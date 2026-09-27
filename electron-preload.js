// Exposes a minimal, safe bridge so the page can ask the desktop app to save
// a file to disk. Blob downloads via a synthetic <a download> click (which
// works fine in a normal browser tab) don't trigger Electron's download
// machinery at all, because blob: URLs never touch the network layer
// Electron hooks into -- so inside the desktop app we go through this IPC
// call instead, which drives a real Electron download/save-as.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quintDesktop', {
  saveFile: (base64Data, filename) => ipcRenderer.invoke('quint:save-file', base64Data, filename),
});
