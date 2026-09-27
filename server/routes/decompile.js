const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { decompileJar } = require('../lib/decompiler');
const { blockifySources } = require('../lib/blockify');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.jar')) {
      cb(new Error('Only .jar files can be decompiled'));
      return;
    }
    cb(null, true);
  },
});

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'quint-decompile-'));
}

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

router.post('/', upload.single('jarfile'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Upload a .jar file under the "jarfile" field' });
    return;
  }

  const tempDir = makeTempDir();
  const jarPath = path.join(tempDir, 'input.jar');
  const outDir = path.join(tempDir, 'out');

  try {
    fs.writeFileSync(jarPath, req.file.buffer);
    const files = await decompileJar(jarPath, outDir);
    const { xml, stats } = blockifySources(files);

    res.json({
      fileName: req.file.originalname,
      files: files.map((f) => ({ path: f.path, content: f.content })),
      blocks: xml,
      stats,
    });
  } catch (err) {
    console.error(err);
    res.status(422).json({ error: err.message || 'Decompilation failed', log: (err.log || '').slice(-4000) });
  } finally {
    cleanup(tempDir);
  }
});

module.exports = router;
