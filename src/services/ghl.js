const axios = require('axios');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger');

const GHL_BASE = 'https://rest.gohighlevel.com/v1';

const ghlClient = axios.create({
  baseURL: GHL_BASE,
  headers: {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Creates or updates a contact in GoHighLevel.
 * GHL deduplicates by email/phone, so this is safe to call on repeat webhooks.
 */
async function upsertContact(lead, agentId, score) {
  return withRetry(
    async () => {
      const payload = {
        locationId: process.env.GHL_LOCATION_ID,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        source: `Facebook Ad — ${lead.campaignName ?? 'Unknown Campaign'}`,
        assignedTo: agentId,
        tags: [score, 'facebook-lead', lead.campaignName].filter(Boolean),
        customField: {
          age: lead.age ?? '',
          lead_score: score,
          ad_name: lead.adName ?? '',
          lead_id: lead.leadId,
        },
      };

      const { data } = await ghlClient.post('/contacts/', payload);
      logger.info('[ghl] contact upserted', { contactId: data.contact?.id, score });
      return data.contact;
    },
    { retries: 3, baseDelayMs: 600, label: `ghl.upsertContact(${lead.leadId})` }
  );
}

module.exports = { upsertContact };
