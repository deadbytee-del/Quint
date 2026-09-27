const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUILD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Runs `mvn package` inside projectDir. Resolves with the built jar path,
 * rejects with an Error whose `.log` property has the captured Maven output.
 */
function runMavenPackage(projectDir) {
  return new Promise((resolve, reject) => {
    const mvn = spawn('mvn', ['-q', '-B', '-DskipTests', 'package'], {
      cwd: projectDir,
      env: process.env,
    });

    let output = '';
    const kill = setTimeout(() => {
      mvn.kill('SIGKILL');
      reject(Object.assign(new Error('Build timed out'), { log: output }));
    }, BUILD_TIMEOUT_MS);

    mvn.stdout.on('data', (d) => { output += d.toString(); });
    mvn.stderr.on('data', (d) => { output += d.toString(); });

    mvn.on('error', (err) => {
      clearTimeout(kill);
      reject(Object.assign(err, { log: output }));
    });

    mvn.on('close', (code) => {
      clearTimeout(kill);
      if (code !== 0) {
        reject(Object.assign(new Error('Maven build failed'), { log: output }));
        return;
      }
      const targetDir = path.join(projectDir, 'target');
      const jar = fs.readdirSync(targetDir).find((f) => f.endsWith('.jar') && !f.endsWith('-sources.jar'));
      if (!jar) {
        reject(Object.assign(new Error('Build succeeded but no jar was produced'), { log: output }));
        return;
      }
      resolve({ jarPath: path.join(targetDir, jar), log: output });
    });
  });
}

module.exports = { runMavenPackage };
