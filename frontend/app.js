// app.js – Sentinel Intelligence v3.0
// Improvements: Translation, Better Map, Fixed AIS/Flights, Conflict Zones

// ─── CONFIG ───────────────────────────────────────────────────
const API_URL = (function() {
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "http://localhost:3001";
  return "https://sentinel-backend.onrender.com"; // ← change after deploy
})();

const REFRESH = { feed: 30000, vessels: 15000, events: 20000 };

// ─── TRANSLATION STATE ────────────────────────────────────────
const translate = {
  active: false,
  cache: new Map(),
};

// ─── APP STATE ────────────────────────────────────────────────
const state = {
  ships: [], flights: [], events: [], news: [],
  currentTrust: "all",
  layers: { ships: true, flights: true, events: true, zones: true },
  communityPosts: [],
  onlineCount: Math.floor(Math.random() * 80) + 40,
};

// ─── MAP SETUP ────────────────────────────────────────────────
const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true,
}).setView([30, 25], 3);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19, opacity: 0.9,
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

const shipLayer   = L.markerClusterGroup({ maxClusterRadius: 50, disableClusteringAtZoom: 6, chunkedLoading: true });
const flightLayer = L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 7, chunkedLoading: true });
const eventLayer  = L.layerGroup();
const zoneLayer   = L.layerGroup();

map.addLayer(shipLayer);
map.addLayer(flightLayer);
map.addLayer(eventLayer);
map.addLayer(zoneLayer);

// ─── CONFLICT ZONES ────────────────────────────────────────────
const CONFLICT_ZONES = [
  { name: "Ukraine War", lat: 49.0, lon: 32.0, radius: 350000, color: "#ff3b3b", intensity: "critical" },
  { name: "Gaza Strip", lat: 31.4, lon: 34.4, radius: 40000, color: "#ff6b00", intensity: "critical" },
  { name: "Red Sea (Houthi)", lat: 15.5, lon: 42.5, radius: 280000, color: "#ffaa00", intensity: "high" },
  { name: "Strait of Hormuz", lat: 26.6, lon: 56.3, radius: 80000, color: "#ffaa00", intensity: "high" },
  { name: "Taiwan Strait", lat: 24.5, lon: 119.5, radius: 150000, color: "#ffaa00", intensity: "elevated" },
  { name: "South China Sea", lat: 12.0, lon: 114.0, radius: 500000, color: "#ffe066", intensity: "elevated" },
  { name: "Lebanon Border", lat: 33.1, lon: 35.5, radius: 60000, color: "#ff6b00", intensity: "high" },
  { name: "Sudan Civil War", lat: 15.5, lon: 32.5, radius: 280000, color: "#ff9944", intensity: "high" },
  { name: "Black Sea", lat: 45.5, lon: 32.5, radius: 220000, color: "#ff4466", intensity: "high" },
  { name: "Sahel Region", lat: 15.0, lon: 1.0, radius: 600000, color: "#ffe066", intensity: "elevated" },
  { name: "North Korea", lat: 38.3, lon: 127.5, radius: 100000, color: "#ffe066", intensity: "elevated" },
  { name: "Syria", lat: 35.0, lon: 38.5, radius: 200000, color: "#ff9944", intensity: "high" },
];

const ZONE_OPACITY = { critical: 0.16, high: 0.11, elevated: 0.07 };
const ZONE_BORDER  = { critical: 0.7,  high: 0.5,  elevated: 0.3  };

function drawConflictZones() {
  zoneLayer.clearLayers();
  CONFLICT_ZONES.forEach(zone => {
    const circle = L.circle([zone.lat, zone.lon], {
      radius: zone.radius,
      color: zone.color,
      fillColor: zone.color,
      fillOpacity: ZONE_OPACITY[zone.intensity] || 0.08,
      weight: 1.5,
      opacity: ZONE_BORDER[zone.intensity] || 0.4,
      dashArray: zone.intensity === "elevated" ? "6 4" : null,
    });

    circle.bindTooltip(
      `<div style="background:rgba(8,10,14,0.95);border:1px solid ${zone.color}55;padding:4px 10px;
        border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:10px;color:${zone.color};
        white-space:nowrap;letter-spacing:0.04em">
        <span style="opacity:0.55;font-size:8px;display:block;text-transform:uppercase;letter-spacing:0.1em">${zone.intensity}</span>
        ${zone.name}
      </div>`,
      { permanent: true, direction: "center", className: "zone-label-tip", offset: [0, 0] }
    );
    circle.addTo(zoneLayer);
  });
}
drawConflictZones();

// ─── MARKER ICONS ─────────────────────────────────────────────
function makeIcon(type, sub) {
  if (type === "ship") {
    const color = sub === "military" ? "#0e9eff" : sub === "unknown" ? "#666" : "#5599dd";
    return L.divIcon({
      html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};
        border:1.5px solid ${color}99;box-shadow:0 0 ${sub==="military"?"8px":"4px"} ${color}77"></div>`,
      className: "", iconSize: [10,10], iconAnchor: [5,5],
    });
  }
  if (type === "flight") {
    const color = sub === "military" ? "#ff7700" : "#00d4aa";
    return L.divIcon({
      html: `<div style="width:9px;height:9px;background:${color};transform:rotate(45deg);
        border:1.5px solid ${color}99;box-shadow:0 0 6px ${color}77"></div>`,
      className: "", iconSize: [10,10], iconAnchor: [5,5],
    });
  }
  if (type === "event") {
    const color = sub === "critical" ? "#ff2222" : sub === "high" ? "#ff5500" : "#ffaa00";
    return L.divIcon({
      html: `<div style="width:13px;height:13px;border-radius:50%;background:${color};
        border:2px solid ${color}66;box-shadow:0 0 10px ${color}99;animation:pulse-anim 1.5s infinite"></div>`,
      className: "", iconSize: [13,13], iconAnchor: [6,6],
    });
  }
}

// ─── TRANSLATION ──────────────────────────────────────────────
async function translateText(text) {
  if (!text || text.length < 5) return text;
  const key = text.slice(0, 120);
  if (translate.cache.has(key)) return translate.cache.get(key);
  if (isLikelyEnglish(text)) { translate.cache.set(key, text); return text; }
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0,500))}&langpair=auto|en`,
      { signal: AbortSignal.timeout(6000) }
    );
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const result = data.responseData.translatedText;
      translate.cache.set(key, result);
      return result;
    }
  } catch(e) {}
  return text;
}

function isLikelyEnglish(text) {
  const eng = ["the","a","is","in","of","to","and","that","it","for","on","are","with","was","has","have","been","will","report","attack","forces","near","after","during","said","over","under","military"];
  const words = text.toLowerCase().split(/\s+/);
  return words.filter(w => eng.includes(w)).length / words.length > 0.06;
}

async function activateTranslation() {
  const items = document.querySelectorAll(".feed-text[data-original]");
  let i = 0;
  for (const el of items) {
    el.style.opacity = "0.5";
    const translated = await translateText(el.getAttribute("data-original") || "");
    el.textContent = translated;
    el.style.opacity = "1";
    el.style.color = "#66ccff";
    i++;
    // Small yield every 5 items to not freeze UI
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));
  }
}

function deactivateTranslation() {
  document.querySelectorAll(".feed-text[data-original]").forEach(el => {
    el.textContent = el.getAttribute("data-original") || "";
    el.style.color = "";
  });
}

function initTranslateButton() {
  const btn = document.getElementById("translate-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    translate.active = !translate.active;
    if (translate.active) {
      btn.innerHTML = `🌐 EN <span class="tgl-on">ON</span>`;
      btn.classList.add("active");
      btn.disabled = true;
      setStatus("loading", "Translating...");
      await activateTranslation();
      setStatus("online", "Live");
      btn.disabled = false;
    } else {
      btn.innerHTML = `🌐 Translate <span class="tgl-off">OFF</span>`;
      btn.classList.remove("active");
      deactivateTranslation();
    }
  });
}

// ─── SHIPS ────────────────────────────────────────────────────
async function loadShips() {
  const data = await apiFetch("/ships", []);
  state.ships = data;
  shipLayer.clearLayers();
  if (!state.layers.ships) return;

  let n = 0;
  for (const ship of data) {
    if (!ship.lat || !ship.lon || n > 500) break;
    n++;
    const isMil = ship.type >= 35 && ship.type <= 37;
    const sub = isMil ? "military" : (!ship.type || ship.type === 0) ? "unknown" : "cargo";
    const marker = L.marker([ship.lat, ship.lon], { icon: makeIcon("ship", sub) });
    marker.bindPopup(buildShipPopup(ship, isMil), { maxWidth: 260 });
    marker.on("click", () => showDetail("ship", ship));
    shipLayer.addLayer(marker);
  }
  document.getElementById("count-ships").textContent = data.length.toLocaleString();
  renderVesselList();
}

function buildShipPopup(ship, isMil) {
  return `<div style="padding:10px 12px;min-width:200px;font-family:'JetBrains Mono',monospace">
    <div style="font-size:12px;font-weight:600;color:${isMil?"#0e9eff":"#5599dd"};margin-bottom:8px">
      ⚓ ${escHtml(ship.name||"UNKNOWN")}${isMil?` <span style="font-size:8px;background:rgba(14,158,255,0.15);color:#0e9eff;padding:1px 5px;border-radius:2px">WARSHIP</span>`:""}
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:10px">
      <span style="color:#555c66">MMSI</span><span>${ship.mmsi||"—"}</span>
      <span style="color:#555c66">TYPE</span><span>${shipTypeName(ship.type)}</span>
      <span style="color:#555c66">SPEED</span><span style="color:${ship.speed===0?"#ffaa00":"#00cc66"}">${(ship.speed||0).toFixed(1)} kn ${ship.speed===0?"⚠ STOPPED":""}</span>
      <span style="color:#555c66">HDG</span><span>${ship.heading||0}°</span>
    </div>
    ${ship.nearbyEvents?`<div style="margin-top:8px;font-size:10px;color:#ffaa00">⚠ ${ship.nearbyEvents} event(s) nearby</div>`:""}
  </div>`;
}

function shipTypeName(t) {
  if (!t) return "Unknown";
  if (t>=35&&t<=37) return "Warship";
  if (t>=70&&t<=79) return "Cargo";
  if (t>=80&&t<=89) return "Tanker";
  if (t>=60&&t<=69) return "Passenger";
  if (t===30) return "Fishing";
  return `Type ${t}`;
}

// ─── FLIGHTS ──────────────────────────────────────────────────
async function loadFlights() {
  const data = await apiFetch("/flights", []);
  state.flights = data;
  flightLayer.clearLayers();
  if (!state.layers.flights) return;

  let n = 0;
  for (const flight of data) {
    if (!flight.lat || !flight.lon || n > 600) break;
    n++;
    const isMil = isMilitaryFlight(flight.callsign, flight.country);
    const marker = L.marker([flight.lat, flight.lon], { icon: makeIcon("flight", isMil ? "military" : "civil") });
    marker.bindPopup(buildFlightPopup(flight, isMil), { maxWidth: 240 });
    marker.on("click", () => showDetail("flight", flight));
    flightLayer.addLayer(marker);
  }
  document.getElementById("count-flights").textContent = data.length.toLocaleString();
  renderVesselList();
}

function buildFlightPopup(f, isMil) {
  return `<div style="padding:10px 12px;min-width:200px;font-family:'JetBrains Mono',monospace">
    <div style="font-size:12px;font-weight:600;color:${isMil?"#ff7700":"#00d4aa"};margin-bottom:8px">
      ✈ ${escHtml(f.callsign||"UNKNOWN")}${isMil?` <span style="font-size:8px;background:rgba(255,119,0,0.15);color:#ff7700;padding:1px 5px;border-radius:2px">MILITARY</span>`:""}
    </div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:10px">
      <span style="color:#555c66">COUNTRY</span><span>${f.country||"?"}</span>
      <span style="color:#555c66">ALT</span><span>${f.altitude?Math.round(f.altitude).toLocaleString()+" ft":"—"}</span>
      <span style="color:#555c66">SPEED</span><span>${f.speed||"—"} kn</span>
      <span style="color:#555c66">HDG</span><span>${f.heading||0}°</span>
    </div>
  </div>`;
}

function isMilitaryFlight(cs, country) {
  if (!cs) return false;
  const s = cs.trim().toUpperCase();
  return ["RRR","JAKE","COBRA","VIPER","EAGLE","REACH","FORTE","MAGIC","NATO","RCH",
    "CNV","ZERO","BARON","GOLD","DARK","IRON","STEEL","GHOST","SAM","ROCKY",
    "SKILL","SLAM","VMF","PAT","HKY"].some(p => s.startsWith(p));
}

// ─── EVENTS ───────────────────────────────────────────────────
async function loadEvents() {
  const data = await apiFetch("/events", []);
  state.events = data;
  eventLayer.clearLayers();
  if (!state.layers.events) return;

  data.forEach(ev => {
    if (!ev.lat || !ev.lon) return;
    const marker = L.marker([ev.lat, ev.lon], { icon: makeIcon("event", ev.severity) });
    const tc = ev.trust==="verified"?"#00cc66":ev.trust==="propaganda"?"#ff3b3b":"#ffaa00";
    const tl = ev.trust==="verified"?"✓ VERIFIED":ev.trust==="propaganda"?"⚑ PROPAGANDA":"~ UNVERIFIED";
    marker.bindPopup(`
      <div style="padding:10px 12px;min-width:220px;font-family:'JetBrains Mono',monospace">
        <div style="font-size:11px;font-weight:600;color:#ff5533;margin-bottom:8px;padding-right:16px">⚠ ${escHtml(ev.title||"Event")}</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:10px">
          <span style="color:#555c66">REGION</span><span>${(ev.locationName||"?").toUpperCase()}</span>
          <span style="color:#555c66">SEVERITY</span><span style="color:${ev.severity==="critical"?"#ff2222":ev.severity==="high"?"#ff5500":"#ffaa00"}">${(ev.severity||"?").toUpperCase()}</span>
          <span style="color:#555c66">TYPE</span><span>${(ev.type||"?").toUpperCase()}</span>
          <span style="color:#555c66">SHIPS NEAR</span><span style="color:#0e9eff">${ev.nearbyShips||0}</span>
          <span style="color:#555c66">AIRCRAFT</span><span style="color:#00d4aa">${ev.nearbyFlights||0}</span>
        </div>
        <div style="margin-top:8px;padding:3px 8px;border-radius:2px;
          background:${tc}18;border:1px solid ${tc}44;font-size:9px;color:${tc};
          font-weight:600;letter-spacing:0.08em">${tl}</div>
        ${ev.url?`<div style="margin-top:6px;font-size:10px"><a href="${ev.url}" target="_blank" style="color:#0e9eff">Source ↗</a></div>`:""}
      </div>`, { maxWidth: 280 });
    marker.on("click", () => showDetail("event", ev));
    eventLayer.addLayer(marker);
  });

  document.getElementById("count-events").textContent = data.length;
  buildIntelCards();
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
    list.innerHTML = `<div class="loading-msg">No news available</div>`;
    return;
  }

  list.innerHTML = filtered.slice(0, 50).map(item => {
    const tl = item.trust==="verified"?"✓ VERIFIED":item.trust==="propaganda"?"⚑ PROPAGANDA":"~ UNVERIFIED";
    const text = escHtml(item.title || item.text || "");
    const tags = extractTags(item.text || item.title || "");
    return `<div class="feed-item" onclick="feedClick('${encodeURIComponent(item.url||"")}',${item.lat||0},${item.lon||0})">
      <div class="feed-meta">
        <span class="trust-badge trust-${item.trust||"unverified"}">${tl}</span>
        <span class="feed-source">${item.type==="telegram"?"📨 ":"📰 "}${escHtml(item.sourceLabel||item.source||"")}</span>
        <span class="feed-time">${formatTimeAgo(item.date)}</span>
      </div>
      <div class="feed-text" data-original="${text}">${text}</div>
      <div class="feed-tags">${tags.map(t=>`<span class="feed-tag">${t}</span>`).join("")}</div>
    </div>`;
  }).join("");

  // Re-apply translations if active
  if (translate.active) activateTranslation();
}

window.feedClick = function(url, lat, lon) {
  const u = decodeURIComponent(url);
  if (lat && lon) map.flyTo([lat, lon], 6, { duration: 1.2 });
  if (u) window.open(u, "_blank");
};

// ─── VESSEL LIST ──────────────────────────────────────────────
function renderVesselList() {
  const q = (document.getElementById("vessel-search")?.value || "").toLowerCase();
  const ships = state.ships.filter(s => !q || (s.name||"").toLowerCase().includes(q)).slice(0,20);
  const flights = state.flights.filter(f => !q || (f.callsign||"").toLowerCase().includes(q) || (f.country||"").toLowerCase().includes(q)).slice(0,20);

  document.getElementById("ships-list").innerHTML = ships.length
    ? ships.map(s => vesselRow("ship", s)).join("")
    : `<div class="loading-msg">No ships</div>`;

  document.getElementById("flights-list").innerHTML = flights.length
    ? flights.map(f => vesselRow("flight", f)).join("")
    : `<div class="loading-msg">No aircraft</div>`;
}

function vesselRow(type, v) {
  const isS = type === "ship";
  const name = isS ? (v.name || `MMSI-${v.mmsi}`) : (v.callsign || "UNKNOWN");
  const sub  = isS ? shipTypeName(v.type) : `${v.country||"?"} · ${v.altitude?Math.round(v.altitude).toLocaleString()+"ft":"—"}`;
  const spd  = isS ? `${(v.speed||0).toFixed(1)} kn` : `${v.speed||0} kn`;
  const hdg  = isS ? `${v.heading||0}°` : `${v.altitude?Math.round(v.altitude).toLocaleString()+"ft":"—"}`;
  const isMil = isS ? (v.type>=35&&v.type<=37) : isMilitaryFlight(v.callsign, v.country);
  const sc = (isS&&v.speed<1) ? "var(--amber)" : isMil ? "#ff7700" : "var(--green)";
  return `<div class="vessel-item" onclick="focusVessel(${v.lat},${v.lon||v.lng})">
    <div class="vessel-icon ${isS?"vi-ship":"vi-plane"}" style="${isMil?"border-color:rgba(255,119,0,0.4);background:rgba(255,119,0,0.1)":""}">${isS?"⚓":"✈"}</div>
    <div class="vessel-info">
      <div class="vessel-name" style="${isMil?"color:#ff9944":""}">${escHtml(name)}${isMil?" 🔶":""}</div>
      <div class="vessel-sub">${escHtml(sub)}</div>
    </div>
    <div class="vessel-right">
      <div style="width:5px;height:5px;border-radius:50%;background:${sc};box-shadow:0 0 4px ${sc};margin-left:auto;margin-bottom:2px"></div>
      <div class="vessel-speed">${spd}</div>
      <div class="vessel-heading">${hdg}</div>
    </div>
  </div>`;
}

window.focusVessel = function(lat, lon) {
  if (lat && lon) map.flyTo([lat, lon], 7, { duration: 1.5 });
};

// ─── DETAIL PANEL ─────────────────────────────────────────────
function showDetail(type, data) {
  const panel = document.getElementById("detail-panel");
  const content = document.getElementById("detail-content");
  let html = "";

  if (type === "ship") {
    const isMil = data.type>=35&&data.type<=37;
    html = `<div class="detail-title" style="color:${isMil?"#ff9944":"#0e9eff"}">⚓ ${escHtml(data.name||"Unknown")}${isMil?` <span style="font-size:9px;color:#ff6600;background:rgba(255,100,0,0.15);padding:1px 6px;border-radius:2px;margin-left:6px">WARSHIP</span>`:""}</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-key">MMSI</div><div class="detail-val">${data.mmsi}</div></div>
      <div class="detail-item"><div class="detail-key">TYPE</div><div class="detail-val">${shipTypeName(data.type)}</div></div>
      <div class="detail-item"><div class="detail-key">SPEED</div><div class="detail-val" style="color:${data.speed===0?"#ffaa00":"#00cc66"}">${(data.speed||0).toFixed(1)} kn</div></div>
      <div class="detail-item"><div class="detail-key">HEADING</div><div class="detail-val">${data.heading||0}°</div></div>
      <div class="detail-item"><div class="detail-key">POSITION</div><div class="detail-val">${(data.lat||0).toFixed(3)}, ${(data.lon||0).toFixed(3)}</div></div>
      <div class="detail-item"><div class="detail-key">AIS</div><div class="detail-val" style="color:${data.speed===0?"#ffaa00":"#00cc66"}">${data.speed===0?"STOPPED":"ACTIVE"}</div></div>
    </div>`;
  } else if (type === "flight") {
    const isMil = isMilitaryFlight(data.callsign, data.country);
    html = `<div class="detail-title" style="color:${isMil?"#ff9944":"#00d4aa"}">✈ ${escHtml(data.callsign||"UNKNOWN")}${isMil?` <span style="font-size:9px;color:#ff6600;background:rgba(255,100,0,0.15);padding:1px 6px;border-radius:2px;margin-left:6px">MILITARY</span>`:""}</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-key">ICAO24</div><div class="detail-val">${data.icao24}</div></div>
      <div class="detail-item"><div class="detail-key">COUNTRY</div><div class="detail-val">${data.country||"?"}</div></div>
      <div class="detail-item"><div class="detail-key">ALTITUDE</div><div class="detail-val">${data.altitude?Math.round(data.altitude).toLocaleString()+" ft":"—"}</div></div>
      <div class="detail-item"><div class="detail-key">SPEED</div><div class="detail-val">${data.speed||0} kn</div></div>
      <div class="detail-item"><div class="detail-key">HEADING</div><div class="detail-val">${data.heading||0}°</div></div>
    </div>`;
  } else if (type === "event") {
    html = `<div class="detail-title" style="color:#ff5533">⚠ ${escHtml(data.title||"Event")}</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-key">SEVERITY</div><div class="detail-val" style="color:${data.severity==="critical"?"#ff2222":data.severity==="high"?"#ff5500":"#ffaa00"}">${(data.severity||"?").toUpperCase()}</div></div>
      <div class="detail-item"><div class="detail-key">TYPE</div><div class="detail-val">${(data.type||"?").toUpperCase()}</div></div>
      <div class="detail-item"><div class="detail-key">REGION</div><div class="detail-val">${(data.locationName||"?").toUpperCase()}</div></div>
      <div class="detail-item"><div class="detail-key">SCORE</div><div class="detail-val">${data.relevanceScore||0}/100</div></div>
      <div class="detail-item"><div class="detail-key">SHIPS NEAR</div><div class="detail-val" style="color:#0e9eff">${data.nearbyShips||0}</div></div>
      <div class="detail-item"><div class="detail-key">AIRCRAFT</div><div class="detail-val" style="color:#00d4aa">${data.nearbyFlights||0}</div></div>
    </div>
    ${data.url?`<div style="margin-top:8px;font-size:10px"><a href="${data.url}" target="_blank" style="color:#0e9eff">View source ↗</a></div>`:""}`;
  }

  content.innerHTML = html;
  panel.classList.remove("hidden");
}

document.getElementById("detail-close")?.addEventListener("click", () => {
  document.getElementById("detail-panel").classList.add("hidden");
});

// ─── AI INTEL ─────────────────────────────────────────────────
function buildIntelCards() {
  const container = document.getElementById("intel-content");
  const critical = state.events.filter(e => e.severity === "critical").slice(0,2);
  const high = state.events.filter(e => e.severity === "high").slice(0,3);
  const aisOff = state.ships.filter(s => s.speed === 0).length;
  const milShips = state.ships.filter(s => s.type>=35&&s.type<=37).length;
  const milFlights = state.flights.filter(f => isMilitaryFlight(f.callsign)).length;

  let html = `<div class="intel-divider">Global Overview</div>
  <div class="intel-card">
    <div class="intel-card-title">Situation Summary</div>
    <div class="intel-card-body">
      Tracking <strong style="color:#0e9eff">${state.ships.length.toLocaleString()}</strong> vessels (${milShips} warships) 
      and <strong style="color:#00d4aa">${state.flights.length.toLocaleString()}</strong> aircraft (${milFlights} military).
      <strong style="color:#ff5533"> ${state.events.length}</strong> active events across 
      ${CONFLICT_ZONES.filter(z=>z.intensity==="critical").length} critical zones.
      ${aisOff>0?`<br/><span style="color:#ffaa00">⚠ ${aisOff} vessels with AIS disabled.</span>`:""}
    </div>
  </div>`;

  if (critical.length) {
    html += `<div class="intel-divider">Critical Alerts</div>`;
    critical.forEach(ev => {
      const conf = Math.min(92, 45 + (ev.relevanceScore||0)*0.5 + (ev.nearbyShips||0)*5);
      html += intelCard(ev, conf, "cf-low");
    });
  }
  if (high.length) {
    html += `<div class="intel-divider">High Priority</div>`;
    high.forEach(ev => {
      const conf = Math.min(82, 38 + (ev.relevanceScore||0)*0.4);
      html += intelCard(ev, conf, "cf-medium");
    });
  }
  if (aisOff > 0) {
    html += `<div class="intel-divider">Anomalies</div>
    <div class="intel-card">
      <div class="intel-card-title">AIS Blackout – ${aisOff} vessels</div>
      <div class="intel-card-body">${aisOff} vessels have disabled transponders. Possible causes: jamming, pre-op stealth, or technical failure.</div>
      <div class="intel-conf"><span class="conf-label">Concern</span>
        <div class="conf-bar"><div class="conf-fill cf-medium" style="width:55%"></div></div>
        <span class="conf-pct">55%</span></div>
    </div>`;
  }
  container.innerHTML = html || `<div class="loading-msg">Insufficient data for analysis</div>`;
}

function intelCard(ev, conf, cls) {
  return `<div class="intel-card">
    <div class="intel-card-title">${(ev.locationName||"?").toUpperCase()} – ${(ev.type||"EVENT").toUpperCase()}</div>
    <div class="intel-card-body">${ev.nearbyShips||0} vessels and ${ev.nearbyFlights||0} aircraft nearby.
    ${ev.count>1?`${ev.count} sources corroborating.`:"Single source."} Severity: ${ev.severity}.</div>
    <div class="intel-conf"><span class="conf-label">Confidence</span>
      <div class="conf-bar"><div class="conf-fill ${cls}" style="width:${Math.round(conf)}%"></div></div>
      <span class="conf-pct">${Math.round(conf)}%</span></div>
  </div>`;
}

// ─── COMMUNITY ────────────────────────────────────────────────
const DEMO_POSTS = [
  { id:1, text:"RC-135 SIGINT over eastern Ukraine for 4h+ – unusual duration", time: Date.now()-12*60000, votes:23 },
  { id:2, text:"MT Pacific Glory AIS reappeared 40nm north of last known position", time: Date.now()-28*60000, votes:15 },
  { id:3, text:"Multiple helicopters south of Kherson on Flightradar – no callsigns", time: Date.now()-45*60000, votes:31 },
  { id:4, text:"Drone strike on infrastructure reported – location still unconfirmed by second source", time: Date.now()-67*60000, votes:8 },
];
state.communityPosts = [...DEMO_POSTS];

function renderCommunity() {
  const feed = document.getElementById("community-feed");
  if (!state.communityPosts.length) { feed.innerHTML=`<div class="loading-msg">No posts yet</div>`; return; }
  feed.innerHTML = state.communityPosts.map(p => `
    <div class="community-post">
      <div class="cp-header"><span class="cp-anon">Anon#${String(p.id).padStart(4,"0")}</span><span class="cp-time">${formatTimeAgo(p.time)}</span></div>
      <div class="cp-text">${escHtml(p.text)}</div>
      <div class="cp-actions">
        <button class="cp-action" onclick="upvote(${p.id})">▲ ${p.votes}</button>
        <button class="cp-action">↩ Reply</button>
      </div>
    </div>`).join("");
}

window.upvote = function(id) {
  const p = state.communityPosts.find(x => x.id===id);
  if (p) { p.votes++; renderCommunity(); }
};

document.getElementById("post-btn")?.addEventListener("click", () => {
  const inp = document.getElementById("post-input");
  const text = inp.value.trim();
  if (!text||text.length<10) return;
  state.communityPosts.unshift({ id: Date.now(), text, time: Date.now(), votes: 0 });
  inp.value = "";
  document.getElementById("post-chars").textContent = "280";
  renderCommunity();
});

document.getElementById("post-input")?.addEventListener("input", function() {
  document.getElementById("post-chars").textContent = 280 - this.value.length;
});

// ─── TABS / FILTERS / TOGGLES ─────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const id = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${id}`)?.classList.add("active");
    if (id==="community") renderCommunity();
  });
});

document.querySelectorAll(".feed-filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".feed-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentTrust = btn.dataset.trust;
    renderFeed();
  });
});

document.querySelectorAll(".filter-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    const layer = btn.dataset.layer;
    btn.classList.toggle("active");
    state.layers[layer] = btn.classList.contains("active");
    const lm = { ships: shipLayer, flights: flightLayer, events: eventLayer };
    if (state.layers[layer]) map.addLayer(lm[layer]);
    else map.removeLayer(lm[layer]);
  });
});

// Zones toggle
document.getElementById("toggle-zones")?.addEventListener("click", function() {
  this.classList.toggle("active");
  state.layers.zones = this.classList.contains("active");
  if (state.layers.zones) map.addLayer(zoneLayer);
  else map.removeLayer(zoneLayer);
});

document.getElementById("vessel-search")?.addEventListener("input", renderVesselList);

// ─── STATUS ───────────────────────────────────────────────────
function setStatus(s, text) {
  const dot = document.getElementById("status-dot");
  const txt = document.getElementById("status-text");
  if (dot) dot.className = `status-indicator ${s}`;
  if (txt) txt.textContent = text;
}
function updateLastUpdated() {
  const el = document.getElementById("last-update");
  if (el) el.textContent = `Updated: ${new Date().toLocaleTimeString("en-US")}`;
}
setInterval(() => {
  state.onlineCount += Math.floor(Math.random()*7)-3;
  state.onlineCount = Math.max(20, Math.min(300, state.onlineCount));
  const el = document.getElementById("online-count");
  if (el) el.textContent = state.onlineCount;
}, 8000);

// ─── API ──────────────────────────────────────────────────────
async function apiFetch(endpoint, fallback=[]) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch(err) {
    console.warn(`[API] ${endpoint}:`, err.message);
    return fallback;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────
function formatTimeAgo(ts) {
  if (!ts) return "?";
  const m = Math.floor((Date.now()-ts)/60000);
  if (m<1) return "just now";
  if (m<60) return `${m}m ago`;
  if (m<1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
}
function extractTags(text) {
  const lower = text.toLowerCase();
  const map = { "ukraine":"🇺🇦 Ukraine","russia":"🇷🇺 Russia","israel":"🇮🇱 Israel",
    "gaza":"Gaza","iran":"Iran","black sea":"Black Sea","red sea":"Red Sea",
    "missile":"Missile","drone":"Drone","airstrike":"Airstrike","explosion":"Explosion",
    "nato":"NATO","hormuz":"Hormuz","syria":"Syria","taiwan":"Taiwan",
    "china":"China","houthi":"Houthi","lebanon":"Lebanon","north korea":"N. Korea" };
  return Object.entries(map).filter(([k])=>lower.includes(k)).map(([,v])=>v).slice(0,4);
}
function escHtml(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── INIT ─────────────────────────────────────────────────────
async function init() {
  setStatus("loading", "Connecting...");
  renderCommunity();
  initTranslateButton();

  const stats = await apiFetch("/", null);
  setStatus(stats ? "online" : "error", stats ? "Live" : "Backend offline – demo mode");

  await Promise.all([loadShips(), loadFlights(), loadEvents(), loadNews()]);
  updateLastUpdated();

  setInterval(async () => { await loadShips(); updateLastUpdated(); }, REFRESH.vessels);
  setInterval(async () => { await loadFlights(); updateLastUpdated(); }, REFRESH.vessels + 5000);
  setInterval(async () => { await loadEvents(); }, REFRESH.events);
  setInterval(async () => { await loadNews(); if (translate.active) activateTranslation(); }, REFRESH.feed);
}
init();
