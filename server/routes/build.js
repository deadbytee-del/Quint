const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');

const { writeProject } = require('../lib/mavenProject');
const { runMavenPackage } = require('../lib/build');

const router = express.Router();

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'quint-build-'));
}

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

router.post('/', async (req, res) => {
  const { mode = 'source', project, commands = [], files = [] } = req.body || {};

  if (!project || !project.packageName || !project.mainClass) {
    res.status(400).json({ error: 'project.packageName and project.mainClass are required' });
    return;
  }
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'At least one generated Java file is required' });
    return;
  }

  const tempDir = makeTempDir();
  try {
    const info = writeProject(tempDir, { project, commands, files });

    if (mode === 'jar') {
      try {
        const { jarPath } = await runMavenPackage(tempDir);
        res.download(jarPath, `${info.artifactId}-${project.version || '1.0.0'}.jar`, (err) => {
          cleanup(tempDir);
          if (err) console.error('Error sending jar:', err);
        });
        return;
      } catch (buildErr) {
        res.status(422).json({
          error: 'Compilation failed. Check your blocks for mistakes and try again.',
          log: (buildErr.log || buildErr.message || '').slice(-8000),
        });
        cleanup(tempDir);
        return;
      }
    }

    // mode === 'source': zip the whole Maven project for download.
    const zipName = `${info.artifactId}-source.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { throw err; });
    archive.on('end', () => cleanup(tempDir));
    archive.pipe(res);
    archive.directory(tempDir, false);
    await archive.finalize();
  } catch (err) {
    console.error(err);
    cleanup(tempDir);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Build failed', id: crypto.randomUUID() });
    }
  }
});

module.exports = router;
