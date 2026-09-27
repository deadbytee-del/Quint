// Electron entry point for the Quint desktop app. This wraps the exact same
// public/ static site used on the web, serving it over a real local HTTP
// server (not file://) so the in-browser Java compiler/decompiler (CheerpJ,
// which needs HTTP range-request support to stream its vendored jars) works
// identically to the hosted version.
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const handler = require('serve-handler');

let mainWindow;
let server;

function startLocalServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      handler(req, res, { public: path.join(__dirname, 'public') });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function createWindow() {
  const port = await startLocalServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Quint',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'electron-preload.js'),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  // Open any target="_blank" link (e.g. the README link in the settings
  // modal) in the user's real browser instead of a bare Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Blob downloads via a synthetic <a download> click never reach Electron's
// download machinery (blob: URLs stay entirely in the renderer, never
// touching the network layer "will-download" observes), so the renderer
// hands us the raw bytes over IPC instead and we drive a real download from
// here via webContents.downloadURL(), which does fire normally.
ipcMain.handle('quint:save-file', async (event, base64Data, filename) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const dataUrl = `data:application/octet-stream;base64,${base64Data}`;

  await new Promise((resolve) => {
    const onWillDownload = (_evt, item) => {
      item.setSavePath(path.join(app.getPath('downloads'), filename));
      item.once('done', () => resolve());
    };
    win.webContents.session.once('will-download', onWillDownload);
    win.webContents.downloadURL(dataUrl);
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
