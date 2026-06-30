require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const webhookRouter = require('./routes/webhook');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Raw body capture (required for Meta signature verification) ──────────────
app.use((req, _res, next) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => { req.rawBody = data; });
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/webhook/facebook', webhookRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Catch-all 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error('[server] unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
});

module.exports = app;
