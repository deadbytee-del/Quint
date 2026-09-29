// Electron entry point for the Quint desktop app. This wraps the exact same
// public/ static site used on the web, serving it over a real local HTTP
// server (not file://) so the in-browser Java compiler/decompiler (CheerpJ,
// which needs HTTP range-request support to stream its vendored jars) works
// identically to the hosted version -- plus a few things only a desktop app
// can do: a native Java compiler/decompiler when the system has one (see
// below), a real file save dialog, an app icon/menu, and single-instance
// behavior.
const { app, BrowserWindow, shell, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const handler = require('serve-handler');
const { autoUpdater } = require('electron-updater');

const APP_VERSION = require('./package.json').version;

let mainWindow;
let server;

// ---------------------------------------------------------------------
// Single instance: launching Quint again while it's already open should
// just focus the existing window, not spin up a second local server and
// a second window.
// ---------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------------------------
// GUI-launched apps on macOS (and often Linux) don't inherit the PATH a
// terminal/login shell would have -- so a JDK installed via a normal
// installer (which only edits shell profile files) is often invisible to
// `spawn('java', ...)` even though `java -version` works fine in Terminal.
// Replace process.env.PATH with what an interactive login shell reports,
// best-effort, before anything tries to find a system Java.
// ---------------------------------------------------------------------
function fixPathFromLoginShell() {
  if (process.platform === 'win32') return;
  try {
    const shellBin = process.env.SHELL || '/bin/bash';
    const marker = '__QUINT_PATH__';
    const out = execFileSync(shellBin, ['-ilc', `echo ${marker}"$PATH"`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const idx = out.indexOf(marker);
    if (idx === -1) return;
    const shellPath = out.slice(idx + marker.length).trim().split('\n')[0];
    if (shellPath) process.env.PATH = shellPath;
  } catch (err) {
    // Best-effort only -- keep whatever PATH Electron started with.
  }
}

function startLocalServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      handler(req, res, { public: path.join(__dirname, 'public', 'app') });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Quint on GitHub', click: () => shell.openExternal('https://github.com/deadbytee-del/Quint') },
        { label: 'Report an Issue', click: () => shell.openExternal('https://github.com/deadbytee-del/Quint/issues') },
        { type: 'separator' },
        {
          label: 'About Quint',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Quint',
              message: 'Quint',
              detail: `Version ${APP_VERSION}\nThe world's easiest Minecraft plugin creator.\nhttps://github.com/deadbytee-del/Quint`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  const port = await startLocalServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Quint',
    backgroundColor: '#1f171d',
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'electron-preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
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

// -----------------------------------------------------------------------
// Native (system-Java) compile/decompile. A website can't shell out to a
// real JVM -- CheerpJ's WASM-emulated one is the only option there, and
// it has real startup/runtime overhead. The desktop app has full Node
// access, so when the machine already has a Java runtime, we run the same
// vendored ECJ/CFR jars directly through it instead: no WASM engine to
// load, no browser memory ceiling, and it's simply a real JVM running
// native code. If no system Java is found (or something about it is
// broken), callers fall back to the CheerpJ path in cheerpjCompiler.js --
// this is purely an optional speed-up, never a hard requirement.
// -----------------------------------------------------------------------
const VENDOR_DIR = path.join(__dirname, 'public', 'app', 'vendor');
const DEFAULT_VENDOR_SUBDIR = 'mc1.20.4';

// Each supported Minecraft/Paper version has its own vendored paper-api.jar
// (+ matching adventure/examination/bungeecord-chat versions) under
// public/app/vendor/<vendorDir>/ -- see app.js's MC_VERSIONS table, which is
// the source of truth for which vendorDir a project resolves to.
function compileClasspathFor(vendorDir) {
  const dir = path.join(VENDOR_DIR, vendorDir || DEFAULT_VENDOR_SUBDIR);
  const perVersion = [
    'paper-api.jar', 'adventure-api.jar', 'adventure-key.jar',
    'examination-api.jar', 'examination-string.jar', 'bungeecord-chat.jar',
    'adventure-text-minimessage.jar',
  ].map((f) => path.join(dir, f));
  return [...perVersion, path.join(VENDOR_DIR, 'luckperms-api.jar')].join(path.delimiter);
}

let javaBinCache; // undefined = not yet checked, null = checked, not found, string = resolved path

async function trySpawnVersion(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-version']);
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function resolveJavaBinary() {
  if (javaBinCache !== undefined) return javaBinCache;
  const candidates = ['java'];
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java'));
  if (process.platform === 'darwin') {
    try {
      const home = execFileSync('/usr/libexec/java_home', [], { encoding: 'utf8', timeout: 3000 }).trim();
      if (home) candidates.push(path.join(home, 'bin', 'java'));
    } catch (err) {
      // No JDK registered with java_home -- fine, keep checking other candidates.
    }
  }
  for (const candidate of candidates) {
    if (await trySpawnVersion(candidate)) {
      javaBinCache = candidate;
      return candidate;
    }
  }
  javaBinCache = null;
  return null;
}

function runProcess(bin, args) {
  return new Promise((resolve) => {
    const child = spawn(bin, args);
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: `${stderr}\n${err}` }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function looksLikeToolingFailure(code, stdout, stderr) {
  if (code === -1) return true;
  return /UnsupportedClassVersionError|Could not find or load main class|NoClassDefFoundError|Unable to access jarfile|Error occurred during initialization of VM/i.test(`${stdout}\n${stderr}`);
}

ipcMain.handle('quint:native-capable', async () => !!(await resolveJavaBinary()));

ipcMain.handle('quint:native-compile', async (event, { packageName, mainClass, javaSource, vendorDir }) => {
  const javaBin = await resolveJavaBinary();
  if (!javaBin) return { ok: false, toolingError: true, log: 'No Java runtime found on this system.' };

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quint-build-'));
  try {
    const srcPath = path.join(tmpDir, `${mainClass}.java`);
    await fs.writeFile(srcPath, javaSource, 'utf8');
    const outDir = path.join(tmpDir, 'out');
    await fs.mkdir(outDir, { recursive: true });

    const { code, stdout, stderr } = await runProcess(javaBin, [
      '-cp', path.join(VENDOR_DIR, 'ecj.jar'),
      'org.eclipse.jdt.internal.compiler.batch.Main',
      '-8', '-classpath', compileClasspathFor(vendorDir), '-d', outDir, srcPath,
    ]);
    if (code !== 0) {
      return { ok: false, toolingError: looksLikeToolingFailure(code, stdout, stderr), log: `${stdout}\n${stderr}`.trim() };
    }

    const packagePath = packageName.split('.').join(path.sep);
    const classFile = path.join(outDir, packagePath, `${mainClass}.class`);
    let classBytes;
    try {
      classBytes = await fs.readFile(classFile);
    } catch (err) {
      return { ok: false, toolingError: true, log: `Compiler reported success but no .class file was produced.\n${stdout}\n${stderr}` };
    }
    return { ok: true, classBase64: classBytes.toString('base64') };
  } catch (err) {
    return { ok: false, toolingError: true, log: String((err && err.stack) || err) };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

ipcMain.handle('quint:native-decompile', async (event, jarBase64) => {
  const javaBin = await resolveJavaBinary();
  if (!javaBin) return { ok: false, log: 'No Java runtime found on this system.' };

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quint-decompile-'));
  try {
    const jarPath = path.join(tmpDir, 'input.jar');
    await fs.writeFile(jarPath, Buffer.from(jarBase64, 'base64'));
    const outDir = path.join(tmpDir, 'out');
    await fs.mkdir(outDir, { recursive: true });

    const { stdout, stderr } = await runProcess(javaBin, [
      '-cp', path.join(VENDOR_DIR, 'cfr.jar'),
      'org.benf.cfr.reader.Main',
      jarPath, '--outputdir', outDir, '--silent', 'true',
    ]);

    const files = [];
    async function walk(dir, prefix) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(full, rel);
        else if (entry.name.endsWith('.java')) files.push({ path: rel, content: await fs.readFile(full, 'utf8') });
      }
    }
    await walk(outDir, '');

    if (files.length === 0) {
      return { ok: false, log: `${stdout}\n${stderr}`.trim() || 'CFR produced no output.' };
    }
    return { ok: true, files };
  } catch (err) {
    return { ok: false, log: String((err && err.stack) || err) };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.whenReady().then(async () => {
  fixPathFromLoginShell();
  if (process.platform === 'win32') app.setAppUserModelId('com.quint.app');
  buildMenu();
  await createWindow();
  // Kick off Java detection in the background right away so the first
  // "Build Plugin" click doesn't pay for it.
  resolveJavaBinary();
  // Auto-update from GitHub Releases (electron-builder's publish config,
  // above) -- one thing a website could never do for itself. Only
  // meaningful for an installed, packaged build; a plain `electron .` dev
  // run has no update feed to check.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
