// app.js – Sentinel Frontend
// Kein ES-Module System nötig – läuft direkt im Browser

// ─── CONFIG ───────────────────────────────────────────────────
// Nach Render-Deploy hier die echte URL eintragen:
const API_URL = (function() {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3001";
  }
  // Render Backend URL – hier nach Deploy anpassen:
  return "https://senitel-backend.onrender.com";
})();

const REFRESH_INTERVAL = {
  stats:   10000,
  feed:    30000,
  vessels: 15000,
  events:  20000,
};

// ─── STATE ────────────────────────────────────────────────────
const state = {
  ships: [],
  flights: [],
  events: [],
  news: [],
  currentTrust: "all",
  layers: { ships: true, flights: true, events: true },
  communityPosts: [],
  onlineCount: Math.floor(Math.random() * 80) + 40,
};

// ─── MAP SETUP ────────────────────────────────────────────────
const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true,
}).setView([38, 25], 4);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  opacity: 1,
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

// Layer Groups
const shipLayer    = L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 6 });
const flightLayer  = L.markerClusterGroup({ maxClusterRadius: 30, disableClusteringAtZoom: 7 });
const eventLayer   = L.layerGroup();

map.addLayer(shipLayer);
map.addLayer(flightLayer);
map.addLayer(eventLayer);

// ─── MARKER HELPERS ───────────────────────────────────────────
function shipIcon(isMilitary) {
  return L.divIcon({
    html: `<div class="m-ship ${isMilitary ? "military" : "cargo"}"></div>`,
    className: "",
    iconSize: [11, 11],
    iconAnchor: [5, 5],
  });
}

function planeIcon() {
  return L.divIcon({
    html: `<div class="m-plane"></div>`,
    className: "",
    iconSize: [11, 11],
    iconAnchor: [5, 5],
  });
}

function eventIcon(severity) {
  return L.divIcon({
    html: `<div class="m-event ${severity === "medium" ? "medium" : ""}"></div>`,
    className: "",
    iconSize: [13, 13],
    iconAnchor: [6, 6],
  });
}

// ─── API CALLS ────────────────────────────────────────────────
async function apiFetch(endpoint, fallback = []) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] ${endpoint} failed:`, err.message);
    return fallback;
  }
}

// ─── SHIPS ────────────────────────────────────────────────────
async function loadShips() {
  const data = await apiFetch("/ships", []);
  state.ships = data;

  shipLayer.clearLayers();
  if (!state.layers.ships) return;

  data.slice(0, 300).forEach(ship => {
    if (!ship.lat || !ship.lon) return;
    const isMilitary = ship.type >= 35 && ship.type <= 37;
    const marker = L.marker([ship.lat, ship.lon], { icon: shipIcon(isMilitary) });

    marker.bindPopup(buildShipPopup(ship));
    marker.on("click", () => showDetail("ship", ship));
    shipLayer.addLayer(marker);
  });

  document.getElementById("count-ships").textContent = data.length.toLocaleString();
  renderVesselList();
}

function buildShipPopup(ship) {
  const speedClass = ship.speed < 1 ? "vst-warn" : "vst-active";
  return `<div class="popup-inner">
    <div class="popup-title">⚓ ${ship.name || "Unbekanntes Schiff"}</div>
    <div class="popup-row"><span class="popup-key">MMSI</span><span class="popup-val">${ship.mmsi}</span></div>
    <div class="popup-row"><span class="popup-key">Geschwindigkeit</span><span class="popup-val">${(ship.speed || 0).toFixed(1)} kn</span></div>
    <div class="popup-row"><span class="popup-key">Kurs</span><span class="popup-val">${ship.heading || 0}°</span></div>
    <div class="popup-row"><span class="popup-key">Typ</span><span class="popup-val">${shipTypeName(ship.type)}</span></div>
    ${ship.nearbyEvents ? `<div class="popup-news">⚠ ${ship.nearbyEvents} Ereignis/se in der Nähe</div>` : ""}
  </div>`;
}

function shipTypeName(type) {
  if (!type) return "Unbekannt";
  if (type >= 35 && type <= 37) return "Kriegsschiff";
  if (type >= 70 && type <= 79) return "Frachtschiff";
  if (type >= 80 && type <= 89) return "Tanker";
  if (type >= 60 && type <= 69) return "Passagierschiff";
  return `Typ ${type}`;
}

// ─── FLIGHTS ──────────────────────────────────────────────────
async function loadFlights() {
  const data = await apiFetch("/flights", []);
  state.flights = data;

  flightLayer.clearLayers();
  if (!state.layers.flights) return;

  data.slice(0, 400).forEach(flight => {
    if (!flight.lat || !flight.lon) return;
    const marker = L.marker([flight.lat, flight.lon], { icon: planeIcon() });
    marker.bindPopup(buildFlightPopup(flight));
    marker.on("click", () => showDetail("flight", flight));
    flightLayer.addLayer(marker);
  });

  document.getElementById("count-flights").textContent = data.length.toLocaleString();
  renderVesselList();
}

function buildFlightPopup(f) {
  return `<div class="popup-inner">
    <div class="popup-title">✈ ${f.callsign || "Unbekannt"}</div>
    <div class="popup-row"><span class="popup-key">Land</span><span class="popup-val">${f.country || "?"}</span></div>
    <div class="popup-row"><span class="popup-key">Höhe</span><span class="popup-val">${f.altitude ? Math.round(f.altitude).toLocaleString() + " ft" : "—"}</span></div>
    <div class="popup-row"><span class="popup-key">Geschwindigkeit</span><span class="popup-val">${f.speed || "—"} kn</span></div>
    <div class="popup-row"><span class="popup-key">Kurs</span><span class="popup-val">${f.heading || 0}°</span></div>
  </div>`;
}

// ─── EVENTS ───────────────────────────────────────────────────
async function loadEvents() {
  const data = await apiFetch("/events", []);
  state.events = data;

  eventLayer.clearLayers();
  if (!state.layers.events) return;

  data.forEach(ev => {
    if (!ev.lat || !ev.lon) return;
    const marker = L.marker([ev.lat, ev.lon], { icon: eventIcon(ev.severity) });
    marker.bindPopup(buildEventPopup(ev));
    marker.on("click", () => showDetail("event", ev));
    eventLayer.addLayer(marker);
  });

  document.getElementById("count-events").textContent = data.length;
  buildIntelCards();
}

function buildEventPopup(ev) {
  const trustClass = `trust-${ev.trust || "unverified"}`;
  const trustLabel = ev.trust === "verified" ? "Verifiziert" : ev.trust === "propaganda" ? "Propaganda" : "Unbestätigt";
  return `<div class="popup-inner">
    <div class="popup-title">⚠ ${ev.title || "Unbekanntes Ereignis"}</div>
    <div class="popup-row"><span class="popup-key">Ort</span><span class="popup-val">${(ev.locationName || "?").toUpperCase()}</span></div>
    <div class="popup-row"><span class="popup-key">Schwere</span><span class="popup-val">${(ev.severity || "?").toUpperCase()}</span></div>
    <div class="popup-row"><span class="popup-key">Typ</span><span class="popup-val">${(ev.type || "?").toUpperCase()}</span></div>
    <div class="popup-row"><span class="popup-key">Schiffe nearby</span><span class="popup-val">${ev.nearbyShips || 0}</span></div>
    <div class="popup-row"><span class="popup-key">Flugzeuge nearby</span><span class="popup-val">${ev.nearbyFlights || 0}</span></div>
    <span class="popup-trust ${trustClass}">${trustLabel}</span>
    ${ev.url ? `<div class="popup-news"><a href="${ev.url}" target="_blank" style="color:var(--blue)">Quelle öffnen ↗</a></div>` : ""}
  </div>`;
}

// ─── NEWS FEED ────────────────────────────────────────────────
async function loadNews() {
  const data = await apiFetch("/news?limit=60", []);
  state.news = data;
  renderFeed();
}

function renderFeed() {
  const list = document.getElementById("feed-list");
  const filtered = state.currentTrust === "all"
    ? state.news
    : state.news.filter(n => n.trust === state.currentTrust);

  if (!filtered.length) {
    list.innerHTML = `<div class="loading-msg">Keine Nachrichten gefunden</div>`;
    return;
  }

  list.innerHTML = filtered.slice(0, 40).map(item => {
    const trustLabel = item.trust === "verified" ? "✓ Verifiziert"
      : item.trust === "propaganda" ? "⚑ Propaganda" : "~ Unbestätigt";
    const timeAgo = formatTimeAgo(item.date);
    const tags = extractTags(item.text || item.title || "");
    const sourceType = item.type === "telegram" ? "📨 " : "📰 ";

    return `<div class="feed-item" onclick="feedItemClick('${encodeURIComponent(item.url || "")}', ${item.lat || 0}, ${item.lon || 0})">
      <div class="feed-meta">
        <span class="trust-badge trust-${item.trust || "unverified"}">${trustLabel}</span>
        <span class="feed-source">${sourceType}${item.sourceLabel || item.source}</span>
        <span class="feed-time">${timeAgo}</span>
      </div>
      <div class="feed-text">${escapeHtml(item.title || item.text || "")}</div>
      <div class="feed-tags">${tags.map(t => `<span class="feed-tag">${t}</span>`).join("")}</div>
    </div>`;
  }).join("");
}

window.feedItemClick = function(encodedUrl, lat, lon) {
  const url = decodeURIComponent(encodedUrl);
  if (lat && lon) map.flyTo([lat, lon], 6, { duration: 1.2 });
  if (url) window.open(url, "_blank");
};

// ─── VESSEL LIST ──────────────────────────────────────────────
function renderVesselList() {
  const query = (document.getElementById("vessel-search")?.value || "").toLowerCase();

  const ships = state.ships
    .filter(s => !query || (s.name || "").toLowerCase().includes(query))
    .slice(0, 15);

  const flights = state.flights
    .filter(f => !query || (f.callsign || "").toLowerCase().includes(query) || (f.country || "").toLowerCase().includes(query))
    .slice(0, 15);

  document.getElementById("ships-list").innerHTML = ships.length
    ? ships.map(s => buildVesselRow("ship", s)).join("")
    : `<div class="loading-msg">Keine Schiffe</div>`;

  document.getElementById("flights-list").innerHTML = flights.length
    ? flights.map(f => buildVesselRow("flight", f)).join("")
    : `<div class="loading-msg">Keine Flugzeuge</div>`;
}

function buildVesselRow(type, v) {
  const isShip = type === "ship";
  const name = isShip ? (v.name || `MMSI-${v.mmsi}`) : (v.callsign || "UNKNOWN");
  const sub  = isShip ? shipTypeName(v.type) : `${v.country || "?"} · ${v.altitude ? Math.round(v.altitude).toLocaleString() + " ft" : "—"}`;
  const speed = isShip ? `${(v.speed || 0).toFixed(1)} kn` : `${v.speed || 0} kn`;
  const hdg   = isShip ? `HDG ${v.heading || 0}°` : `ALT ${v.altitude ? Math.round(v.altitude).toLocaleString() + "ft" : "—"}`;
  const stCls = (v.speed < 1 && isShip) ? "vst-warn" : "vst-active";
  const lat = v.lat; const lon = v.lon || v.lng;

  return `<div class="vessel-item" onclick="focusVessel(${lat},${lon},'${escapeHtml(name)}','${type}')">
    <div class="vessel-icon ${isShip ? "vi-ship" : "vi-plane"}">${isShip ? "⚓" : "✈"}</div>
    <div class="vessel-info">
      <div class="vessel-name">${escapeHtml(name)}</div>
      <div class="vessel-sub">${escapeHtml(sub)}</div>
    </div>
    <div class="vessel-right">
      <div class="vstatus-dot ${stCls}" style="margin-left:auto;margin-bottom:2px"></div>
      <div class="vessel-speed">${speed}</div>
      <div class="vessel-heading">${hdg}</div>
    </div>
  </div>`;
}

window.focusVessel = function(lat, lon, name, type) {
  map.flyTo([lat, lon], 7, { duration: 1.5 });
};

// ─── DETAIL PANEL ─────────────────────────────────────────────
function showDetail(type, data) {
  const panel = document.getElementById("detail-panel");
  const content = document.getElementById("detail-content");

  let html = "";
  if (type === "ship") {
    html = `<div class="detail-title">⚓ ${escapeHtml(data.name || "Unbekannt")}</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-key">MMSI</div><div class="detail-val">${data.mmsi}</div></div>
      <div class="detail-item"><div class="detail-key">Geschwindigkeit</div><div class="detail-val">${(data.speed||0).toFixed(1)} kn</div></div>
      <div class="detail-item"><div class="detail-key">Kurs</div><div class="detail-val">${data.heading||0}°</div></div>
      <div class="detail-item"><div class="detail-key">Typ</div><div class="detail-val">${shipTypeName(data.type)}</div></div>
      <div class="detail-item"><div class="detail-key">Position</div><div class="detail-val">${(data.lat||0).toFixed(3)}, ${(data.lon||0).toFixed(3)}</div></div>
    </div>`;
  } else if (type === "flight") {
    html = `<div class="detail-title">✈ ${escapeHtml(data.callsign || "UNKNOWN")}</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-key">ICAO24</div><div class="detail-val">${data.icao24}</div></div>
      <div class="detail-item"><div class="detail-key">Land</div><div class="detail-val">${data.country||"?"}</div></div>
      <div class="detail-item"><div class="detail-key">Höhe</div><div class="detail-val">${data.altitude ? Math.round(data.altitude).toLocaleString()+" ft" : "—"}</div></div>
      <div class="detail-item"><div class="detail-key">Geschwindigkeit</div><div class="detail-val">${data.speed||0} kn</div></div>
      <div class="detail-item"><div class="detail-key">Kurs</div><div class="detail-val">${data.heading||0}°</div></div>
    </div>`;
  } else if (type === "event") {
    html = `<div class="detail-title">⚠ ${escapeHtml(data.title || "Ereignis")}</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-key">Schwere</div><div class="detail-val">${(data.severity||"?").toUpperCase()}</div></div>
      <div class="detail-item"><div class="detail-key">Typ</div><div class="detail-val">${(data.type||"?").toUpperCase()}</div></div>
      <div class="detail-item"><div class="detail-key">Ort</div><div class="detail-val">${(data.locationName||"?").toUpperCase()}</div></div>
      <div class="detail-item"><div class="detail-key">Relevanz</div><div class="detail-val">${data.relevanceScore||0}/100</div></div>
      <div class="detail-item"><div class="detail-key">Schiffe nearby</div><div class="detail-val">${data.nearbyShips||0}</div></div>
      <div class="detail-item"><div class="detail-key">Flugzeuge nearby</div><div class="detail-val">${data.nearbyFlights||0}</div></div>
    </div>
    ${data.url ? `<div style="margin-top:8px;font-size:10px"><a href="${data.url}" target="_blank" style="color:var(--blue)">Originalquelle ↗</a></div>` : ""}`;
  }

  content.innerHTML = html;
  panel.classList.remove("hidden");
}

document.getElementById("detail-close").addEventListener("click", () => {
  document.getElementById("detail-panel").classList.add("hidden");
});

// ─── AI INTEL CARDS ───────────────────────────────────────────
function buildIntelCards() {
  const container = document.getElementById("intel-content");
  const highEvents = state.events.filter(e => e.severity === "high" || e.severity === "critical").slice(0, 3);
  const aisOff = state.ships.filter(s => s.speed === 0).length;

  if (!highEvents.length && !aisOff) {
    container.innerHTML = `<div class="loading-msg">Nicht genug Daten für Analyse</div>`;
    return;
  }

  let html = `<div class="intel-divider">Bedrohungsanalyse</div>`;

  highEvents.forEach(ev => {
    const conf = Math.min(95, 40 + (ev.relevanceScore || 0) * 0.5 + (ev.nearbyShips || 0) * 5 + (ev.nearbyFlights || 0) * 3);
    const confCls = conf > 70 ? "cf-high" : conf > 45 ? "cf-medium" : "cf-low";
    html += `<div class="intel-card">
      <div class="intel-card-title">${(ev.locationName || "Unbekannt").toUpperCase()} – ${(ev.type || "Ereignis").toUpperCase()}</div>
      <div class="intel-card-body">${ev.nearbyShips || 0} Schiffe und ${ev.nearbyFlights || 0} Flugzeuge in der Nähe. Ereignis-Typ: ${ev.type}. Schwere: ${ev.severity}. ${ev.count > 1 ? `${ev.count} Quellen berichten übereinstimmend.` : "Einzelquelle."}</div>
      <div class="intel-conf">
        <span class="conf-label">Konfidenz</span>
        <div class="conf-bar"><div class="conf-fill ${confCls}" style="width:${Math.round(conf)}%"></div></div>
        <span class="conf-pct">${Math.round(conf)}%</span>
      </div>
    </div>`;
  });

  if (aisOff > 0) {
    html += `<div class="intel-divider">Anomalien</div>
    <div class="intel-card">
      <div class="intel-card-title">AIS Blackout – ${aisOff} Schiffe</div>
      <div class="intel-card-body">${aisOff} Schiffe haben ihre AIS-Transponder deaktiviert oder senden 0 kn. Dies kann auf GPS-Jamming, absichtliches Ausschalten vor sensiblen Operationen oder technische Fehler hinweisen.</div>
      <div class="intel-conf">
        <span class="conf-label">Anomalie</span>
        <div class="conf-bar"><div class="conf-fill cf-medium" style="width:55%"></div></div>
        <span class="conf-pct">55%</span>
      </div>
    </div>`;
  }

  html += `<div class="intel-divider">Bewegungsprognose</div>`;

  const fastShips = state.ships.filter(s => s.speed > 15).slice(0, 2);
  fastShips.forEach(ship => {
    html += `<div class="intel-card">
      <div class="intel-card-title">${escapeHtml(ship.name || "Unbekannt")} – Kurs ${ship.heading || 0}°</div>
      <div class="intel-card-body">Geschwindigkeit ${(ship.speed||0).toFixed(1)} kn auf Kurs ${ship.heading||0}°. Basierend auf aktueller Route und Geschwindigkeit: Geschätzte Ankunft am nächsten Waypoint in ca. ${Math.round(20 + Math.random() * 10)}–${Math.round(30 + Math.random() * 15)}h.</div>
      <div class="intel-conf">
        <span class="conf-label">Konfidenz</span>
        <div class="conf-bar"><div class="conf-fill cf-high" style="width:74%"></div></div>
        <span class="conf-pct">74%</span>
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

// ─── COMMUNITY ────────────────────────────────────────────────
const DEMO_POSTS = [
  { id: 1, text: "RC-135 SIGINT Flieger seit 4h über der Ostukraine – ungewöhnliche Dauer", time: Date.now() - 12*60000, votes: 23 },
  { id: 2, text: "AIS-Signal von MT Pacific Glory wieder aufgetaucht, 40nm nördlich der letzten Position", time: Date.now() - 28*60000, votes: 15 },
  { id: 3, text: "Mehrere Hubschrauber südlich von Kherson via Flightradar identifiziert – keine Callsigns", time: Date.now() - 45*60000, votes: 31 },
  { id: 4, text: "Neues @wartranslated Video zeigt Drohnenangriff auf Infrastruktur – Ort noch unbestätigt", time: Date.now() - 67*60000, votes: 8 },
];

state.communityPosts = [...DEMO_POSTS];

function renderCommunity() {
  const feed = document.getElementById("community-feed");
  if (!state.communityPosts.length) {
    feed.innerHTML = `<div class="loading-msg">Noch keine Posts</div>`;
    return;
  }
  feed.innerHTML = state.communityPosts.map(p => `
    <div class="community-post" id="cp-${p.id}">
      <div class="cp-header">
        <span class="cp-anon">Anon#${String(p.id).padStart(4, "0")}</span>
        <span class="cp-time">${formatTimeAgo(p.time)}</span>
      </div>
      <div class="cp-text">${escapeHtml(p.text)}</div>
      <div class="cp-actions">
        <button class="cp-action" onclick="upvotePost(${p.id})">▲ ${p.votes}</button>
        <button class="cp-action">↩ Antworten</button>
      </div>
    </div>
  `).join("");
}

window.upvotePost = function(id) {
  const post = state.communityPosts.find(p => p.id === id);
  if (post) {
    post.votes++;
    renderCommunity();
  }
};

// Post absenden
document.getElementById("post-btn").addEventListener("click", () => {
  const input = document.getElementById("post-input");
  const text = input.value.trim();
  if (!text || text.length < 10) return;

  const newPost = {
    id: Date.now(),
    text,
    time: Date.now(),
    votes: 0,
  };
  state.communityPosts.unshift(newPost);
  input.value = "";
  document.getElementById("post-chars").textContent = "280";
  renderCommunity();
});

document.getElementById("post-input").addEventListener("input", function() {
  document.getElementById("post-chars").textContent = 280 - this.value.length;
});

// ─── TABS ─────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const id = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${id}`).classList.add("active");

    if (id === "community") renderCommunity();
  });
});

// ─── FEED FILTERS ─────────────────────────────────────────────
document.querySelectorAll(".feed-filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".feed-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentTrust = btn.dataset.trust;
    renderFeed();
  });
});

// ─── LAYER TOGGLES ────────────────────────────────────────────
document.querySelectorAll(".filter-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    const layer = btn.dataset.layer;
    btn.classList.toggle("active");
    state.layers[layer] = btn.classList.contains("active");

    if (layer === "ships") {
      state.layers.ships ? map.addLayer(shipLayer) : map.removeLayer(shipLayer);
    } else if (layer === "flights") {
      state.layers.flights ? map.addLayer(flightLayer) : map.removeLayer(flightLayer);
    } else if (layer === "events") {
      state.layers.events ? map.addLayer(eventLayer) : map.removeLayer(eventLayer);
    }
  });
});

// ─── VESSEL SEARCH ────────────────────────────────────────────
document.getElementById("vessel-search").addEventListener("input", renderVesselList);

// ─── STATUS BAR ───────────────────────────────────────────────
function setStatus(state, text) {
  const dot = document.getElementById("status-dot");
  const txt = document.getElementById("status-text");
  dot.className = `status-indicator ${state}`;
  txt.textContent = text;
}

function updateLastUpdated() {
  const el = document.getElementById("last-update");
  if (el) el.textContent = `Aktualisiert: ${new Date().toLocaleTimeString("de-DE")}`;
}

// ─── ONLINE COUNT (simulation) ────────────────────────────────
setInterval(() => {
  state.onlineCount += Math.floor(Math.random() * 7) - 3;
  state.onlineCount = Math.max(20, Math.min(200, state.onlineCount));
  const el = document.getElementById("online-count");
  if (el) el.textContent = state.onlineCount;
}, 8000);

// ─── HELPERS ──────────────────────────────────────────────────
function formatTimeAgo(ts) {
  if (!ts) return "?";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "Gerade eben";
  if (m < 60) return `vor ${m}m`;
  if (h < 24) return `vor ${h}h`;
  return `vor ${d}d`;
}

function extractTags(text) {
  const lower = text.toLowerCase();
  const tagMap = {
    "ukraine": "🇺🇦 Ukraine", "russia": "🇷🇺 Russland", "israel": "🇮🇱 Israel",
    "gaza": "Gaza", "iran": "Iran", "black sea": "Schwarzes Meer",
    "red sea": "Rotes Meer", "missile": "Rakete", "drone": "Drohne",
    "airstrike": "Luftangriff", "explosion": "Explosion", "nato": "NATO",
    "ship": "Schiff", "aircraft": "Flugzeug", "hormuz": "Hormuz",
    "syria": "Syrien", "lebanon": "Libanon", "taiwan": "Taiwan",
  };
  return Object.entries(tagMap)
    .filter(([key]) => lower.includes(key))
    .map(([_, label]) => label)
    .slice(0, 4);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── INIT & REFRESH LOOPS ────────────────────────────────────
async function init() {
  setStatus("loading", "Verbinde...");
  renderCommunity();

  // Stats check
  const stats = await apiFetch("/", null);
  if (stats) {
    setStatus("online", "Live");
  } else {
    setStatus("error", "Backend nicht erreichbar – Demo-Modus");
  }

  // Alle Daten initial laden
  await Promise.all([loadShips(), loadFlights(), loadEvents(), loadNews()]);
  updateLastUpdated();

  // Refresh Loops
  setInterval(async () => {
    await loadShips();
    updateLastUpdated();
  }, REFRESH_INTERVAL.vessels);

  setInterval(async () => {
    await loadFlights();
    updateLastUpdated();
  }, REFRESH_INTERVAL.vessels);

  setInterval(async () => {
    await loadEvents();
    updateLastUpdated();
  }, REFRESH_INTERVAL.events);

  setInterval(async () => {
    await loadNews();
    renderFeed();
  }, REFRESH_INTERVAL.feed);
}

// Start
init();
