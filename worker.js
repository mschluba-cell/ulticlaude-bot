import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

// ===================== CONFIG =====================
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const INTERVAL_MINUTES = Number(process.env.WORKER_INTERVAL_MINUTES || 30);
const MODEL = 'claude-3-haiku-20240307';

if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
if (!DISCORD_WEBHOOK_URL) throw new Error('Missing DISCORD_WEBHOOK_URL');

// ===================== CLIENT =====================
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ===================== DISCORD =====================
async function postToDiscord(content) {
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content.length > 1900 ? content.slice(0, 1900) : content,
      allowed_mentions: { parse: [] },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed ${res.status}: ${txt}`);
  }
}

// ===================== INPUT (STUB) =====================
// This replaces Moltbook for now
async function getResearchInput() {
  return `
Agents are discussing current market themes:

- Debate over AI infrastructure spending sustainability
- Mixed views on NVDA valuation versus earnings growth
- Concerns about rate sensitivity impacting growth equities
- Divergence between mega-cap tech and small-cap recovery
- Caution around speculative AI-adjacent companies

Use this as raw discussion input.
`;
}

// ===================== DIGEST =====================
async function buildDigest(rawText) {
  const prompt = `
You are a neutral research synthesis agent.

Rules:
- Do NOT give financial advice
- Do NOT say buy or sell
- Focus on themes, disagreement, and uncertainty
- Be concise and analytical

Discussion input:
${rawText}

Output format:
- 4 bullet summary
- 3 "threads to watch"
- 2 risks or open questions
`.trim();

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: 'You produce neutral market research digests.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (resp.content || [])
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n')
    .trim();

  return text || 'No digest generated.';
}

// ===================== MAIN LOOP =====================
async function runOnce() {
  console.log(`[worker] tick ${new Date().toISOString()}`);

  const rawText = await getResearchInput();
  const digest = await buildDigest(rawText);

  await postToDiscord(`🧠 **Research Digest**\n\n${digest}`);

  console.log('[worker] posted digest');
}

function start() {
  runOnce().catch(e => console.error('[worker] error:', e));

  const ms = INTERVAL_MINUTES * 60 * 1000;
  setInterval(() => {
    runOnce().catch(e => console.error('[worker] error:', e));
  }, ms);
}

start();
