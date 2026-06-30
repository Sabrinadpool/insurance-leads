const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../logs/rr-state.json');

function loadIndex() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw).index ?? 0;
  } catch {
    return 0;
  }
}

function saveIndex(index) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ index }), 'utf8');
}

/**
 * Returns the next agent in round-robin order.
 * Persists state to disk so it survives server restarts.
 */
function getNextAgent() {
  const agentIds = process.env.GHL_AGENT_IDS?.split(',').map((s) => s.trim()) ?? [];
  const agentPhones = process.env.GHL_AGENT_PHONES?.split(',').map((s) => s.trim()) ?? [];

  if (agentIds.length === 0) throw new Error('GHL_AGENT_IDS is not configured');

  const index = loadIndex();
  const nextIndex = (index + 1) % agentIds.length;
  saveIndex(nextIndex);

  return {
    agentId: agentIds[index],
    agentPhone: agentPhones[index] ?? null,
    agentIndex: index,
  };
}

module.exports = { getNextAgent };
