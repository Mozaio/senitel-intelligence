// geo.js – Ortsextraktion aus Text (ohne externe NLP-Bibliothek)
// Nutzt eine kuratierte Datenbank bekannter Konfliktregionen

const LOCATION_DB = {
  // Ukraine
  "ukraine": { lat: 48.3, lon: 31.1 },
  "kyiv": { lat: 50.4, lon: 30.5 },
  "kiev": { lat: 50.4, lon: 30.5 },
  "kharkiv": { lat: 50.0, lon: 36.2 },
  "kherson": { lat: 46.6, lon: 32.6 },
  "mariupol": { lat: 47.1, lon: 37.5 },
  "zaporizhzhia": { lat: 47.8, lon: 35.2 },
  "bakhmut": { lat: 48.6, lon: 38.0 },
  "odessa": { lat: 46.5, lon: 30.7 },
  "odesa": { lat: 46.5, lon: 30.7 },
  "donetsk": { lat: 48.0, lon: 37.8 },
  "luhansk": { lat: 48.6, lon: 39.3 },
  "crimea": { lat: 45.3, lon: 34.0 },
  "sevastopol": { lat: 44.6, lon: 33.5 },
  "donbas": { lat: 48.2, lon: 38.0 },
  "dnipro": { lat: 48.5, lon: 35.0 },
  "lviv": { lat: 49.8, lon: 24.0 },

  // Russia
  "russia": { lat: 55.8, lon: 37.6 },
  "moscow": { lat: 55.7, lon: 37.6 },
  "belgorod": { lat: 50.6, lon: 36.6 },
  "kursk": { lat: 51.7, lon: 36.2 },

  // Middle East
  "israel": { lat: 31.0, lon: 35.0 },
  "tel aviv": { lat: 32.1, lon: 34.8 },
  "jerusalem": { lat: 31.8, lon: 35.2 },
  "gaza": { lat: 31.5, lon: 34.4 },
  "west bank": { lat: 32.0, lon: 35.2 },
  "lebanon": { lat: 33.9, lon: 35.5 },
  "beirut": { lat: 33.9, lon: 35.5 },
  "syria": { lat: 34.8, lon: 38.9 },
  "damascus": { lat: 33.5, lon: 36.3 },
  "iran": { lat: 32.4, lon: 53.7 },
  "tehran": { lat: 35.7, lon: 51.4 },
  "iraq": { lat: 33.3, lon: 44.4 },
  "baghdad": { lat: 33.3, lon: 44.4 },
  "yemen": { lat: 15.5, lon: 48.5 },
  "houthi": { lat: 15.0, lon: 44.0 },
  "jordan": { lat: 31.9, lon: 35.9 },

  // Seas & Straits
  "black sea": { lat: 43.0, lon: 34.0 },
  "red sea": { lat: 20.0, lon: 38.0 },
  "mediterranean": { lat: 36.0, lon: 14.0 },
  "persian gulf": { lat: 26.5, lon: 52.0 },
  "hormuz": { lat: 26.6, lon: 56.3 },
  "strait of hormuz": { lat: 26.6, lon: 56.3 },
  "bab al-mandab": { lat: 12.5, lon: 43.3 },
  "suez": { lat: 30.0, lon: 32.5 },
  "baltic": { lat: 57.0, lon: 19.0 },
  "north sea": { lat: 56.0, lon: 3.0 },
  "aegean": { lat: 39.0, lon: 25.0 },
  "adriatic": { lat: 43.0, lon: 16.0 },
  "caspian": { lat: 42.0, lon: 51.0 },

  // Asia-Pacific
  "taiwan": { lat: 23.7, lon: 120.9 },
  "south china sea": { lat: 15.0, lon: 115.0 },
  "taiwan strait": { lat: 24.5, lon: 119.5 },
  "korea": { lat: 37.5, lon: 127.0 },
  "north korea": { lat: 40.0, lon: 127.5 },
  "south korea": { lat: 37.5, lon: 127.8 },
  "china": { lat: 35.0, lon: 105.0 },
  "japan": { lat: 36.2, lon: 138.3 },

  // Africa
  "sudan": { lat: 12.9, lon: 30.2 },
  "ethiopia": { lat: 9.1, lon: 40.5 },
  "somalia": { lat: 5.2, lon: 46.2 },
  "libya": { lat: 26.3, lon: 17.2 },
  "mali": { lat: 17.6, lon: -4.0 },
  "sahel": { lat: 15.0, lon: 10.0 },

  // NATO / Europe
  "nato": { lat: 50.8, lon: 4.3 },
  "poland": { lat: 51.9, lon: 19.1 },
  "romania": { lat: 45.9, lon: 24.9 },
  "finland": { lat: 61.9, lon: 25.7 },
  "sweden": { lat: 60.1, lon: 18.6 },
  "turkey": { lat: 38.9, lon: 35.2 },
  "greece": { lat: 39.1, lon: 21.8 },
  "balkans": { lat: 43.5, lon: 20.0 },
  "kosovo": { lat: 42.6, lon: 20.9 },
  "serbia": { lat: 44.0, lon: 21.0 },
};

function extractLocation(text) {
  const lower = text.toLowerCase();

  // Längste übereinstimmungen zuerst (damit "south china sea" vor "china" matched)
  const sortedKeys = Object.keys(LOCATION_DB).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      return { ...LOCATION_DB[key], name: key };
    }
  }
  return null;
}

module.exports = { extractLocation, LOCATION_DB };
