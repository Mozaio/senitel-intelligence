// news.js – RSS Feed Aggregator für verifizierte Nachrichtenquellen

const RSSParser = require("rss-parser");
const { getTrustInfo } = require("./utils");

const parser = new RSSParser({
  timeout: 8000,
  headers: {
    "User-Agent": "Sentinel/2.0 RSS Reader",
    "Accept": "application/rss+xml, application/xml, text/xml",
  },
});

// Kuratierte RSS Feeds – kostenlos, keine API Keys
const RSS_FEEDS = [
  // Kriege & Konflikte
  {
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    source: "bbc",
    category: "general",
  },
  {
    url: "https://feeds.reuters.com/reuters/worldNews",
    source: "reuters",
    category: "general",
  },
  {
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    source: "aljazeera",
    category: "general",
  },
  {
    url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    source: "nytimes",
    category: "general",
  },
  // Defense/Military
  {
    url: "https://www.defensenews.com/arc/outboundfeeds/rss/",
    source: "defensenews",
    category: "military",
  },
  {
    url: "https://feeds.feedburner.com/BreakingDefense",
    source: "breakingdefense",
    category: "military",
  },
];

async function fetchRSSFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const trust = getTrustInfo(feed.source);

    return parsed.items.slice(0, 10).map(item => ({
      id: item.guid || item.link || `${feed.source}_${Date.now()}`,
      title: (item.title || "").slice(0, 200),
      text: (item.contentSnippet || item.summary || item.title || "").slice(0, 400),
      url: item.link || "",
      date: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      source: feed.source,
      sourceLabel: trust.label,
      trust: trust.trust,
      trustScore: trust.score,
      category: feed.category,
      type: "rss",
    }));
  } catch (err) {
    console.warn(`[RSS] Fehler bei ${feed.source}: ${err.message}`);
    return [];
  }
}

async function fetchAllRSS() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(feed => fetchRSSFeed(feed))
  );

  const allItems = [];
  results.forEach(result => {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
  });

  return allItems.sort((a, b) => b.date - a.date);
}

module.exports = { fetchAllRSS, fetchRSSFeed, RSS_FEEDS };
