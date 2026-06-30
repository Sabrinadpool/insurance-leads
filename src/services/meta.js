const axios = require('axios');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger');

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

/**
 * Fetches full lead data from the Meta Graph API by lead ID.
 * Returns a normalized lead object.
 */
async function fetchLeadData(leadId) {
  return withRetry(
    async () => {
      const { data } = await axios.get(`${GRAPH_BASE}/${leadId}`, {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          fields: 'field_data,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id',
        },
      });

      logger.debug('[meta] raw lead data', { leadId, data });

      // Flatten Meta's field_data array into a plain object
      const fields = {};
      for (const { name, values } of data.field_data ?? []) {
        fields[name] = values?.[0] ?? null;
      }

      return {
        leadId,
        createdTime: data.created_time,
        adName: data.ad_name,
        campaignName: data.campaign_name,
        formId: data.form_id,
        firstName: fields['first_name'] ?? fields['full_name']?.split(' ')[0] ?? '',
        lastName: fields['last_name'] ?? fields['full_name']?.split(' ').slice(1).join(' ') ?? '',
        email: fields['email'] ?? '',
        phone: fields['phone_number'] ?? fields['phone'] ?? '',
        age: fields['age'] ? parseInt(fields['age'], 10) : null,
        // Capture any extra fields the form may have
        raw: fields,
      };
    },
    { retries: 3, baseDelayMs: 800, label: `meta.fetchLeadData(${leadId})` }
  );
}

module.exports = { fetchLeadData };
