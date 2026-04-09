// utils.js – Hilfsfunktionen für Sentinel

function distance(a, b) {
  const dLat = (a.lat || 0) - (b.lat || 0);
  const dLon = (a.lon || a.lng || 0) - (b.lon || b.lng || 0);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function calculateRelevance(event) {
  let score = 0;
  if (event.severity === "critical") score += 80;
  else if (event.severity === "high") score += 50;
  else if (event.severity === "medium") score += 30;
  else score += 10;

  score += Math.min((event.count || 1) * 10, 40);

  const ageMinutes = (Date.now() - event.time) / 60000;
  score += Math.max(0, 30 - ageMinutes);

  if (event.nearbyShips > 0) score += event.nearbyShips * 5;
  if (event.nearbyFlights > 0) score += event.nearbyFlights * 3;

  return Math.round(Math.min(score, 100));
}

// Trust Score für Quellen
const SOURCE_TRUST = {
  // Hohe Vertrauenswürdigkeit
  "reuters": { trust: "verified", score: 95, label: "Reuters" },
  "bbc": { trust: "verified", score: 92, label: "BBC" },
  "ap": { trust: "verified", score: 93, label: "AP News" },
  "afp": { trust: "verified", score: 91, label: "AFP" },
  "aljazeera": { trust: "verified", score: 82, label: "Al Jazeera" },
  "theguardian": { trust: "verified", score: 85, label: "The Guardian" },
  "nytimes": { trust: "verified", score: 88, label: "New York Times" },

  // Mittlere Vertrauenswürdigkeit (OSINT, aber gut)
  "wartranslated": { trust: "unverified", score: 65, label: "War Translated" },
  "ua_military": { trust: "unverified", score: 60, label: "UA Military" },
  "osintdefender": { trust: "unverified", score: 68, label: "OSINT Defender" },
  "intel_slava": { trust: "unverified", score: 55, label: "Intel Slava" },
  "militaryosint": { trust: "unverified", score: 62, label: "Military OSINT" },
  "bellingcat": { trust: "verified", score: 80, label: "Bellingcat" },

  // Niedrige Vertrauenswürdigkeit / bekannte Propaganda
  "rybar": { trust: "propaganda", score: 15, label: "Rybar (RU Pro)" },
  "southfront": { trust: "propaganda", score: 10, label: "SouthFront (RU)" },
  "tass": { trust: "propaganda", score: 20, label: "TASS (RU State)" },
  "rt": { trust: "propaganda", score: 12, label: "RT (RU State)" },
};

function getTrustInfo(source) {
  const key = source.toLowerCase().replace(/[@\s]/g, "");
  for (const [k, v] of Object.entries(SOURCE_TRUST)) {
    if (key.includes(k)) return v;
  }
  return { trust: "unverified", score: 40, label: source };
}

// Keyword-Detektion für Events
const EVENT_KEYWORDS = [
  { words: ["nuclear", "nuke", "radiological"], severity: "critical", type: "nuclear" },
  { words: ["explosion", "exploded", "blast", "detonation"], severity: "high", type: "explosion" },
  { words: ["missile", "rocket", "ballistic", "cruise missile"], severity: "high", type: "missile" },
  { words: ["airstrike", "air strike", "bombing", "bombed"], severity: "high", type: "airstrike" },
  { words: ["attack", "attacked", "offensive"], severity: "high", type: "attack" },
  { words: ["drone", "uav", "shahed", "kamikaze drone"], severity: "medium", type: "drone" },
  { words: ["troops", "soldiers", "forces advancing"], severity: "medium", type: "ground" },
  { words: ["warship", "naval vessel", "destroyer", "frigate"], severity: "medium", type: "naval" },
  { words: ["evacuation", "evacuated", "flee", "refugees"], severity: "medium", type: "humanitarian" },
  { words: ["ceasefire", "truce", "peace talks"], severity: "low", type: "diplomatic" },
];

function detectEventType(text) {
  const lower = text.toLowerCase();
  for (const kw of EVENT_KEYWORDS) {
    for (const word of kw.words) {
      if (lower.includes(word)) {
        return { severity: kw.severity, type: kw.type };
      }
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeText(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

module.exports = {
  distance,
  calculateRelevance,
  getTrustInfo,
  detectEventType,
  sleep,
  sanitizeText,
  SOURCE_TRUST,
};
