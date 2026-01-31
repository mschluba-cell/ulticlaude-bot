import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import Anthropic from '@anthropic-ai/sdk';

// ================== DISCORD CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ================== ANTHROPIC CLIENT ==================
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ================== BOT CONFIG ==================
// TURN ON DEVELOPER MODE IN DISCORD
// Right-click #ask-ulticlaude → Copy Channel ID → paste below
const ALLOWED_CHANNEL_ID = '1467246866537124054';

const historyByChannel = new Map(); // channelId -> [{ role, content }]
const MAX_TURNS = 10;

// ================== READY ==================
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ================== MESSAGE HANDLER ==================
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    // Restrict bot to ONE channel
    if (ALLOWED_CHANNEL_ID && message.channelId !== ALLOWED_CHANNEL_ID) return;

    const userText = message.content.trim();
    if (!userText) return;

    const channelId = message.channelId;
    const history = historyByChannel.get(channelId) || [];

    // Reset memory
    if (userText.toLowerCase() === 'reset') {
      historyByChannel.delete(channelId);
      await message.reply('Memory cleared for this channel.');
      return;
    }

    // Add user message
    history.push({ role: 'user', content: userText });
    const trimmedHistory = history.slice(-MAX_TURNS * 2);

    await message.channel.sendTyping();

    const resp = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 400,
      system:
        'You are a helpful Discord assistant. Be concise, accurate, and safe. ' +
        'Do not request or store personal data, passwords, or API keys.',
      messages: trimmedHistory,
    });

    const replyText = (resp.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();

    if (!replyText) {
      await message.reply('Claude returned no text.');
      return;
    }

    // Add assistant reply
    history.push({ role: 'assistant', content: replyText });
    historyByChannel.set(channelId, history.slice(-MAX_TURNS * 2));

    await message.reply(replyText.slice(0, 1900));
  } catch (err) {
    console.error('ERROR:', err);
    try {
      await message.reply(`Error: ${err?.message ?? err}`);
    } catch {}
  }
});

// ================== LOGIN ==================
client.login(process.env.DISCORD_TOKEN);
