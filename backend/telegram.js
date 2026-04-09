// telegram.js – Robuster Telegram-Channel-Scraper
// Scrapet öffentliche Channels über t.me/s/ (kein API Key nötig)

const axios = require("axios");
const cheerio = require("cheerio");

// Channels nach Kategorie – kuratierte Liste
const CHANNELS = {
  ukraine: [
    "wartranslated",
    "ukraine_world_news",
    "truexanewsua",
  ],
  middleeast: [
    "middleeasteye",
    "almanarnews",
  ],
  osint: [
    "osintdefender",
    "intel_slava",
  ],
  shipping: [
    "shipwatcher",
  ],
};

const ALL_CHANNELS = Object.values(CHANNELS).flat();

// Headers um Bot-Detection zu vermeiden
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
};

async function fetchChannel(channel, maxPosts = 15) {
  try {
    const url = `https://t.me/s/${channel}`;
    const { data } = await axios.get(url, {
      headers: HEADERS,
      timeout: 8000,
    });

    const $ = cheerio.load(data);
    const posts = [];

    $(".tgme_widget_message").each((i, el) => {
      if (posts.length >= maxPosts) return false;

      const textEl = $(el).find(".tgme_widget_message_text");
      const text = textEl.text().trim();
      if (!text || text.length < 20) return;

      const dateStr = $(el).find("time").attr("datetime");
      const messageId = $(el).attr("data-post") || `${channel}_${i}`;
      const views = $(el).find(".tgme_widget_message_views").text().trim() || "0";
      const hasPhoto = $(el).find(".tgme_widget_message_photo").length > 0;
      const hasVideo = $(el).find(".tgme_widget_message_video").length > 0;
      const forwarded = $(el).find(".tgme_widget_message_forwarded_from").text().trim();

      posts.push({
        id: messageId,
        text: text.slice(0, 400),
        date: dateStr ? new Date(dateStr).getTime() : Date.now(),
        source: channel,
        views: parseViews(views),
        hasMedia: hasPhoto || hasVideo,
        forwardedFrom: forwarded || null,
        url: `https://t.me/${messageId}`,
      });
    });

    return posts;
  } catch (err) {
    // Stiller Fehler – Channel evtl. privat oder Rate-Limit
    console.warn(`[Telegram] Fehler bei @${channel}: ${err.message}`);
    return [];
  }
}

function parseViews(viewStr) {
  if (!viewStr) return 0;
  const s = viewStr.trim().toUpperCase();
  if (s.includes("K")) return Math.round(parseFloat(s) * 1000);
  if (s.includes("M")) return Math.round(parseFloat(s) * 1000000);
  return parseInt(s) || 0;
}

// Alle Channels parallel fetchen mit Verzögerung (anti-rate-limit)
async function fetchAllChannels(maxPerChannel = 10) {
  const results = [];

  // In Batches von 3 fetchen um Rate-Limits zu vermeiden
  const batchSize = 3;
  for (let i = 0; i < ALL_CHANNELS.length; i += batchSize) {
    const batch = ALL_CHANNELS.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(ch => fetchChannel(ch, maxPerChannel))
    );

    batchResults.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        results.push(...result.value);
      }
    });

    // Kleine Pause zwischen Batches
    if (i + batchSize < ALL_CHANNELS.length) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // Nach Datum sortieren (neueste zuerst)
  return results.sort((a, b) => b.date - a.date);
}

// Einzelner Channel für spezifische Abfragen
async function fetchTelegram(channel, maxPosts = 15) {
  return fetchChannel(channel, maxPosts);
}

module.exports = {
  fetchTelegram,
  fetchAllChannels,
  fetchChannel,
  CHANNELS,
  ALL_CHANNELS,
};
