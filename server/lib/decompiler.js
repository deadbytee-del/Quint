const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ensureCfr } = require('../../scripts/setup-cfr');

const DECOMPILE_TIMEOUT_MS = 3 * 60 * 1000;

function walkJavaFiles(dir, base = dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJavaFiles(full, base, acc);
    } else if (entry.name.endsWith('.java')) {
      acc.push({
        path: path.relative(base, full).split(path.sep).join('/'),
        content: fs.readFileSync(full, 'utf8'),
      });
    }
  }
  return acc;
}

/**
 * Decompiles every class in the given .jar into Java source using CFR.
 * @returns {Promise<{path:string, content:string}[]>}
 */
async function decompileJar(jarPath, outDir) {
  const cfrPath = await ensureCfr();
  fs.mkdirSync(outDir, { recursive: true });

  await new Promise((resolve, reject) => {
    const proc = spawn('java', ['-jar', cfrPath, jarPath, '--outputdir', outDir, '--silent', 'true'], {
      env: process.env,
    });
    let log = '';
    const kill = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(Object.assign(new Error('Decompilation timed out'), { log }));
    }, DECOMPILE_TIMEOUT_MS);

    proc.stdout.on('data', (d) => { log += d.toString(); });
    proc.stderr.on('data', (d) => { log += d.toString(); });
    proc.on('error', (err) => { clearTimeout(kill); reject(Object.assign(err, { log })); });
    proc.on('close', () => {
      // CFR exits non-zero on partial-decompile warnings even when useful output
      // was produced, so we treat "did it write any .java files" as success.
      clearTimeout(kill);
      resolve();
    });
  });

  const files = walkJavaFiles(outDir);
  if (files.length === 0) {
    throw new Error('CFR produced no decompiled source. Is this a valid .jar file?');
  }
  return files;
}

module.exports = { decompileJar };
