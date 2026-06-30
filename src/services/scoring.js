const Anthropic = require('@anthropic-ai/sdk');
const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Age bands that matter most for life insurance underwriting
const AGE_CONTEXT = `
Life insurance lead scoring by age (standard underwriting guidelines):
- Age 18–35 → BEST insurability, lowest premiums, highest conversion likelihood → Hot
- Age 36–50 → Good insurability, moderate premiums, strong intent → Warm
- Age 51–60 → Elevated premiums, some health questions, still very closeable → Warm
- Age 61–70 → Higher risk class, often final expense focus → Cold
- Age 71+ → Very limited products, very high premiums → Cold
- Unknown age → Treat as Warm until confirmed on call
`;

/**
 * Uses Claude to score a lead as Hot, Warm, or Cold.
 * Returns { score, reasoning }.
 */
async function scoreLead(lead) {
  return withRetry(
    async () => {
      const prompt = `You are a life insurance sales expert scoring inbound leads.

${AGE_CONTEXT}

Lead details:
- Name: ${lead.firstName} ${lead.lastName}
- Age: ${lead.age ?? 'Unknown'}
- Campaign: ${lead.campaignName ?? 'Unknown'}
- Ad: ${lead.adName ?? 'Unknown'}
- Additional fields: ${JSON.stringify(lead.raw ?? {})}

Score this lead as exactly one of: Hot, Warm, or Cold.
Respond with valid JSON only, no markdown:
{"score": "Hot"|"Warm"|"Cold", "reasoning": "<one sentence>"}`;

      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = message.content[0]?.text?.trim() ?? '{}';
      logger.debug('[scoring] claude response', { raw });

      const parsed = JSON.parse(raw);
      if (!['Hot', 'Warm', 'Cold'].includes(parsed.score)) {
        throw new Error(`Unexpected score value: ${parsed.score}`);
      }

      return { score: parsed.score, reasoning: parsed.reasoning ?? '' };
    },
    { retries: 2, baseDelayMs: 1000, label: `scoring.scoreLead(${lead.leadId})` }
  );
}

module.exports = { scoreLead };
