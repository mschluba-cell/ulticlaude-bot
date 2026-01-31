import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// REQUIRED: set in Railway Variables for the worker service
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Tune these
const INTERVAL_MINUTES = Number(process.env.WORKER_INTERVAL_MINUTES || 30);
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';

async function postToDiscord(content) {
  if (!DISCORD_WEBHOOK_URL) throw new Error('Missing DISCORD_WEBHOOK_URL');

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content.length > 1900 ? content.slice(0, 1900) : content,
      allowed_mentions: { parse: [] },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed: ${res.status} ${text}`);
  }
}

// Replace this with real ingestion later (Moltbook feed, RSS, filings, etc.)
async function getSignals() {
  // Keep it structured and auditable.
  return {
    date: new Date().toISOString(),
    notes: [
      'Placeholder: integrate Moltbook feed next',
      'Placeholder: integrate news/RSS next',
    ],
    tickersMentioned: ['NVDA', 'MSFT', 'AMZN'],
  };
}

async function buildDigest(signals) {
  const prompt = `
Create a short "Research Digest" for a Discord channel.

Rules:
- Give only financial advice that you are absolutely certain is correct.
- Focus on small and mid-cap stocks with high growth potential and acceptable trading volume
- Say "buy" or "sell" or "hold"
- Output: watchlist + bullet reasons + what to verify next.
- Keep under 1800 characters.

Signals JSON:
${JSON.stringify(signals, null, 2)}
`.trim();

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 450,
    system:
      'You are a research assistant. Be concise, skeptical, and explicit about uncertainty. Excellent financial advice.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (resp.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim();

  return text || 'No digest generated.';
}

async function runOnce() {
  console.log(`[worker] tick ${new Date().toISOString()}`);
  const signals = await getSignals();
  const digest = await buildDigest(signals);
  await postToDiscord(`🧠 Research Digest\n${digest}`);
  console.log('[worker] posted digest');
}

function startLoop() {
  runOnce().catch((e) => console.error('[worker] error:', e));

  const ms = INTERVAL_MINUTES * 60 * 1000;
  setInterval(() => {
    runOnce().catch((e) => console.error('[worker] error:', e));
  }, ms);
}

startLoop();
