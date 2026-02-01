import 'dotenv/config';
import cron from 'node-cron';
import Parser from 'rss-parser';

// ===================== CONFIG =====================
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TZ = 'America/New_York'; // 9am EST/EDT automatically
const CRON_SCHEDULE = '0 9 * * *'; // minute hour day month day-of-week -> 09:00 daily

if (!DISCORD_WEBHOOK_URL) throw new Error('Missing DISCORD_WEBHOOK_URL');

// ===================== RSS SOURCES =====================
// Google News World (global news). RSS is stable and easy.
// You can add more sources later if you want diversity.
const RSS_URLS = [
  'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
];

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: ['source'], // sometimes present
  },
});

// ===================== DISCORD =====================
async function postToDiscord(content) {
  const body = JSON.stringify({
    content: content.length > 1900 ? content.slice(0, 1900) : content,
    allowed_mentions: { parse: [] },
  });

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed ${res.status}: ${txt}`);
  }
}

// ===================== NEWS =====================
function clean(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function formatDate(d) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleString('en-US', { timeZone: TZ });
  } catch {
    return '';
  }
}

async function fetchTopStories(limit = 10) {
  const allItems = [];

  for (const url of RSS_URLS) {
    const feed = await parser.parseURL(url);
    const items = Array.isArray(feed.items) ? feed.items : [];
    for (const it of items) {
      allItems.push({
        title: clean(it.title),
        link: clean(it.link),
        pubDate: it.isoDate || it.pubDate || '',
      });
    }
  }

  // Deduplicate by link/title, then sort newest-first
  const seen = new Set();
  const deduped = [];
  for (const it of allItems) {
    const key = `${it.link}::${it.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!it.title || !it.link) continue;
    deduped.push(it);
  }

  deduped.sort((a, b) => {
    const ta = new Date(a.pubDate).getTime() || 0;
    const tb = new Date(b.pubDate).getTime() || 0;
    return tb - ta;
  });

  return deduped.slice(0, limit);
}

function buildMessage(stories) {
  const today = new Date().toLocaleDateString('en-US', { timeZone: TZ });
  const header = `🗞️ Global News Top 10 — ${today} (9:00 AM ET)`;

  const lines = stories.map((s, i) => {
    const when = formatDate(s.pubDate);
    const timePart = when ? ` (${when})` : '';
    return `${i + 1}. ${s.title}${timePart}\n${s.link}`;
  });

  // Keep under Discord limit
  let msg = `${header}\n\n${lines.join('\n\n')}`;
  if (msg.length > 1900) msg = msg.slice(0, 1900);
  return msg;
}

// ===================== JOB =====================
async function runJob() {
  console.log(`[worker] job start ${new Date().toISOString()}`);

  const stories = await fetchTopStories(10);
  if (!stories.length) {
    await postToDiscord('🗞️ Global News Top 10: No stories found (feed empty).');
    console.log('[worker] posted empty notice');
    return;
  }

  const message = buildMessage(stories);
  await postToDiscord(message);

  console.log('[worker] posted top 10 stories');
}

// ===================== STARTUP =====================
// Schedule daily at 9:00 AM Eastern
cron.schedule(
  CRON_SCHEDULE,
  () => {
    runJob().catch((e) => console.error('[worker] job error:', e));
  },
  { timezone: TZ }
);

console.log(`[worker] scheduled daily job at 09:00 ET (${TZ}).`);

// Optional: run once on boot for testing (set RUN_ON_BOOT=true)
if ((process.env.RUN_ON_BOOT || '').toLowerCase() === 'true') {
  runJob().catch((e) => console.error('[worker] boot run error:', e));
}
