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
  const PLUGIN_COMPILE_CLASSPATH = '/app/vendor/paper-api.jar:/app/vendor/adventure-api.jar:/app/vendor/bungeecord-chat.jar';

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

  /**
   * Compiles a single generated Java source file against the Paper API and
   * packages the result into a real, loadable plugin .jar.
   * @param {{packageName:string, mainClass:string, javaSource:string, pluginYml:string}} opts
   * @returns {Promise<Blob>}
   */
  async function compilePluginJar(opts, onProgress) {
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

    const zip = new JSZip();
    zip.file('plugin.yml', opts.pluginYml);
    zip.file(`${packagePath}/${opts.mainClass}.class`, classBytes);
    zip.file('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\nCreated-By: Quint\n');
    onProgress && onProgress('Packaging the .jar...');
    return zip.generateAsync({ type: 'blob', mimeType: 'application/java-archive' });
  }

  /**
   * Decompiles every class in an uploaded .jar into readable Java source.
   * @param {Uint8Array} jarBytes
   * @returns {Promise<{path:string, content:string}[]>}
   */
  async function decompileJarClientSide(jarBytes, onProgress) {
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
