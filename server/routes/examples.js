const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const EXAMPLES_DIR = path.join(__dirname, '..', '..', 'examples');

router.get('/', (req, res) => {
  const manifestPath = path.join(EXAMPLES_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    res.json([]);
    return;
  }
  res.json(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
});

router.get('/:id', (req, res) => {
  const id = String(req.params.id).replace(/[^a-z0-9-]/gi, '');
  const manifestPath = path.join(EXAMPLES_DIR, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
  const entry = manifest.find((e) => e.id === id);
  if (!entry) {
    res.status(404).json({ error: 'Unknown example' });
    return;
  }
  const xmlPath = path.join(EXAMPLES_DIR, entry.file);
  res.json({ ...entry, xml: fs.readFileSync(xmlPath, 'utf8') });
});

module.exports = router;
