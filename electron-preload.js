// Exposes a minimal, safe bridge so the page can ask the desktop app to save
// a file to disk, and to use a real system Java compiler/decompiler when
// one is available (see electron-main.js) instead of the in-browser CheerpJ
// engine every web visitor has to use.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quintDesktop', {
  saveFile: (base64Data, filename) => ipcRenderer.invoke('quint:save-file', base64Data, filename),
  nativeCapable: () => ipcRenderer.invoke('quint:native-capable'),
  nativeCompile: (opts) => ipcRenderer.invoke('quint:native-compile', opts),
  nativeDecompile: (jarBase64) => ipcRenderer.invoke('quint:native-decompile', jarBase64),
});
