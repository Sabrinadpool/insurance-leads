const express = require('express');
const crypto = require('crypto');
const { fetchLeadData } = require('../services/meta');
const { scoreLead } = require('../services/scoring');
const { upsertContact } = require('../services/ghl');
const { getNextAgent } = require('../utils/roundRobin');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Webhook Verification (GET) ──────────────────────────────────────────────

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    logger.info('[webhook] verification successful');
    return res.status(200).send(challenge);
  }

  logger.warn('[webhook] verification failed', { mode, token });
  res.sendStatus(403);
});

// ─── Lead Event Handler (POST) ───────────────────────────────────────────────

router.post('/', verifyMetaSignature, async (req, res) => {
  // Acknowledge immediately — Meta expects < 5s or it will retry
  res.sendStatus(200);

  const body = req.body;
  const entries = body?.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;

      const leadId = change.value?.leadgen_id;
      if (!leadId) continue;

      // Fire-and-forget so we don't block the response loop
      processLead(leadId).catch((err) =>
        logger.error('[webhook] unhandled error in processLead', { leadId, error: err.message, stack: err.stack })
      );
    }
  }
});

// ─── Lead Processing Pipeline ─────────────────────────────────────────────────

async function processLead(leadId) {
  logger.info('[pipeline] starting', { leadId });

  // 1. Fetch full lead data from Meta Graph API
  const lead = await fetchLeadData(leadId);
  logger.info('[pipeline] lead fetched', { name: `${lead.firstName} ${lead.lastName}`, age: lead.age });

  // 2. Assign agent via round-robin
  const { agentId, agentPhone, agentIndex } = getNextAgent();
  logger.info('[pipeline] agent assigned', { agentId, agentIndex });

  // 3. Score lead with Claude (run in parallel with GHL contact creation)
  const [scoreResult, contact] = await Promise.all([
    scoreLead(lead),
    upsertContact(lead, agentId, 'Pending'),
  ]);

  logger.info('[pipeline] lead scored', { score: scoreResult.score, reasoning: scoreResult.reasoning });

  // 4. Update contact with final score
  await upsertContact(lead, agentId, scoreResult.score);

  logger.info('[pipeline] complete', { leadId, score: scoreResult.score });

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Validates the X-Hub-Signature-256 header Meta sends with every POST.
 * Skip verification in development for easier local testing.
 */
function verifyMetaSignature(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    logger.warn('[webhook] missing signature header');
    return res.sendStatus(401);
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.META_APP_SECRET)
    .update(req.rawBody) // rawBody attached by express json middleware below
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    logger.warn('[webhook] invalid signature');
    return res.sendStatus(401);
  }

  next();
}

module.exports = router;
