const express = require('express');
const path = require('path');

const buildRoute = require('./routes/build');
const decompileRoute = require('./routes/decompile');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Example projects live under public/examples/ and are served as plain
// static files (by this line above, and by GitHub Pages when self-hosting
// isn't used) -- there's no dynamic behavior needed for them.
app.use('/api/build', buildRoute);
app.use('/api/decompile', decompileRoute);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`Quint is running at http://localhost:${PORT}`);
});
