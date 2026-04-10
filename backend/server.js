// server.js – Sentinel Intelligence Platform Backend
// Production-ready mit Caching, Error Handling, WebSocket

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const WebSocket = require("ws");
const NodeCache = require("node-cache");
const rateLimit = require("express-rate-limit");

const { fetchAllChannels } = require("./telegram");
const { fetchAllRSS } = require("./news");
const { extractLocation } = require("./geo");
const { distance, calculateRelevance, getTrustInfo, detectEventType, sanitizeText } = require("./utils");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Cache (TTL in Sekunden) ───────────────────────────────────────────────
const cache = new NodeCache({ stdTTL: 30, checkperiod: 60 });
const CACHE_TTL = {
  ships: 15,
  flights: 30,
  news: 120,
  events: 60,
};

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5500",
    "http://localhost:3000",
    "http://127.0.0.1:5500",
    /\.vercel\.app$/,
    /\.netlify\.app$/,
  ],
  methods: ["GET"],
  credentials: false,
}));

app.use(express.json());

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 Minute
  max: 60,
  message: { error: "Zu viele Anfragen – bitte warte kurz." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ─── In-Memory State ───────────────────────────────────────────────────────
let ships = new Map();      // mmsi → ship object
let flights = new Map();    // icao24 → flight object
let events = [];
let allNews = [];
let lastFlightFetch = 0;
let lastNewsFetch = 0;

// ─── AIS SHIPS (WebSocket mit Auto-Reconnect) ──────────────────────────────
let aisSocket = null;
let aisReconnectTimer = null;

function connectAIS() {
  if (!process.env.AIS_API_KEY || process.env.AIS_API_KEY === "b22e06db2f43896bc45007f245db790c93a5b2f9") {
    console.log("[AIS] Kein API Key – nutze Demo-Daten");
    loadDemoShips();
    return;
  }

  try {
    aisSocket = new WebSocket("wss://stream.aisstream.io/v0/stream");

    aisSocket.on("open", () => {
      console.log("[AIS] WebSocket verbunden");
      aisSocket.send(JSON.stringify({
        APIKey: process.env.AIS_API_KEY,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FilterMessageTypes: ["PositionReport"],
      }));
    });

    aisSocket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.Message?.PositionReport) {
          const s = msg.Message.PositionReport;
          const meta = msg.MetaData || {};
          if (!s.Latitude || !s.Longitude) return;
          if (s.Latitude === 0 && s.Longitude === 0) return;

          ships.set(String(s.UserID), {
            mmsi: s.UserID,
            lat: s.Latitude,
            lon: s.Longitude,
            speed: s.SpeedOverGround || 0,
            heading: s.TrueHeading !== 511 ? s.TrueHeading : s.CourseOverGround || 0,
            name: meta.ShipName?.trim() || `MMSI-${s.UserID}`,
            type: meta.ShipType || 0,
            timestamp: Date.now(),
          });
        }
      } catch (e) {}
    });

    aisSocket.on("error", (err) => {
      console.warn("[AIS] WebSocket Fehler:", err.message);
    });

    aisSocket.on("close", () => {
      console.log("[AIS] Verbindung getrennt – reconnect in 10s");
      aisSocket = null;
      aisReconnectTimer = setTimeout(connectAIS, 10000);
    });
  } catch (err) {
    console.warn("[AIS] Verbindungsfehler:", err.message);
    aisReconnectTimer = setTimeout(connectAIS, 15000);
  }
}

// Demo-Schiffe wenn kein API Key
function loadDemoShips() {
  const demoShips = [
    { mmsi: 1, lat: 47.2, lon: 31.5, speed: 12.4, heading: 247, name: "RFS MAKAROV", type: 35 },
    { mmsi: 2, lat: 36.5, lon: 18.2, speed: 18.2, heading: 92, name: "USS GERALD FORD", type: 35 },
    { mmsi: 3, lat: 26.5, lon: 56.3, speed: 0, heading: 0, name: "MT PACIFIC GLORY", type: 80 },
    { mmsi: 4, lat: 40.1, lon: 28.8, speed: 15.3, heading: 122, name: "TCG KEMALREIS", type: 35 },
    { mmsi: 5, lat: 33.8, lon: 35.5, speed: 8.1, heading: 180, name: "IDF PATROL BOAT", type: 35 },
    { mmsi: 6, lat: 43.5, lon: 28.1, speed: 6.2, heading: 90, name: "BG DRAZKI", type: 35 },
    { mmsi: 7, lat: 38.0, lon: 23.5, speed: 14.0, heading: 210, name: "HS KANARIS", type: 35 },
    { mmsi: 8, lat: 20.5, lon: 38.5, speed: 9.3, heading: 350, name: "HMS DIAMOND", type: 35 },
    { mmsi: 9, lat: 12.5, lon: 43.3, speed: 0.5, heading: 0, name: "UNKNOWN CARGO", type: 70 },
    { mmsi: 10, lat: 32.5, lon: 34.9, speed: 22.0, heading: 200, name: "INS LAHAV", type: 35 },
  ];
  demoShips.forEach(s => ships.set(String(s.mmsi), { ...s, timestamp: Date.now() }));
}

// ─── FLIGHTS (OpenSky mit Rate-Limit Handling) ─────────────────────────────
async function fetchFlights() {
  const now = Date.now();
  if (now - lastFlightFetch < 25000) return; // Max alle 25s
  lastFlightFetch = now;

  try {
    const res = await axios.get("https://opensky-network.org/api/states/all", {
      timeout: 10000,
      // No bounding box = global, all aircraft in the air
      timeout: 15000,
    });

    if (!res.data?.states) return;

    flights.clear();
    let count = 0;
    for (const f of res.data.states) {
      if (count > 2000) break; // Increased limit
      if (!f[6] || !f[5]) continue;
      if (f[8] === true) continue; // Skip on-ground

      const alt = f[7] ? Math.round(f[7] * 3.281) : 0; // m → ft
      const spd = f[9] ? Math.round(f[9] * 1.944) : 0; // m/s → kn

      flights.set(f[0], {
        icao24: f[0],
        callsign: (f[1] || "").trim() || "UNKNOWN",
        lat: f[6],
        lon: f[5],
        altitude: alt,
        speed: spd,
        heading: f[10] ? Math.round(f[10]) : 0,
        country: f[2] || "Unknown",
        onGround: false,
        timestamp: Date.now(),
      });
      count++;
    }
    console.log(`[OpenSky] ${flights.size} aircraft loaded globally`);
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn("[OpenSky] Rate limit – warte 60s");
      lastFlightFetch = Date.now() + 60000;
    } else {
      console.warn("[OpenSky] Fehler:", err.message);
      if (flights.size === 0) loadDemoFlights();
    }
  }
}

function loadDemoFlights() {
  const demoFlights = [
    { icao24:"a1",callsign:"JAKE21",lat:48.5,lon:37.5,altitude:35000,speed:420,heading:180,country:"United States" },
    { icao24:"a2",callsign:"COBRA1",lat:33.5,lon:36.2,altitude:28000,speed:580,heading:270,country:"Israel" },
    { icao24:"a3",callsign:"RRR7701",lat:51.5,lon:0.1,altitude:38000,speed:460,heading:90,country:"United Kingdom" },
    { icao24:"a4",callsign:"NATO01",lat:50.1,lon:14.4,altitude:30000,speed:440,heading:120,country:"Belgium" },
    { icao24:"a5",callsign:"RECON22",lat:35.0,lon:32.5,altitude:40000,speed:480,heading:45,country:"United States" },
    { icao24:"a6",callsign:"UAE001",lat:25.2,lon:55.4,altitude:36000,speed:500,heading:60,country:"United Arab Emirates" },
    { icao24:"a7",callsign:"AIR001",lat:48.8,lon:2.3,altitude:35000,speed:470,heading:270,country:"France" },
    { icao24:"a8",callsign:"DLH101",lat:52.5,lon:13.4,altitude:33000,speed:450,heading:180,country:"Germany" },
    { icao24:"a9",callsign:"BAW202",lat:55.8,lon:-4.3,altitude:37000,speed:490,heading:200,country:"United Kingdom" },
    { icao24:"a10",callsign:"RYR500",lat:41.9,lon:12.5,altitude:34000,speed:460,heading:100,country:"Ireland" },
    { icao24:"a11",callsign:"KLM303",lat:52.3,lon:4.9,altitude:36000,speed:470,heading:320,country:"Netherlands" },
    { icao24:"a12",callsign:"FORTE10",lat:38.8,lon:-77.0,altitude:38000,speed:520,heading:90,country:"United States" },
  ];
  demoFlights.forEach(f => flights.set(f.icao24, { ...f, timestamp: Date.now() }));
}

// ─── NEWS & EVENTS ─────────────────────────────────────────────────────────
async function refreshNews() {
  const now = Date.now();
  if (now - lastNewsFetch < 90000) return; // Max alle 90s
  lastNewsFetch = now;

  try {
    const [rssItems, telegramPosts] = await Promise.allSettled([
      fetchAllRSS(),
      fetchAllChannels(8),
    ]);

    const rss = rssItems.status === "fulfilled" ? rssItems.value : [];
    const tg = telegramPosts.status === "fulfilled" ? telegramPosts.value : [];

    // Telegram Posts anreichern
    const enrichedTg = tg.map(post => {
      const trust = getTrustInfo(post.source);
      return {
        ...post,
        sourceLabel: trust.label,
        trust: trust.trust,
        trustScore: trust.score,
        type: "telegram",
      };
    });

    allNews = [...rss, ...enrichedTg]
      .sort((a, b) => b.date - a.date)
      .slice(0, 100); // Max 100 News

    // Events aus News extrahieren
    buildEvents();
    console.log(`[News] ${rss.length} RSS + ${enrichedTg.length} Telegram Posts`);
  } catch (err) {
    console.error("[News] Fehler:", err.message);
  }
}

function buildEvents() {
  const rawEvents = new Map();

  for (const item of allNews) {
    const textToSearch = `${item.title || ""} ${item.text || ""}`;
    const eventType = detectEventType(textToSearch);
    if (!eventType) continue;

    const loc = extractLocation(textToSearch);
    if (!loc) continue;

    const locKey = `${Math.round(loc.lat * 2) / 2}_${Math.round(loc.lon * 2) / 2}`;

    if (rawEvents.has(locKey)) {
      const existing = rawEvents.get(locKey);
      existing.count++;
      existing.sources.push(item.source);
      if (eventType.severity === "critical" || (eventType.severity === "high" && existing.severity !== "critical")) {
        existing.severity = eventType.severity;
      }
    } else {
      rawEvents.set(locKey, {
        id: `ev_${locKey}_${Date.now()}`,
        title: sanitizeText(item.title || item.text),
        text: sanitizeText(item.text),
        lat: loc.lat,
        lon: loc.lon,
        locationName: loc.name,
        severity: eventType.severity,
        type: eventType.type,
        time: item.date || Date.now(),
        count: 1,
        sources: [item.source],
        trust: item.trust,
        url: item.url || "",
      });
    }
  }

  // Nearby Assets verlinken
  const shipArr = Array.from(ships.values());
  const flightArr = Array.from(flights.values());

  events = Array.from(rawEvents.values()).map(ev => {
    const nearbyShips = shipArr.filter(s => distance(ev, s) < 3).length;
    const nearbyFlights = flightArr.filter(f => distance(ev, f) < 3).length;

    return {
      ...ev,
      nearbyShips,
      nearbyFlights,
      relevanceScore: calculateRelevance({ ...ev, nearbyShips, nearbyFlights }),
    };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ─── API ROUTES ────────────────────────────────────────────────────────────


// Translation Proxy - avoids browser CORS issues
app.post("/translate", async (req, res) => {
  const { text, from = "auto" } = req.body || {};
  if (!text || typeof text !== "string") return res.json({ translation: "" });
  const snippet = text.slice(0, 500);
  // Try multiple source languages when auto
  const pairs = from === "auto"
    ? ["ru|en","ar|en","uk|en","de|en","fr|en","es|en","zh|en","fa|en","he|en"]
    : [`${from}|en`];
  for (const pair of pairs) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(snippet)}&langpair=${pair}`;
      const r = await axios.get(url, { timeout: 5000 });
      const d = r.data;
      if (d?.responseStatus === 200 && d.responseData?.translatedText) {
        const t = d.responseData.translatedText;
        if (t && t !== snippet && t.length > 5) {
          return res.json({ translation: t, pair });
        }
      }
    } catch(_) {}
  }
  res.json({ translation: text, fallback: true });
});

// Health Check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    version: "2.0.0",
    ships: ships.size,
    flights: flights.size,
    events: events.length,
    news: allNews.length,
    uptime: Math.round(process.uptime()),
  });
});

// Schiffe
app.get("/ships", (req, res) => {
  const cached = cache.get("ships");
  if (cached) return res.json(cached);

  // Alte Daten entfernen (> 15 Min)
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [mmsi, ship] of ships.entries()) {
    if (ship.timestamp < cutoff) ships.delete(mmsi);
  }

  const result = Array.from(ships.values());
  cache.set("ships", result, CACHE_TTL.ships);
  res.json(result);
});

// Flugzeuge
app.get("/flights", async (req, res) => {
  const cached = cache.get("flights");
  if (cached) return res.json(cached);

  await fetchFlights();
  const result = Array.from(flights.values());
  cache.set("flights", result, CACHE_TTL.flights);
  res.json(result);
});

// News Feed
app.get("/news", async (req, res) => {
  await refreshNews();
  const { trust, limit = 50 } = req.query;

  let result = allNews;
  if (trust) {
    result = result.filter(n => n.trust === trust);
  }
  res.json(result.slice(0, parseInt(limit)));
});

// Events (News mit Geo-Koordinaten)
app.get("/events", async (req, res) => {
  await refreshNews();
  const { severity } = req.query;

  let result = events;
  if (severity) {
    result = result.filter(e => e.severity === severity);
  }
  res.json(result);
});

// Timeline (chronologisch)
app.get("/timeline", async (req, res) => {
  await refreshNews();
  res.json(allNews.slice(0, 30));
});

// Stats für Header-Anzeige
app.get("/stats", (req, res) => {
  res.json({
    ships: ships.size,
    flights: flights.size,
    events: events.length,
    news: allNews.length,
    conflicts: events.filter(e => e.severity === "high" || e.severity === "critical").length,
  });
});

// ─── SERVER START ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Sentinel Backend läuft auf http://localhost:${PORT}`);
  console.log(`   AIS Key: ${process.env.AIS_API_KEY ? "✓ gesetzt" : "✗ fehlt – Demo-Modus"}`);

  // Initiale Daten laden
  connectAIS();
  fetchFlights();
  refreshNews();

  // Periodische Updates
  setInterval(fetchFlights, 30000);
  setInterval(refreshNews, 90000);
  setInterval(buildEvents, 60000);

  // Stale ship cleanup
  setInterval(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [k, v] of ships.entries()) {
      if (v.timestamp < cutoff) ships.delete(k);
    }
  }, 5 * 60 * 1000);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  if (aisSocket) aisSocket.close();
  if (aisReconnectTimer) clearTimeout(aisReconnectTimer);
  process.exit(0);
});
