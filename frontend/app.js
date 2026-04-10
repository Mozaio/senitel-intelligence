// ═══════════════════════════════════════════════════════════
// SENTINEL v3.1 — Complete Frontend
// ═══════════════════════════════════════════════════════════

// ─── CONFIG ────────────────────────────────────────────────
const API = (() => {
  const h = location.hostname;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:3001'
    : 'https://senitel-backend.onrender.com/'; // ← update after deploy
})();

const TICK = { vessels: 15000, events: 20000, news: 30000 };

// ─── STATE ─────────────────────────────────────────────────
const S = {
  ships: [], flights: [], events: [], news: [],
  trust: 'all',
  layers: { ships: true, flights: true, events: true, zones: true },
  posts: [],
  online: 47 + Math.floor(Math.random() * 60),
  translated: false,
  translating: false,
  xlateCache: new Map(),      // original → translated
};

// ─── MAP ───────────────────────────────────────────────────
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true,
}).setView([25, 20], 3);

// Carto Dark — beautiful dark basemap, no CSS filter needed
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19, subdomains: 'abcd', opacity: 0.92,
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

const GL = {
  ships:   L.markerClusterGroup({ maxClusterRadius: 50, disableClusteringAtZoom: 6, chunkedLoading: true }),
  flights: L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 7, chunkedLoading: true }),
  events:  L.layerGroup(),
  zones:   L.layerGroup(),
};
Object.values(GL).forEach(l => map.addLayer(l));

// ─── CONFLICT ZONES ────────────────────────────────────────
const ZONES = [
  // CRITICAL
  { n:'Ukraine War',          lat:49.0, lon:32.0, r:370000, c:'#ff2222', i:'critical' },
  { n:'Gaza / West Bank',     lat:31.5, lon:34.6, r:45000,  c:'#ff4400', i:'critical' },
  // HIGH
  { n:'Red Sea / Houthi',     lat:14.5, lon:42.5, r:320000, c:'#ff6600', i:'high' },
  { n:'Lebanon-Israel',       lat:33.2, lon:35.5, r:65000,  c:'#ff6600', i:'high' },
  { n:'Black Sea',            lat:45.5, lon:32.5, r:230000, c:'#ff4455', i:'high' },
  { n:'Strait of Hormuz',     lat:26.6, lon:56.3, r:85000,  c:'#ffaa00', i:'high' },
  { n:'Sudan Civil War',      lat:15.5, lon:32.5, r:300000, c:'#ff8800', i:'high' },
  { n:'Syria',                lat:35.0, lon:38.5, r:210000, c:'#ff7700', i:'high' },
  // ELEVATED
  { n:'Taiwan Strait',        lat:24.5, lon:119.5,r:160000, c:'#ffcc00', i:'elevated' },
  { n:'South China Sea',      lat:12.0, lon:114.0,r:550000, c:'#ffcc00', i:'elevated' },
  { n:'North Korea Border',   lat:38.3, lon:127.5,r:110000, c:'#ffcc00', i:'elevated' },
  { n:'Sahel Region',         lat:15.0, lon:1.0,  r:700000, c:'#ddaa00', i:'elevated' },
  { n:'Ethiopia / Horn',      lat:9.0,  lon:40.0, r:280000, c:'#ddaa00', i:'elevated' },
  { n:'Bab el-Mandeb',        lat:12.5, lon:43.3, r:75000,  c:'#ffaa00', i:'elevated' },
  { n:'Aegean / Turkey-Greece',lat:39.5,lon:25.5, r:120000, c:'#ddaa00', i:'elevated' },
  { n:'Myanmar Civil War',    lat:19.5, lon:96.0, r:250000, c:'#ddaa00', i:'elevated' },
];

const ZOP  = { critical:.18, high:.12, elevated:.07 };
const ZBOR = { critical:.75, high:.55, elevated:.3  };
const ZDSH = { critical:null, high:null, elevated:'6 4' };

function drawZones() {
  GL.zones.clearLayers();
  ZONES.forEach(z => {
    const c = L.circle([z.lat, z.lon], {
      radius: z.r,
      color: z.c, fillColor: z.c,
      fillOpacity: ZOP[z.i] || .08,
      weight: 1.5, opacity: ZBOR[z.i] || .4,
      dashArray: ZDSH[z.i],
    });
    c.bindTooltip(`<span style="color:${z.c};font-size:9px;font-weight:600;letter-spacing:.05em">
        <span style="opacity:.55;font-size:8px;display:block;text-transform:uppercase">${z.i}</span>${z.n}
      </span>`, { permanent: true, direction: 'center', className: 'ztip' });
    GL.zones.addLayer(c);
  });
}
drawZones();

// ─── ICONS ─────────────────────────────────────────────────
function icon(type, sub) {
  let html = '';
  if (type === 'ship') {
    const col = sub === 'mil' ? '#0e9eff' : sub === 'unk' ? '#556' : '#4488bb';
    const glow = sub === 'mil' ? '0 0 8px ' + col + '88' : '0 0 4px ' + col + '55';
    html = `<div style="width:10px;height:10px;border-radius:50%;background:${col};
      border:1.5px solid ${col}88;box-shadow:${glow}"></div>`;
  } else if (type === 'flight') {
    const col = sub === 'mil' ? '#ff7700' : '#00d4aa';
    html = `<div style="width:9px;height:9px;background:${col};transform:rotate(45deg);
      border:1.5px solid ${col}88;box-shadow:0 0 6px ${col}66"></div>`;
  } else if (type === 'event') {
    const col = sub === 'critical' ? '#ff2222' : sub === 'high' ? '#ff5500' : '#ffaa00';
    html = `<div style="width:13px;height:13px;border-radius:50%;background:${col};
      border:2px solid ${col}55;box-shadow:0 0 10px ${col}88;animation:blink 1.5s infinite"></div>`;
  }
  return L.divIcon({ html, className: '', iconSize: [13,13], iconAnchor: [6,6] });
}

// ─── TRANSLATION ───────────────────────────────────────────
// Translation is done via the BACKEND proxy endpoint /translate
// This avoids CORS issues and keeps the API key server-side if needed.
// Falls back to MyMemory public API if backend not available.

async function xlate(text) {
  if (!text || text.trim().length < 4) return text;
  const key = text.slice(0, 200);
  if (S.xlateCache.has(key)) return S.xlateCache.get(key);

  // Try backend proxy first
  try {
    const r = await fetch(`${API}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 500) }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const d = await r.json();
      if (d.translation) {
        S.xlateCache.set(key, d.translation);
        return d.translation;
      }
    }
  } catch (_) {}

  // Fallback: MyMemory public API (detect language → EN)
  try {
    const encoded = encodeURIComponent(text.slice(0, 450));
    // Use explicit langpair detection: try common non-English sources
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encoded}&langpair=ru|en`,
      { signal: AbortSignal.timeout(7000) }
    );
    const d = await r.json();
    if (d.responseStatus === 200) {
      const t = d.responseData?.translatedText || text;
      // MyMemory sometimes returns same text if already English
      const result = t && t !== text ? t : text;
      S.xlateCache.set(key, result);
      return result;
    }
  } catch (_) {}

  return text;
}

// Translate all visible feed items with progress bar
async function translateFeed() {
  const list = document.getElementById('feed');
  const items = list.querySelectorAll('.ftext[data-orig]');
  if (!items.length) return;

  // Show progress bar
  let prog = list.querySelector('.translate-progress');
  if (!prog) {
    prog = document.createElement('div');
    prog.className = 'translate-progress';
    prog.innerHTML = `<span id="tp-txt">Translating...</span><div class="tp-bar"><div class="tp-fill" id="tp-fill" style="width:0%"></div></div><span id="tp-done">0/${items.length}</span>`;
    list.prepend(prog);
  }

  let done = 0;
  for (const el of items) {
    const orig = el.getAttribute('data-orig');
    el.classList.add('translating');
    const result = await xlate(orig);
    el.textContent = result;
    el.classList.remove('translating');
    el.classList.add('translated');
    done++;
    const pct = Math.round(done / items.length * 100);
    document.getElementById('tp-fill').style.width = pct + '%';
    document.getElementById('tp-done').textContent = `${done}/${items.length}`;
    // Tiny yield every 3 items to keep UI responsive
    if (done % 3 === 0) await new Promise(r => setTimeout(r, 0));
  }

  document.getElementById('tp-txt').textContent = '✓ Translated to English';
  setTimeout(() => prog.remove(), 3000);
}

function restoreFeed() {
  document.querySelectorAll('.ftext[data-orig]').forEach(el => {
    el.textContent = el.getAttribute('data-orig');
    el.classList.remove('translated', 'translating');
  });
}

// ─── TRANSLATE BUTTON ──────────────────────────────────────
function initTranslate() {
  const btn = document.getElementById('btn-translate');
  const lbl = document.getElementById('tgl-label');

  btn.addEventListener('click', async () => {
    if (S.translating) return;

    S.translated = !S.translated;

    if (S.translated) {
      btn.classList.add('on', 'loading');
      lbl.textContent = 'ON';
      S.translating = true;
      await translateFeed();
      S.translating = false;
      btn.classList.remove('loading');
    } else {
      btn.classList.remove('on', 'loading');
      lbl.textContent = 'OFF';
      restoreFeed();
    }
  });
}

// ─── SHIPS ─────────────────────────────────────────────────
async function loadShips() {
  const data = await get('/ships') || [];
  S.ships = data;
  GL.ships.clearLayers();
  if (!S.layers.ships) return;

  let n = 0;
  for (const s of data) {
    if (!s.lat || !s.lon || n >= 600) break;
    n++;
    const isMil = s.type >= 35 && s.type <= 37;
    const sub = isMil ? 'mil' : (!s.type || s.type === 0) ? 'unk' : 'cargo';
    const m = L.marker([s.lat, s.lon], { icon: icon('ship', sub) });
    m.bindPopup(shipPopup(s, isMil), { maxWidth: 260 });
    m.on('click', () => openDrawer('ship', s));
    GL.ships.addLayer(m);
  }
  qs('#cnt-ships').textContent = data.length.toLocaleString();
  renderVessels();
}

function shipPopup(s, isMil) {
  const col = isMil ? '#0e9eff' : '#4488bb';
  const tag = isMil ? `<span class="popup-tag" style="background:rgba(14,158,255,.15);color:#0e9eff;border:1px solid rgba(14,158,255,.3)">WARSHIP</span>` : '';
  return `<div class="popup">
    <div class="popup-title" style="color:${col}">⚓ ${esc(s.name || 'UNKNOWN')} ${tag}</div>
    <div class="popup-grid">
      <span class="pk">MMSI</span><span class="pv">${s.mmsi || '—'}</span>
      <span class="pk">TYPE</span><span class="pv">${stype(s.type)}</span>
      <span class="pk">SPEED</span><span class="pv" style="color:${s.speed===0?'#ffaa00':'#00cc66'}">${(s.speed||0).toFixed(1)} kn${s.speed===0?' ⚠':''}</span>
      <span class="pk">HEADING</span><span class="pv">${s.heading||0}°</span>
      <span class="pk">POSITION</span><span class="pv">${(s.lat||0).toFixed(2)}, ${(s.lon||0).toFixed(2)}</span>
    </div>
    ${s.nearbyEvents ? `<div style="margin-top:8px;font-size:10px;color:#ffaa00">⚠ ${s.nearbyEvents} event(s) nearby</div>` : ''}
  </div>`;
}

function stype(t) {
  if (!t) return 'Unknown';
  if (t>=35&&t<=37) return 'Warship';
  if (t>=70&&t<=79) return 'Cargo';
  if (t>=80&&t<=89) return 'Tanker';
  if (t>=60&&t<=69) return 'Passenger';
  if (t===30) return 'Fishing';
  return `Type ${t}`;
}

// ─── FLIGHTS ───────────────────────────────────────────────
async function loadFlights() {
  const data = await get('/flights') || [];
  S.flights = data;
  GL.flights.clearLayers();
  if (!S.layers.flights) return;

  let n = 0;
  for (const f of data) {
    if (!f.lat || !f.lon || n >= 700) break;
    n++;
    const isMil = milFlight(f.callsign);
    const m = L.marker([f.lat, f.lon], { icon: icon('flight', isMil ? 'mil' : 'civ') });
    m.bindPopup(flightPopup(f, isMil), { maxWidth: 240 });
    m.on('click', () => openDrawer('flight', f));
    GL.flights.addLayer(m);
  }
  qs('#cnt-flights').textContent = data.length.toLocaleString();
  renderVessels();
}

function flightPopup(f, isMil) {
  const col = isMil ? '#ff7700' : '#00d4aa';
  const tag = isMil ? `<span class="popup-tag" style="background:rgba(255,119,0,.15);color:#ff7700;border:1px solid rgba(255,119,0,.3)">MILITARY</span>` : '';
  return `<div class="popup">
    <div class="popup-title" style="color:${col}">✈ ${esc(f.callsign||'UNKNOWN')} ${tag}</div>
    <div class="popup-grid">
      <span class="pk">COUNTRY</span><span class="pv">${f.country||'?'}</span>
      <span class="pk">ALTITUDE</span><span class="pv">${f.altitude ? f.altitude.toLocaleString()+' ft' : '—'}</span>
      <span class="pk">SPEED</span><span class="pv">${f.speed||'—'} kn</span>
      <span class="pk">HEADING</span><span class="pv">${f.heading||0}°</span>
      <span class="pk">ICAO24</span><span class="pv">${f.icao24||'—'}</span>
    </div>
  </div>`;
}

const MIL_PFXS = ['RRR','JAKE','COBRA','VIPER','EAGLE','REACH','FORTE','MAGIC','RCH',
  'CNV','ZERO','BARON','GOLD','DARK','IRON','STEEL','GHOST','SAM','ROCKY','SKILL',
  'SLAM','VMF','PAT','HKY','NATO','USAF','NAVY','ARMY'];

function milFlight(cs) {
  if (!cs) return false;
  const s = cs.trim().toUpperCase();
  return MIL_PFXS.some(p => s.startsWith(p));
}

// ─── EVENTS ────────────────────────────────────────────────
async function loadEvents() {
  const data = await get('/events') || [];
  S.events = data;
  GL.events.clearLayers();
  if (!S.layers.events) return;

  data.forEach(ev => {
    if (!ev.lat || !ev.lon) return;
    const m = L.marker([ev.lat, ev.lon], { icon: icon('event', ev.severity) });
    m.bindPopup(evPopup(ev), { maxWidth: 280 });
    m.on('click', () => openDrawer('event', ev));
    GL.events.addLayer(m);
  });

  qs('#cnt-events').textContent = data.length;
  buildIntel();
}

function evPopup(ev) {
  const tc = ev.trust==='verified'?'#00cc66':ev.trust==='propaganda'?'#ff3b3b':'#ffaa00';
  const tl = ev.trust==='verified'?'✓ VERIFIED':ev.trust==='propaganda'?'⚑ PROPAGANDA':'~ UNVERIFIED';
  const sc = ev.severity==='critical'?'#ff2222':ev.severity==='high'?'#ff5500':'#ffaa00';
  return `<div class="popup">
    <div class="popup-title" style="color:#ff5533">⚠ ${esc(ev.title||'Unknown Event')}</div>
    <div class="popup-grid">
      <span class="pk">REGION</span><span class="pv">${(ev.locationName||'?').toUpperCase()}</span>
      <span class="pk">SEVERITY</span><span class="pv" style="color:${sc}">${(ev.severity||'?').toUpperCase()}</span>
      <span class="pk">TYPE</span><span class="pv">${(ev.type||'?').toUpperCase()}</span>
      <span class="pk">SCORE</span><span class="pv">${ev.relevanceScore||0}/100</span>
      <span class="pk">SHIPS NEAR</span><span class="pv" style="color:#0e9eff">${ev.nearbyShips||0}</span>
      <span class="pk">AIRCRAFT</span><span class="pv" style="color:#00d4aa">${ev.nearbyFlights||0}</span>
    </div>
    <span class="popup-tag" style="background:${tc}18;color:${tc};border:1px solid ${tc}44">${tl}</span>
    ${ev.url?`<a class="popup-link" href="${ev.url}" target="_blank">View source ↗</a>`:''}
  </div>`;
}

// ─── NEWS FEED ─────────────────────────────────────────────
async function loadNews() {
  const data = await get('/news?limit=60') || [];
  S.news = data;
  renderFeed();
  // Re-translate if active
  if (S.translated) await translateFeed();
}

function renderFeed() {
  const el = qs('#feed');
  const filtered = S.trust === 'all' ? S.news : S.news.filter(n => n.trust === S.trust);

  if (!filtered.length) { el.innerHTML = '<div class="empty">No news available</div>'; return; }

  el.innerHTML = filtered.slice(0, 50).map(item => {
    const tl = item.trust==='verified'?'✓ VERIFIED':item.trust==='propaganda'?'⚑ PROPAGANDA':'~ UNVERIFIED';
    const text = esc(item.title || item.text || '');
    const tags = extractTags(item.text || item.title || '');
    return `<div class="fi" onclick="clickFeed('${encodeURIComponent(item.url||'')}',${item.lat||0},${item.lon||0})">
      <div class="fi-meta">
        <span class="tbadge t-${item.trust||'unverified'}">${tl}</span>
        <span class="fsrc">${item.type==='telegram'?'📨 ':'📰 '}${esc(item.sourceLabel||item.source||'')}</span>
        <span class="ftime">${ago(item.date)}</span>
      </div>
      <div class="ftext" data-orig="${text}">${text}</div>
      <div class="ftags">${tags.map(t=>`<span class="ftag">${t}</span>`).join('')}</div>
    </div>`;
  }).join('');
}

window.clickFeed = (enc, lat, lon) => {
  const url = decodeURIComponent(enc);
  if (lat && lon) map.flyTo([lat, lon], 6, { duration: 1.2 });
  if (url) window.open(url, '_blank');
};

// ─── VESSELS LIST ──────────────────────────────────────────
function renderVessels() {
  const q = (qs('#vsearch')?.value || '').toLowerCase();

  const ships = S.ships
    .filter(s => !q || (s.name||'').toLowerCase().includes(q))
    .slice(0, 25);
  const flights = S.flights
    .filter(f => !q || (f.callsign||'').toLowerCase().includes(q) || (f.country||'').toLowerCase().includes(q))
    .slice(0, 25);

  qs('#vships').innerHTML = ships.length ? ships.map(s => vrow('ship', s)).join('') : '<div class="empty">No ships</div>';
  qs('#vflights').innerHTML = flights.length ? flights.map(f => vrow('flight', f)).join('') : '<div class="empty">No aircraft</div>';
}

function vrow(type, v) {
  const isS = type === 'ship';
  const name = isS ? (v.name || `MMSI-${v.mmsi}`) : (v.callsign || 'UNKNOWN');
  const sub  = isS ? stype(v.type) : `${v.country||'?'} · ${v.altitude?v.altitude.toLocaleString()+'ft':'—'}`;
  const spd  = isS ? `${(v.speed||0).toFixed(1)} kn` : `${v.speed||0} kn`;
  const hdg  = isS ? `${v.heading||0}°` : `${v.altitude?v.altitude.toLocaleString()+'ft':'—'}`;
  const isMil = isS ? (v.type>=35&&v.type<=37) : milFlight(v.callsign);
  const sc = (isS&&v.speed<1)?'#ffaa00':isMil?'#ff7700':'#00cc66';
  const ico = isS ? (isMil ? 'vim' : 'vis') : (isMil ? 'vim' : 'vip');

  return `<div class="vi" onclick="flyTo(${v.lat},${v.lon||v.lng})">
    <div class="viico ${ico}">${isS?'⚓':'✈'}</div>
    <div class="viinfo">
      <div class="viname" style="${isMil?'color:#ff9944':''}">${esc(name)}${isMil?' 🔶':''}</div>
      <div class="visub">${esc(sub)}</div>
    </div>
    <div class="viright">
      <div style="width:5px;height:5px;border-radius:50%;background:${sc};box-shadow:0 0 4px ${sc};margin-left:auto;margin-bottom:2px"></div>
      <div class="vispd">${spd}</div>
      <div class="vihdg">${hdg}</div>
    </div>
  </div>`;
}

window.flyTo = (lat, lon) => {
  if (lat && lon) map.flyTo([lat, lon], 7, { duration: 1.5 });
};

// ─── DETAIL DRAWER ─────────────────────────────────────────
function openDrawer(type, d) {
  const el = qs('#drawer-content');
  let h = '';

  if (type === 'ship') {
    const isMil = d.type>=35&&d.type<=37;
    const col = isMil ? '#0e9eff' : '#4488bb';
    h = `<div class="dtitle" style="color:${col}">⚓ ${esc(d.name||'Unknown')}
      ${isMil?`<span style="font-size:9px;padding:1px 6px;border-radius:2px;background:rgba(14,158,255,.15);color:#0e9eff">WARSHIP</span>`:''}</div>
    <div class="dgrid">
      <div><div class="dk">MMSI</div><div class="dv">${d.mmsi}</div></div>
      <div><div class="dk">TYPE</div><div class="dv">${stype(d.type)}</div></div>
      <div><div class="dk">SPEED</div><div class="dv" style="color:${d.speed===0?'#ffaa00':'#00cc66'}">${(d.speed||0).toFixed(1)} kn</div></div>
      <div><div class="dk">HEADING</div><div class="dv">${d.heading||0}°</div></div>
      <div><div class="dk">LAT/LON</div><div class="dv">${(d.lat||0).toFixed(3)}, ${(d.lon||0).toFixed(3)}</div></div>
      <div><div class="dk">AIS</div><div class="dv" style="color:${d.speed===0?'#ffaa00':'#00cc66'}">${d.speed===0?'STOPPED':'ACTIVE'}</div></div>
    </div>`;
  } else if (type === 'flight') {
    const isMil = milFlight(d.callsign);
    const col = isMil ? '#ff9944' : '#00d4aa';
    h = `<div class="dtitle" style="color:${col}">✈ ${esc(d.callsign||'UNKNOWN')}
      ${isMil?`<span style="font-size:9px;padding:1px 6px;border-radius:2px;background:rgba(255,119,0,.15);color:#ff7700">MILITARY</span>`:''}</div>
    <div class="dgrid">
      <div><div class="dk">ICAO24</div><div class="dv">${d.icao24}</div></div>
      <div><div class="dk">COUNTRY</div><div class="dv">${d.country||'?'}</div></div>
      <div><div class="dk">ALTITUDE</div><div class="dv">${d.altitude?d.altitude.toLocaleString()+' ft':'—'}</div></div>
      <div><div class="dk">SPEED</div><div class="dv">${d.speed||0} kn</div></div>
      <div><div class="dk">HEADING</div><div class="dv">${d.heading||0}°</div></div>
    </div>`;
  } else if (type === 'event') {
    const sc = d.severity==='critical'?'#ff2222':d.severity==='high'?'#ff5500':'#ffaa00';
    h = `<div class="dtitle" style="color:#ff5533">⚠ ${esc(d.title||'Event')}</div>
    <div class="dgrid">
      <div><div class="dk">SEVERITY</div><div class="dv" style="color:${sc}">${(d.severity||'?').toUpperCase()}</div></div>
      <div><div class="dk">TYPE</div><div class="dv">${(d.type||'?').toUpperCase()}</div></div>
      <div><div class="dk">REGION</div><div class="dv">${(d.locationName||'?').toUpperCase()}</div></div>
      <div><div class="dk">SCORE</div><div class="dv">${d.relevanceScore||0}/100</div></div>
      <div><div class="dk">SHIPS NEAR</div><div class="dv" style="color:#0e9eff">${d.nearbyShips||0}</div></div>
      <div><div class="dk">AIRCRAFT</div><div class="dv" style="color:#00d4aa">${d.nearbyFlights||0}</div></div>
    </div>
    ${d.url?`<div style="margin-top:8px;font-size:10px"><a href="${d.url}" target="_blank" style="color:#0e9eff">View source ↗</a></div>`:''}`;
  }

  el.innerHTML = h;
  qs('#drawer').classList.remove('hidden');
}

qs('#drawer-close')?.addEventListener('click', () => qs('#drawer').classList.add('hidden'));

// ─── AI INTEL ──────────────────────────────────────────────
function buildIntel() {
  const el = qs('#intel');
  const crit   = S.events.filter(e => e.severity==='critical').slice(0,3);
  const high   = S.events.filter(e => e.severity==='high').slice(0,3);
  const aisOff = S.ships.filter(s => s.speed===0).length;
  const milS   = S.ships.filter(s => s.type>=35&&s.type<=37).length;
  const milF   = S.flights.filter(f => milFlight(f.callsign)).length;
  const critZones = ZONES.filter(z=>z.i==='critical').length;

  let h = `<div class="idiv">Global Situation</div>
  <div class="icard">
    <div class="icard-t">Real-Time Overview</div>
    <div class="icard-b">
      Tracking <b style="color:#0e9eff">${S.ships.length.toLocaleString()}</b> vessels 
      (${milS} warships) and <b style="color:#00d4aa">${S.flights.length.toLocaleString()}</b> aircraft 
      (${milF} military identified). 
      <b style="color:#ff5533">${S.events.length}</b> active events across 
      <b>${critZones}</b> critical conflict zones.
      ${aisOff>0?`<br/><span style="color:#ffaa00">⚠ ${aisOff} vessels showing AIS blackout.</span>`:''}
    </div>
  </div>`;

  if (crit.length) {
    h += `<div class="idiv">Critical Alerts</div>`;
    crit.forEach(ev => h += icard(ev, Math.min(92,45+(ev.relevanceScore||0)*.5+(ev.nearbyShips||0)*5), 'ic-lo'));
  }
  if (high.length) {
    h += `<div class="idiv">High Priority</div>`;
    high.forEach(ev => h += icard(ev, Math.min(80,38+(ev.relevanceScore||0)*.4), 'ic-md'));
  }
  if (aisOff>0) {
    h += `<div class="idiv">Anomalies</div>
    <div class="icard">
      <div class="icard-t">AIS Blackout — ${aisOff} vessels</div>
      <div class="icard-b">Vessels with disabled AIS transponders. Possible causes: GPS jamming, deliberate stealth, pre-operation positioning, or technical failure.</div>
      <div class="iconf"><span class="iclabel">Concern</span><div class="icbar"><div class="icfill ic-md" style="width:55%"></div></div><span class="icpct">55%</span></div>
    </div>`;
  }
  if (milF > 0) {
    h += `<div class="idiv">Military Aviation</div>
    <div class="icard">
      <div class="icard-t">${milF} Military Aircraft Active</div>
      <div class="icard-b">Identified via callsign patterns. Elevated activity near conflict zones may indicate ISR missions, force posturing, or active operations.</div>
      <div class="iconf"><span class="iclabel">Confidence</span><div class="icbar"><div class="icfill ic-hi" style="width:72%"></div></div><span class="icpct">72%</span></div>
    </div>`;
  }

  el.innerHTML = h || '<div class="empty">Insufficient data for analysis</div>';
}

function icard(ev, conf, cls) {
  return `<div class="icard">
    <div class="icard-t">${(ev.locationName||'?').toUpperCase()} — ${(ev.type||'EVENT').toUpperCase()}</div>
    <div class="icard-b">${ev.nearbyShips||0} vessels and ${ev.nearbyFlights||0} aircraft nearby. ${ev.count>1?`${ev.count} sources corroborating.`:'Single source.'} Severity: ${ev.severity}.</div>
    <div class="iconf"><span class="iclabel">Confidence</span><div class="icbar"><div class="icfill ${cls}" style="width:${Math.round(conf)}%"></div></div><span class="icpct">${Math.round(conf)}%</span></div>
  </div>`;
}

// ─── COMMUNITY ─────────────────────────────────────────────
const DEMO_POSTS = [
  { id:1, t:'RC-135 SIGINT aircraft over eastern Ukraine for 4h+ — unusual loiter duration',      ts:Date.now()-12*60000, v:23 },
  { id:2, t:'MT Pacific Glory AIS reappeared 40nm north of last position near Hormuz',            ts:Date.now()-28*60000, v:15 },
  { id:3, t:'Multiple helicopters south of Kherson on FlightRadar24 — callsigns not displayed',   ts:Date.now()-45*60000, v:31 },
  { id:4, t:'Drone strike on infrastructure facility reported — second source not yet confirmed',  ts:Date.now()-67*60000, v:8  },
  { id:5, t:'Unusual carrier group movement in Eastern Mediterranean — USS Gerald Ford HDG 092°', ts:Date.now()-90*60000, v:44 },
];
S.posts = [...DEMO_POSTS];

function renderCommunity() {
  const el = qs('#cfeed');
  if (!S.posts.length) { el.innerHTML = '<div class="empty">No posts yet</div>'; return; }
  el.innerHTML = S.posts.map(p => `
    <div class="cpost">
      <div class="cphdr"><span class="cpanon">Anon#${String(p.id).padStart(4,'0')}</span><span class="cptime">${ago(p.ts)}</span></div>
      <div class="cptext">${esc(p.t)}</div>
      <div class="cpact"><button class="cpbtn" onclick="upvote(${p.id})">▲ ${p.v}</button><button class="cpbtn">↩ Reply</button></div>
    </div>`).join('');
}

window.upvote = id => {
  const p = S.posts.find(x => x.id===id);
  if (p) { p.v++; renderCommunity(); }
};

qs('#pbtn')?.addEventListener('click', () => {
  const inp = qs('#pinput');
  const t = inp.value.trim();
  if (!t || t.length < 10) return;
  S.posts.unshift({ id: Date.now(), t, ts: Date.now(), v: 0 });
  inp.value = ''; qs('#pchars').textContent = '280';
  renderCommunity();
});
qs('#pinput')?.addEventListener('input', function() {
  qs('#pchars').textContent = 280 - this.value.length;
});

// ─── TABS ──────────────────────────────────────────────────
qsa('.tab').forEach(btn => btn.addEventListener('click', () => {
  const id = btn.dataset.tab;
  qsa('.tab').forEach(t => t.classList.remove('active'));
  qsa('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  qs(`#panel-${id}`)?.classList.add('active');
  if (id === 'community') renderCommunity();
}));

// Feed trust filter
qsa('.ff').forEach(btn => btn.addEventListener('click', () => {
  qsa('.ff').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.trust = btn.dataset.trust;
  renderFeed();
  if (S.translated) translateFeed();
}));

// Layer toggles
qsa('.h-btn[data-layer]').forEach(btn => btn.addEventListener('click', () => {
  const l = btn.dataset.layer;
  btn.classList.toggle('active');
  S.layers[l] = btn.classList.contains('active');
  if (S.layers[l]) map.addLayer(GL[l]);
  else map.removeLayer(GL[l]);
}));

qs('#btn-zones')?.addEventListener('click', function() {
  this.classList.toggle('active');
  S.layers.zones = this.classList.contains('active');
  if (S.layers.zones) map.addLayer(GL.zones);
  else map.removeLayer(GL.zones);
});

qs('#vsearch')?.addEventListener('input', renderVessels);

// ─── STATUS ────────────────────────────────────────────────
function setStatus(state, msg) {
  const d = qs('#sdot'), t = qs('#stxt');
  if (d) d.className = `sdot ${state}`;
  if (t) t.textContent = msg;
}
function setUpdated() {
  const e = qs('#lupd');
  if (e) e.textContent = `Updated ${new Date().toLocaleTimeString('en-US')}`;
}

// Online counter simulation
setInterval(() => {
  S.online += Math.floor(Math.random()*7)-3;
  S.online = Math.max(20, Math.min(350, S.online));
  const e = qs('#online');
  if (e) e.textContent = S.online;
}, 9000);

// ─── API ───────────────────────────────────────────────────
async function get(path, fallback=[]) {
  try {
    const r = await fetch(API + path, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch(e) {
    console.warn('[GET]', path, e.message);
    return fallback;
  }
}

// ─── HELPERS ───────────────────────────────────────────────
function ago(ts) {
  if (!ts) return '?';
  const m = Math.floor((Date.now()-ts)/60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
}

function extractTags(txt) {
  const lo = txt.toLowerCase();
  const MAP = {
    'ukraine':'🇺🇦 Ukraine','russia':'🇷🇺 Russia','israel':'🇮🇱 Israel',
    'gaza':'Gaza','iran':'Iran','black sea':'Black Sea','red sea':'Red Sea',
    'missile':'Missile','drone':'Drone','airstrike':'Airstrike',
    'explosion':'Explosion','nato':'NATO','hormuz':'Hormuz',
    'syria':'Syria','taiwan':'Taiwan','china':'China',
    'houthi':'Houthi','lebanon':'Lebanon','north korea':'N.Korea',
    'myanmar':'Myanmar','sudan':'Sudan','ethiopia':'Ethiopia',
  };
  return Object.entries(MAP).filter(([k])=>lo.includes(k)).map(([,v])=>v).slice(0,4);
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const qs  = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

// ─── INIT ──────────────────────────────────────────────────
async function init() {
  setStatus('loading', 'Connecting...');
  renderCommunity();
  initTranslate();

  const ping = await get('/', null);
  setStatus(ping ? 'live' : 'err', ping ? 'Live' : 'Demo mode — backend offline');

  await Promise.all([loadShips(), loadFlights(), loadEvents(), loadNews()]);
  setUpdated();

  setInterval(async () => { await loadShips();   setUpdated(); }, TICK.vessels);
  setInterval(async () => { await loadFlights();             }, TICK.vessels + 7000);
  setInterval(async () => { await loadEvents();              }, TICK.events);
  setInterval(async () => { await loadNews();                }, TICK.news);
}

init();
