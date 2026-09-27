const express = require('express');
const path = require('path');

const buildRoute = require('./routes/build');
const decompileRoute = require('./routes/decompile');
const examplesRoute = require('./routes/examples');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/build', buildRoute);
app.use('/api/decompile', decompileRoute);
app.use('/api/examples', examplesRoute);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`Quint is running at http://localhost:${PORT}`);
});
