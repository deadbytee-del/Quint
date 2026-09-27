// Runs a real Java compiler (ECJ) and a real Java decompiler (CFR) entirely
// client-side, inside the browser tab, via CheerpJ (a WebAssembly JVM).
// No server is involved -- this is what lets "Build Plugin" and "Import
// .jar" work the same way whether Quint is opened from GitHub Pages or from
// any other plain static file host.
//
// The compiler/decompiler jars themselves (ECJ, the Paper API + its
// transitive deps, CFR) are vendored under public/vendor/ and loaded via
// CheerpJ's same-origin "/app/" filesystem mount, which streams them with
// HTTP range requests -- Maven Central and the PaperMC repo both refuse
// cross-origin fetch() from a browser, so those jars cannot be fetched
// directly from their original hosts at runtime and must be vendored.
(function () {
  'use strict';

  const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/4.3/loader.js';
  const ECJ_CLASSPATH = '/app/vendor/ecj.jar';
  const CFR_CLASSPATH = '/app/vendor/cfr.jar';
  const PLUGIN_COMPILE_CLASSPATH = [
    '/app/vendor/paper-api.jar',
    '/app/vendor/adventure-api.jar',
    '/app/vendor/adventure-key.jar',
    '/app/vendor/examination-api.jar',
    '/app/vendor/examination-string.jar',
    '/app/vendor/bungeecord-chat.jar',
  ].join(':');

  let initPromise = null;

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${url}`));
      document.head.appendChild(script);
    });
  }

  /** Loads CheerpJ and initializes its JVM. Safe to call many times. */
  function ensureCheerpj(onProgress) {
    if (!initPromise) {
      initPromise = (async () => {
        onProgress && onProgress('Loading the in-browser Java engine (first time only, a few MB)...');
        await loadScript(CHEERPJ_LOADER_URL);
        await cheerpjInit();
      })();
    }
    return initPromise;
  }

  /** Captures everything CheerpJ/Java prints to the console during fn(). */
  async function captureConsole(fn) {
    const lines = [];
    const realLog = console.log;
    const realError = console.error;
    const capture = (...args) => lines.push(args.map(String).join(' '));
    console.log = capture;
    console.error = capture;
    try {
      const result = await fn();
      return { result, output: lines.join('\n') };
    } finally {
      console.log = realLog;
      console.error = realError;
    }
  }

  function uint8ToBase64Blob(bytes, mimeType) {
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  }

  // btoa/atob only take binary strings, and String.fromCharCode(...bytes)
  // blows the call stack on anything but small arrays -- chunk it.
  function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  function base64ToUint8(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function packageJar(classBytes, opts) {
    const packagePath = opts.packageName.split('.').join('/');
    const zip = new JSZip();
    zip.file('plugin.yml', opts.pluginYml);
    zip.file(`${packagePath}/${opts.mainClass}.class`, classBytes);
    zip.file('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\nCreated-By: Quint\n');
    return zip.generateAsync({ type: 'blob', mimeType: 'application/java-archive' });
  }

  // The desktop app (see electron-main.js/electron-preload.js) can run the
  // very same vendored ECJ/CFR jars through a real system JVM instead of
  // CheerpJ's WASM-emulated one -- no multi-MB engine to load, no browser
  // memory ceiling, just native code. It's a pure speed-up: if the machine
  // has no usable Java (or something about it misbehaves), we fall back to
  // the CheerpJ path below exactly as if this code didn't exist.
  async function compilePluginJarNative(opts, onProgress) {
    onProgress && onProgress("Compiling with your system's Java (native)...");
    const result = await window.quintDesktop.nativeCompile({
      packageName: opts.packageName,
      mainClass: opts.mainClass,
      javaSource: opts.javaSource,
    });
    if (!result.ok) {
      throw Object.assign(new Error('Compilation failed'), { log: result.log, toolingError: result.toolingError });
    }
    onProgress && onProgress('Packaging the .jar...');
    return packageJar(base64ToUint8(result.classBase64), opts);
  }

  async function decompileJarNative(jarBytes, onProgress) {
    onProgress && onProgress("Decompiling with your system's Java (native)...");
    const result = await window.quintDesktop.nativeDecompile(uint8ToBase64(jarBytes));
    if (!result.ok) {
      throw Object.assign(new Error('Decompile failed'), { log: result.log });
    }
    return result.files;
  }

  // Checked once per page load, not once per build -- avoids an extra IPC
  // round trip on every single compile/decompile.
  const nativeCapablePromise = (window.quintDesktop
    ? window.quintDesktop.nativeCapable().catch(() => false)
    : Promise.resolve(false));

  /**
   * Compiles a single generated Java source file against the Paper API and
   * packages the result into a real, loadable plugin .jar. Prefers a native
   * system Java (desktop app only) over the in-browser CheerpJ engine.
   * @param {{packageName:string, mainClass:string, javaSource:string, pluginYml:string}} opts
   * @returns {Promise<Blob>}
   */
  async function compilePluginJar(opts, onProgress) {
    if (await nativeCapablePromise) {
      try {
        return await compilePluginJarNative(opts, onProgress);
      } catch (err) {
        if (!err.toolingError) throw err; // a real error in the generated Java -- show it, don't retry
        onProgress && onProgress('Native compiler unavailable, falling back to the in-browser compiler...');
      }
    }
    return compilePluginJarCheerpj(opts, onProgress);
  }

  async function compilePluginJarCheerpj(opts, onProgress) {
    await ensureCheerpj(onProgress);
    onProgress && onProgress('Compiling your plugin...');

    const packagePath = opts.packageName.split('.').join('/');
    const sourcePath = `/str/${opts.mainClass}.java`;
    const outDir = '/files/out';
    const classPath = `${outDir}/${packagePath}/${opts.mainClass}.class`;

    cheerpOSAddStringFile(sourcePath, opts.javaSource);

    const { result: exitCode, output } = await captureConsole(() =>
      cheerpjRunMain(
        'org.eclipse.jdt.internal.compiler.batch.Main',
        ECJ_CLASSPATH,
        '-8',
        '-classpath', PLUGIN_COMPILE_CLASSPATH,
        '-d', outDir,
        sourcePath
      )
    );

    if (exitCode !== 0) {
      throw Object.assign(new Error('Compilation failed'), { log: output });
    }

    let classBlob;
    try {
      classBlob = await cjFileBlob(classPath);
    } catch (err) {
      throw Object.assign(new Error('Compilation reported success but no .class file was produced'), { log: output });
    }
    const classBytes = new Uint8Array(await classBlob.arrayBuffer());
    onProgress && onProgress('Packaging the .jar...');
    return packageJar(classBytes, opts);
  }

  /**
   * Decompiles every class in an uploaded .jar into readable Java source.
   * Prefers a native system Java (desktop app only) over CheerpJ.
   * @param {Uint8Array} jarBytes
   * @returns {Promise<{path:string, content:string}[]>}
   */
  async function decompileJarClientSide(jarBytes, onProgress) {
    if (await nativeCapablePromise) {
      try {
        return await decompileJarNative(jarBytes, onProgress);
      } catch (err) {
        onProgress && onProgress('Native decompiler unavailable, falling back to the in-browser decompiler...');
      }
    }
    return decompileJarClientSideCheerpj(jarBytes, onProgress);
  }

  async function decompileJarClientSideCheerpj(jarBytes, onProgress) {
    await ensureCheerpj(onProgress);
    onProgress && onProgress('Reading the jar...');

    // Enumerate the .class entries ourselves via JSZip -- CheerpJ's virtual
    // filesystem has no directory-listing API, but a .jar is just a .zip.
    const inputZip = await JSZip.loadAsync(jarBytes);
    const classEntries = Object.keys(inputZip.files).filter(
      (p) => p.endsWith('.class') && !p.includes('$') && !p.startsWith('META-INF/')
    );

    onProgress && onProgress('Decompiling with CFR...');
    cheerpOSAddStringFile('/str/input.jar', jarBytes);
    const outDir = '/files/decompiled';
    const { output } = await captureConsole(() =>
      cheerpjRunMain('org.benf.cfr.reader.Main', CFR_CLASSPATH, '/str/input.jar', '--outputdir', outDir, '--silent', 'true')
    );

    const files = [];
    for (const classEntry of classEntries) {
      const javaPath = `${outDir}/${classEntry.replace(/\.class$/, '.java')}`;
      try {
        const blob = await cjFileBlob(javaPath);
        files.push({ path: classEntry.replace(/\.class$/, '.java'), content: await blob.text() });
      } catch (err) {
        // CFR didn't produce this one (e.g. a synthetic/anonymous class); skip it.
      }
    }

    if (files.length === 0) {
      throw Object.assign(new Error('CFR produced no decompiled source. Is this a valid plugin .jar?'), { log: output });
    }
    return files;
  }

  window.QuintCompiler = { compilePluginJar, decompileJarClientSide, ensureCheerpj };
})();
