/* Harvester: logika gry, wejście, rysowanie nakładki (statek, wiry-porty, pierścień celu, łuk postępu). */
(function () {
'use strict';
const qs = new URLSearchParams(location.search);
const NS_MAX = GAS_NS, A = MAPA, HC = window.HC;
const NSEC = 15;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const touchInit = matchMedia('(pointer: coarse)').matches;      // ekran dotykowy w komputerze ma pointer: fine (mysz/gładzik), więc nie dostaje podpowiedzi dotykowych
let inputT = -9;
function setInput(isTouch) { if (touchDevice === isTouch) return; const n = performance.now(); if (n - inputT < 1200) return; touchDevice = isTouch; inputT = n; }      // histereza: telefon z klawiaturą nie przełącza podpowiedzi co chwilę
let touchDevice = touchInit;                                      // zmienia się z ostatnim użytym wejściem: klawisz/mysz = false, palec = true (patrz nasłuch wejścia)
let SAFE = { t: 0, r: 0, b: 0, l: 0 };                      // bezpieczne strefy (notch, pasek gestów), w pikselach canvasa
function readSafe() { const e = document.getElementById('safe'); if (!e) return; const cs = getComputedStyle(e), d = window.devicePixelRatio ? Math.min(window.devicePixelRatio, 1.5) : 1;
  SAFE = { t: (parseFloat(cs.paddingTop) || 0) * d, r: (parseFloat(cs.paddingRight) || 0) * d, b: (parseFloat(cs.paddingBottom) || 0) * d, l: (parseFloat(cs.paddingLeft) || 0) * d }; }
function buzz(p) { if (touchDevice && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }
let wakeLock = null;
async function keepAwake() { try { if (navigator.wakeLock && !wakeLock && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && G.started) keepAwake(); });
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { deferredInstall = null; });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canInstall = () => !isStandalone() && location.protocol.startsWith('http') && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost' || (!isStandalone() && !!deferredInstall);

// ---------- świat: sektory, sąsiedztwo, przepisy ----------
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // N, E, S, W (świat/ekran: y w górę)
const counts = ports => { const n = [0, 0, 0]; for (const p of ports) n[p]++; return n; };

function buildWorld(seed) {
  const R = rng(seed), pts = [];
  const x0 = .24, x1 = A - .24, y0 = .15, y1 = .85;
  while (pts.length < NSEC) {
    let best = null, bd = -1;
    for (let i = 0; i < 40; i++) {
      const c = [x0 + R() * (x1 - x0), y0 + R() * (y1 - y0)];
      let md = 9; for (const p of pts) md = Math.min(md, Math.hypot(c[0] - p[0], c[1] - p[1]));
      if (md > bd) { bd = md; best = c; }
    }
    pts.push(best);
  }
  // sąsiedztwo z próbkowania siatki (Voronoi bez warpu)
  const nb = pts.map(() => new Set()), GW = 260, GH = Math.round(GW / A);
  const grid = new Int16Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = (i + .5) / GW * A, y = (j + .5) / GH; let b = 0, bd = 9;
    for (let k = 0; k < pts.length; k++) { const d = Math.hypot(x - pts[k][0], y - pts[k][1]); if (d < bd) { bd = d; b = k; } }
    grid[j * GW + i] = b;
  }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const a = grid[j * GW + i];
    for (const [di, dj] of [[1, 0], [0, 1]]) { const ii = i + di, jj = j + dj; if (ii >= GW || jj >= GH) continue;
      const b = grid[jj * GW + ii]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  }
  // start: sektor najbliżej lewo-środka
  let start = 0, sd = 9;
  pts.forEach((p, i) => { const d = Math.hypot(p[0] - .33 * A, p[1] - .5); if (d < sd) { sd = d; start = i; } });
  // głębokość BFS
  const depth = pts.map(() => -1); depth[start] = 0; const q = [start];
  while (q.length) { const a = q.shift(); for (const b of nb[a]) if (depth[b] < 0) { depth[b] = depth[a] + 1; q.push(b); } }
  // przepisy: tier 0 = podstawowe i wtórne, 1 = pośrednie, 2 = pastele
  const tierOf = r => { const k = Math.min(...r); if (k > 0) return 2; const m = Math.max(...r); return (m === 4 || m === 2) ? 0 : 1; };
  const recipes = HC.RECIPES.filter(r => r[0] + r[1] + r[2] === 4);
  let assign = null;
  for (let attempt = 0; attempt < 400 && !assign; attempt++) {
    const Rr = rng(seed + attempt * 977);
    const secOrder = pts.map((_, i) => i).sort((a, b) => (depth[a] + Rr() * .9) - (depth[b] + Rr() * .9));
    const rec = recipes.map(r => ({ r, t: tierOf(r) + Rr() * .8 })).sort((a, b) => a.t - b.t).map(o => o.r);
    const as = new Array(pts.length);
    secOrder.forEach((si, k) => { as[si] = rec[k]; });
    // start = czysty czerwony, jego sąsiedzi nie same trudne
    const redIdx = recipes.findIndex(r => r[0] === 4);
    const sOfRed = as.findIndex(r => r && r[0] === 4);
    if (sOfRed !== start) { const tmp = as[start]; as[start] = as[sOfRed]; as[sOfRed] = tmp; }
    let ok = true;
    for (let i = 0; i < pts.length && ok; i++) {
      let near = false; for (const b of nb[i]) if (HC.dist(as[i], as[b]) <= 2) near = true;
      if (!near) ok = false;
    }
    if (ok) assign = as;
  }
  if (!assign) assign = pts.map((_, i) => recipes[i % 15]);
  const out = pts.map((p, i) => ({ id: i, x: p[0], y: p[1], nb: [...nb[i]], depth: depth[i], recipe: assign[i], tier: tierOf(assign[i]),
    col: HC.mixColor(assign[i]), claim: 0, claimed: false, reach: i === start, claimV: 0, reachV: i === start ? 1 : 0 , start: i === start, rem: 1, rest: 0, restTot: 0, restV: 0, fails: 0 }));
  // SPLOT: w kilku dziurach dwa sąsiednie kamienie są sprzężone (link = [lider, następca]): stuknięcie lidera obraca oba, następcy tylko jego. Osobny generator, żeby nie ruszać przepisów
  { const sp = qs.get('splot'), Rl = rng(seed + 4242), n = sp === '0' ? 0 : (typeof WORLD === 'number' && WORLD > 0 ? 5 : 3);
    const cand = out.filter(s => !s.start && s.depth >= 2).map(s => ({ i: s.id, k: s.depth + Rl() * 1.5 + (s.tier > 0 ? .8 : 0) })).sort((a, b) => a.k - b.k).map(o => o.i);
    const pick = sp === 'all' ? out.filter(s => !s.start).map(s => s.id) : cand.slice(0, n);
    for (const i of pick) { const lead = (Rl() * 4) | 0; out[i].link = [lead, (lead + (Rl() < .5 ? 1 : 3)) % 4]; } }
  return out;
}

// ---------- stan ----------
let W = 0, H = 0, DPR = 1, ASP = 1;
const cvGas = document.getElementById('gl'), cvUi = document.getElementById('ui'), ux = cvUi.getContext('2d');
let gas = null, sectors = null, startIdx = 0;
const G = {
  mode: 'map',            // map | dive | sector | surf
  t: 0, tb: 0,
  ship: { x: 0, y: 0, vx: 0, vy: 0, trail: [] },
  ports: [0, 0, 0, 1],    // 0=R 1=G 2=B ; start: R,R,R,G
  slotDisp: [HC.PRIM[0], HC.PRIM[0], HC.PRIM[0], HC.PRIM[1]],
  fx: [0, 0, 0, 0], ripple: [-9, -9, -9, -9],
  cur: -1, diveT: 0, dwell: 0, auto: null,
  streak: 0, matchedAt: -9, lastProgressT: 0, whisper: -1, quietUntil: 0,
  warn: null, fixes: null, acted: false, keysUsed: 0,
  nextNudge: 0, flashT: -9, catchT: -9, catchKind: '', claimT: -9, surfWait: 0,
  q: touchInit ? .45 : .6, ema: 16, lowT: 0, highT: 0,
  intro: 0, matchSm: 0, leave: -1, actedK: -1, maxQ: touchInit ? .6 : .85, lastDrop: -99,
  wake: [], drops: [], shipDir: [1, 0], shipSp: 0, wakeT: 0, waveAt: -99, waveAmp: 0, waveRb: 0,
};
const cam = [A / 2, .5];
let s0 = 1.1, scaleNow = 1.1, S_SEC = .16, ROT = false;
const keys = new Set();
const CAP = { txt: '', t0: -99, dur: 4 };
function capSeen(key) { try { return (JSON.parse(localStorage.getItem('harv-cap') || '{}'))[key]; } catch (e) { return false; } }
function capMark(key) { try { const o = JSON.parse(localStorage.getItem('harv-cap') || '{}'); o[key] = 1; localStorage.setItem('harv-cap', JSON.stringify(o)); } catch (e) {} }
function capForce(txt, dur) { CAP.txt = txt; CAP.t0 = G.t; CAP.dur = dur || 4.5; }
function cap(key, txt, dur) { if (capSeen(key) || G.t - CAP.t0 < CAP.dur) return; capMark(key); capForce(txt, dur); }
let cbMode = false; try { cbMode = localStorage.getItem('harv-cb') === '1'; } catch (e) {}
const ptr = { down: false, x: 0, y: 0, sx: 0, sy: 0, t0: 0, moved: false, swiped: false, id: -1, wx: 0, wy: 0 };

const SAVE_KEY = 'harvester-v2';
const SEEDS = [20261102, 31415926, 27182818, 16180339, 14142135];
const seedOf = w => w < SEEDS.length ? SEEDS[w] : 9100000 + w * 7919;
let WORLD = 0;
const WORLDS = [                                   // kolejne mgławice: ten sam rdzeń, coraz kapryśniejszy gaz
  { name: 'Spokój', rule: '', nud: 1, lead: .6, d2: 0, frost: 0, pen: .07, dbl: 0 },
  { name: 'Wiatr', rule: 'Punkty skaczą o dwa kroki', nud: .82, lead: .5, d2: .3, frost: 0, pen: .08, dbl: 0 },
  { name: 'Szron', rule: 'Punkty zamarzają', nud: .82, lead: .5, d2: .25, frost: 1, pen: .09, dbl: .15 },
  { name: 'Burza', rule: 'Dwa punkty naraz', nud: .66, lead: .42, d2: .35, frost: 1.3, pen: .1, dbl: .35 },
  { name: 'Zenit', rule: 'Wszystko naraz, krótka zapowiedź', nud: .55, lead: .36, d2: .45, frost: 1.6, pen: .11, dbl: .5 } ];
let calm = false; try { calm = localStorage.getItem('harv-calm') === '1'; } catch (e) {}
let timeLimit = true; try { timeLimit = localStorage.getItem('harv-limit') !== '0'; } catch (e) {}      // okno podejścia: dziura zamyka się, gdy kolory długo się nie zgadzają (menu: Limit czasu; tryb spokojny = brak limitu)
let pulsMode = 0; try { pulsMode = +localStorage.getItem('harv-puls') || 0; } catch (e) {}      // 0 Spokojny, 1 Puls łagodny, 2 Puls pełny
let puls = pulsMode > 0;
let reduceMotion = (() => { let mm = false; try { mm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {} try { const v = localStorage.getItem('harv-rm'); return v === null ? mm : v === '1'; } catch (e) { return mm; } })();      // tryb Puls: wspólny takt 96 BPM, kwantyzacja dźwięku, melodia z trafień
let calMs = 0; try { calMs = +localStorage.getItem('harv-cal') || 0; } catch (e) {}              // kalibracja opóźnienia wyjścia audio (ms)
const WR = () => { const b = WORLDS[Math.min(WORLD, WORLDS.length - 1)]; return calm ? Object.assign({}, b, { nud: b.nud * 1.45, lead: b.lead + .3, d2: 0, frost: 0, dbl: 0, pen: .05 }) : b; };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const worldTitle = () => 'Mgławica ' + (ROMAN[WORLD] || WORLD + 1) + '  ·  ' + WR().name + (WR().rule ? '. ' + WR().rule : '');
function peekWorld() { try { const o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return o && Number.isInteger(o.world) && o.world >= 0 && o.world < 99 ? o.world : 0; } catch (e) { return 0; } }
let noSave = false;
function save() { if (noSave) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: seedOf(WORLD), world: WORLD, cl: sectors.map(s => +s.claim.toFixed(3)), ports: G.ports, rs: sectors.map(s => +Math.max(0, s.rest).toFixed(1)), fl: sectors.map(s => s.fails) })); } catch (e) {} }
function load() { try { const o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (!o || o.seed !== seedOf(WORLD) || !Array.isArray(o.cl) || o.cl.length !== sectors.length || !o.cl.every(v => Number.isFinite(v))) return;
  const ok = Array.isArray(o.ports) && o.ports.length === 4 && o.ports.every(p => p === 0 || p === 1 || p === 2);
  o.cl.forEach((v, i) => { v = clamp(v, 0, 1); sectors[i].claim = v; sectors[i].claimed = v >= 1; sectors[i].claimV = v >= 1 ? 1 : 0; });
  if (Array.isArray(o.rs)) o.rs.forEach((v, i) => { const s = sectors[i]; if (s && Number.isFinite(v) && v > 0 && !s.claimed) { s.rest = clamp(v, 0, 120); s.restTot = Math.max(s.rest, 20); s.restV = clamp(1 - s.rest / s.restTot, 0, 1); } });
  if (Array.isArray(o.fl)) o.fl.forEach((v, i) => { if (sectors[i] && Number.isInteger(v) && v > 0 && v < 99 && !sectors[i].claimed) sectors[i].fails = v; });
  if (ok) G.ports = o.ports.slice(); G.slotDisp = G.ports.map(p => HC.PRIM[p].slice());
  refreshReach(true); if (sectors.every(s => s.claimed)) G.finale = -99; } catch (e) {} }
function nextWorld() {
  WORLD++; sectors = buildWorld(seedOf(WORLD)); startIdx = sectors.findIndex(s => s.start);
  G.ports = [0, 0, 0, 1]; G.slotDisp = G.ports.map(p => HC.PRIM[p].slice()); G.cur = startIdx; G.mode = 'map'; G.diveT = 0; G.finale = 0; G.finaleMenu = false;
  G.streak = 0; G.warn = null; G.fixes = null; G.frost = null; G.pick = -1; G.hov = false; G.mapT = 0;
  G.ship.x = sectors[startIdx].x - .34; G.ship.y = sectors[startIdx].y - .14; G.ship.vx = G.ship.vy = 0; G.ship.trail = [];
  save(); if (window.Audio2) { Audio2.layers(0); Audio2.songs && Audio2.songs([]); }
  capForce(worldTitle(), 6);
}
function refreshReach(instant) {
  for (const s of sectors) { s.reach = s.start || s.claimed || s.nb.some(b => sectors[b].claimed); if (instant) s.reachV = s.reach ? 1 : 0; }
}

// ---------- rozmiar ----------
function resize() {
  if (!innerWidth || !innerHeight) return;
  readSafe();
  DPR = Math.min(window.devicePixelRatio || 1, 1.5); W = Math.round(innerWidth * DPR); H = Math.round(innerHeight * DPR); ASP = W / H;
  cvUi.width = W; cvUi.height = H; applyQ();
  ROT = ASP < 1;
  s0 = ROT ? (A - .1) * 1.04 : Math.max(1, (A - .1) / ASP) * 1.04;
  if (window.Backdrop && Backdrop.resize) Backdrop.resize(innerWidth, innerHeight, window.devicePixelRatio || 1);
}
function applyQ() { if (!gas) return; cvGas.width = Math.round(W * G.q); cvGas.height = Math.round(H * G.q); }

// ---------- współrzędne ----------
function w2c(x, y) { const dx = x - cam[0], dy = y - cam[1]; return [(ROT ? dy : dx) / scaleNow, (ROT ? -dx : dy) / scaleNow]; }
function w2s(x, y) { const dx = x - cam[0], dy = y - cam[1], cx = (ROT ? dy : dx) / scaleNow, cy = (ROT ? -dx : dy) / scaleNow; return [(cx / ASP + .5) * W, (.5 - cy) * H]; }
function s2w(px, py) { const cx = (px / W - .5) * ASP, cy = .5 - py / H; return ROT ? [cam[0] - cy * scaleNow, cam[1] + cx * scaleNow] : [cam[0] + cx * scaleNow, cam[1] + cy * scaleNow]; }
const portR = () => Math.min(ASP > 1.7 ? .36 : .30, ASP * .5 * .72);      // krótki/szeroki ekran (telefon poziomo, Fold rozłożony): orby rozsuwają się szerzej, układ wypełnia więcej kadru
const portRX = () => portR() * (ASP > 1.7 ? Math.min(1.5, 1 + (ASP - 1.7) * .55) : 1);      // na szerokim ekranie orby E/W rozsuwają się wszerz (układ eliptyczny) -> wypełniają puste boki
const secZoom = () => ASP > 1.7 ? Math.min(1.22, 1 + (ASP - 1.7) * .28) : 1;      // na krótkim/szerokim ekranie całe serce i pierścień rosną proporcjonalnie do rozsunięcia orbów (układ nie jest maleńki w środku)
const portPx = k => [W / 2 + DIRS[k][0] * portRX() * H, H / 2 - DIRS[k][1] * portR() * H];      // x wg portRX (szerzej), y wg portR

// ---------- mieszanka ----------
const curRecipe = () => counts(G.ports);
const dToTarget = () => (G.cur >= 0 ? HC.dist(curRecipe(), sectors[G.cur].recipe) : 9);
const mixNow = () => HC.mixColor(curRecipe());
// Splot wchodzi do gry od 4. przejęcia w mgławicy I (wcześniej dziury z `link` grają jak zwykłe), w kolejnych mgławicach od początku
const linkOf = s => (s && s.link && (WORLD > 0 || sectors.reduce((n, q) => n + (q.claimed ? 1 : 0), 0) >= 3)) ? s.link : null;
const curLink = () => (sectors && G.cur >= 0 && linkOf(sectors[G.cur])) || null;
const frozenK = k => !!(G.frost && G.frost.k === k && G.t < G.frost.until);
// wynik stuknięcia kamienia k o dir (1 lub 2) z uwzględnieniem sprzężenia (link = [lider, następca]); jedna funkcja dla gry, podpowiedzi i podświetlenia
function applyPress(ports, k, dir, link) { const np = ports.slice(), d = (dir || 1) + 3; np[k] = (np[k] + d) % 3; if (link && link[0] === k && !frozenK(link[1])) np[link[1]] = (np[link[1]] + d) % 3; return np; }
// minimalna liczba naciśnięć, żeby zmienić port k (±1 w cyklu)
// najmniejsza liczba stuknięć (+1) od układu ports do celu, z uwzględnieniem sprzężenia (BFS po 81 układach, z pamięcią podręczną)
const _sd = new Map();
function solveDist(ports, tgt, link) {
  const key = ports.join('') + '|' + tgt.join('') + '|' + (link ? link.join('') : '-'); if (_sd.has(key)) return _sd.get(key);
  const seen = new Set([ports.join('')]); let fr = [ports], n = 0, res = 99;
  while (fr.length && n < 12) { if (fr.some(st => HC.dist(counts(st), tgt) === 0)) { res = n; break; } const nx = []; for (const st of fr) for (let k = 0; k < 4; k++) { const np = applyPress(st, k, 1, link), kk = np.join(''); if (!seen.has(kk)) { seen.add(kk); nx.push(np); } } fr = nx; n++; }
  _sd.set(key, res); return res;
}
// który kamień stuknąć (najkrótsza droga do celu; szron pomija)
function bestHint() {
  const s = sectors[G.cur], tgt = s.recipe, lk = linkOf(s), cur = solveDist(G.ports, tgt, lk); let best = null, bd = cur;
  for (let k = 0; k < 4; k++) { if (frozenK(k)) continue; const d = solveDist(applyPress(G.ports, k, 1, lk), tgt, lk); if (d < bd) { bd = d; best = k; } }
  return best;
}

// ---------- poziom trudności sektora ----------
function levelOf(s) { return s.tier + 1; }
const NUDGE_INT = [0, 7, 5.5, 4.2];
const BEAT = 60 / 96;
// zegar Pulsu: kotwiczony w zegarze audio (bez dryfu przy spadkach fps); bez dźwięku zegar klatek
function pt() { const n = window.Audio2 && Audio2.now ? Audio2.now() : null; return n == null ? G.t : n; }
function pLat() { return calMs / 1000 + (window.Audio2 && Audio2.latency ? Audio2.latency() : 0); }
function qNext(sub) { let d = (Math.floor(pt() / sub) + 1) * sub - pt() - pLat(); while (d < 0) d += sub; return d; }   // sekundy do najbliższego punktu siatki (z kompensacją opóźnienia wyjścia)
function prng(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }      // deterministyczne figury: ten sam sektor, ten sam wzór
const PAT_B = [[10, 12, 10, 14, 12, 10], [6, 6, 8, 6, 10, 8]];                                    // odstępy figur w uderzeniach: Puls łagodny / pełny
// jedna siatka szesnastek dla kwantyzacji, oceny i błysku: dźwięk przyciąga się do NAJBLIŻSZEGO punktu (także tuż po nim), nie do następnego
function qSnap() {
  const sub = BEAT / 4, now = pt(), lat = pLat(); let idx = Math.round(now / sub), off = idx * sub - now; const jo = Math.abs(off);
  if (off < -.07) { idx++; off = idx * sub - now; }      // okno przyciągania 70 ms obejmuje wszystkie okna oceny, więc ocena i fraza dotyczą tego samego punktu
  return { d: Math.max(0, off - lat), slot: idx, off: jo };
}
const CAL = { on: false, t0: 0, taps: [], ticks: [] };
function calStart() { if (window.Audio2 && Audio2.isMuted()) { cap('cal0', 'Włącz dźwięk, aby skalibrować', 4); return; } CAL.on = true; CAL.taps = []; CAL.t0 = (Math.floor(pt() / BEAT) + 4) * BEAT; CAL.ticks = []; CAL.res = ''; for (let i = 0; i < 12; i++) { const at = CAL.t0 + i * BEAT; CAL.ticks.push(at); if (window.Audio2) Audio2.tick(Math.max(0, at - pt()), i % 4 === 0); } }
function calTap() { if (CAL.on) CAL.taps.push(pt()); }
function calFinish() {
  CAL.on = false; const ds = [];
  for (const tp of CAL.taps) { let bi = 0, bd = 9; CAL.ticks.forEach((tk, i) => { const d = Math.abs(tp - tk); if (d < bd) { bd = d; bi = i; } }); if (bi >= 4 && bd < BEAT / 2) ds.push(tp - CAL.ticks[bi]); }
  if (ds.length >= 4) { ds.sort((a, b) => a - b); const med = ds[ds.length >> 1]; calMs = clamp(Math.round((med - (window.Audio2 && Audio2.latency ? Audio2.latency() : 0)) * 100) * 10, -100, 300); try { localStorage.setItem('harv-cal', String(calMs)); } catch (e) {} CAL.res = calMs + ' ms'; }
  else CAL.res = 'za mało stuknięć';
  cap('cal1', CAL.res === 'za mało stuknięć' ? 'Kalibracja: za mało stuknięć, spróbuj jeszcze raz' : 'Kalibracja: ' + CAL.res, 4);
}

// ---------- akcje ----------
// na mapie cała mieszanka obraca się o krok na kole (R->G->B->R): wybór, który sąsiad zaatakować idealnym wejściem
function rotateMix(dir) {
  if (G.mode !== 'map') return;
  G.ports = G.ports.map(p => (p + dir) % 3); for (let k = 0; k < 4; k++) { G.fx[k] = 1; G.ripple[k] = G.t; }
  if (window.Audio2) Audio2.press(0, G.ports[0]);
}
function pressPort(k, dir) {
  if (G.exhale) return;
  if (G.mode !== 'sector' || G.diveT < .98) return;
  if (sectors[G.cur].claimed) { if (G.t - (G.claimT || -9) > .7) surface(); return; }          // dowolny ruch po przejęciu = skok na mapę
  if (G.frost && G.frost.k === k && G.t < G.frost.until) { G.fx[k] = .5; G.ripple[k] = G.t; buzz(4); if (window.Audio2) Audio2.hit(); return; }   // szron blokuje port
  const d0 = dToTarget();
  const lk = curLink(), before = G.ports.slice(), np0 = applyPress(G.ports, k, dir, lk); for (let i = 0; i < 4; i++) G.ports[i] = np0[i];
  if (lk && lk[0] === k && G.ports[lk[1]] !== before[lk[1]]) { const f = lk[1]; G.fx[f] = .8; G.ripple[f] = G.t + .12; const [fx2, fy2] = portPx(f); burst(fx2, fy2, HC.PRIM[G.ports[f]], 12, .36); }
  G.fx[k] = 1; G.ripple[k] = G.t; G.actedK = k; G.keysUsed++; G.whisper = -1; buzz(8);
  { const [bx, by] = portPx(k); burst(bx, by, HC.PRIM[G.ports[k]], 18, .42); }
  (G.pressT = G.pressT || [-9, -9, -9, -9])[k] = G.t;
  const qs = puls ? qSnap() : null;      // dźwięk i błysk dziury na najbliższej szesnastce siatki
  { const dn = dToTarget(); (G.pfx = G.pfx || [])[k] = { t: G.t, better: dn < d0, worse: dn > d0 }; }
  if (puls) (G.pOff = G.pOff || [])[k] = { off: qs.off, t: G.t };
  if (puls) judgeNote(k, G.ports[k], qs, dToTarget() < d0 || !!(G.warn && G.warn.ks.includes(k)) || !!(G.fixes && G.fixes.ks && G.fixes.ks.includes(k)));
  if (window.Audio2) Audio2.press(k, G.ports[k], curRecipe(), sectors[G.cur].recipe, puls ? qs.d : undefined);
  if (window.Audio2 && Audio2.fb) { const dn2 = dToTarget(); Audio2.fb(dn2 < d0, dn2 > d0, puls ? qs.d : 0, G.ports[k]); }
}
// ocena trafienia w siatkę szesnastek (bez kary postępu). Nagroda tylko za ruch, który zbliża do celu (albo odpowiada na figurę): samo klikanie nic nie daje
// podpowiedzi Pulsu: każda pojawia się najwyżej raz (zapis w localStorage), po jednej naraz, bez ramek, jako delikatny napis ze światłem
const PULS_HINTS = [
  { id: 1, when: () => G.t - G.secT0 > 4.5 && (G.st ? G.st.n : 0) === 0, text: () => touchDevice ? 'Dotykaj punktów, gdy świetlny pierścień zamyka się na dziurze' : 'Naciskaj punkty, gdy świetlny pierścień zamyka się na dziurze' },
  { id: 2, when: () => G.st && G.st.n >= 3, text: () => 'Nie musisz być dokładny: dźwięk sam wskoczy w takt. Jasny błysk oznacza trafienie' },
  { id: 3, when: () => dToTarget() === 0 && G.st && G.st.n >= 2, text: () => touchDevice ? 'Kolory się zgadzają: dotknij środka, by dołożyć własną nutę' : 'Kolory się zgadzają: Spacja dokłada własną nutę, a melodia się zapętla' },
  { id: 4, when: () => !!G.warn, text: () => 'Kolorowy pierścień przy punkcie domyka się, gdy gaz zmieni jego kolor: popraw go', any: true },
  { id: 5, when: () => pearlAlive(), text: () => touchDevice ? 'Dotknij punktu ze złotą iskrą, gdy jej pierścień go dotknie' : 'Strzałka (albo Spacja) łapie złotą iskrę, gdy jej pierścień dotknie punktu; punkty zmieniaj wtedy literami W A S D', any: true }
];
function pulsHintTick() {
  if (G.mode !== 'sector' || sectors[G.cur].claimed) return;
  let mask = 0; try { mask = +localStorage.getItem('harv-pg') || 0; } catch (e) {}
  const cur = G.pgCur;
  if (cur && G.t - cur.t0 > 7.5) { G.pgCur = null; G.pgEnd = G.t; }
  if (G.pgCur || G.t - (G.pgEnd || -9) < 3) return;
  for (const h of PULS_HINTS) if (!(mask & (1 << h.id)) && (puls || h.any) && h.when()) {
    G.pgCur = { id: h.id, t0: G.t, text: h.text() }; try { localStorage.setItem('harv-pg', String(mask | (1 << h.id))); } catch (e) {} break; }
}
function drawPulsGuide(a, cx, cy, k) {
  if (G.mode !== 'sector') return;
  const t = G.t, rh = .07 * H;
  if (puls && !reduceMotion && !sectors[G.cur].claimed) {      // pierścień nadlatuje na takt: tam, gdzie się zamyka, trafiasz
    const ph = (pt() / BEAT) % 1, r = rh * (1.06 + 1.15 * (1 - ph) * (1 - ph)), al = Math.sin(Math.PI * Math.min(1, ph * 1.02)) * (.2 + .22 * ph * ph) * a, bar = Math.floor(pt() / BEAT) % 4 === 3;
    ux.strokeStyle = `rgba(225,232,255,${al * (bar ? 1.5 : 1)})`; ux.lineWidth = (1.3 + ph * 1.4) * k; ux.beginPath(); ux.arc(cx, cy, r, 0, TAU); ux.stroke();
  }
  const g = G.pgCur; if (!g) return;
  const age = t - g.t0, al = Math.min(1, age / 1.2) * Math.min(1, (7.5 - age) / 1.2) * a; if (al <= .01) return;
  const pc = ux.globalCompositeOperation; ux.globalCompositeOperation = 'source-over'; ux.textAlign = 'center'; ux.textBaseline = 'middle';
  const fs = Math.max(15, Math.round(18 * k)); ux.font = `500 ${fs}px Manrope, ui-sans-serif, system-ui, sans-serif`;
  const y = H * .94 - SAFE.b, tw = Math.min(W - 40 * k - SAFE.l - SAFE.r, 760 * k);
  ux.shadowColor = `rgba(4,6,30,${.85 * al})`; ux.shadowBlur = 14 * k; ux.fillStyle = `rgba(235,240,255,${.9 * al})`; ux.fillText(g.text, cx, y, tw); ux.shadowBlur = 0;
  ux.globalCompositeOperation = 'lighter'; glow(cx, y + fs * .95, Math.min(tw * .4, 220 * k), [.55, .6, 1], .16 * al); ux.globalCompositeOperation = pc;
}
// ---------- podbicia: perła z punktu, łapana strzałką / Spacją / dotykiem; po dopasowaniu koloru dopełnia dziurę ----------
const PEARL_GAIN = [.10, .06, .015];      // idealne / dobre / pudło (litościwe), bierne napełnianie przy dopasowaniu .075/s
function pearlTime() { return puls ? pt() : G.t; }
function pearlAlive() { const q = G.pearl; return !!(q && !q.done && G.mode === 'sector' && G.cur >= 0 && !sectors[G.cur].claimed); }
function pearlResolve(grade) {
  const q = G.pearl, s = sectors[G.cur]; q.done = true; q.tEnd = G.t; q.grade = grade;
  const ch = grade >= 1 ? (G.chain = (G.chain || 0) + 1) : (G.chain = 0);
  const gain = PEARL_GAIN[2 - grade] * (grade >= 1 ? 1 + .15 * Math.min(ch, 5) : 1) * (q.big ? 1.6 : 1);      // „wielka" perła (co piąta) jest warta więcej
  s.claim = clamp(s.claim + gain, 0, 1); if (s.claim >= 1 && !s.claimed) claimSector(s);
  if (grade >= 1) {
    G.heartPulse = 1; G.lastRew = G.t; buzz(grade === 2 ? [12, 20, 12] : 8);
    if (window.Audio2 && Audio2.boost) Audio2.boost(Math.min(ch - 1, 4), puls ? qSnap().d : 0, grade === 2);
    if (ch % 3 === 0) { s.claim = clamp(s.claim + .06, 0, 1); G.waveAt = G.t; G.waveAmp = .7; G.waveRb = 1; if (window.Audio2) Audio2.chord(0); }
  }
  G.pearlFx = { k: q.k, t: G.t, grade, col: [1, .86, .5] };      // złota iskra
  if (grade === 0 && window.Audio2 && Audio2.breath) Audio2.breath();
  G.pearlNext = Math.max(G.pearlNext || 0, G.t + .6);
}
function tryPearlCatch(soft) {
  if (G.exhale) return false;      // soft: Spacja/środek (za wcześnie = false, wtedy grają zwykłą nutę); strzałki/port za wcześnie = lekki znak zamiast ciszy
  if (!pearlAlive()) return false; const q = G.pearl, now = pearlTime(), early = () => { G.ripple[q.k] = G.t; G.fx[q.k] = Math.max(G.fx[q.k], .4); return !soft; };
  if (puls) { const off = Math.abs(now - q.tA), W1 = pulsMode === 1 ? [.04, .065] : [.025, .045]; if (off > .28) return early();
    pearlResolve(off <= W1[0] ? 2 : off <= W1[1] * 2.2 ? 1 : 0); }
  else { const f = (now - q.t0) / (q.tA - q.t0); if (f < .5) return early(); pearlResolve(f >= .88 && f <= 1.08 ? 2 : f >= .6 && f <= 1.22 ? 1 : 0); }      // Spokojny: „idealne" symetrycznie wokół domknięcia (±ok. .2 s)
  return true;
}
function dIf(k, st) { const np = G.ports.slice(); np[k] = st; return HC.dist(counts(np), sectors[G.cur].recipe); }
function judgeNote(k, c, qs, ok) {
  const W1 = pulsMode === 1 ? [.04, .065] : [.025, .045], off = qs.off, gr = off <= W1[0] ? 2 : off <= W1[1] ? 1 : 0;
  G.lastNote = { c, t: G.t, k }; G.lastOff = off;
  (G.hits = G.hits || []).push({ t: G.t + qs.d + pLat(), k, gr, col: HC.PRIM[c] }); if (G.hits.length > 12) G.hits.shift();
  const st = G.st || (G.st = { n: 0, p: 0, best: 0 }); if (ok) st.n++;      // procent „idealnych” liczy tylko nuty, które mogły być nagrodzone
  if (gr >= 1) { const pos = qs.slot % 32; G.phrase = (G.phrase || []).filter(e => e.pos !== pos); G.phrase.push({ c, k, pos, t: G.t }); if (G.phrase.length > 8) G.phrase.shift(); }      // do frazy trafiają tylko nuty na siatce
  const can = ok && G.t - (G.lastRew || -9) > (pulsMode === 1 ? BEAT : BEAT / 2);      // anty-spam: nagroda najwyżej raz na pół uderzenia
  if (gr === 2 && can) { G.pq = Math.min(pulsMode === 1 ? 1.25 : 1.5, G.pq + .04); G.streak = Math.min(pulsMode === 1 ? 4 : 10, G.streak + 1); G.lastRew = G.t; st.p++; }
  else if (gr === 1 && can) { G.pq = Math.min(1.5, G.pq + .01); G.lastRew = G.t; }
  else if (gr === 0) { G.lastRew = G.t; if (pulsMode === 2) { G.streak = Math.max(0, G.streak - 1); G.pq = Math.max(.6, G.pq - .04); } }      // pudło blokuje następną nagrodę
  st.best = Math.max(st.best, G.streak);
}
// Spacja / dotyk w środek: dodatkowa nuta w kolorze mieszanki (gdy już się zgadza, nadal jest co grać), nie zmienia punktów
function playNote() {
  if (G.exhale) return;
  if (!puls || G.mode !== 'sector' || G.diveT < .98 || sectors[G.cur].claimed) return;
  const cn = counts(G.ports); let c = 0; for (let i = 1; i < 3; i++) if (cn[i] > cn[c]) c = i;
  const i2 = G.spI = G.spI == null ? 0 : G.spI + 1, jj = c + [0, 1, 2, 1][i2 % 4], cc = jj % 3, kk = jj >= 3 ? 0 : 1;      // łuk góra-dół po triadzie, bez skoków o decymę
  const qs = qSnap(); G.ripple[1] = G.t; G.keysUsed++; G.whisper = -1; judgeNote(kk, cc, qs, dToTarget() === 0);
  if (window.Audio2 && G.t - (G.lastSpSnd || -9) >= BEAT / 4) { G.lastSpSnd = G.t; Audio2.press(kk, cc, null, null, qs.d); }      // dźwięk nie gęstnieje przy spamie
}
function chordReward() {
  G.chordT = G.t; G.lastRew = G.t; G.streak = Math.min(10, G.streak + 2); G.pq = Math.min(1.5, G.pq + .25); G.heartPulse = 1; burst(W / 2, H / 2, mixNow(), 40, .6); cap('chord1', 'Akord! Dwa punkty w jednym takcie', 4);
  if (window.Audio2) Audio2.chord(qSnap().d);
}
function enterSector(i, instant) {
  const s = sectors[i]; CAP.t0 = -99; G.cur = i; G.mode = 'dive'; G.diveT = 0; G.dive = { from: [cam[0], cam[1]], inst: !!instant };
  G.pearl = null; G.pearlFx = null; G.chain = 0; G.pearlNext = G.t + 1.5; G.dZero = 0; G.pfx = []; G.secT0 = G.t; G.pgCur = null; G.pgEnd = G.t; G.pq = 1; G.pressT = [-9, -9, -9, -9]; G.nextS = Math.ceil(pt() / (BEAT / 4)); G.chordT = -99; G.hits = []; G.lastNote = null; G.phrase = []; G.figI = 0; G.spI = null; G.pOff = []; G.st = { n: 0, p: 0, best: 0 };
  G.warn = null; G.fixes = null; G.frost = null; G.nextFrost = G.t + 8; G.nextNudge = G.t + 5; G.lastProgressT = G.t; G.whisper = -1;
  G.ship.vx = G.ship.vy = 0; G.surfWait = 0; G.exhale = 0; G.zeroAt = 0; G.winOn = false; G.winT0 = -99; G.flMs = Math.floor(s.claim * 4);
  if (window.Audio2) Audio2.dive();
}
function surface() {
  if (G.mode !== 'sector' && !(G.mode === 'dive' && G.diveT > .3)) return;
  G.mode = 'surf'; G.surfFrom = G.diveT; G.warn = null; G.winOn = false; save();
  if (window.Audio2) Audio2.surface();
}
const limitOn = () => timeLimit && !calm;
const winSec = s => (+qs.get('okno') || (75 + 8 * s.tier - 4 * Math.min(WORLD, 4))) * (1 + .25 * Math.min(s.fails, 2)) * (puls ? 1.3 : 1);      // okno podejścia (s czasu gry); druga próba +25%, trzecia +50%
function sectorFail(s) {      // wydech: dziura gaśnie, zostaje połowa zalania (w dół do ćwiartki, nie mniej niż .25), potem odpoczynek
  s.claim = Math.min(s.claim, Math.max(.25, Math.floor(s.claim * 10) / 20)); s.fails++;
  s.rest = s.restTot = (35 + 5 * Math.min(WORLD, 4)) * (s.fails >= 2 ? .7 : 1); s.restV = 0;
  G.exhale = G.t; G.warn = null; G.fixes = null; G.frost = null; G.chain = 0; G.streak = 0; if (G.pearl && !G.pearl.done) { G.pearl.done = true; G.pearl.tEnd = G.t; G.pearl.cancel = true; }
  buzz(18); if (window.Audio2 && Audio2.fail) Audio2.fail(); cap('fail1', 'Dziura wydycha. Zostaje część zalania, wróć za chwilę', 6); save();
}
function tickRest(dt) {      // odpoczynek w czasie gry; gdy WSZYSTKIE dostępne dziury odpoczywają, najkrótszy skraca się do 8 s (gracz nigdy nie stoi)
  let open = 0, nr = 0, mi = -1; if (!limitOn()) for (const s of sectors) s.rest = 0;
  for (const s of sectors) {
    if (s.rest > 0) { s.rest = Math.max(0, s.rest - dt); if (s.rest <= 0 && G.mode === 'map' && window.Audio2 && Audio2.ready) Audio2.ready(s.recipe.indexOf(Math.max(...s.recipe))); }
    if (s.reach && !s.claimed) { open++; if (s.rest > 0) { nr++; if (mi < 0 || s.rest < sectors[mi].rest) mi = s.id; } }
  }
  if (open > 0 && nr === open && sectors[mi].rest > 8) sectors[mi].rest = 8;
}
// pieśń dziury: jej przepis jako cztery nuty (kolor -> ton triady D-dur), obrócona o numer dziury; po zdobyciu zostaje w tle mapy
function songList() { return sectors.filter(s => s.claimed).map(s => { const n = []; s.recipe.forEach((c, i) => { for (let q = 0; q < c; q++) n.push(i); }); const r = s.id % 4; return { n: n.slice(r).concat(n.slice(0, r)), p: clamp((s.x / A - .5) * 1.4, -.7, .7) }; }); }
function claimSector(s) {
  s.claim = 1; s.claimed = true; s.fails = 0; s.rest = 0; G.claimT = G.t; G.surfWait = 3; G.warn = null;
  refreshReach(false); save();
  G.waveAt = G.t; G.waveAmp = 1.3; G.waveRb = 1; buzz([30, 40, 30, 40, 70]);
  burst(W / 2, H / 2, [1, 1, 1], 140, 1.0, true);
  if (sectors.every(x => x.claimed)) { G.finale = G.t; G.finaleMenu = false; if (window.Audio2) setTimeout(() => Audio2.finale && Audio2.finale(), 2400); }
  if (window.Audio2) { Audio2.claim(); Audio2.songs && Audio2.songs(songList()); }
  if (puls && G.st && G.st.n >= 3) { const pct = Math.round(100 * G.st.p / G.st.n), stars = pct >= 70 ? 3 : pct >= 50 ? 2 : 1;
    let bm = {}; try { bm = JSON.parse(localStorage.getItem('harv-best') || '{}'); } catch (e) {}
    const key = s.id + ':' + pulsMode, prev = bm[key] || 0; if (pct > prev) { bm[key] = pct; try { localStorage.setItem('harv-best', JSON.stringify(bm)); } catch (e) {} }
    cap('score', 'Puls ' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '  idealne ' + pct + '%  ·  seria ' + G.st.best + (prev ? (pct > prev ? '  ·  nowy rekord' : '  ·  rekord ' + prev + '%') : ''), 6); }
}

// ---------- aktualizacja ----------
function nearestSector(x, y) { let b = 0, bd = 9; sectors.forEach((s, i) => { const d = Math.hypot(x - s.x, y - s.y); if (d < bd) { bd = d; b = i; } }); return [b, bd]; }

function mapCan(s) { return s.reach && !s.claimed && !(s.rest > 0); }
function pickAt(px, py, tol) { const [wx, wy] = s2w(px, py), [i, d] = nearestSector(wx, wy); return d < tol ? i : -1; }
function pickMove(dx, dy) {                                  // klawiatura: wybór sąsiedniej dostępnej perły w kierunku strzałki (układ ekranu)
  const from = G.pick >= 0 ? w2s(sectors[G.pick].x, sectors[G.pick].y) : [W / 2, H / 2]; let best = -1, bs = -1e9;
  for (const s of sectors) { if (!mapCan(s) || s.id === G.pick) continue; const q = w2s(s.x, s.y), vx = q[0] - from[0], vy = q[1] - from[1], d = Math.hypot(vx, vy) || 1, al = (vx * dx + vy * dy) / d;
    const sc = al > .35 ? 2 - d / H + .3 * al : al - 2 - d / H; if (sc > bs) { bs = sc; best = s.id; } }
  if (best >= 0) { G.pick = best; G.hov = false; if (window.Audio2) Audio2.press(0, 1); }
}
function updateMap(dt) {
  if (G.started || qs.has('nomenu')) { G.mapT = (G.mapT || 0) + dt; if (G.mapT > 1.6 && !sectors.some(s => s.claimed)) cap('map1', touchDevice ? 'Dotknij jasnej dziury, aby w nią wejść' : 'Kliknij jasną dziurę, aby w nią wejść', 7); }
  if (G.finale > 0 && !G.finaleMenu && G.t - G.finale > 9 && !MENU.on) { G.finaleMenu = true; menuOpen(); }
  if (G.hov) { const i = pickAt(ptr.x, ptr.y, .1); G.pick = i >= 0 && mapCan(sectors[i]) ? i : -1; }
  else if (G.pick >= 0 && !mapCan(sectors[G.pick])) G.pick = -1;
}

function beatPulse() { if (reduceMotion) return 0; const ph = (pt() / BEAT) % 1, bp = puls && G.mode === 'sector' ? Math.exp(-ph * 4.5) * (.6 + .4 * (G.pq || 1)) : 0; return Math.min(1.2, bp + (G.heartPulse || 0) * .6); }

function updateSector(dt) {
  const s = sectors[G.cur], d = dToTarget(), lvl = levelOf(s);
  if (G.exhale) { for (let k = 0; k < 4; k++) G.fx[k] = Math.max(0, G.fx[k] - dt * 3.2); G.matchSm = lerp(G.matchSm || 0, 0, 1 - Math.exp(-6 * dt)); s.rem = Math.max(0, s.rem - dt * 2); if (G.t - G.exhale > 1.8) { G.exhale = 0; s.rem = 1; surface(); } return; }
  // postęp
  const matched = d === 0 || (G.t - G.matchedAt < .12 && d <= 1);
  if (d === 0 && !G.wasMatched) G.matchHit = G.t;      // chwila SAMEGO trafienia (nie każda klatka trzymania) -> obieg światła po pierścieniu
  G.wasMatched = d === 0;
  if (d === 0) G.matchedAt = G.t;
  const mult = Math.min(2, 1 + .15 * G.streak);
  let rate = 0;
  if (matched) rate = .075 * (1 - .09 * Math.min(WORLD, 4)) * mult * (puls ? (G.pq || 1) : 1);
  else rate = puls ? 0 : -.02 * (s.claim > Math.floor(s.claim * 4) / 4 + .001 ? 1 : 0);      // w Pulsie dziura nigdy się nie opróżnia
  if (puls && G.streak > 0 && G.t - (G.lastRew || 0) > 2.2 && G.t - (G.lastDec || 0) > 1.2 && !G.fixes && d > 0) { G.streak--; G.lastDec = G.t; }
  if (puls) G.pq = lerp(G.pq || 1, pulsMode === 2 ? .9 : 1, 1 - Math.exp(-(pulsMode === 2 ? .3 : .15) * dt));
  if (rate > 0) G.lastProgressT = G.t;
  s.claim = clamp(s.claim + rate * dt, 0, 1);
  if (s.claim >= 1 && !s.claimed) claimSector(s);
  // okno podejścia: rant dziury (rem 1 -> 0); dopasowanie odnawia, d=1 zwalnia; pierwsze 3 przejęcia bez limitu, 4 s zwłoki po wejściu
  { const gate = limitOn() && !s.claimed && G.diveT > .98 && (WORLD > 0 || qs.has('okno') || sectors.filter(x => x.claimed).length >= 3) && (G.t - G.secT0 > 4 || G.matchedAt > G.secT0);
    G.winOn = gate;
    if (gate) { s.rem = clamp(s.rem + (d === 0 ? .5 : d === 1 ? -.4 : -1) * dt / winSec(s), 0, 1);       if (G.winT0 < -50) G.winT0 = G.t;
      if (s.rem <= 0) { if (!G.zeroAt) G.zeroAt = G.t; if (G.t - G.zeroAt > 1.5 && !G.warn && !G.fixes) { sectorFail(s); return; } } else G.zeroAt = 0; }
    if (!s.claimed) { const ms = Math.floor(s.claim * 4); if (ms > (G.flMs || 0) && ms < 4) { if (window.Audio2 && Audio2.flood) Audio2.flood(ms); } G.flMs = ms; } }
  // dopasowanie: błysk
  G.matchSm = lerp(G.matchSm || 0, d === 0 ? 1 : d === 1 ? .35 : 0, 1 - Math.exp(-6 * dt));
  if (d === 0 && !G._wasMatch) { G.flashT = G.t; G.waveAt = G.t; G.waveAmp = .55; G.waveRb = 0; buzz(20); burst(W / 2, H / 2, mixNow(), 30, .5); if (window.Audio2) Audio2.match(); }
  G._wasMatch = d === 0;
  if (!s.claimed && G.diveT > .98) {
    const quiet = d === 0 && !G.warn && !G.fixes; G.dZero = quiet ? (G.dZero || 0) + dt : 0;
    const pr = G.pearl;
    if (pr && !pr.done) { if (!quiet) { pr.done = true; pr.tEnd = G.t; pr.cancel = true; if (!G.warn && !G.fixes) G.chain = 0; if (window.Audio2 && Audio2.breath) Audio2.breath(); }      // zapowiedź gazu gasi perłę, ale nie kasuje łańcucha
      else { if (!puls && !pr.ping && pearlTime() >= pr.t0 + .88 * (pr.tA - pr.t0)) { pr.ping = true; if (window.Audio2 && Audio2.pearlNow) Audio2.pearlNow(pr.k); }
        if (pearlTime() > pr.tA + (puls ? .3 : .8)) pearlResolve(0); } }
    else if (quiet && G.dZero > .8 && G.t > (G.pearlNext || 0)) {      // zapowiedź gazu czeka, aż perła się rozstrzygnie (patrz warunek zapowiedzi), więc nie trzeba omijać turbulencji
      let k = (prng(s.id * 5.3 + (G.pearlN || 0) * 1.7) * 4) | 0; if (G.pearl && k === G.pearl.k) k = (k + 1) % 4; G.pearlN = (G.pearlN || 0) + 1;
      const t0 = pearlTime(), tA = puls ? Math.ceil((t0 + 1.0) / BEAT) * BEAT : t0 + 2.6;
      G.pearl = { k, t0, tA, col: HC.PRIM[(G.ports[k] + 1) % 3], done: false, big: (G.pearlN % 5) === 0 && G.pearlN > 1, ping: false }; G.pearlNext = G.t + (puls ? 4 * BEAT : 3.2);
      if (window.Audio2 && Audio2.pearl) Audio2.pearl(k);
    }
  }
  pulsHintTick();
  // Puls: planowanie po szesnastkach z krótkim wyprzedzeniem na siatce zegara audio: tyknięcie, zapętlona fraza gracza (do 8 nut, 2 takty), ostinato triady przy napełnieniu >50%
  if (puls && !s.claimed) {
    const sub = BEAT / 4; G.nextS = Math.max(G.nextS || 0, Math.ceil(pt() / sub)); if (G.nextS * sub - pt() > 3) G.nextS = Math.ceil(pt() / sub);      // po pauzie lub nurkowaniu bez serii zaległych tyknięć
    if (G.diveT > .98) { let guard = 0;
      while (G.nextS * sub - pt() < .12 + pLat() && guard++ < 10) {
        const sl = G.nextS, dl = Math.max(0, sl * sub - pt() - pLat());
        if (window.Audio2) {
          if (sl % 4 === 0) Audio2.tick(dl, sl % 16 === 0, d <= 1 ? .45 : 1);
          if (d <= 1 && G.phrase) for (const e of G.phrase) if (e.pos === sl % 32 && G.t - e.t > .4 && G.t - e.t < 20) Audio2.arp(e.c, dl, (d === 0 ? .6 : .4) * Math.min(1.4, G.pq), e.k === 1 ? .35 : e.k === 3 ? -.35 : 0, e.k === 0 ? 12 : e.k === 2 ? -12 : 0);
          if (s.claim > .5 && sl % 2 === 0) Audio2.arp([0, 1, 2, 1][(sl >> 1) % 4], dl, .24 * s.claim, 0);
        }
        G.nextS++;
      } }
  }
  // szept
  const done = sectors.filter(x => x.claimed).length;
  if (done === 0 && !s.claimed && G.diveT > .98) cap('sec1', puls ? (touchDevice ? 'Puls: dotykaj punktów w takt. Zrównaj połowy pierścienia, a zagra melodia' : 'Puls: W A S D w takt. Zrównaj połowy pierścienia, a zagra melodia') : touchDevice ? 'Przesuń palcem w stronę punktu. Zrównaj prawą połowę pierścienia z lewą' : 'W A S D zmienia punkty. Zrównaj prawą połowę pierścienia z lewą', 8);
  if (!s.claimed && G.t - G.lastProgressT > (done === 0 && WORLD === 0 ? 3.5 : 5 + Math.min(WORLD, 4) * 1.5) && G.whisper < 0) G.whisper = bestHint() ?? -1;
  if (G.t - G.lastProgressT < .2) G.whisper = -1;
  if (!puls && done >= 1 && !s.claimed && G.diveT > .98 && !G.pulsHinted) { G.pulsHinted = true; let seen = false; try { seen = localStorage.getItem('harv-pulshint') === '1'; } catch (e) {}
    if (!seen) { try { localStorage.setItem('harv-pulshint', '1'); } catch (e) {} cap('pulsHint', 'Nowość: tryb Puls włączysz w menu na mapie (Esc)', 7); } }
  // turbulencje z zapowiedzią (pierwsze dwa sektory bez)
  const turbOn = !s.claimed && (done >= 1 || WORLD > 0) && G.diveT > .98;
  if (turbOn) {
    if (!G.warn && G.t > G.nextNudge && G.t > G.quietUntil && !pearlAlive()) {
      const fi = G.figI || 0, sd = (s.id + 1) * 7.13 + fi * 3.7, R1 = puls ? prng(sd) : Math.random(), R2 = puls ? prng(sd + 1.1) : Math.random(), R3 = puls ? prng(sd + 2.2) : Math.random(), R4 = puls ? prng(sd + 3.3) : Math.random();
      let k = (R1 * 4) | 0; if (G.frost && G.frost.k === k) k = (k + 1) % 4;
      const dir = R2 < WR().d2 ? 2 : 1, ks = [k]; if (R3 < (puls && pulsMode === 2 ? Math.max(WR().dbl, done >= 2 ? .3 : 0) : WR().dbl)) { let k2 = (k + 1 + ((R4 * 3) | 0)) % 4; if (G.frost && G.frost.k === k2) k2 = (k2 + 1) % 4; if (k2 !== k) ks.push(k2); }
      if (puls) G.figI = fi + 1;
      const p0 = puls ? pt() : G.t, land = (Math.floor((p0 + (puls ? 2 * BEAT : WR().lead)) / BEAT) + 1) * BEAT;      // Puls: zapowiedź to odliczanie dwóch uderzeń, na siatce zegara audio
      G.warn = { k, ks, dir, t0: G.t, p0, land, dBefore: d, acted: false };
      if (window.Audio2) Audio2.warn(k, G.ports[k], (G.ports[k] + dir) % 3); buzz(6);
    }
    if (G.warn) { if (G.warn.ks.includes(G.actedK)) G.warn.acted = true;
      if ((puls ? pt() : G.t) >= G.warn.land) {
        const w = G.warn, dB = dToTarget(); if (puls && w.ks.length === 2 && w.ks.every(q => G.pressT[q] > w.t0 && G.pressT[q] <= G.t) && Math.abs(G.pressT[w.ks[0]] - G.pressT[w.ks[1]]) < BEAT * .5) { chordReward(); w.chord = true; } for (const q of w.ks) { G.ports[q] = (G.ports[q] + w.dir) % 3; G.fx[q] = 1; G.ripple[q] = G.t; }
        const dA = dToTarget(); (G.nlog = G.nlog || []).push([+G.t.toFixed(2), w.k, w.dir, dB, dA, w.acted ? 1 : 0]); if (G.nlog.length > 60) G.nlog.shift();
        if (dA <= dB && w.acted && (!puls || w.ks.some(q => G.pOff && G.pOff[q] && G.pOff[q].t > w.t0 && G.pOff[q].off <= .045))) { if (puls) G.pq = Math.min(1.5, G.pq + .2); G.streak = Math.min(10, G.streak + 2); G.catchT = G.t; G.catchKind = 'idealne'; if (window.Audio2) Audio2.catch2(true); }
        else if (dA > dB) { G.fixes = { land: G.t, dB, ks: w.ks, chord: !!w.chord }; if (puls) G.pq = Math.max(.6, G.pq - .12); else s.claim = Math.max(Math.floor(s.claim * 4) / 4, s.claim - WR().pen); }   // koszt: -7 pp (nie niżej niż próg)
        G.quietUntil = G.t + 1.2;
        if (window.Audio2 && !(puls && dA <= dB)) Audio2.hit();
        const base = puls ? PAT_B[pulsMode === 2 ? 1 : 0][(G.figI || 0) % 6] * BEAT : (done === 1 && WORLD === 0 ? 9 : NUDGE_INT[lvl]) * WR().nud * (.85 + Math.random() * .3);      // Puls: odstępy z wzoru, bez losowości
        G.nextNudge = G.t + base; G.warn = null;
      } }
    if (G.fixes && G.t - G.fixes.land > 1.5) { G.streak = Math.floor(G.streak / 2); G.fixes = null; }     // za późno: seria o połowę, tylko raz
    if (puls && G.fixes && G.fixes.ks && G.fixes.ks.length === 2 && !G.fixes.chord) {      // akord: oba punkty poprawione w jednym takcie, niezależnie od kolejności dopasowania
      const a = G.pressT[G.fixes.ks[0]], b = G.pressT[G.fixes.ks[1]], L0 = G.fixes.land - .2;
      if (a > L0 && b > L0 && Math.abs(a - b) < BEAT * .5) { G.fixes.chord = true; chordReward(); } }
    if (G.fixes && dToTarget() <= G.fixes.dB) {
      const dtc = G.t - G.fixes.land, perf = dtc <= .6 && (!puls || (G.fixes.ks || []).some(q => G.pOff && G.pOff[q] && G.pOff[q].t > G.fixes.land - .2 && G.pOff[q].off <= .045));      // w Pulsie „idealne” tylko gdy poprawka trafiła w siatkę
      if (perf) { G.streak = Math.min(10, G.streak + 2); G.catchKind = 'idealne'; } else { G.streak = Math.min(10, G.streak + 1); G.catchKind = 'zlapane'; }
      if (puls) { G.pq = Math.min(1.5, G.pq + (perf ? .2 : .08)); const f2 = G.fixes.ks;
        void f2; }
      G.lastRew = G.t; G.catchT = G.t; G.pearlNext = 0; G.dZero = Math.max(G.dZero || 0, .6); if (window.Audio2) Audio2.catch2(perf); G.fixes = null;
    }
  }
  if (WR().frost && turbOn) {                       // szron: jeden port na kilka sekund nie reaguje (tylko taki, który cel nadal dopuszcza)
    if (G.frost && G.t > G.frost.until) G.frost = null;
    if (!G.frost && G.t > (G.nextFrost || 0) && !G.warn) {
      const tg = s.recipe, cn = curRecipe(), cands = d === 0 ? [] : [0, 1, 2, 3].filter(q => cn[G.ports[q]] >= 2 && cn[G.ports[q]] > tg[G.ports[q]]);   // zamarza port, który trzeba ruszyć, ale zostaje inna droga (drugi port tego koloru)
      if (cands.length) { const q = cands[(Math.random() * cands.length) | 0]; G.frost = { k: q, t0: G.t, until: G.t + 4.2 }; G.nextFrost = G.t + 4.2 + 9 / WR().frost * (.8 + Math.random() * .4);
        cap('frost1', 'Szron skuł punkt na kilka sekund. Zmień inny punkt tego koloru', 5); if (window.Audio2) Audio2.hit(); }
    }
  }
  G.actedK = -1;
  if (G.t - (G.saveT || 0) > 2.5) { G.saveT = G.t; save(); }
  for (let k = 0; k < 4; k++) G.fx[k] = Math.max(0, G.fx[k] - dt * 3.2);
  if (s.claimed) { G.surfWait -= dt; if (G.surfWait <= 0) surface(); }
}

function update(dt) {
  G.t += dt; if (!MENU.on && !TUT.on) tickRest(dt);
  if (G.mode === 'map') { if (!MENU.on && !TUT.on) updateMap(dt); }
  else if (G.mode === 'dive') {
    G.diveT = clamp(G.diveT + dt / (G.dive.inst ? .01 : 1.2), 0, 1);
    if (G.diveT >= 1) { G.mode = 'sector'; G.secEnterT = G.t;      // chwila wejścia: do „oddechu" (settle gazu + rozbłysk serca)
      if (dToTarget() === 0 && !sectors[G.cur].claimed) { sectors[G.cur].claim = Math.max(sectors[G.cur].claim, .2); G.streak += 2; G.flashT = G.t; } }
  } else if (G.mode === 'sector') updateSector(dt);
  else if (G.mode === 'surf') {
    G.diveT = clamp(G.diveT - dt / .8, 0, 1);
    if (G.diveT <= 0) { G.mode = 'map'; G.pick = -1; }
  }
  updateParts(dt);
  // animacje sektorów
  for (const s of sectors) { s.claimV += (s.claim - s.claimV) * (1 - Math.exp(-3 * dt)); s.reachV += ((s.reach ? 1 : 0) - s.reachV) * (1 - Math.exp(-2.2 * dt)); if (!(G.mode === 'sector' && s.id === G.cur)) s.rem = Math.min(1, s.rem + dt * .008); s.restV += ((s.rest > 0 ? clamp(1 - s.rest / Math.max(1, s.restTot), 0, 1) : 1) - s.restV) * (1 - Math.exp(-3 * dt)); }
  // kolory portów
  for (let k = 0; k < 4; k++) G.slotDisp[k] = mix3(G.slotDisp[k], HC.PRIM[G.ports[k]], 1 - Math.exp(-14 * dt));
  // kamera
  const dv = G.diveT, e = sstep(0, 1, dv), eCam = sstep(0, .55, dv);
  const sec = G.cur >= 0 ? sectors[G.cur] : null;
  const overCam = [A / 2, .5];
  if (G.mode === 'map') { cam[0] = overCam[0]; cam[1] = overCam[1]; scaleNow = s0; }
  else { cam[0] = lerp(overCam[0], sec.x, eCam); cam[1] = lerp(overCam[1], sec.y, eCam); scaleNow = Math.exp(lerp(Math.log(s0), Math.log(S_SEC), e));
    if (G.mode === 'sector' && !reduceMotion) { const ea = G.t - (G.secEnterT == null ? -9 : G.secEnterT); if (ea >= 0 && ea < 1.3) scaleNow *= 1 + .045 * Math.exp(-ea * 2.6) * Math.sin(ea * 3.4); } }      // oddech wejścia: gaz robi jeden miękki wdech i osiada (sam gaz, nakładka 2D bez zmian)
  // jakość adaptacyjna z histerezą (60 Hz vsync = ~16,7 ms)
  G.ema = lerp(G.ema, dt * 1000, .05);
  if (G.ema > 22) { G.lowT += dt; G.highT = 0; } else if (G.ema < 18) { G.highT += dt; G.lowT = 0; } else { G.lowT = G.highT = 0; }
  if (G.lowT > .8 && G.q > .38) { if (G.t - G.lastDrop < 8) G.maxQ = Math.min(G.maxQ, G.q); G.q = Math.max(.38, G.q - .06); G.lastDrop = G.t; applyQ(); G.lowT = 0; }
  if (G.highT > 6 && G.q < G.maxQ && G.t - G.lastDrop > 8) { G.q = Math.min(G.maxQ, G.q + .05); applyQ(); G.highT = 0; G.lastDrop = G.t - 4; }
}

// ---------- rysowanie nakładki ----------
const glowCache = new Map();
function glowSprite(c) {
  const key = (Math.round(c[0] * 12) << 8) | (Math.round(c[1] * 12) << 4) | Math.round(c[2] * 12);
  let s = glowCache.get(key); if (s) return s;
  s = document.createElement('canvas'); s.width = s.height = 128; const x = s.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64), N = 16;
  for (let i = 0; i <= N; i++) { const r = i / N, hot = Math.exp(-Math.pow(r / .13, 2)), body = Math.exp(-Math.pow(r / .4, 2)), tail = Math.exp(-Math.pow(r / .85, 2));
    const al = Math.min(1, .9 * hot + .42 * body + .13 * tail) * (1 - r * r * r * r);
    const w = hot * .88 + body * .06, col = [0, 1, 2].map(q => Math.round(255 * clamp(c[q] * (1 - w) + w + (1 - r) * .02, 0, 1)));
    gr.addColorStop(r, `rgba(${col},${al.toFixed(4)})`); }
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  if (glowCache.size > 400) glowCache.clear(); glowCache.set(key, s); return s;
}
function glow(x, y, r, c, a) { if (!(a > .004) || !(r > 0)) return; const pa = ux.globalAlpha; ux.globalAlpha = Math.min(1, a); ux.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2); ux.globalAlpha = pa; }
function rainbow(u, a) { const h = (u % 1) * 6, f = h % 1, i = Math.floor(h);
  const c = [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i % 6]; return rgba(mix3(c, [.92, .9, 1], .25), a); }
function glyph(k, x, y, r, a) {
  if (cbMode) a = Math.max(a, .9);
  if (touchDevice) r *= 1.12;      // większe znaki na telefonie (ale nie tak, żeby tłoczyły orby): na małym ekranie były najdrobniejszym elementem
  const lw = Math.max(1, r * (cbMode ? .22 : .12));
  ux.save(); ux.globalCompositeOperation = 'source-over'; ux.lineJoin = 'round'; ux.lineCap = 'round';
  const path = () => { ux.beginPath();
    if (k === 0) ux.arc(x, y, r * .55, 0, TAU);
    else if (k === 1) { ux.moveTo(x, y - r * .62); ux.lineTo(x + r * .58, y + r * .42); ux.lineTo(x - r * .58, y + r * .42); ux.closePath(); }
    else ux.rect(x - r * .48, y - r * .48, r * .96, r * .96); };
  path(); ux.strokeStyle = `rgba(4,6,22,${.5 * a})`; ux.lineWidth = lw + Math.max(1.8, r * .16); ux.stroke();   // ciemny podkład: znak czytelny na jasnym gazie
  path(); ux.strokeStyle = `rgba(255,255,255,${a})`; ux.lineWidth = lw; ux.stroke();
  ux.restore();
}

function drawMapUi(alpha) {
  const t = G.t, k = H / 1000, mc = mixNow();
  ux.globalCompositeOperation = 'lighter';
  for (const s of sectors) if (linkOf(s) && !s.claimed && s.reachV > .3) {      // znak SPLOTU na mapie: dwa ziarna spięte łukiem nad dziurą (widać rodzaj przed wejściem)
    const [sx, sy] = w2s(s.x, s.y), rhp = .06 * H / scaleNow * (.62 + .38 * s.reachV), yy = sy - rhp * 1.75, w2 = Math.max(12 * k, rhp * .62), al = alpha * Math.min(1, s.reachV) * (s.rest ? .35 : 1), thr = [1, .93, .74], br = .85 + .15 * Math.sin(t * 2 + s.id);
    glow(sx - w2, yy, 11 * k, thr, .75 * al * br); glow(sx + w2, yy, 11 * k, thr, .75 * al * br); glow(sx - w2, yy, 3.4 * k, [1, 1, 1], .95 * al); glow(sx + w2, yy, 3.4 * k, [1, 1, 1], .95 * al);
    for (let i = 1; i < 8; i++) glow(sx - w2 + (2 * w2) * i / 8, yy - Math.sin(i / 8 * Math.PI) * 4 * k, 2.6 * k, thr, .7 * al); }
  // sektory, ich kryształy i podświetlenie wyboru rysuje shader (bez ikon i kresek)
  // niesiona mieszanka: cztery kropki na dole (obracasz ją Q / E); bez statku
  { const bx = W / 2, by = H - 46 * k - SAFE.b;
    for (let i = 0; i < 4; i++) { const an = -Math.PI / 2 + i * Math.PI / 2, x = bx + Math.cos(an) * 15 * k, y = by + Math.sin(an) * 15 * k; glow(x, y, 9 * k, G.slotDisp[i], .85 * alpha); glow(x, y, 2.6 * k, [1, 1, 1], .9 * alpha); } }
  if (touchDevice) for (const [bx, dirn] of [[60 * k + SAFE.l, -1], [W - 60 * k - SAFE.r, 1]]) { const by = H - 60 * k - SAFE.b; glow(bx, by, 44 * k, mc, .3 * alpha); glow(bx, by, 16 * k, [1, 1, 1], .14 * alpha);
    const a0 = dirn > 0 ? -2.4 : -.74 - Math.PI + Math.PI, n = 9; for (let q = 0; q < n; q++) { const u = q / (n - 1), an = dirn > 0 ? -2.5 + u * 4.2 : -.64 - u * 4.2 + Math.PI - Math.PI; const xx = bx + Math.cos(an) * 20 * k, yy = by + Math.sin(an) * 20 * k;
      glow(xx, yy, (4 + 5 * u) * k, [.9, .94, 1], (.35 + .5 * u) * alpha); if (q === n - 1) { glow(xx, yy, 11 * k, [1, 1, 1], .8 * alpha); } } }
  else { ux.fillStyle = `rgba(230,236,255,${.34 * alpha})`; ux.font = `600 ${Math.round(13 * k)}px Manrope, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle'; ux.fillText('Q', W / 2 - 46 * k, H - 46 * k - SAFE.b); ux.fillText('E', W / 2 + 46 * k, H - 46 * k - SAFE.b); }
  if (touchDevice) for (let i = -1; i <= 1; i++) { glow(W - 40 * k - SAFE.r, 40 * k + SAFE.t + i * 14 * k, 13 * k, [.9, .93, 1], .65 * alpha); glow(W - 40 * k - SAFE.r, 40 * k + SAFE.t + i * 14 * k, 4.5 * k, [1, 1, 1], .9 * alpha); }
  if (G.finale && G.t - G.finale > 3 && G.t - G.finale < 11) { const f = G.t - G.finale - 3, a = Math.min(1, f / 1.5, (8 - f) / 1.5); ux.fillStyle = `rgba(240,236,255,${.85 * Math.max(0, a) * alpha})`;
    ux.font = `600 ${Math.round(34 * k)}px Manrope, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle'; ux.fillText('Wszystko świeci.', W / 2, H * .16); }
}

function fancyArc(cx, cy, r, a0, a1, col, a, t, w) {            // świetlista rurka z biegnącym połyskiem, bez płaskiej kreski
  const len = Math.abs(a1 - a0) * r, n = Math.max(6, Math.ceil(len / (w * .55)));
  for (let i = 0; i <= n; i++) { const u = i / n, an = lerp(a0, a1, u), x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r, sh = .62 + .38 * Math.sin(u * 14 - t * 3.2);
    glow(x, y, w * 2.1, col, .4 * sh * a); glow(x, y, w * .85, mix3(col, [1, 1, 1], .45), .6 * a * (.7 + .3 * sh)); }
}
function drawSectorUi(a) {
  if (a <= 0.01) return;
  const t = G.t, k = H / 1000, cx = W / 2, cy = H / 2, s = sectors[G.cur], d = dToTarget();
  const sz = secZoom(), tgt = s.col, mc = mixNow(), rr = .125 * H * sz, m = G.matchSm || 0;
  ux.globalCompositeOperation = 'lighter';
  glow(cx, cy, 90 * k, mc, (.12 + .14 * m) * a);
  { const ea = G.t - (G.secEnterT == null ? -9 : G.secEnterT); if (ea >= 0 && ea < 1 && !reduceMotion) { const f = ea, ee = 1 - (1 - f) * (1 - f); glow(cx, cy, rr * (1.3 + ee * 4.2), mix3(tgt, [.88, .92, 1], .45), (1 - f) * (1 - f) * .32 * a); } }      // oddech wejścia: miękki rozbłysk w kolorze dziury rozchodzący się z serca (mapa i sektor się zespalają)
  // SPLOT: nić światła po orbicie między dwoma sprzężonymi kamieniami; ziarno biegnie od lidera do następcy (po stuknięciu szybko)
  if (linkOf(s) && !s.claimed) { const [l0, f0] = s.link, R = portR() * H, ro0 = .036 * H, an0 = Math.atan2(-DIRS[l0][1], DIRS[l0][0]), an1 = Math.atan2(-DIRS[f0][1], DIRS[f0][0]);
    let df = ((an1 - an0 + 3 * Math.PI) % TAU) - Math.PI; const sg = df >= 0 ? 1 : -1, dl = Math.min(.5, ro0 * 1.7 / R), a0 = an0 + sg * dl, a1 = an0 + df - sg * dl, tk = G.pressT ? G.pressT[l0] : -9, age = t - tk, thr = [1, .93, .74];
    fancyArc(cx, cy, R, a0, a1, thr, .5 * a, t, 4.5 * k);
    const u = age >= 0 && age < .45 ? age / .45 : reduceMotion ? .5 : (t * .42) % 1, am = lerp(a0, a1, u), bx2 = cx + Math.cos(am) * R, by2 = cy + Math.sin(am) * R;
    glow(bx2, by2, ro0 * .55, thr, (age >= 0 && age < .45 ? 1 : .75) * a); glow(bx2, by2, ro0 * .18, [1, 1, 1], .95 * a);
    const [lx0, ly0] = portPx(l0); glow(lx0, ly0, ro0 * 2.2, thr, (.16 + (age >= 0 && age < .5 ? .3 * (1 - age / .5) : 0)) * a); }
  // punkty: ciekłe orby rysuje shader; tu halo, okrążające perełki, fale przy zmianie, zapowiedzi i podpowiedzi
  for (let p = 0; p < 4; p++) {
    const [x, y] = portPx(p), col = G.slotDisp[p], fx = G.fx[p], ro = .036 * H * sz * (1 + fx * .18);      // sz: na szerokim ekranie orby (halo i glif) rosną razem z sercem
    glow(x, y, ro * 3.6, col, (.5 + fx * .6) * a);
    { const pcr = ux.globalCompositeOperation; ux.globalCompositeOperation = 'source-over';      // rant orbu: ciemny obrys + jasna obwódka -> orb nie ginie na tle w zbliżonym kolorze (np. niebieski orb na niebieskim tle)
      ux.strokeStyle = `rgba(6,8,26,${.4 * a})`; ux.lineWidth = 3 * k; ux.beginPath(); ux.arc(x, y, ro * 1.13, 0, TAU); ux.stroke();
      ux.strokeStyle = rgba(mix3(col, [1, 1, 1], .55), .5 * a); ux.lineWidth = 1.6 * k; ux.beginPath(); ux.arc(x, y, ro * .98, 0, TAU); ux.stroke();
      ux.globalCompositeOperation = pcr; }
    for (let i = 0; i < 3; i++) { const an = t * (1.1 + i * .3) * (p % 2 ? -1 : 1) + i * 2.09 + p, rad = ro * (1.55 + i * .22), bx = x + Math.cos(an) * rad, by = y + Math.sin(an) * rad;
      glow(bx, by, ro * (.34 - i * .06), col, .5 * a); glow(bx, by, ro * (.11 - i * .02), [1, 1, 1], .85 * a); }
    glyph(G.ports[p], x, y, ro * .75, (cbMode ? .9 : .55) * a);
    if (G.frost && G.frost.k === p && t < G.frost.until) { const fr = clamp((G.frost.until - t) / 4.2, 0, 1); glow(x, y, ro * 3.4, [.75, .92, 1], .55 * a); glow(x, y, ro * 1.3, [1, 1, 1], .3 * a);
      ux.globalCompositeOperation = 'source-over'; ux.font = `700 ${Math.max(13, Math.round(15 * k))}px Manrope, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle'; ux.shadowColor = 'rgba(2,4,24,.9)'; ux.shadowBlur = 6 * k; ux.fillStyle = `rgba(225,244,255,${.95 * a})`; ux.fillText('szron', x, y + ro * 2.3); ux.shadowBlur = 0; ux.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const an = i * TAU / 6 + .3; glow(x + Math.cos(an) * ro * 1.55, y + Math.sin(an) * ro * 1.55, ro * .3, [.85, .96, 1], .85 * a * (.4 + .6 * fr)); } }
    const rt = t - G.ripple[p]; if (rt >= 0 && rt < .6) { const f = rt / .6; glow(x, y, ro * (1.6 + f * 3.2), col, (1 - f) * (1 - f) * .75 * a); }
    if (G.warn && G.warn.ks.includes(p)) {      // zegar koloru: gruby łuk w NOWYM kolorze domyka się dokładnie na zmianie; pod spodem ciemny obrys, na łuku glif nowego koloru
      const nw = HC.PRIM[(G.ports[p] + G.warn.dir) % 3], f2 = puls ? clamp((pt() - G.warn.p0) / Math.max(.2, G.warn.land - G.warn.p0), 0, 1) : clamp((t - G.warn.t0) / Math.max(.2, G.warn.land - G.warn.t0), 0, 1), R2 = ro * 2.05, pc4 = ux.globalCompositeOperation;
      glow(x, y, ro * 3.4, nw, (.2 + .35 * f2) * a);
      ux.globalCompositeOperation = 'source-over'; ux.lineCap = 'round';
      ux.strokeStyle = `rgba(4,6,24,${.55 * a})`; ux.lineWidth = 10 * k; ux.beginPath(); ux.arc(x, y, R2, 0, TAU); ux.stroke();
      ux.strokeStyle = rgba(nw, .22 * a); ux.lineWidth = 5.5 * k; ux.beginPath(); ux.arc(x, y, R2, 0, TAU); ux.stroke();
      ux.strokeStyle = rgba(mix3(nw, [1, 1, 1], .3), (.88 + .12 * f2) * a); ux.lineWidth = 6.5 * k; ux.beginPath(); ux.arc(x, y, R2, -Math.PI / 2, -Math.PI / 2 + TAU * f2); ux.stroke();
      ux.strokeStyle = `rgba(255,255,255,${.45 * a})`; ux.lineWidth = 1.5 * k; ux.beginPath(); ux.arc(x, y, R2, -Math.PI / 2, -Math.PI / 2 + TAU * f2); ux.stroke();
      ux.globalCompositeOperation = pc4;
      { const an = -Math.PI / 2 + TAU * f2; glow(x + Math.cos(an) * R2, y + Math.sin(an) * R2, ro * .5, nw, .9 * a); }
      glow(x, y - R2, ro * 1.0, nw, .5 * a); glyph((G.ports[p] + G.warn.dir) % 3, x, y - R2, ro * .8, a);
    }
    { const nx = (G.ports[p] + 1) % 3, vx = cx - x, vy = cy - y, vl = Math.hypot(vx, vy) || 1, nar = portR() < .207, side = nar && p % 2 === 1, nrw = nar ? -1 : 1, qx = side ? x : x + vx / vl * ro * 1.5 * nrw, qy = side ? y + ro * 1.75 : y + vy / vl * ro * 1.5 * nrw;      // na wąskim ekranie (telefon) podgląd nie wchodzi na pierścień celu: góra/dół na zewnątrz, boki pod kamieniem      // podgląd: kolor, jaki da klawisz
      const pv = pearlAlive() || (G.warn && G.warn.ks.includes(p)) ? 0 : 1;      // przy iskrze i zegarze koloru podgląd znika (lżejszy kadr)
      if (pv) {      // podświetlenie: ten kamień zbliży do celu (jego następny znak wypełnia puste miejsce w rzędzie celu) = oddychający pierścień w kolorze znaku; inne przygasają
        const np2 = applyPress(G.ports, p, 1, linkOf(s)), frz = frozenK(p), helps = !s.claimed && !frz && solveDist(np2, s.recipe, linkOf(s)) < solveDist(G.ports, s.recipe, linkOf(s)), pl = .5 + .5 * Math.sin(t * 2.6 + p * .9);
        glow(qx, qy, ro * (helps ? 1.25 : .95), HC.PRIM[nx], (helps ? .42 + .2 * pl : .3) * a); glyph(nx, qx, qy, ro * .6, (cbMode ? .98 : helps ? .98 : .6) * a);
        if (helps) { const pc6 = ux.globalCompositeOperation; ux.globalCompositeOperation = 'source-over'; ux.strokeStyle = rgba(mix3(HC.PRIM[nx], [1, 1, 1], .35), (.4 + .45 * pl) * a); ux.lineWidth = 2.2 * k; ux.beginPath(); ux.arc(qx, qy, ro * (.8 + .08 * pl), 0, TAU); ux.stroke(); ux.globalCompositeOperation = pc6; } } }
    { const pf = G.pfx && G.pfx[p]; if (pf) { const ag = t - pf.t; if (ag >= 0 && ag < 1) {      // wynik wciśnięcia: bliżej celu = jasny pierścień i światło płynące do dziury, dalej = szara przerywana obręcz
      const f = ag;
      if (pf.better) { ux.strokeStyle = rgba([1, 1, 1], (1 - f) * .85 * a); ux.lineWidth = 2.6 * k; ux.beginPath(); ux.arc(x, y, ro * (1.2 + 1.6 * f), 0, TAU); ux.stroke();
        for (let i2 = 0; i2 < 3; i2++) { const u = clamp(f * 1.4 - i2 * .12, 0, 1); glow(lerp(x, cx, u), lerp(y, cy, u), ro * .3, [1, .95, .8], (1 - u) * .8 * a); } }
      else if (pf.worse) { ux.save(); ux.setLineDash([5 * k, 6 * k]); ux.strokeStyle = `rgba(150,160,195,${(1 - f) * .75 * a})`; ux.lineWidth = 2.2 * k; ux.beginPath(); ux.arc(x, y, ro * (1.9 - .7 * f), 0, TAU); ux.stroke(); ux.restore(); } } } }
    if (G.whisper === p) { const pl = .5 + .5 * Math.sin(t * 5); glow(x, y, ro * (3 + pl * 1.4), [1, 1, 1], (.18 + .22 * pl) * a);
      if (!sectors.some(q => q.claimed)) { const u = clamp(((t * .6) % 2) / 1.3, 0, 1.2), e = Math.min(u, 1), ee = e * e * (3 - 2 * e), gx = lerp(cx + 190 * k, x, ee), gy = lerp(cy + 250 * k, y, ee);      // duch palca: pokazuje, który punkt dotknąć
        glow(gx, gy, 30 * k, [1, 1, 1], .5 * a); glow(gx, gy, 12 * k, [1, 1, 1], .8 * a); { const pc3 = ux.globalCompositeOperation; ux.globalCompositeOperation = 'source-over'; ux.fillStyle = rgba([1, 1, 1], .92 * a); ux.strokeStyle = 'rgba(8,10,30,.85)'; ux.lineWidth = 2.4 * k; ux.beginPath(); ux.arc(gx, gy, 11 * k, 0, TAU); ux.fill(); ux.stroke(); ux.globalCompositeOperation = pc3; } if (u >= 1) { const f = clamp((u - 1) / .2, 0, 1); glow(x, y, ro * (1.2 + 2 * f), [1, 1, 1], (1 - f) * .6 * a); } } }
    if (!touchDevice && G.keysUsed < 12) { const kk = ['W', 'D', 'S', 'A'][p], off = ro * (portR() < .207 && p % 2 === 0 ? 3.1 : 2.3); const lx = x + DIRS[p][0] * off * (p % 2 ? 1 : 0), ly = y - DIRS[p][1] * off * (p % 2 ? 0 : 1);
      ux.fillStyle = `rgba(230,236,255,${.8 * a * (1 - G.keysUsed / 12)})`; ux.font = `${Math.round(20 * k)}px Manrope, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle'; const pc2 = ux.globalCompositeOperation; ux.globalCompositeOperation = 'source-over'; ux.shadowColor = 'rgba(2,4,20,.9)'; ux.shadowBlur = 5 * k; ux.fillText(kk, lx, ly); ux.shadowBlur = 0;
      { const ox = DIRS[p][0], oy = -DIRS[p][1], tx = lx + ox * ro * 1.15, ty = ly + oy * ro * 1.15, sz2 = ro * .34, ang = Math.atan2(oy, ox); ux.save(); ux.translate(tx, ty); ux.rotate(ang); ux.strokeStyle = `rgba(230,236,255,${.7 * a * (1 - G.keysUsed / 12)})`; ux.lineWidth = 2.4 * k; ux.lineCap = 'round'; ux.lineJoin = 'round'; ux.beginPath(); ux.moveTo(-sz2 * .6, sz2 * .9); ux.lineTo(sz2 * .6, 0); ux.lineTo(-sz2 * .6, -sz2 * .9); ux.stroke(); ux.restore(); }
      ux.globalCompositeOperation = pc2; }
  }
  // perła podbicia (złota iskra): kite wskazuje kierunek klawisza, cienki pierścień ZWĘŻA się do punktu i dotyka go w chwili trafienia (inny kod i ruch niż zegar koloru, który się wypełnia)
  { const q = G.pearl;
    if (q && (!q.done || (t - q.tEnd) < .6)) { const [x, y] = portPx(q.k), ro = .036 * H, now = pearlTime(), f = clamp((now - q.t0) / (q.tA - q.t0), 0, 1.1), fa = q.done ? clamp(1 - (t - q.tEnd) / .6, 0, 1) : clamp(f * 4, 0, 1), hot = !q.done && f > .86 ? 1 : 0, gold = [1, .86, .5], pc5 = ux.globalCompositeOperation;
      const rr3 = ro * (1.1 + 2.3 * Math.pow(1 - Math.min(f, 1), 1.3)), ox = DIRS[q.k][0], oy = -DIRS[q.k][1], cxk = x + ox * ro * 3.2, cyk = y + oy * ro * 3.2, ang = Math.atan2(oy, ox) + (reduceMotion ? 0 : Math.sin(t * 5) * .12), sd = ro * (.78 + .26 * hot) * (q.big ? 1.25 : 1);      // kite poza etykietą klawisza (2,3 ro), większy
      glow(cxk, cyk, ro * (1.5 + .8 * hot), gold, (.4 + .35 * hot) * fa * a); glow(x, y, ro * 1.5, gold, (.18 + .2 * hot) * fa * a);
      ux.strokeStyle = rgba(mix3(gold, [1, 1, 1], hot ? .6 : .2), (.28 + .6 * Math.min(f, 1)) * fa * a); ux.lineWidth = (2.6 + 2 * hot + (q.big ? 1 : 0)) * k; ux.beginPath(); ux.arc(x, y, rr3, 0, TAU); ux.stroke();
      if (q.big && !q.done) { ux.strokeStyle = rgba([1, .95, .8], .5 * fa * a); ux.lineWidth = 1.2 * k; ux.beginPath(); ux.arc(x, y, rr3 + 5 * k, 0, TAU); ux.stroke(); }      // wielka perła: podwójny pierścień
      ux.globalCompositeOperation = 'source-over';
      { const P = [[sd * 2.3, 0], [0, sd * .85], [-sd * .9, 0], [0, -sd * .85]].map(([px4, py4]) => [cxk + px4 * Math.cos(ang) - py4 * Math.sin(ang), cyk + px4 * Math.sin(ang) + py4 * Math.cos(ang)]);
        ux.beginPath(); ux.moveTo(P[0][0], P[0][1]); for (let i4 = 1; i4 < 4; i4++) ux.lineTo(P[i4][0], P[i4][1]); ux.closePath();
        ux.fillStyle = rgba(mix3(gold, [1, 1, 1], .35 + .4 * hot), .95 * fa * a); ux.strokeStyle = `rgba(30,18,4,${.55 * fa * a})`; ux.lineWidth = 1.6 * k; ux.lineJoin = 'round'; ux.stroke(); ux.fill(); }
      ux.globalCompositeOperation = pc5;
    }
    const pf2 = G.pearlFx; if (pf2 && t - pf2.t < .8 && pf2.grade >= 1) { const [x, y] = portPx(pf2.k), f = (t - pf2.t) / .8, bx = (x + cx) / 2 + (y - cy) * .25, by = (y + cy) / 2 - (x - cx) * .25;
      for (let i3 = 0; i3 < 8; i3++) { const u = clamp(f * 1.5 - i3 * .07, 0, 1), iu = 1 - u, px3 = iu * iu * x + 2 * iu * u * bx + u * u * cx, py3 = iu * iu * y + 2 * iu * u * by + u * u * cy; glow(px3, py3, .036 * H * (.5 - .03 * i3), pf2.col, (1 - u * .6) * (1 - i3 / 10) * .9 * a); }
      if (f > .5) { const g2 = (f - .5) / .5; ux.strokeStyle = rgba(mix3(pf2.col, [1, 1, 1], pf2.grade === 2 ? .5 : .2), (1 - g2) * a); ux.lineWidth = (pf2.grade === 2 ? 4 : 2.6) * k; ux.beginPath(); ux.arc(cx, cy, .07 * H * (1.05 + .9 * g2), 0, TAU); ux.stroke(); } }
  }
  // pierścień: lewa połowa = cel, prawa = mieszanka (świetlne rurki)
  if (sectors.filter(q => q.claimed).length === 0 && !s.claimed) { ux.globalCompositeOperation = 'source-over'; ux.font = `700 ${Math.max(15, Math.round(17 * k))}px Manrope, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle'; ux.shadowColor = 'rgba(2,4,20,.8)'; ux.shadowBlur = 8 * k;
    ux.fillStyle = `rgba(244,246,255,${.9 * a})`; { const dq = .707 * (rr + 26 * k); ux.fillText('cel', cx - dq, cy - dq); ux.fillText('Ty', cx + dq, cy - dq); } ux.shadowBlur = 0; ux.globalCompositeOperation = 'lighter'; }
  { const ka = cbMode ? 1 : .7, tc3 = s.recipe, cr = curRecipe();      // rząd celu: tyle miejsc na znak, ile ich trzeba; zapełnione świecą kolorem, PUSTE oddychają = tych znaków szukaj na kamieniach (kamień z takim podglądem też oddycha)
    const ro0 = .036 * H, pY = portPx(2)[1], ringBot = cy + rr + 22 * k, pvTop = pY - 2.45 * ro0, avail = pvTop - ringBot;
    let gs = Math.min(22 * k, avail * .5 - 5 * k), gy0 = (ringBot + pvTop) / 2;
    if (gs < 16 * DPR) { const below = H - SAFE.b - pY; gs = clamp(below * .3, 16 * k, 24 * k); gy0 = Math.min(pY + Math.max(.16 * H, below * .46), H - SAFE.b - gs * 2.7); }      // gdy rząd „między pierścieniem a portem" byłby za drobny (krótki/wąski ekran: telefon, Fold poziomo) -> schodzi pod dolny port z zapasem od krawędzi i większymi znakami; na desktopie zostaje między
    const tot = tc3[0] + tc3[1] + tc3[2], ng = (tc3[0] > 0) + (tc3[1] > 0) + (tc3[2] > 0), pitch = gs * 1.7, gg = gs * .55, rowW = (tot - 1) * pitch + Math.max(0, ng - 1) * gg, x0 = cx - rowW / 2;
    { const pc7 = ux.globalCompositeOperation; ux.globalCompositeOperation = 'source-over'; const rw2 = rowW / 2 + gs * 1.5;      // miękki ciemny poblask pod rzędem celu (gaśnie we wszystkich kierunkach, bez twardej ramki): znaki nie giną na jasnym gazie
      const rg = ux.createRadialGradient(cx, gy0, 0, cx, gy0, rw2); rg.addColorStop(0, `rgba(4,6,22,${.42 * a})`); rg.addColorStop(.55, `rgba(4,6,22,${.28 * a})`); rg.addColorStop(1, 'rgba(4,6,22,0)');
      ux.save(); ux.translate(cx, gy0); ux.scale(1, gs * 1.5 / rw2); ux.translate(-cx, -gy0); ux.fillStyle = rg; ux.beginPath(); ux.arc(cx, gy0, rw2, 0, TAU); ux.fill(); ux.restore(); ux.globalCompositeOperation = pc7; }
    ux.shadowColor = 'rgba(2,4,20,.85)'; ux.shadowBlur = 5 * k; ux.globalCompositeOperation = 'source-over'; let nn = 0, gi = 0;
    for (let c = 0; c < 3; c++) { if (!tc3[c]) continue; const lit = Math.min(cr[c], tc3[c]);
      for (let q = 0; q < tc3[c]; q++) { const gx = x0 + nn * pitch + gi * gg, gy = gy0, ok = q < lit, pl = .5 + .5 * Math.sin(t * 2.6 + nn * .7);
        if (ok) { glow(gx, gy, gs * 1.5, HC.PRIM[c], .6 * a * ka); glyph(c, gx, gy, gs * 1.1, .98 * a * ka); }
        else { glow(gx, gy, gs * 1.2, HC.PRIM[c], (.1 + .12 * pl) * a * ka); glyph(c, gx, gy, gs * 1.1, (.42 + .3 * pl) * a * ka);
          ux.save(); ux.shadowBlur = 0; ux.setLineDash([3.5 * k, 4.5 * k]); ux.strokeStyle = rgba(mix3(HC.PRIM[c], [1, 1, 1], .35), (.4 + .45 * pl) * a); ux.lineWidth = 2 * k; ux.beginPath(); ux.arc(gx, gy, gs * (.95 + .06 * pl), 0, TAU); ux.stroke(); ux.restore(); }
        nn++; } gi++; }
    ux.shadowBlur = 0; ux.globalCompositeOperation = 'lighter'; }
  const gap = d === 0 ? 0 : .05 + Math.min(d, 3) * .06;
  const hO = { cx, cy, k, t, d, m, hp: G.heartPulse || 0, mc, tgt, slot: G.slotDisp, R: .016 * H * sz, satR: .052 * H * sz };
  drawHeart(a, hO, 0);
  fancyArc(cx, cy, rr, Math.PI / 2 + gap, Math.PI * 1.5 - gap, tgt, a, t, 7 * k);
  fancyArc(cx, cy, rr, -Math.PI / 2 + gap, Math.PI / 2 - gap, mc, a, t, 7 * k);
  // obieg światła po pierścieniu w chwili trafienia: jasny punkt okrąża pierścień raz i gaśnie (nagroda bez dźwięku)
  { const ma = t - (G.matchHit == null ? -9 : G.matchHit); if (ma >= 0 && ma < .9 && !reduceMotion) { const u = Math.min(1, ma / .7), e = 1 - (1 - u) * (1 - u), an = -Math.PI / 2 + e * TAU, fade = clamp(1 - (ma - .5) / .4, 0, 1), sweepCol = mix3(mc, [1, 1, 1], .5);
      ux.strokeStyle = rgba(mix3(mc, [1, 1, 1], .4), .22 * fade * a); ux.lineWidth = 2 * k; ux.beginPath(); ux.arc(cx, cy, rr, 0, TAU); ux.stroke();
      for (let i = 0; i < 7; i++) { const aa = an - i * .13, bx = cx + Math.cos(aa) * rr, by = cy + Math.sin(aa) * rr; glow(bx, by, (11 - i) * k, sweepCol, (1 - i / 8) * fade * a); }
      const hx = cx + Math.cos(an) * rr, hy = cy + Math.sin(an) * rr; glow(hx, hy, 15 * k, [1, 1, 1], fade * a); } }
  { const ma = t - (G.matchHit == null ? -9 : G.matchHit); if (ma >= 0 && ma < .4 && !reduceMotion) { const f = ma / .4; glow(cx, cy, rr * (.85 + f * 1.1), mix3(tgt, [1, 1, 1], .5), (1 - f) * .42 * a); } }      // oddech serca w chwili trafienia: jeden krótki puls jasności wzmacnia moment
  drawParts(0, a, 1);
  drawPulsGuide(a, cx, cy, k);
  drawHeart(a, hO, 1);
  if (puls && G.hits) for (const h of G.hits) { const age = t - h.t; if (age < 0 || age > .55) continue; const f = age / .55, rr2 = .07 * H * (1.1 + 1.3 * f), al = (1 - f) * (1 - f) * (h.gr === 2 ? 1 : h.gr === 1 ? .6 : .3);      // błysk dziury w takt dźwięku: jasny = idealnie
    ux.strokeStyle = rgba(mix3(h.col, [1, 1, 1], h.gr === 2 ? .35 : .1), al * a); ux.lineWidth = (h.gr === 2 ? 3.4 : h.gr === 1 ? 2.2 : 1.4) * k; ux.beginPath(); ux.arc(cx, cy, rr2, 0, TAU); ux.stroke(); }
  // postęp pokazuje sama czarna dziura (napełnia się barwą od brzegu, przy pełnym staje się pryzmatem)
  const prog = s.claim, ra = rr + 28 * k;
  // przejęcie: miękki błysk światła (bez kresek)
  const ct = t - G.claimT; if (ct < 2.2 && s.claimed) { const f = ct / 2.2; glow(cx, cy, rr * (2 + f * 5), [1, 1, 1], (1 - f) * .28 * a); }
  // seria: perełki
  const sr = Math.min(7, G.streak); for (let i = 0; i < sr; i++) { const an = -Math.PI / 2 - .5 + i * .16; glow(cx + Math.cos(an) * (ra + 16 * k), cy + Math.sin(an) * (ra + 16 * k), 6 * k, [1, .95, .8], .85 * a); }
  // przycisk wynurzenia (dotyk)
  if (touchDevice) { ux.strokeStyle = `rgba(230,236,255,${.55 * a})`; ux.lineWidth = 2 * k; ux.beginPath(); glow(40 * k + SAFE.l, 40 * k + SAFE.t, 30 * k, [.9, .93, 1], .35 * a); glow(40 * k + SAFE.l, 40 * k + SAFE.t, 11 * k, [1, 1, 1], .5 * a);
    ux.fillStyle = `rgba(240,244,255,${.9 * a})`; ux.font = `800 ${Math.max(26, Math.round(30 * k))}px Manrope, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle'; ux.fillText('‹', 40 * k + SAFE.l - 1 * k, 40 * k + SAFE.t - 3 * k); }
}

// ---------- cząstki obłoku ----------
const parts = [], bokeh = [];
for (let i = 0; i < 16; i++) bokeh.push({ x: Math.random(), y: Math.random(), r: .035 + Math.random() * .09, vx: (Math.random() - .5) * .006, vy: (Math.random() - .5) * .005, ph: Math.random() * 6.28 });
function rainbowRGB(u) { const h = (u % 1) * 6, f = h % 1, i = Math.floor(h); return mix3([[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i % 6], [.92, .9, 1], .2); }
// rozbłysk cząstek w pikselach (x,y), prędkość w H/s
function burst(x, y, c, n, sp, big) { if (reduceMotion) return; return burst_(x, y, c, n, sp, big); }
function burst_(x, y, col, n, speed, rainbowMode) {
  for (let i = 0; i < n; i++) { const an = Math.random() * TAU, v = speed * H * (.25 + Math.random() * .9);
    parts.push({ kind: 'b', x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: 0, max: .55 + Math.random() * .9, c: col, rb: rainbowMode ? Math.random() : -1, sz: .6 + Math.random() * 1.5 }); }
}
function streamAt(p, u, match) {                          // pozycja cząstki na wstędze port -> środek (z wirem przy dopasowaniu)
  const [px, py] = portPx(p.k), cx = W / 2, cy = H / 2;
  const e = u * u * (3 - 2 * u), ang = Math.atan2(cy - py, cx - px) + 1.5708, off = Math.sin(u * Math.PI) * p.wob * H + Math.sin(p.ph + u * 9) * (1 - e) * .010 * H;
  let x = lerp(px, cx, e) + Math.cos(ang) * off, y = lerp(py, cy, e) + Math.sin(ang) * off;
  if (match > .02) { const th = p.spin * u * u * 2.6 * match, dx = x - cx, dy = y - cy, cs = Math.cos(th), sn = Math.sin(th); x = cx + dx * cs - dy * sn; y = cy + dx * sn + dy * cs; }
  return [x, y, e];
}
function spawnParts(dt) {
  if (G.mode === 'sector' || (G.mode === 'dive' && G.diveT > .7)) {
    if (parts.length > 230) return;
    const rate = 38 * (1 + (G.matchSm || 0) * 1.1) * dt;
    for (let k = 0; k < 4; k++) { let n = rate / 4 + Math.random(); while (n-- > 1 && parts.length < 260) {
      parts.push({ kind: 's', k, u: 0, sp: .3 + Math.random() * .38, wob: (Math.random() - .5) * .24, ph: Math.random() * 6.28, sz: .95 + Math.random() * 1.6,
        spin: Math.random() < .5 ? 1 : -1, tail: .1 + Math.random() * .1, under: Math.random() < .5 }); } }
  } else if (parts.length < 150 && Math.random() < dt * 18) {
    const s = sectors[(Math.random() * sectors.length) | 0], c = s.col, m = Math.random();
    parts.push({ kind: 'd', x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .012, vy: (Math.random() - .5) * .008, life: 0, max: 7 + Math.random() * 7,
      c: [lerp(c[0], 1, .3), lerp(c[1], 1, .3), lerp(c[2], 1, .3)], z: .3 + m * .9, sz: .5 + m * 1.6 });
  }
}
function updateParts(dt) {
  spawnParts(dt);
  const inSec = G.mode === 'sector' || (G.mode === 'dive' && G.diveT > .7);
  G.heartPulse = (G.heartPulse || 0) * Math.exp(-5 * dt);
  for (const o of bokeh) { o.x += o.vx * dt; o.y += o.vy * dt; if (o.x < -.15) o.x = 1.15; if (o.x > 1.15) o.x = -.15; if (o.y < -.15) o.y = 1.15; if (o.y > 1.15) o.y = -.15; }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i];
    if (p.kind === 's') { p.u += dt * p.sp * (1 + (G.matchSm || 0) * .6); if (p.u >= 1) { G.heartPulse = Math.min(1, (G.heartPulse || 0) + .07); parts.splice(i, 1); } else if (!inSec && Math.random() < .08) parts.splice(i, 1); }
    else if (p.kind === 'b') { p.life += dt; const dr = Math.pow(.05, dt); p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life > p.max) parts.splice(i, 1); }
    else { p.life += dt; p.x += p.vx * dt * (1 + p.z); p.y += p.vy * dt * (1 + p.z); if (p.life > p.max || p.x < -.1 || p.x > 1.1 || p.y < -.1 || p.y > 1.1) parts.splice(i, 1); } }
}
function drawBokeh(secA) {
  if (secA < .02) return; const mc = mixNow();
  bokeh.forEach((o, i) => { const pl = .5 + .5 * Math.sin(G.t * .6 + o.ph), col = i % 3 === 0 ? mix3(mc, [1, 1, 1], .35) : i % 3 === 1 ? G.slotDisp[i % 4] : mc;
    const dr = reduceMotion ? 0 : (i % 2 ? 1 : -1), ox = o.x + Math.sin(G.t * .05 + o.ph) * .02 * dr, oy = o.y + Math.cos(G.t * .045 + o.ph * 1.3) * .016 * dr;      // powolny dryf (parallax): tło żyje bez kosztu; wyłączony przy „Ruch: ograniczony"
    const edge = sstep(.18, .5, Math.hypot((ox - .5) * 1.35, oy - .5));      // mgiełki na brzegach jaśniejsze: wypełniają ciemne boki (Fold, ekran poziomy) miękkim światłem zamiast pustki
    glow(ox * W, oy * H, o.r * H * (1 + edge * .55), col, (.055 + .07 * pl) * (1 + edge * 2.1) * secA); });
}
function drawParts(mapA, secA, pass) {                      // pass 1 = cząstki "nad" pierścieniami (rysowane po nich); 0 = reszta i cząstki "pod" (przygaszone na pierścieniu)
  const k = H / 1000, mc = mixNow(), match = G.matchSm || 0, over = pass === 1, t = G.t, cx = W / 2, cy = H / 2, rr = .125 * H * secZoom(), ra = rr + 28 * k;
  if (!over) drawBokeh(secA);
  ux.lineCap = 'round';
  for (const p of parts) {
    if (over ? (p.kind !== 's' || p.under) : (p.kind === 's' && !p.under)) continue;
    if (p.kind === 'd') { if (mapA < .02) continue; const f = Math.sin(Math.PI * p.life / p.max), a = f * .5 * mapA * p.z, x = p.x * W, y = p.y * H;
      glow(x, y, p.sz * k * 5, p.c, a * 1.4); }
    else if (p.kind === 'b') { const f = 1 - p.life / p.max, col = p.rb >= 0 ? rainbowRGB(p.rb) : p.c;
      ux.strokeStyle = rgba(col, f * .8); ux.lineWidth = p.sz * k * 1.6 * f; ux.beginPath(); ux.moveTo(p.x, p.y); ux.lineTo(p.x - p.vx * .045, p.y - p.vy * .045); ux.stroke();
      glow(p.x, p.y, p.sz * k * 7 * f, col, f * .8); }
    else { if (secA < .02) continue; const slot = G.slotDisp[p.k], N = 5, a = Math.sin(Math.PI * Math.min(1, p.u * 1.02)) * secA;
      const [hx, hy, he] = streamAt(p, p.u, match); let px = hx, py = hy;
      // "pod" pierścieniami: cząstka przygasa, gdy przechodzi przez obręcz
      const rh = .07 * H, att = (x, y) => { const d = Math.hypot(x - cx, y - cy), hz = clamp((d / rh - .6) / .6, 0, 1); if (!p.under) return hz; return hz * (1 - .8 * Math.exp(-Math.pow((d - rr) / (9 * k), 2)) - .6 * Math.exp(-Math.pow((d - ra) / (9 * k), 2))); };
      for (let j = 1; j <= N; j++) { const uj = Math.max(0, p.u - j * p.tail / N), [qx, qy, qe] = streamAt(p, uj, match), fr = 1 - j / (N + 1);
        ux.strokeStyle = rgba(mix3(slot, mc, qe), a * fr * .7 * att(qx, qy)); ux.lineWidth = p.sz * k * 2.4 * fr; ux.beginPath(); ux.moveTo(px, py); ux.lineTo(qx, qy); ux.stroke(); px = qx; py = qy; }
      const focal = 1 - .42 * clamp(Math.hypot(hx - cx, hy - cy) / (rr * 2.4) - .4, 0, 1);      // jedno ognisko: cząstki i iskry dalej od serca lekko ściszone
      const col = mix3(slot, mc, he), aa = a * att(hx, hy) * focal, pul = 1 + .22 * Math.sin(t * 7 + p.ph * 3), sh = rainbowRGB(p.ph * .16 + t * .35), sat = col.map(v => clamp(v * 1.2, 0, 1));
      glow(hx, hy, p.sz * k * 9, col, aa * 1.05);                                    // poświata w kolorze punktu
      glow(hx, hy, p.sz * k * 4.4 * pul, mix3(sat, sh, .42), aa * .95);              // mieniące się ciało (barwa pływa po tęczy)
      glow(hx, hy, p.sz * k * 1.9, mix3(sat, [1, 1, 1], .2), aa * .95);              // jądro: kolor punktu, nie biel
      { const oa = t * 6 + p.ph * 5, orr = p.sz * k * 3; glow(hx + Math.cos(oa) * orr, hy + Math.sin(oa) * orr, p.sz * k * 1.3, sh, aa * .55); }   // iskierka krążąca wokół (ściszona, mniej „sparku")
    }
  }
}

// serce sektora: sam kryształ (warstwy, bez obrysów) rysuje shader; tu aureola i satelity niosące mieszankę
// part: 0 = tył (aureola, satelity za kryształem), 1 = przód (satelity przed nim), brak = oba
function drawHeart(a, o, part) {
  const { cx, cy, k, t, d, m, hp, mc, tgt, slot } = o, R = (o.R || .03 * H) * (1 + m * .16 + hp * .22), Rs = R * 1.3;
  const back = part !== 1, front = part !== 0;
  if (back) {
    glow(cx, cy, R * 10, mc, (.06 + .08 * m) * a); glow(cx, cy, R * 4.6, mix3(mc, tgt, .4), (.04 + .06 * m + hp * .08) * a);
    const ph = ((puls ? pt() : t) / BEAT) % 1; glow(cx, cy, R * (3 + ph * 3.5), mc, (1 - ph) * (1 - ph) * .3 * a);
  }
  const prevOp = ux.globalCompositeOperation; ux.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const an = t * (.85 + .13 * i) + i * Math.PI / 2, z = Math.sin(an);
    if (z >= 0 ? !front : !back) continue;
    const rad = (o.satR ? o.satR * (1.6 - m * .55) : R * (2.35 - m * 1.55)) + Math.sin(t * 1.3 + i) * R * .12, col = slot[i];
    const dp = .78 + .22 * z, da = .62 + .38 * (z * .5 + .5);                       // głębia: tył mniejszy i ciemniejszy
    for (let j = 1; j <= 4; j++) { const a2 = an - j * .12, zz = Math.sin(a2), dj = .78 + .22 * zz;
      glow(cx + Math.cos(a2) * rad, cy + Math.sin(a2) * rad * .82, Rs * (.5 - j * .07) * dj, col, (.38 - j * .08) * a * da); }
    const sx = cx + Math.cos(an) * rad, sy = cy + Math.sin(an) * rad * .82, Rh = Rs * dp;
    const sh = rainbowRGB(t * .2 + i * .27), body = mix3(col, sh, .3), sat = col.map(v => clamp(v * 1.25, 0, 1));
    glow(sx, sy, Rh * 1.25, col, .8 * a * da);                                       // poświata w kolorze punktu
    glow(sx, sy, Rh * .7, mix3(sat, sh, .4 + .2 * Math.sin(t * 2.4 + i * 1.7)), .85 * a * da);   // mieniące się ciało
    glow(sx, sy, Rh * .3, mix3(body, [1, 1, 1], .28), .85 * a * da);                // jądro: kolor, nie biel
    const ph = (t * .9 + i * .25) % 1;                                              // rozchodzący się pierścień
    ux.strokeStyle = rgba(mix3(col, sh, .3), (1 - ph) * .5 * a * da); ux.lineWidth = 1.2 * k; ux.beginPath(); ux.arc(sx, sy, Rh * (.4 + ph * .95), 0, TAU); ux.stroke();
    for (let q = 0; q < 3; q++) { const sa = t * 5.5 + q * 2.094 + i, sr = Rh * (.62 + .12 * Math.sin(t * 3 + q)); glow(sx + Math.cos(sa) * sr, sy + Math.sin(sa) * sr, Rh * .16, rainbowRGB(t * .3 + q * .33 + i * .2), .75 * a * da); }
  }
  ux.globalCompositeOperation = prevOp;
}

// ---------- samouczek ----------
const TUT = { on: false, slide: 0, t0: 0, sl: -1, ports: [0, 0, 1, 1], pt: [-9, -9, -9, -9], did: 0, nudge: -9 };      // ports/pt/did: własny stan punktów gracza na slajdach interaktywnych
const TUT_KEY = 'harvester-tut-v2', TUT_N = 6, SLIDE_MAP = [0, 1, 2, 3, 5, 4];      // slajdy: światło, cztery punkty, cel, szturchnięcie, złota iskra, mapa
const RN = ['czerwień', 'pomarańcz', 'żółć', 'limonka', 'zieleń', 'mięta', 'turkus', 'azur', 'błękit', 'fiolet', 'magenta', 'róż'];
const PN = ['czerwień', 'zieleń', 'błękit'];
function recipeName(n) { const kmin = Math.min(n[0], n[1], n[2]), m = [n[0] - kmin, n[1] - kmin, n[2] - kmin];
  if (!(m[0] + m[1] + m[2])) return 'perła'; const nm = RN[Math.round(HC.ringIndex(m)) % 12]; return kmin ? 'jasna ' + nm : nm; }
function tutSeen() { try { return !!localStorage.getItem(TUT_KEY); } catch (e) { return false; } }
function tutStart() { if (TUT.on) return; TUT.on = true; TUT.slide = 0; TUT.sl = -1; TUT.t0 = G.t; G.mode = 'map'; G.diveT = 0; keys.clear(); }
function tutEnd() { TUT.on = false; try { localStorage.setItem(TUT_KEY, '1'); } catch (e) {} }
// slajdy 2 i 3 (cztery punkty, cel) są interaktywne: gracz sam naciska punkty, a dopiero potem "dalej"; reszta to pokaz
function tutInter() { const s = SLIDE_MAP[TUT.slide]; return s === 1 || s === 2; }
function tutPress(p, dir) { TUT.ports[p] = (TUT.ports[p] + dir) % 3; TUT.pt[p] = G.t; TUT.did++; if (window.Audio2 && Audio2.ui) Audio2.ui('hover'); buzz(8); }
function tutNext() {
  if (G.t - TUT.t0 < .5) return;
  if (tutInter() && !TUT.did && G.t - TUT.t0 < 14) { TUT.nudge = G.t; return; }      // najpierw sam wypróbuj (po 14 s puszczamy, żeby nikt nie utknął)
  if (TUT.slide >= TUT_N - 1) { tutEnd(); return; } TUT.slide++; TUT.t0 = G.t;
}
function tutBack() { if (TUT.slide > 0) { TUT.slide--; TUT.t0 = G.t; } }
function tutKey(e) {
  if (e.code === 'Escape') { tutEnd(); e.preventDefault(); return; }
  const inter = tutInter();
  if (inter && e.code in KEYPORT) { if (!e.repeat) tutPress(KEYPORT[e.code], e.shiftKey ? 2 : 1); e.preventDefault(); return; }
  if (e.code === 'Space' || e.code === 'Enter' || (!inter && e.code === 'ArrowRight')) { if (!e.repeat) tutNext(); e.preventDefault(); }
  if (e.code === 'Backspace' || (!inter && e.code === 'ArrowLeft')) { if (!e.repeat) tutBack(); e.preventDefault(); }
}
function tutPointer(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const k = H / 1000, px = e.clientX * DPR, py = e.clientY * DPR;
  if (px > W - 150 * k - SAFE.r && py < 80 * k + SAFE.t) { tutEnd(); return; }
  if (tutInter()) { const R = Math.min(.19 * H, .3 * W); for (let p = 0; p < 4; p++) if (Math.hypot(px - (W / 2 + DIRS[p][0] * R), py - (H * .5 - DIRS[p][1] * R)) < Math.max(.075 * H, 56 * DPR)) { tutPress(p, 1); return; } }
  tutNext();
}
function tutText(str, x, y, size, color, weight, maxW) {
  ux.font = `${weight || 400} ${Math.round(size)}px Manrope, ui-sans-serif, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle';
  const words = str.split(' '), lines = []; let line = '';
  for (const w of words) { const test = line ? line + ' ' + w : w; if (ux.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  lines.push(line); ux.fillStyle = color; lines.forEach((l, i) => ux.fillText(l, x, y + (i - (lines.length - 1) / 2) * size * 1.32));
}
function keycap(x, y, label, press, a, k, wide) {
  const s = 17 * k, sw = s * (wide || 1), pr = clamp(press, 0, 1), prevOp = ux.globalCompositeOperation; ux.globalCompositeOperation = 'source-over';
  ux.fillStyle = `rgba(20,28,70,${(.55 + .3 * pr) * a})`; ux.strokeStyle = `rgba(210,220,255,${(.45 + .5 * pr) * a})`; ux.lineWidth = 1.6 * k;
  ux.beginPath(); ux.roundRect ? ux.roundRect(x - sw, y - s + pr * 2 * k, sw * 2, s * 2, 6 * k) : ux.rect(x - sw, y - s, sw * 2, s * 2); ux.fill(); ux.stroke();
  ux.fillStyle = `rgba(240,244,255,${(.8 + .2 * pr) * a})`; ux.font = `600 ${Math.round(16 * k)}px Manrope, ui-sans-serif, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle'; ux.fillText(label, x, y + 1 + pr * 2 * k);
  ux.globalCompositeOperation = prevOp; if (pr > .02) glow(x, y, 46 * k, [.8, .88, 1], .35 * pr * a);
}
// znak wciśnięcia w pokazie: z klawiaturą klawisz (wciska się), z palcem dotyk (pierścień rozchodzi się od palca); pr = 0..1 przebieg wciśnięcia
function pressMark(x, y, label, pr, a, k, wide) {
  if (!touchDevice) { keycap(x, y, label, pr > 0 ? Math.sin(Math.PI * clamp(pr, 0, 1)) : 0, a, k, wide); return; }
  if (pr <= 0 || pr >= 1) return;
  const pc = ux.globalCompositeOperation; ux.globalCompositeOperation = 'lighter';
  glow(x, y, 20 * k, [.9, .94, 1], .5 * a * Math.sin(Math.PI * pr));
  ux.strokeStyle = `rgba(235,240,255,${(1 - pr) * .8 * a})`; ux.lineWidth = 2.4 * k; ux.beginPath(); ux.arc(x, y, (16 + 34 * pr) * k, 0, TAU); ux.stroke();
  ux.globalCompositeOperation = pc;
}
function demoOrb(x, y, ro, col, fx, a, glyphIdx, t, p, k) {
  glow(x, y, ro * 3.2, col, (.55 + fx * .5) * a);
  ux.strokeStyle = rgba(mix3(col, [1, 1, 1], .35), (.75 + .25 * fx) * a); ux.lineWidth = 2 * k; ux.beginPath(); ux.arc(x, y, ro, 0, TAU); ux.stroke();
  const gr = ux.createRadialGradient(x, y, 0, x, y, ro); gr.addColorStop(0, rgba(mix3(col, [1, 1, 1], .65), a)); gr.addColorStop(.7, rgba(col, .85 * a)); gr.addColorStop(1, rgba(col, .2 * a));
  ux.fillStyle = gr; ux.beginPath(); ux.arc(x, y, ro * .88, 0, TAU); ux.fill(); glyph(glyphIdx, x, y, ro, .32 * a);
  for (let i = 0; i < 3; i++) { const rad = ro * (1.45 + i * .34), st = t * (1.1 + i * .35) * (p % 2 ? -1 : 1) + i * 2.1 + p; ux.strokeStyle = rgba(mix3(col, [1, 1, 1], .4), (.5 - i * .13) * a); ux.lineWidth = (2.2 - i * .5) * k; ux.beginPath(); ux.arc(x, y, rad, st, st + 1.5 - i * .35); ux.stroke(); }
}
// układ demonstracyjny: 4 punkty, wstęgi, kryształ; stany ports = [0|1|2 x4]
function demoPorts(a, k, t, cx, cy, R, ports, fxArr, tgt, mClose, hp) {
  const cnt = counts(ports), mc = HC.mixColor(cnt), cols = ports.map(p => HC.PRIM[p]);
  TUT.demo = { slot: cols, fx: fxArr, mix: mc, match: mClose, portR: R / H };       // orby i środek rysuje prawdziwy shader
  for (let p = 0; p < 4; p++) { const px = cx + DIRS[p][0] * R, py = cy - DIRS[p][1] * R;
    for (let i = 0; i < 6; i++) { const u = ((t * .42 + i / 6 + p * .13) % 1), e = u * u * (3 - 2 * u), x = lerp(px, cx, e), y = lerp(py, cy, e), c = mix3(cols[p], mc, e), al = Math.sin(Math.PI * u) * .9 * a;
      glow(x, y, 7 * k, c, al); glow(x, y, 2.4 * k, [1, 1, 1], al * .8); }
    glow(px, py, .036 * H * 3.4, cols[p], (.5 + fxArr[p] * .6) * a); }
  drawHeart(a, { cx, cy, k, t, d: tgt ? HC.dist(cnt, tgt.r) : 0, m: mClose, hp: hp || 0, mc, tgt: tgt ? tgt.c : mc, slot: cols, R: .016 * H, satR: .052 * H });
  return { cnt, mc };
}
// teksty zależą od ostatniego użytego wejścia (klawisze i mysz albo palec); jedna rzecz na slajd, zwykłe słowa
function slideText(s) {
  const T = touchDevice;
  if (s === 0) return { title: 'Światło się dodaje', sub: 'Gaz świeci, więc barwy łączą się jak światło: czerwień i zieleń dają żółć, a wszystkie trzy dają biel.' };
  if (s === 1) return { title: 'Cztery punkty, jeden kolor w środku', sub: 'Każdy punkt ma barwę: czerwoną, zieloną albo niebieską. Naciśnięcie zmienia ją na następną: czerwień → zieleń → błękit → czerwień.' + (T ? '' : ' Shift cofa.'),
    ctl: T ? 'Wypróbuj: dotknij punktu' : 'Wypróbuj: naciśnij W, A, S lub D (albo strzałkę, albo kliknij punkt)' };
  if (s === 2) return { title: 'Zrób kolor celu', sub: 'Lewa połowa pierścienia to cel, prawa to Twoja mieszanka. Zrównaj je, a dziura napełni się światłem.',
    ctl: T ? 'Dotknij dolnego i lewego punktu' : 'Naciśnij S i A, żeby zielone punkty zmienić na niebieskie' };
  if (s === 3) return { title: 'Gaz przemalowuje punkty', sub: 'Nad punktem rośnie łuk w kolorze, na jaki gaz go zmieni. Gdy łuk się zamknie, punkt zmienia barwę. Nic nie trzymasz: ' + (T ? 'dotknij tego punktu' : 'naciśnij ten punkt') + ', aż kolor znów pasuje do celu. Szybka poprawka buduje serię, spóźnienie kosztuje niewiele.',
    ctl: T ? 'W grze: łuk się zamknął, dotknij tego punktu (zaraz po albo jeszcze przed)' : 'W grze: łuk się zamknął, naciśnij klawisz tego punktu (zaraz po albo jeszcze przed)' };
  if (s === 5) return { title: 'Złota iskra to bonus', sub: 'Gdy pierścień złotej iskry dotknie punktu, ' + (T ? 'dotknij go.' : 'naciśnij strzałkę lub Spację (punkty zmieniasz wtedy literami).') + ' Dziura napełni się szybciej. Pominięcie iskry nic nie kosztuje.',
    ctl: T ? 'W grze: dotknij punktu, gdy pierścień go dotknie' : 'W grze: strzałka albo Spacja, gdy pierścień dotknie punktu' };
  return { title: 'Wybierz dziurę', sub: (T ? 'Dotknij jasnej dziury, żeby w nią wejść. ' : 'Kliknij jasną dziurę (albo strzałki i Enter), żeby w nią wejść. Esc wraca z dziury na mapę. ') + 'Ciemne dziury odblokujesz, zalewając sąsiednie.' };
}
// znaki punktów w pokazie: klawisze W D S A (komputer) albo pierścienie dotyku na samych punktach (telefon); dopóki gracz nic nie nacisnął, wskazane punkty pulsują
function tutMarks(list, a, k, cx, cy, R, t, only) {
  list.forEach(([lb, p]) => {
    const pr = clamp((t - TUT.pt[p]) / .45, 0, 1), on = pr > 0 && pr < 1, hint = !TUT.did && (!only || only.includes(p)), pl = .5 + .5 * Math.sin(t * 4.5), ro = R + (touchDevice ? 0 : .07 * H);
    const px = cx + DIRS[p][0] * ro, py = cy - DIRS[p][1] * ro;
    if (hint) { const pc = ux.globalCompositeOperation; ux.globalCompositeOperation = 'lighter'; glow(px, py, (touchDevice ? 46 : 34) * k, [1, .9, .6], (.16 + .26 * pl) * a); ux.globalCompositeOperation = pc;
      if (touchDevice) { ux.strokeStyle = `rgba(255,236,190,${(.3 + .4 * pl) * a})`; ux.lineWidth = 2 * k; ux.beginPath(); ux.arc(px, py, (30 + 6 * pl) * k, 0, TAU); ux.stroke(); } }
    pressMark(px, py, lb, on ? pr : 0, a, k);
  });
}
function drawTut() {
  const t = G.t, tt = t - TUT.t0, k = H / 1000, cx = W / 2, cy = H * .5, R = Math.min(.19 * H, .3 * W), a = clamp(tt / .7, 0, 1), s = SLIDE_MAP[TUT.slide];
  TUT.demo = null;
  if (TUT.sl !== TUT.slide) { TUT.sl = TUT.slide; TUT.ports = [0, 0, 1, 1]; TUT.pt = [-9, -9, -9, -9]; TUT.did = 0; TUT.matchT = 0; }
  ux.globalCompositeOperation = 'source-over'; ux.fillStyle = 'rgba(4,6,22,.6)'; ux.fillRect(0, 0, W, H);
  ux.globalCompositeOperation = 'lighter';
  const L = (u, from, to) => clamp((u - from) / (to - from), 0, 1);
  if (s === 0) {                                  // diagram Venna: trzy podstawowe, pary i wszystkie
    const r = Math.min(.17 * H, .2 * W), ap = sstep(0, 1.4, tt), d = r * .62 * ap, phase = Math.floor(tt / 2.6) % 4, hl = [[0, 1], [1, 2], [2, 0], [0, 1, 2]][phase], cyv = H * .5;
    const pos = [[0, -1], [.866, .5], [-.866, .5]].map(v => [cx + v[0] * d, cyv + v[1] * d]);
    for (let i = 0; i < 3; i++) lightDisc(pos[i][0], pos[i][1], r, HC.PRIM[i], hl.includes(i) ? 1 : 0, a, k);
    const rec = [0, 0, 0]; hl.forEach(i => rec[i] = 1); const mcol = HC.mixColor(rec), mx = hl.reduce((q, i) => q + pos[i][0], 0) / hl.length, my = hl.reduce((q, i) => q + pos[i][1], 0) / hl.length;
    glow(mx, my, r * .62, mcol, .5 * a * ap); glow(mx, my, r * .19, mix3([1, 1, 1], mcol, .3), .42 * a * ap); flare(mx, my, r * 1.3, mix3(mcol, [1, 1, 1], .5), .5 * a * ap);      // rdzeń lekko stonowany, nie przepalony na czysto biały
    const ph2 = (tt % 2.6) / 2.6, fa = a * Math.min(1, ph2 * 6, (1 - ph2) * 6 + .3);
    ux.globalCompositeOperation = 'source-over'; tutText(hl.map(i => PN[i]).join(' + ') + ' = ' + recipeName(rec), cx, cyv + r * 1.75, 26 * k, rgba(mix3(mcol, [1, 1, 1], .35), fa), 800, W * .86);
  } else if (s === 1) {                           // cztery punkty: gracz sam przestawia punkty (klawisz, klik albo dotyk)
    const ports = TUT.ports, fx = [0, 1, 2, 3].map(p => Math.max(0, 1 - (t - TUT.pt[p]) / .45));
    const { cnt, mc } = demoPorts(a, k, t, cx, cy, R, ports, fx, null, 0, 0);
    tutMarks([['W', 0], ['D', 1], ['S', 2], ['A', 3]], a, k, cx, cy, R, t);
    ux.globalCompositeOperation = 'source-over'; const eq = [0, 1, 2].filter(i => cnt[i]).map(i => cnt[i] + '× ' + PN[i]).join(' + ') + ' → ' + recipeName(cnt);
    tutText(eq, cx, cy + R + .105 * H, 24 * k, rgba(mix3(mc, [1, 1, 1], .35), a), 600, W * .9);
  } else if (s === 2) {                           // cel: magenta (2,0,2); gracz zamienia zielone punkty (S i A) na błękitne
    const ports = TUT.ports, tr = [2, 0, 2], tc = HC.mixColor(tr), cnt = counts(ports), dd = HC.dist(cnt, tr);
    if (dd === 0 && !TUT.matchT) TUT.matchT = t; else if (dd > 0) TUT.matchT = 0;
    const mu = TUT.matchT ? t - TUT.matchT : -1, mt = mu >= 0 ? sstep(0, .8, mu) : 0, hp = mu >= 0 && mu < .6 ? 1 - mu / .6 : 0, fx = [0, 1, 2, 3].map(p => Math.max(0, 1 - (t - TUT.pt[p]) / .45));
    const { mc } = demoPorts(a, k, t, cx, cy, R, ports, fx, { r: tr, c: tc }, mt, hp);
    const rr = .125 * H, gap = dd === 0 ? 0 : .05 + Math.min(dd, 3) * .06;
    fancyArc(cx, cy, rr, Math.PI / 2 + gap, Math.PI * 1.5 - gap, tc, a, t, 7 * k); fancyArc(cx, cy, rr, -Math.PI / 2 + gap, Math.PI / 2 - gap, mc, a, t, 7 * k);
    const prog = mu >= 0 ? clamp((mu - .6) / 4.5, 0, 1) : 0, ra = rr + 24 * k, n = 54; ux.lineCap = 'butt'; ux.lineWidth = 4 * k; ux.strokeStyle = rgba(tc, .16 * a); ux.beginPath(); ux.arc(cx, cy, ra, 0, TAU); ux.stroke();
    for (let i = 0; i < n * prog; i++) { const a0 = -Math.PI / 2 + i / n * TAU; ux.strokeStyle = rainbow(i / n + t * .05, .85 * a); ux.beginPath(); ux.arc(cx, cy, ra, a0, a0 + TAU / n * 1.25); ux.stroke(); }
    if (mu >= 0 && mu < .9) { const f = mu / .9; glow(cx, cy, rr * (1.6 + f * 2.4), [1, 1, 1], (1 - f) * (1 - f) * .35 * a); }
    tutMarks([['W', 0], ['D', 1], ['S', 2], ['A', 3]], a, k, cx, cy, R, t, [2, 3]);
    ux.globalCompositeOperation = 'source-over';
    tutText(dd === 0 ? 'Dopasowane! Trzymaj kolor' : !TUT.did ? 'Cel: ' + recipeName(tr) : 'Zmieniaj punkty, aż połówki się zrównają', cx, cy + R + .105 * H, 26 * k, rgba(mix3(dd === 0 ? mc : tc, [1, 1, 1], .35), a), 600, W * .9);
  } else if (s === 3) {                           // szturchnięcie: ostrzeżenie, zmiana, poprawka dwoma naciśnięciami
    const u = tt % 9, tr = [2, 0, 2], tc = HC.mixColor(tr);
    const ports = u < 2.6 ? [0, 0, 2, 2] : u < 4.0 ? [1, 0, 2, 2] : u < 4.5 ? [2, 0, 2, 2] : [0, 0, 2, 2];
    const warn = u > 1 && u < 2.6 ? (u - 1) / 1.6 : 0, hit = u >= 2.6 && u < 3.1 ? 1 - (u - 2.6) / .5 : 0, p1 = u >= 4.0 && u < 4.4 ? (u - 4) / .4 : 0, p2 = u >= 4.5 && u < 4.9 ? (u - 4.5) / .4 : 0;
    const cnt = counts(ports), dd = HC.dist(cnt, tr), mt = dd === 0 ? .9 : 0, fx = [hit || (p1 ? 1 - p1 : 0) || (p2 ? 1 - p2 : 0), 0, 0, 0];
    const { mc } = demoPorts(a, k, t, cx, cy, R, ports, fx, { r: tr, c: tc }, mt, u > 4.5 && u < 5.1 ? 1 : 0);
    if (warn > 0 || hit > 0) { const px = cx, py = cy - R, nw = HC.PRIM[1], fr = warn > 0 ? warn : 1, rw = .034 * H * 1.8;      // łuk zapowiedzi w NOWYM kolorze: rośnie od góry po obwodzie, przy zamknięciu punkt zmienia barwę
      glow(px, py, .034 * H * 3.4, nw, (.25 + .4 * fr) * a * (hit > 0 ? hit : 1));
      ux.lineCap = 'round'; ux.strokeStyle = rgba(nw, .22 * a); ux.lineWidth = 4 * k; ux.beginPath(); ux.arc(px, py, rw, 0, TAU); ux.stroke();
      ux.strokeStyle = rgba(mix3(nw, [1, 1, 1], .3), .95 * a); ux.lineWidth = 5.5 * k; ux.beginPath(); ux.arc(px, py, rw, -Math.PI / 2, -Math.PI / 2 + TAU * fr); ux.stroke(); ux.lineCap = 'butt'; }
    const rr = .125 * H, gap = dd === 0 ? 0 : .05 + Math.min(dd, 3) * .06;
    fancyArc(cx, cy, rr, Math.PI / 2 + gap, Math.PI * 1.5 - gap, tc, a, t, 7 * k); fancyArc(cx, cy, rr, -Math.PI / 2 + gap, Math.PI / 2 - gap, mc, a, t, 7 * k);
    ux.lineCap = 'butt'; ux.lineWidth = 4 * k; for (let i = 0; i < 54 * .55; i++) { ux.strokeStyle = rainbow(i / 54 + t * .05, .8 * a); ux.beginPath(); ux.arc(cx, cy, rr + 24 * k, -Math.PI / 2 + i / 54 * TAU, -Math.PI / 2 + i / 54 * TAU + TAU / 54 * 1.25); ux.stroke(); }
    const streak = u > 5 ? 2 : 0; for (let i = 0; i < streak; i++) glow(cx + Math.cos(-Math.PI / 2 - .5 + i * .16) * (rr + 38 * k), cy + Math.sin(-Math.PI / 2 - .5 + i * .16) * (rr + 38 * k), 6 * k, [1, .95, .8], .85 * a);
    [['W', 0, p1 || p2 || 0], ['D', 1, 0], ['S', 2, 0], ['A', 3, 0]].forEach(([lb, p, pr]) => { const px = cx + DIRS[p][0] * (R + .07 * H), py = cy - DIRS[p][1] * (R + .07 * H); pressMark(px, py, lb, pr, a, k); });
    ux.globalCompositeOperation = 'source-over';
    tutText(warn > 0 ? '1. Łuk rośnie: ten punkt zaraz zmieni się na zielony' : u >= 2.6 && u < 4.0 ? '2. Łuk się zamknął: punkt zmienił kolor' : u >= 4.0 && u < 4.9 ? '3. Naciskasz ten punkt, aż kolor znów pasuje' : u >= 4.9 ? 'Idealnie. Seria rośnie' : 'Dopasowane', cx, cy + R + .105 * H, 24 * k, `rgba(240,244,255,${a})`, 600, W * .9);
  } else if (s === 5) {                           // złota iskra (bonus): pierścień kurczy się do punktu, w chwili zetknięcia naciskasz; dziura napełnia się szybciej
    const u = tt % 6.5, tr = [2, 0, 2], tc = HC.mixColor(tr), ports = [0, 0, 2, 2], ring = u < 3 ? 1 - u / 3 : 0, cp = u >= 3 && u < 3.5 ? (u - 3) / .5 : 0, got = u >= 3.1 ? clamp((u - 3.1) / .5, 0, 1) : 0;
    const { mc } = demoPorts(a, k, t, cx, cy, R, ports, [cp ? 1 - cp : 0, 0, 0, 0], { r: tr, c: tc }, .9, u > 3.1 && u < 3.8 ? 1 : 0);
    const rr = .125 * H; fancyArc(cx, cy, rr, Math.PI / 2, Math.PI * 1.5, tc, a, t, 7 * k); fancyArc(cx, cy, rr, -Math.PI / 2, Math.PI / 2, mc, a, t, 7 * k);
    const px = cx, py = cy - R, ro = .036 * H, gold = [1, .86, .5];
    if (u < 3.4) { const rad = ro * (1.1 + 2.7 * ring * ring), pl = .6 + .4 * Math.sin(t * 9);
      ux.strokeStyle = rgba(gold, (.4 + .55 * (1 - ring)) * a); ux.lineWidth = 3 * k; ux.beginPath(); ux.arc(px, py, rad, 0, TAU); ux.stroke();
      glow(px, py, ro * 1.5, gold, (.35 + .4 * pl) * a); glow(px, py, ro * .5, [1, .97, .85], .9 * a); }
    if (u >= 3 && u < 4.4) { const f = (u - 3) / 1.4; glow(px, py, ro * (1.6 + 3.4 * f), gold, (1 - f) * (1 - f) * .75 * a); glow(px, py, ro * 1.4, [1, 1, 1], (1 - f) * .5 * a); }
    if (touchDevice) pressMark(px, py, '', cp, a, k); else pressMark(px, py - .075 * H, '↑', cp, a, k);
    ux.globalCompositeOperation = 'source-over';
    tutText(u < 3 ? 'Pierścień się kurczy…' : u < 3.5 ? 'Teraz!' : 'Złapana. Dziura napełnia się szybciej', cx, cy + R + .105 * H, 26 * k, rgba(mix3(got > .1 ? gold : mc, [1, 1, 1], .3), a), 600, W * .9);
  } else {                                        // mapa: prawdziwy statek (rtęć, ślad), ciężki lot po własnym sektorze
    drawMapUi(a * .9);
  }
  // nagłówek, opis, nawigacja
  ux.globalCompositeOperation = 'source-over';
  const sl = slideText(s);
  if (s === 0) drawTitle('HARV', cx, H * .13, Math.min(.085 * H, .15 * W), a, t); else
  tutText(sl.title, cx, H * .1, Math.min(36 * k, W * .07), `rgba(244,246,255,${a})`, 800, W * .92);
  if (sl.ctl) { const fl = clamp(1 - (t - TUT.nudge) / 1.2, 0, 1); tutText(sl.ctl, cx, H * .175, Math.max(16, 20 * k) * (1 + .06 * fl), `rgba(255,${236 + 19 * fl | 0},${190 + 50 * fl | 0},${(.95 + .05 * fl) * a})`, 700, W * .92); }      // jak to zrobić: ciepły napis tuż pod tytułem, mruga przy próbie pójścia dalej bez wypróbowania
  tutText(sl.sub, cx, H * .85 - SAFE.b, Math.max(18 * k, 16), `rgba(214,222,250,${.95 * a})`, 500, Math.min(W * .88, 820 * k));
  for (let i = 0; i < TUT_N; i++) { ux.fillStyle = i === TUT.slide ? `rgba(244,246,255,${.9 * a})` : `rgba(160,172,230,${.35 * a})`; ux.beginPath(); ux.arc(cx + (i - (TUT_N - 1) / 2) * 18 * k, H * .952 - SAFE.b, (i === TUT.slide ? 4.5 : 3.2) * k, 0, TAU); ux.fill(); }
  const pulse = .78 + .2 * Math.sin(t * 3), inter = tutInter(), last = TUT.slide === TUT_N - 1;
  tutText(touchDevice ? (last ? 'Dotknij tła, aby zacząć' : inter && !TUT.did ? 'Najpierw wypróbuj, potem dotknij tła' : 'Dotknij tła, aby iść dalej') : last ? 'Spacja — zaczynamy  ·  Backspace — wstecz' : inter ? (TUT.did ? 'Spacja — dalej' : 'Najpierw wypróbuj, potem Spacja — dalej') + '  ·  Backspace — wstecz  ·  Esc — pomiń' : 'Spacja albo klik — dalej  ·  ← wstecz  ·  Esc — pomiń', cx, H * .982 - SAFE.b, Math.max(15, 16 * k), `rgba(200,210,255,${pulse * a})`, 500, W * .96);
  tutText('Pomiń', W - 62 * k - SAFE.r, 40 * k + SAFE.t, Math.max(15, 16 * k), `rgba(205,214,255,${.85 * a})`, 600, 200 * k);
}


// ---------- menu ----------
const MENU = { on: false, sel: 0, t0: 0, pt: 0, confirm: 0, rects: [], page: 'main' };      // dwie strony: główna (graj, jak grać, dźwięk, ustawienia) i ustawienia
function menuItems() {
  const prog = sectors.some(s => s.claim > 0) || WORLD > 0, muted = window.Audio2 && Audio2.isMuted();
  if (MENU.page === 'settings') {
    const it = [{ id: 'puls', label: 'Tryb', val: pulsMode === 2 ? 'Puls pełny' : pulsMode === 1 ? 'Puls łagodny' : 'Spokojny' }, ...(puls ? [{ id: 'cal', label: 'Kalibracja dźwięku', val: calMs + ' ms' }] : []),
      { id: 'calm', label: 'Tempo', val: calm ? 'spokojne' : 'normalne' }, { id: 'lim', label: 'Limit czasu', val: calm ? 'brak (spokojne)' : timeLimit ? 'włączony' : 'wyłączony' },
      { id: 'rm', label: 'Ruch', val: reduceMotion ? 'ograniczony' : 'pełny' }, { id: 'cb', label: 'Daltonizm', val: cbMode ? 'włączony' : 'wyłączony' }];
    if (prog) it.push({ id: 'new', label: MENU.confirm > G.t ? 'Na pewno? Skasuj postęp' : 'Nowa gra' });
    it.push({ id: 'back', label: 'Wróć' });
    return it;
  }
  const it = [{ id: 'play', label: G.started ? 'Wznów' : prog ? 'Kontynuuj' : 'Graj' }, { id: 'tut', label: 'Jak grać' }, { id: 'snd', label: 'Dźwięk', val: muted ? 'wyłączony' : 'włączony' }, { id: 'set', label: 'Ustawienia' }];
  if (sectors.every(s => s.claimed)) it.unshift({ id: 'next', label: 'Następna mgławica' });
  if (canInstall()) it.push({ id: 'inst', label: isIOS ? 'Dodaj do ekranu głównego' : 'Zainstaluj aplikację' });
  return it;
}
function menuPage(p) { MENU.page = p; MENU.sel = p === 'main' ? Math.max(0, menuItems().findIndex(q => q.id === 'set')) : 0; MENU.pt = G.t; MENU.confirm = 0; }
function menuOpen() { if (G.mode !== 'map' || TUT.on) return; try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {} MENU.on = true; MENU.page = 'main'; MENU.sel = 0; MENU.t0 = G.t; MENU.pt = G.t; keys.clear(); ptr.down = false; if (window.Audio2) Audio2.menu(true); }
function menuClose() { MENU.on = false; MENU.page = 'main'; G.started = true; keepAwake(); if (window.Audio2) Audio2.menu(false); }
function menuAct(id) {
  if (window.Audio2) Audio2.ui(id === 'play' ? 'select' : 'select');
  if (id === 'set') menuPage('settings');
  else if (id === 'back') menuPage('main');
  else if (id === 'play') { menuClose(); if (!tutSeen() && !sectors.some(s => s.claimed)) tutStart(); }
  else if (id === 'tut') { menuClose(); tutStart(); }
  else if (id === 'inst') installAction();
  else if (id === 'puls') { pulsMode = (pulsMode + 1) % 3; puls = pulsMode > 0; try { localStorage.setItem('harv-puls', String(pulsMode)); } catch (e) {} }
  else if (id === 'cal') calStart();
  else if (id === 'lim') { if (!calm) { timeLimit = !timeLimit; try { localStorage.setItem('harv-limit', timeLimit ? '1' : '0'); } catch (e) {} } }
  else if (id === 'calm') { calm = !calm; try { localStorage.setItem('harv-calm', calm ? '1' : '0'); } catch (e) {} }
  else if (id === 'next') { menuClose(); nextWorld(); }
  else if (id === 'rm') { reduceMotion = !reduceMotion; try { localStorage.setItem('harv-rm', reduceMotion ? '1' : '0'); } catch (e) {} }
  else if (id === 'cb') { cbMode = !cbMode; try { localStorage.setItem('harv-cb', cbMode ? '1' : '0'); } catch (e) {} }
  else if (id === 'snd') { if (window.Audio2) { const m = Audio2.toggle(); try { localStorage.setItem('harv-mute', m ? '1' : '0'); } catch (e) {} } }
  else if (id === 'new') { if (MENU.confirm > G.t) { noSave = true; try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); } else MENU.confirm = G.t + 3.2; }
}
function menuKey(e) {
  if (CAL.on) { if (e.code === 'Escape') CAL.on = false; else if (!e.repeat) calTap(); e.preventDefault(); return; }
  if (MENU.sheet) { MENU.sheet = null; e.preventDefault(); return; }
  const n = menuItems().length;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { MENU.sel = (MENU.sel + n - 1) % n; if (window.Audio2) Audio2.ui('hover'); e.preventDefault(); }
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') { MENU.sel = (MENU.sel + 1) % n; if (window.Audio2) Audio2.ui('hover'); e.preventDefault(); }
  else if (e.code === 'Enter' || e.code === 'Space') { menuAct(menuItems()[MENU.sel].id); e.preventDefault(); }
  else if ((e.code === 'Escape' || e.code === 'Backspace') && MENU.page !== 'main') { menuPage('main'); if (window.Audio2) Audio2.ui('back'); e.preventDefault(); }
  else if (e.code === 'Escape' && G.started) { menuClose(); if (window.Audio2) Audio2.ui('back'); }
  else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && menuItems()[MENU.sel].val && menuItems()[MENU.sel].id !== 'snd') { menuAct(menuItems()[MENU.sel].id); e.preventDefault(); }
  else if (e.code === 'KeyM') menuAct('snd');
}
function menuHit(e) { const px = e.clientX * DPR, py = e.clientY * DPR; for (let i = 0; i < MENU.rects.length; i++) { const r = MENU.rects[i]; if (px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]) return i; } return -1; }
function menuHover(e) { const i = menuHit(e); if (i >= 0 && i !== MENU.sel) { MENU.sel = i; if (window.Audio2) Audio2.ui('hover'); } }
function menuPointer(e) { if (CAL.on) { calTap(); return; } if (MENU.sheet) { MENU.sheet = null; return; } const i = menuHit(e); if (i >= 0) { MENU.sel = i; menuAct(menuItems()[i].id); } }

function flare(x, y, size, col, a) {                       // anamorficzne smugi (pozioma i pionowa) jak w obiektywie
  ux.save(); ux.translate(x, y); ux.scale(1, .06); glow(0, 0, size, col, a); ux.restore();
  ux.save(); ux.translate(x, y); ux.scale(.06, 1); glow(0, 0, size * .55, col, a * .6); ux.restore();
}
function lightDisc(x, y, r, col, lit, a, k) {              // szklany dysk światła: wnętrze, obrzeże w trzech warstwach, poświata, połysk
  const g2 = ux.createRadialGradient(x, y, r * .05, x, y, r);
  g2.addColorStop(0, rgba(col, (.2 + .2 * lit) * a)); g2.addColorStop(.62, rgba(col, (.34 + .26 * lit) * a)); g2.addColorStop(.88, rgba(mix3(col, [1, 1, 1], .12), (.62 + .26 * lit) * a));
  g2.addColorStop(.97, rgba(mix3(col, [1, 1, 1], .4), (.5 + .3 * lit) * a)); g2.addColorStop(1, rgba(col, 0));
  ux.fillStyle = g2; ux.beginPath(); ux.arc(x, y, r, 0, TAU); ux.fill();
  for (let i = 0; i < 3; i++) { ux.strokeStyle = rgba(mix3(col, [1, 1, 1], .55), (.55 - i * .15) * a * (.45 + .55 * lit)); ux.lineWidth = (1.2 + i * 2.2) * k; ux.beginPath(); ux.arc(x, y, r * (.985 + i * .01), 0, TAU); ux.stroke(); }
  glow(x, y, r * 1.55, col, .2 * a * (.4 + .6 * lit)); glow(x - r * .36, y - r * .42, r * .3, [1, 1, 1], .3 * a * lit);
}
// tytuł HARV rysowany z nitek światła: trzy barwy podstawowe (R, G, B) lekko się rozchodzą i schodzą do białego rdzenia, po literach biegną iskry, za nimi wolno obraca się wir gazu
const TITLE_GLYPHS = {
  H: p => { p.moveTo(0, 0); p.lineTo(0, 1); p.moveTo(1, 0); p.lineTo(1, 1); p.moveTo(0, .5); p.lineTo(1, .5); },
  A: p => { p.moveTo(0, 1); p.lineTo(.5, 0); p.lineTo(1, 1); p.moveTo(.2, .66); p.lineTo(.8, .66); },
  R: p => { p.moveTo(0, 1); p.lineTo(0, 0); p.lineTo(.58, 0); p.arc(.58, .27, .27, -Math.PI / 2, Math.PI / 2); p.lineTo(0, .54); p.moveTo(.44, .54); p.lineTo(.96, 1); },
  V: p => { p.moveTo(0, 0); p.lineTo(.5, 1); p.lineTo(1, 0); }
};
function gasVortex(x, y, rx, ry, col, inten, t, seed, spin) {      // wir gazu: ramiona spirali (cienkie włókna światła + miękkie obłoki), całość płaska i szeroka; spin = prędkość obrotu
  const arms = 4, n = 30, pc = ux.lineCap; ux.lineCap = 'round';
  glow(x, y, ry * 2.1, col, .2 * inten);
  for (let a = 0; a < arms; a++) {
    const pts = []; for (let q = 0; q < n; q++) { const sv = (q + 1) / n, ang = seed + a * TAU / arms + sv * 3.8 - t * spin, r = sv * (.3 + .7 * sv); pts.push([x + Math.cos(ang) * r * rx, y + Math.sin(ang) * r * ry, sv]); }
    for (let q = 1; q < n; q++) {      // włókno: odcinki o malejącej jasności i grubości, barwa zdryfowana po tęczy
      const [x0, y0] = pts[q - 1], [x1, y1, sv] = pts[q], fa = (1 - sv * .62) * inten;
      ux.strokeStyle = rgba(mix3(col, rainbowRGB(sv * .5 + a * .12 + t * .02), .3), Math.min(1, .5 * fa)); ux.lineWidth = Math.max(.8, (4.2 - 2.6 * sv) * (H / 1000) * (.55 + .45 * Math.min(1.6, inten)));
      ux.beginPath(); ux.moveTo(x0, y0); ux.lineTo(x1, y1); ux.stroke();
      if (q % 2 === 0 && sv > .24) glow(x1, y1, ry * (1.0 - .55 * sv), mix3(col, [1, .95, 1], .3 * (1 - sv)), fa * .2);
    }
  }
  ux.lineCap = pc;
}
function drawTitle(text, cx, cy, size, a, t) {
  if (text !== 'HARV') return drawTitleOld(text, cx, cy, size, a, t);
  const sz = size * .92, lw = Math.max(2.4, sz * .056), gw = sz * .8, gap = sz * .46, tw = text.length * gw + (text.length - 1) * gap, x0 = cx - tw / 2 + 0, y0 = cy - sz / 2;
  const pc = ux.globalCompositeOperation; ux.globalCompositeOperation = 'lighter'; ux.lineCap = 'round'; ux.lineJoin = 'round';
  const paths = []; for (let q = 0; q < text.length; q++) { const p = new Path2D(); TITLE_GLYPHS[text[q]](p); paths.push(p); }
  // rysowanie z przekształceniem bez deformacji grubości: ścieżki skalujemy w przestrzeni jednostkowej, kreska w pikselach
  const strokeLetters = (ox, oy, w, style, al, dash, dashOff) => {
    ux.strokeStyle = style; ux.globalAlpha = al * a; ux.lineWidth = w;
    if (dash) { ux.setLineDash(dash); ux.lineDashOffset = dashOff; } else ux.setLineDash([]);
    for (let q = 0; q < paths.length; q++) {
      const px = x0 + q * (gw + gap) + ox, py = y0 + oy + Math.sin(t * .7 + q * 1.3) * sz * .012, P = new Path2D(), m = new DOMMatrix([gw, 0, 0, sz, px, py]);
      P.addPath(paths[q], m); ux.stroke(P);
    }
    ux.setLineDash([]);
  };
  const flow = ux.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); for (let q = 0; q <= 5; q++) flow.addColorStop(q / 5, `hsl(${(t * 28 + q * 64) % 360},85%,64%)`);
  strokeLetters(0, 0, lw * 9, flow, .07); strokeLetters(0, 0, lw * 4.4, flow, .13); strokeLetters(0, 0, lw * 2.2, flow, .26);
  const sp = sz * .022 * (1 + .75 * Math.sin(t * .5)) + sz * .008;       // rozejście barw: oddycha, a w szczytach rozdziela R/G/B, w dolinach schodzą się do bieli
  [['rgb(255,55,90)', 0], ['rgb(70,255,130)', 1], ['rgb(80,110,255)', 2]].forEach(([col, c]) => { const an = t * .31 + c * 2.094; strokeLetters(Math.cos(an) * sp, Math.sin(an) * sp, lw * 1.25, col, .85); });
  strokeLetters(0, 0, lw * .5, 'rgb(255,255,255)', .95);
  const per = sz * 3.4; strokeLetters(0, 0, lw * 1.1, 'rgb(255,255,255)', .95, [sz * .13, per], -(t * sz * .9) % (per + sz * .13));      // iskry biegnące po nitkach
  ux.globalAlpha = 1; ux.globalCompositeOperation = pc;
}
let titleCv = null, titleX = null;
// tytuł: maska tekstu -> irysujące wypełnienie z kilku ruchomych gradientów -> aura w kilku odcieniach i rozszczepione krawędzie
function drawTitleOld(text, cx, cy, size, a, t) {
  const w = Math.ceil(size * (text.length * 1.05 + 1.6)), h = Math.ceil(size * 1.9);
  if (!titleCv) { titleCv = document.createElement('canvas'); titleX = titleCv.getContext('2d'); }
  if (titleCv.width !== w || titleCv.height !== h) { titleCv.width = w; titleCv.height = h; }
  const x = titleX; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h); x.globalCompositeOperation = 'source-over'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `800 ${Math.round(size)}px Unbounded, Manrope, system-ui, sans-serif`; try { x.letterSpacing = (size * .14) + 'px'; } catch (e) {}
  x.fillStyle = '#fff'; x.fillText(text, w / 2 + size * .07, h / 2);
  x.globalCompositeOperation = 'source-atop';
  const hs = t * 38, g1 = x.createLinearGradient(w * .2, 0, w * .8, h * .55);
  for (let i = 0; i <= 6; i++) g1.addColorStop(i / 6, `hsl(${(hs + i * 52) % 360},88%,64%)`);
  x.fillStyle = g1; x.fillRect(0, 0, w, h);
  x.globalAlpha = .55; const g2 = x.createLinearGradient(w * .9, h * .1, w * .1, h * .9);
  for (let i = 0; i <= 5; i++) g2.addColorStop(i / 5, `hsl(${(-hs * .7 + 140 + i * 71) % 360},90%,60%)`);
  x.fillStyle = g2; x.fillRect(0, 0, w, h); x.globalAlpha = 1;
  const gv = x.createLinearGradient(0, h * .22, 0, h * .78); gv.addColorStop(0, 'rgba(255,255,255,.55)'); gv.addColorStop(.45, 'rgba(255,255,255,0)'); gv.addColorStop(1, 'rgba(10,8,40,.28)');
  x.fillStyle = gv; x.fillRect(0, 0, w, h);
  const bx = ((t * .22) % 1.5 - .25) * w, gb = x.createLinearGradient(bx - w * .1, 0, bx + w * .1, 0); gb.addColorStop(0, 'rgba(255,255,255,0)'); gb.addColorStop(.5, 'rgba(255,255,255,.7)'); gb.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gb; x.fillRect(0, 0, w, h);
  const pc = ux.globalCompositeOperation, oy = cy - h / 2, ox = cx - w / 2;
  ux.globalCompositeOperation = 'lighter'; ux.globalAlpha = a;
  for (const [blur, hue, al] of [[size * 1.1, hs % 360, .5], [size * .5, (hs + 120) % 360, .6], [size * .2, (hs + 240) % 360, .5]]) {
    ux.shadowColor = `hsla(${hue},95%,60%,${al})`; ux.shadowBlur = blur; ux.drawImage(titleCv, ox, oy); }
  const off = size * .03 * (1 + .4 * Math.sin(t * .8));
  ux.shadowBlur = 0; ux.shadowColor = 'rgba(255,60,110,.5)'; ux.shadowOffsetX = -off * 4; ux.shadowOffsetY = 0; ux.drawImage(titleCv, ox, oy);
  ux.shadowColor = 'rgba(70,110,255,.5)'; ux.shadowOffsetX = off * 4; ux.drawImage(titleCv, ox, oy);
  ux.shadowColor = 'transparent'; ux.shadowOffsetX = 0; ux.globalCompositeOperation = 'source-over'; ux.drawImage(titleCv, ox, oy);
  ux.globalAlpha = 1; ux.globalCompositeOperation = pc;
  const fx = cx + Math.sin(t * .6) * w * .12;
  ux.globalCompositeOperation = 'lighter'; flare(fx, cy, size * 2.6, [1, .95, 1], .5 * a); ux.globalCompositeOperation = pc;
}

// ---------- instalacja (PWA) ----------
// natywne okno instalacji wymaga gestu użytkownika; na dotyku menu reaguje na pointerdown, który gestu NIE daje (dopiero pointerup/click), więc przy odmowie ponawiamy po puszczeniu palca
function tryInstallPrompt(retry) {
  const d = deferredInstall; if (!d) return;
  const again = () => { if (!retry) { showInstallSheet(); return; } ['pointerup', 'click', 'touchend'].forEach(n => removeEventListener(n, once, true)); tryInstallPrompt(false); };
  const once = () => again();
  const fail = () => { if (retry) ['pointerup', 'click', 'touchend'].forEach(n => addEventListener(n, once, { capture: true, once: true })); else showInstallSheet(); };
  try { const pr = d.prompt(); deferredInstall = null; if (pr && pr.then) pr.then(() => {}, e => { deferredInstall = d; fail(); }); if (d.userChoice && d.userChoice.then) d.userChoice.then(() => {}, () => {}); }
  catch (e) { fail(); }
}
function installAction() {
  if (deferredInstall) { tryInstallPrompt(true); return; }
  showInstallSheet();
}
function showInstallSheet() {
  MENU.sheet = isIOS ? { title: 'Dodaj Harv do ekranu głównego', steps: ['Stuknij ikonę Udostępnij w pasku Safari', 'Wybierz „Do ekranu początkowego”', 'Potwierdź „Dodaj”. Harv uruchomi się na pełnym ekranie, także bez internetu'] }
    : touchDevice ? { title: 'Zainstaluj Harv', steps: ['Otwórz menu przeglądarki (trzy kropki)', 'Wybierz „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”', 'Harv uruchomi się na pełnym ekranie, także bez internetu'] }
    : { title: 'Zainstaluj Harv', steps: ['Kliknij ikonę instalacji w pasku adresu przeglądarki', 'Albo menu przeglądarki, potem „Zainstaluj Harv”', 'Gra otworzy się we własnym oknie i działa bez internetu'] };
  MENU.sheet.t0 = G.t;
}
function drawSheet(a, k) {
  const sh = MENU.sheet, t = G.t, cx = W / 2, cy = H / 2, ap = clamp((t - sh.t0) / .4, 0, 1), w = Math.min(W * .88, 560 * k), n = sh.steps.length, hh = (150 + n * 70) * k, x = cx - w / 2, y = cy - hh / 2;
  ux.globalCompositeOperation = 'source-over'; ux.fillStyle = `rgba(4,6,22,${.55 * ap})`; ux.fillRect(0, 0, W, H);
  const gg = ux.createLinearGradient(0, y, 0, y + hh); gg.addColorStop(0, `rgba(255,255,255,${.2 * ap})`); gg.addColorStop(1, `rgba(255,255,255,${.07 * ap})`);
  ux.fillStyle = gg; roundRect(x, y, w, hh, 28 * k); ux.fill(); ux.strokeStyle = `rgba(230,236,255,${.35 * ap})`; ux.lineWidth = 1.2 * k; ux.stroke();
  ux.fillStyle = `rgba(244,246,255,${ap})`; ux.textAlign = 'center'; ux.textBaseline = 'middle'; ux.font = `800 ${Math.round(24 * k)}px Manrope, system-ui, sans-serif`; ux.fillText(sh.title, cx, y + 44 * k);
  sh.steps.forEach((s, i) => { const yy = y + (100 + i * 70) * k; ux.globalCompositeOperation = 'lighter'; glow(x + 40 * k, yy, 22 * k, [.6, .65, 1], .5 * ap); ux.globalCompositeOperation = 'source-over';
    ux.font = `800 ${Math.round(17 * k)}px Manrope, system-ui, sans-serif`; ux.fillStyle = `rgba(255,255,255,${ap})`; ux.fillText(String(i + 1), x + 40 * k, yy + 1);
    ux.textAlign = 'left'; ux.font = `600 ${Math.max(15, Math.round(17 * k))}px Manrope, system-ui, sans-serif`; ux.fillStyle = `rgba(230,236,255,${.95 * ap})`;
    const words = s.split(' '), lim = w - 110 * k; let line = '', ly = yy - ((words.join(' ').length > 40) ? 11 * k : 0); const lines = [];
    for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (ux.measureText(tst).width > lim && line) { lines.push(line); line = wd; } else line = tst; } lines.push(line);
    lines.forEach((l, j) => ux.fillText(l, x + 76 * k, yy + (j - (lines.length - 1) / 2) * 22 * k)); ux.textAlign = 'center'; });
  ux.fillStyle = `rgba(190,200,255,${.7 * ap})`; ux.font = `600 ${Math.max(13, Math.round(14 * k))}px Manrope, system-ui, sans-serif`; ux.fillText(touchDevice ? 'Dotknij, aby zamknąć' : 'Dowolny klawisz lub kliknięcie zamyka', cx, y + hh - 28 * k);
}
function roundRect(x, y, w, h, r) { ux.beginPath(); if (ux.roundRect) ux.roundRect(x, y, w, h, r); else ux.rect(x, y, w, h); }
function spacing(px) { try { ux.letterSpacing = px + 'px'; } catch (e) {} }
function drawCal() {
  const k = H / 1000, cx = W / 2, cy = H / 2, t = pt();
  if (t > CAL.t0 + 12 * BEAT + .6) calFinish();
  if (!CAL.on) return;
  glow(cx, cy, H * .5, [.3, .35, .8], .22);
  const ph = ((t - CAL.t0) / BEAT) % 1, active = t >= CAL.t0 - .1 && t < CAL.t0 + 12 * BEAT, pu = active ? Math.exp(-(ph < 0 ? 1 : ph) * 5) : 0;
  glow(cx, cy, 70 * k * (1 + .5 * pu), [.8, .85, 1], Math.min(1, .35 + .5 * pu));
  ux.globalCompositeOperation = 'source-over'; ux.textAlign = 'center'; ux.textBaseline = 'middle'; ux.fillStyle = 'rgba(244,246,255,.95)'; ux.font = `700 ${Math.max(20, Math.round(26 * k))}px Manrope, system-ui, sans-serif`;
  ux.fillText(touchDevice ? 'Stukaj palcem w rytm' : 'Stukaj Spacją w rytm', cx, cy - 140 * k);
  ux.font = `500 ${Math.max(16, Math.round(18 * k))}px Manrope, system-ui, sans-serif`; ux.fillStyle = 'rgba(210,218,255,.85)';
  ux.fillText(active ? 'Słuchaj kliknięć i stukaj równo z nimi (' + CAL.taps.length + ')' : 'Za chwilę: ' + Math.max(0, Math.ceil((CAL.t0 - t) / BEAT)) + '  ·  Esc przerywa', cx, cy + 140 * k);
}
const MENU_DESC = {
  play: 'Mapa mgławicy: wybierz jasną dziurę i zalej ją światłem',
  next: 'Kolejna mgławica, trudniejsza i z nowym gazem',
  tut: 'Krótko o tym, jak mieszają się barwy i czym sterujesz',
  snd: 'Klawisz M też włącza i wyłącza dźwięk',
  set: 'Tryb gry, tempo, limit czasu, ruch i daltonizm',
  puls: 'Puls: dźwięk wskakuje w takt 96 BPM, a melodię układają Twoje ruchy. Łagodny nie karze, pełny ocenia rytm',
  cal: 'Stukaj równo z kliknięciami: gra sama wyrówna dźwięk do Twojego urządzenia',
  calm: 'Spokojne tempo: rzadsze zaburzenia, więcej czasu na poprawkę, dziura nie zamyka się przed czasem',
  lim: 'Limit czasu: gdy kolory długo się nie zgadzają, rant dziury się zamyka, a ona odpoczywa. Wyłączony: nic nie ucieka',
  rm: 'Ograniczony ruch: bez fal i wybuchów, mniej migotania',
  cb: 'Daltonizm: kształty i podpisy zamiast samych kolorów',
  new: 'Kasuje cały postęp. Zapyta jeszcze raz',
  back: 'Wraca do głównego menu',
  inst: 'Gra otworzy się we własnym oknie i działa bez internetu'
};
// menu: tytuł z nitek światła, pozycje jako czysty napis; wybraną zaznacza mała czarna dziura z rantem po lewej i cienka nitka światła pod napisem (bez wirów i galaktyk)
function menuMark(x, y, r, col, al, t, k) {
  const pc = ux.globalCompositeOperation; ux.globalCompositeOperation = 'source-over'; ux.fillStyle = `rgba(3,4,18,${.94 * al})`; ux.beginPath(); ux.arc(x, y, r, 0, TAU); ux.fill();
  ux.globalCompositeOperation = 'lighter'; glow(x, y, r * 3.6, col, .35 * al);
  ux.strokeStyle = rgba(mix3(col, [1, 1, 1], .4), .95 * al); ux.lineWidth = Math.max(1.4, 1.9 * k); ux.beginPath(); ux.arc(x, y, r, 0, TAU); ux.stroke();
  const an = t * .9; glow(x + Math.cos(an) * r, y + Math.sin(an) * r, r * .5, [1, 1, 1], .8 * al);
  ux.globalCompositeOperation = pc;
}
function drawMenu() {
  const t = G.t, k = H / 1000, cx = W / 2, tt = t - MENU.t0, a = clamp(tt / .8, 0, 1), st = MENU.page === 'settings';
  ux.globalCompositeOperation = 'source-over'; const dg = ux.createLinearGradient(0, 0, 0, H); dg.addColorStop(0, `rgba(4,6,22,${.2 * a})`); dg.addColorStop(.3, `rgba(4,6,22,${.46 * a})`); dg.addColorStop(.55, `rgba(4,6,22,${.64 * a})`); dg.addColorStop(1, `rgba(4,6,22,${.7 * a})`); ux.fillStyle = dg; ux.fillRect(0, 0, W, H);
  const ts = Math.min(.14 * H, .15 * W), ty = st ? H * .15 : H * .2;
  { const ly = H * (st ? .6 : .63), lr = Math.min(W * .52, 400 * k), vg = ux.createRadialGradient(cx, ly, 0, cx, ly, lr); vg.addColorStop(0, `rgba(3,4,18,${.78 * a})`); vg.addColorStop(.5, `rgba(3,4,18,${.6 * a})`); vg.addColorStop(.82, `rgba(3,4,18,${.24 * a})`); vg.addColorStop(1, 'rgba(3,4,18,0)');
    ux.save(); ux.translate(cx, ly); ux.scale(1, H * .46 / lr); ux.translate(-cx, -ly); ux.fillStyle = vg; ux.fillRect(cx - lr, ly - lr, lr * 2, lr * 2); ux.restore(); }      // miękkie ciemne tło za listą: czytelność nad jasnym gazem
  ux.globalCompositeOperation = 'lighter'; glow(cx, ty, ts * 3.4, [.45, .4, 1], .12 * a);
  drawTitle('HARV', cx, ty, st ? ts * .72 : ts, a, t);
  ux.globalCompositeOperation = 'source-over'; ux.textAlign = 'center'; ux.textBaseline = 'middle';
  const items = menuItems(); MENU.sel = Math.min(MENU.sel, items.length - 1); MENU.rects = [];
  const bw = Math.min(W * .9, 520 * k), top = H * (st ? .3 : .4), bottom = H * .895 - SAFE.b, step = Math.min((st ? .08 : .088) * H, (bottom - top) / items.length), fsMax = Math.round(Math.min(.031 * H, step * .46));
  items.forEach((it, i) => {
    const yc = top + (i + .5) * step, sel = i === MENU.sel, ap = clamp((t - MENU.pt - .1 - i * .06) / .45, 0, 1), yy = yc + (1 - ap) * 10 * k, al = ap * a;
    MENU.rects.push([cx - bw / 2, yc - step / 2, bw, step]);
    const col = mix3(rainbowRGB(i / Math.max(6, items.length) * .8 + t * .012), [.78, .84, 1], .38);
    let fs = fsMax, w1, w2 = 0, gap = 0; spacing(.002 * H);
    do { ux.font = `${sel ? 800 : 600} ${fs}px Manrope, ui-sans-serif, system-ui, sans-serif`; w1 = ux.measureText(it.label).width; if (it.val) { gap = fs * 1.3; w2 = ux.measureText(it.val).width; } fs--; } while (w1 + gap + w2 > bw * .86 && fs > 10);
    const tw = w1 + gap + w2, x0 = cx - tw / 2, ty0 = yy + 1, lc = sel ? 1 : .92;
    if (sel) {      // nitka światła pod napisem i mała czarna dziura po lewej; płynnie jadą za wyborem
      if (MENU.mx == null || MENU.mp !== MENU.page + ':' + MENU.pt) { MENU.mx = x0; MENU.my = yy; MENU.mp = MENU.page + ':' + MENU.pt; } else { MENU.mx += (x0 - MENU.mx) * .2; MENU.my += (yy - MENU.my) * .2; }
      ux.globalCompositeOperation = 'lighter';
      const ly = MENU.my + fsMax * .78, lw = tw + 200 * k, cxl = cx + Math.sin(t * 1.05) * .12 * lw, lg = ux.createLinearGradient(cxl - lw / 2, 0, cxl + lw / 2, 0); lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(.5, rgba(mix3(col, [1, 1, 1], .35), .95 * al)); lg.addColorStop(1, rgba(col, 0));
      ux.fillStyle = lg; ux.fillRect(cx - lw / 2, ly - 1.2 * k, lw, Math.max(2.4, 2.4 * k));
      menuMark(MENU.mx - 24 * k - fsMax * .6, MENU.my + 1, fsMax * .6, col, al, t, k);
      ux.globalCompositeOperation = 'source-over';
    }
    ux.textAlign = 'left'; ux.lineJoin = 'round'; ux.lineWidth = 3.2 * k;
    const tg = ux.createLinearGradient(0, yy - fsMax * .6, 0, yy + fsMax * .6); tg.addColorStop(0, `rgba(255,255,255,${lc * al})`); tg.addColorStop(1, `rgba(206,218,255,${(sel ? .95 : .84) * al})`);
    ux.strokeStyle = `rgba(6,8,34,${.5 * al})`; ux.strokeText(it.label, x0, ty0);
    ux.shadowColor = `rgba(6,8,34,${.8 * al})`; ux.shadowBlur = 10 * k; ux.fillStyle = tg; ux.fillText(it.label, x0, ty0); ux.shadowBlur = 0;
    if (it.val) { const vx = x0 + w1 + gap; ux.strokeStyle = `rgba(6,8,34,${.5 * al})`; ux.strokeText(it.val, vx, ty0); ux.shadowColor = `rgba(6,8,34,${.8 * al})`; ux.shadowBlur = 10 * k; ux.fillStyle = `rgba(255,240,208,${(sel ? 1 : .78) * al})`; ux.fillText(it.val, vx, ty0); ux.shadowBlur = 0; }
    if (sel) { ux.globalCompositeOperation = 'lighter'; ux.shadowColor = rgba(col, .8 * al); ux.shadowBlur = 16 * k; ux.fillStyle = `rgba(255,255,255,${.3 * al})`; ux.fillText(it.label, x0, ty0); ux.shadowBlur = 0; ux.globalCompositeOperation = 'source-over'; }
    ux.textAlign = 'center'; spacing(0);
  });
  const fsd = Math.max(15, Math.round(.0185 * H)), ds = items[MENU.sel] && MENU_DESC[items[MENU.sel].id];
  ux.shadowColor = `rgba(4,6,22,${.85 * a})`; ux.shadowBlur = 9 * k;      // cień pod drobnym tekstem: nie ginie na jasnym gazie
  if (ds) { ux.fillStyle = `rgba(232,237,255,${.95 * a})`; ux.font = `500 ${fsd}px Manrope, ui-sans-serif, system-ui, sans-serif`; ux.fillText(ds, cx, H * .94 - SAFE.b, W * .92); }
  ux.fillStyle = `rgba(206,216,255,${.72 * a})`; ux.font = `500 ${Math.max(14, Math.round(.017 * H))}px Manrope, ui-sans-serif, system-ui, sans-serif`;
  ux.fillText(touchDevice ? 'Dotknij, aby wybrać' : 'W S albo strzałki  ·  Enter zatwierdź  ·  ' + (st ? 'Esc wróć' : G.started ? 'Esc zamknij' : 'M dźwięk'), cx, H * .975 - SAFE.b);
  ux.textAlign = 'right'; ux.fillStyle = `rgba(206,216,255,${.5 * a})`; ux.fillText('v1', W - 18 * k - SAFE.r, H * .975 - SAFE.b); ux.textAlign = 'center'; ux.shadowBlur = 0;
  if (MENU.sheet) drawSheet(a, k);
}

function drawUi() {
  ux.setTransform(1, 0, 0, 1, 0, 0); ux.clearRect(0, 0, W, H); ux.globalCompositeOperation = 'lighter';
  const mapA = G.mode === 'map' ? 1 : G.mode === 'dive' || G.mode === 'surf' ? 1 - sstep(0, .5, G.diveT) : 0;
  drawParts(mapA, G.mode === 'sector' ? 1 : G.mode === 'dive' || G.mode === 'surf' ? sstep(.62, 1, G.diveT) : 0);
  if (CAL.on) { drawCal(); ux.globalCompositeOperation = 'source-over'; return; }
  if (MENU.on) { drawMenu(); ux.globalCompositeOperation = 'source-over'; return; }
  if (TUT.on) { drawTut(); ux.globalCompositeOperation = 'source-over'; return; }
  if (mapA > .01) drawMapUi(mapA);
  const secA = G.mode === 'sector' ? 1 : G.mode === 'dive' || G.mode === 'surf' ? sstep(.62, 1, G.diveT) : 0;
  drawSectorUi(secA);
  ux.globalCompositeOperation = 'source-over';
  const ca = clamp((G.t - CAP.t0) / .5, 0, 1) * clamp((CAP.dur - (G.t - CAP.t0)) / .6, 0, 1);
  if (ca > .01) { const k = H / 1000; ux.font = `700 ${Math.max(20, Math.round(28 * k))}px Manrope, ui-sans-serif, system-ui, sans-serif`; ux.textAlign = 'center'; ux.textBaseline = 'middle';
    ux.shadowColor = 'rgba(2,4,24,.9)'; ux.shadowBlur = 14 * k; ux.fillStyle = `rgba(246,248,255,${.96 * ca})`;
    const mw = Math.min(W - 40 * k - SAFE.l - SAFE.r, 900 * k), words = CAP.txt.split(' '), lines = []; let ln = '';
    for (const wd of words) { const tt = ln ? ln + ' ' + wd : wd; if (ux.measureText(tt).width > mw && ln) { lines.push(ln); ln = wd; } else ln = tt; } lines.push(ln);
    { const lw = Math.max(...lines.map(l => ux.measureText(l).width)), lh = 36 * k, bh = lines.length * lh + 18 * k, by = H * .86 - SAFE.b - (lines.length - 1) * lh - lh * .5 - 7 * k; ux.shadowBlur = 0; const pg = ux.createLinearGradient(0, by, 0, by + bh); pg.addColorStop(0, `rgba(5,7,26,0)`); pg.addColorStop(.5, `rgba(5,7,26,${.4 * ca})`); pg.addColorStop(1, `rgba(5,7,26,0)`); ux.fillStyle = pg; roundRect(W / 2 - lw / 2 - 26 * k, by, lw + 52 * k, bh, 18 * k); ux.fill(); ux.shadowColor = 'rgba(2,4,24,.9)'; ux.shadowBlur = 14 * k; ux.fillStyle = `rgba(246,248,255,${.97 * ca})`; }
    lines.forEach((l, i) => ux.fillText(l, W / 2, H * .86 - SAFE.b - (lines.length - 1 - i) * 36 * k)); ux.shadowBlur = 0; }
}

// ---------- render ----------
function render() {
  if (G.gasLost) return;
  const demo = TUT.on && TUT.demo ? TUT.demo : null;
  const mode = demo ? 1 : G.mode === 'sector' ? 1 : G.mode === 'map' ? 0 : sstep(.62, 1, G.diveT);
  const sec = G.cur >= 0 ? sectors[G.cur] : null;
  const arr = sectors.map(s => { const br = s.claimed ? .95 : lerp(.66, .88, s.reachV); const c = s.col;
    return { x: s.x, y: s.y, claimV: s.claimV, reachV: s.reachV, rest: s.rest > 0 ? Math.max(.03, s.restV) : 0, col: [c[0] * br, c[1] * br, c[2] * br] }; });
  const slot = (demo ? demo.slot : G.slotDisp).map(c => [c[0] * .95, c[1] * .95, c[2] * .95]);
  const mc = demo ? demo.mix : mixNow();
  const dv = G.diveT;
  const mapA = G.mode === 'map' ? 1 : G.mode === 'dive' || G.mode === 'surf' ? 1 - sstep(0, .5, G.diveT) : 0;
    const wage = G.t - G.waveAt, wenv = wage < 3 ? Math.exp(-wage * 1.5) * (reduceMotion ? 0 : G.waveAmp) : 0, dvp = (G.mode === 'dive' || G.mode === 'surf') ? Math.sin(Math.PI * G.diveT) : 0, mm = (demo ? demo.match : G.matchSm) || 0;
  let touch = [0, 0, 0];      // reakcja gazu na palec/mysz: punkt w przestrzeni c + siła (gaśnie po puszczeniu)
  { const tc = G.touch, inSec = G.mode === 'sector' || (G.mode === 'dive' && G.diveT > .7); if (tc && inSec && !reduceMotion) { const str = tc.hold ? 1 : clamp(1 - (G.t - tc.t0) / .6, 0, 1); if (str > .001) touch = [(tc.x / W - .5) * ASP, .5 - tc.y / H, str]; } }
  const ex = { trail: [], ship: { x: 0, y: 0, r: .04, a: 0, dx: 1, dy: 0, sp: 0 }, touch,
    drops: [[0, 0], [0, 0], [0, 0], [0, 0]], wave: [wage < 4 ? wage : -1, reduceMotion ? 0 : G.waveAmp, G.waveRb], orb: [.036 * secZoom(), .052 * secZoom(), sec ? sec.rem : 1, G.winOn && G.mode === 'sector' ? 1 + (reduceMotion ? 0 : Math.exp(-(G.t - G.winT0) * .8)) : 0],
    post: [.0016 + mode * .0054 + wenv * .02 + dvp * .014, (.3 + .18 * mm) + wenv * .3, mode * (.22 + .3 * mm) + wenv * .35] };
  gas.draw({ ...ex, rot: ROT, t: G.t + 40, oct: 5 + 2 * sstep(0, 1, dv), mode, match: demo ? demo.match : G.matchSm || 0, prismG: sec && (G.mode !== 'map') ? sec.claimV : 0,
    s0, scale: scaleNow, portR: demo ? demo.portR : portR(), portRX: demo ? demo.portR : portRX(), cam, sectors: arr, slot, fx: demo ? demo.fx : G.fx, mix: [mc[0] * .9, mc[1] * .9, mc[2] * .9], tgt: demo && demo.tgt ? demo.tgt : (sec ? sec.col : mc), fill: demo ? (demo.fill || 0) : (sec && G.mode !== 'map' ? sec.claim : 0), beat: beatPulse(),
    sel: G.mode === 'map' && G.pick >= 0 && mapCan(sectors[G.pick]) ? [sectors[G.pick].x, sectors[G.pick].y, .9] : [0, 0, 0] });
}

let last = 0, frameN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now; if (dt <= 0) return;
  frameN++;
  update(dt);
  if (G.q <= .39 && G.ema > 28 && (frameN & 1)) return;            // tryb oszczędny: przy bardzo słabym urządzeniu rysujemy co drugą klatkę
  if (window.Audio2 && Audio2.fillV) Audio2.fillV(G.mode === 'sector' && G.cur >= 0 && !sectors[G.cur].claimed ? sectors[G.cur].claim : 0);
  if (window.Audio2 && Audio2.win) Audio2.win(G.winOn && G.mode === 'sector' && G.cur >= 0 ? sectors[G.cur].rem : -1, dToTarget() === 0);
  if (window.Audio2) Audio2.update(counts(G.ports), dToTarget(), G.mode === 'sector' || (G.mode === 'dive' && G.diveT > .8), G.mode === 'sector' ? 1 : G.diveT);
  if (window.Audio2) Audio2.move(0, false, G.mode === 'map' ? 1 : 0);
  const bcam = [0, 0];                                       // niebo stoi: bez paralaksy względem kamery
  Backdrop.frame(G.t + 40, bcam, dt, frameN % 2 === 0);
  render(); drawUi();
}

// ---------- wejście ----------
const KEYPORT = { KeyW: 0, ArrowUp: 0, KeyD: 1, ArrowRight: 1, KeyS: 2, ArrowDown: 2, KeyA: 3, ArrowLeft: 3 };
addEventListener('keydown', e => {
  if (window.Audio2) Audio2.unlock();
  if (touchDevice && e.isTrusted !== false && !['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Tab'].includes(e.code)) setInput(false);      // użyto klawiatury: podpowiedzi z klawiszami
  if (MENU.on) { menuKey(e); return; }
  if (TUT.on) { tutKey(e); return; }
  if (e.code === 'Escape' && G.mode === 'map') { menuOpen(); return; }
  if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey && !e.altKey) { tutStart(); return; }
  if (e.repeat && G.mode === 'sector') return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  keys.add(e.code);
  if (G.mode === 'sector' && e.code in KEYPORT) { const arrow = e.code.startsWith('Arrow'); G.lastArrow = arrow; if (arrow && pearlAlive()) tryPearlCatch(); else pressPort(KEYPORT[e.code], e.shiftKey ? 2 : 1); e.preventDefault(); }
  if (G.mode === 'sector' && e.code === 'Enter' && !sectors[G.cur].claimed) { if (!tryPearlCatch(true) && puls) playNote(); e.preventDefault(); }
  if (G.mode === 'sector' && e.code === 'Space' && !sectors[G.cur].claimed) { if (!tryPearlCatch(true) && puls) playNote(); e.preventDefault(); }
  if (e.code === 'Escape' || e.code === 'Backspace') surface();
  if (G.mode === 'map' && (e.code === 'KeyQ' || e.code === 'KeyE')) rotateMix(e.code === 'KeyE' ? 1 : 2);
  if (G.mode === 'map') { const dv = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] }[e.code]; if (dv) pickMove(dv[0], dv[1]); }
  if ((e.code === 'Space' || e.code === 'Enter') && G.mode === 'map' && G.pick >= 0 && mapCan(sectors[G.pick])) enterSector(G.pick);
  if (e.code === 'KeyM' && window.Audio2) Audio2.toggle();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); ptr.down = false; if (G.touch) G.touch.hold = false; });
cvUi.style.pointerEvents = 'none';
function hitPort(px, py) { for (let p = 0; p < 4; p++) { const [x, y] = portPx(p); if (Math.hypot(px - x, py - y) < Math.max(.075 * H, 56 * DPR)) return p; } return -1; }
addEventListener('pointerdown', e => {
  if (window.Audio2) Audio2.unlock();
  setInput(e.pointerType !== 'mouse');                // palec i rysik: podpowiedzi dotykowe; mysz: klik i klawisze
  if (MENU.on) { menuPointer(e); return; }
  if (TUT.on) { tutPointer(e); return; }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const px = e.clientX * DPR, py = e.clientY * DPR, k = H / 1000;
  if (G.mode === 'sector') {
    G.touch = { x: px, y: py, t0: G.t, hold: true };      // palec/mysz rozchodzi fale w gazie (reakcja na dotyk)
    if (touchDevice && Math.hypot(px - 40 * k - SAFE.l, py - 40 * k - SAFE.t) < Math.max(36 * k, 44 * DPR)) { surface(); return; }
    if (Math.hypot(px - W / 2, py - H / 2) < .1 * H) { if (!tryPearlCatch(true) && puls) playNote(); return; }
    const p = hitPort(px, py); if (p >= 0) { if (pearlAlive() && G.pearl.k === p) tryPearlCatch(); else pressPort(p, 1); if (!ptr.down) { ptr.down = true; ptr.id = e.pointerId; ptr.x = ptr.sx = px; ptr.y = ptr.sy = py; ptr.t0 = G.t; ptr.moved = false; ptr.swiped = true; } return; }
  } else if (G.mode === 'map' && px > W - 80 * k - SAFE.r && py < 80 * k + SAFE.t) { menuOpen(); return;
  } else if (G.mode === 'map' && touchDevice && py > H - 110 * k - SAFE.b) {
    if (px < 130 * k + SAFE.l) { rotateMix(2); return; } if (px > W - 130 * k - SAFE.r) { rotateMix(1); return; }
  }
  if (ptr.down) return;                                    // drugi palec nie nadpisuje pierwszego
  ptr.down = true; ptr.id = e.pointerId; ptr.x = ptr.sx = px; ptr.y = ptr.sy = py; ptr.t0 = G.t; ptr.moved = false; ptr.swiped = false;
});
addEventListener('pointermove', e => {
  if (MENU.on) { menuHover(e); return; }
  if (ptr.down && e.pointerId !== ptr.id) return;
  ptr.x = e.clientX * DPR; ptr.y = e.clientY * DPR; if (e.pointerType === 'mouse') G.hov = true;
  if (ptr.down && G.mode === 'sector' && G.touch) { G.touch.x = ptr.x; G.touch.y = ptr.y; G.touch.t0 = G.t; G.touch.hold = true; }      // fala gazu idzie za palcem
  if (!ptr.down) return;
  const dx = ptr.x - ptr.sx, dy = ptr.y - ptr.sy, th = Math.max(24 * DPR, .04 * Math.min(W, H));
  if (Math.hypot(dx, dy) > 8 * DPR) ptr.moved = true;
  if (G.mode === 'sector' && Math.hypot(dx, dy) > th) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > ay * 1.2 || ay > ax * 1.2) { const k = ax > ay ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); pressPort(k, 1); ptr.swiped = true; ptr.sx = ptr.x; ptr.sy = ptr.y; }
  }
});
addEventListener('pointerup', e => {
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false;
  if (G.touch) { G.touch.hold = false; G.touch.t0 = G.t; }      // po puszczeniu fala gazu gaśnie (~0,6 s)
  if (G.mode === 'map' && G.t - ptr.t0 < .6 && !ptr.moved) {
    const i = pickAt(ptr.x, ptr.y, touchDevice ? .14 : .11);
    if (i >= 0) { const sc = sectors[i]; if (mapCan(sc)) { G.pick = i; enterSector(i); } else if (!sc.claimed && sc.reach && sc.rest > 0) cap('rest1', 'Ta dziura odpoczywa po wydechu. Spróbuj innej', 5); else if (!sc.claimed) cap('locked', 'Ta dziura jeszcze śpi. Najpierw zalej sąsiednią', 5); }
  }
});
addEventListener('pointercancel', e => { if (e.pointerId === ptr.id) { ptr.down = false; if (G.touch) { G.touch.hold = false; G.touch.t0 = G.t; } } });
let wheelT = 0;
addEventListener('wheel', e => { if (e.ctrlKey || Math.abs(e.deltaY) < 8 || G.t - wheelT < .7) return; wheelT = G.t; if (e.deltaY > 0) surface(); else if (G.mode === 'map' && G.pick >= 0 && mapCan(sectors[G.pick])) enterSector(G.pick); }, { passive: true });
addEventListener('resize', resize);
addEventListener('pagehide', () => { if (sectors) save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && sectors) save(); });
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------- start ----------
try { document.fonts.load('800 40px Unbounded'); document.fonts.load('600 20px Manrope'); document.fonts.load('800 20px Manrope'); document.fonts.load('400 20px Manrope'); } catch (e) {}
const img = new Image();
img.onload = function boot() {
  if (!innerWidth || !innerHeight) { setTimeout(boot, 120); return; }   // karta w tle ma rozmiar 0
  try {
    Backdrop.init();
    gas = new Gas(cvGas, img);
    cvGas.addEventListener('webglcontextlost', e => { e.preventDefault(); G.gasLost = true; });
    cvGas.addEventListener('webglcontextrestored', () => { try { gas = new Gas(cvGas, img); applyQ(); G.gasLost = false; } catch (err) { console.error(err); } });
    WORLD = peekWorld(); sectors = buildWorld(seedOf(WORLD)); startIdx = sectors.findIndex(s => s.start);
    G.ship.x = sectors[startIdx].x - .34; G.ship.y = sectors[startIdx].y - .14;
    resize(); load(); G.cur = startIdx;
    try { if (localStorage.getItem('harv-mute') === '1' && window.Audio2) Audio2.setMute(true); } catch (e) {}
    if (window.Audio2) { Audio2.layers(sectors.filter(s => s.claimed).length); Audio2.songs && Audio2.songs(songList()); }
    if (WORLD > 0 && !sectors.some(s => s.claimed)) setTimeout(() => capForce(worldTitle(), 6), 1500);
    if (qs.has('tut')) tutStart(); else if (!qs.has('notut') && !qs.has('nomenu')) menuOpen();
    if (qs.has('mute') && window.Audio2) Audio2.setMute(true);
    requestAnimationFrame(frame);
    window.__h = { G, w2s, DPRf: () => DPR, tickRest, winSec, sectorFail, limitOn, get sectors() { return sectors; }, cam, bestHint, TUT, MENU, menuOpen, menuClose, menuAct, tutStart, tutNext, tutEnd, step(n, dt) { for (let i = 0; i < n; i++) update(dt); }, enterSector, surface, pressPort, applyPress, curLink, claimSector, refreshReach, curRecipe, dToTarget, HC,
      setQ(q) { G.q = q; applyQ(); }, nextWorld, WR, get WORLD() { return WORLD; }, cap, capForce, CAP, claimAll() { sectors.forEach(s => { s.claim = 1; s.claimed = true; }); refreshReach(true); sectors.forEach(s => s.claimV = 1); },
      reset() { noSave = true; try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('harv-cap'); } catch (e) {} location.reload(); } };
  } catch (err) { const pre = document.createElement('pre'); pre.style.cssText = 'position:fixed;left:10px;top:10px;color:#f88;z-index:99;font:12px monospace;white-space:pre-wrap';
    pre.textContent = err.message; document.body.appendChild(pre); console.error(err); }
};
img.onerror = () => { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = '#777'; x.fillRect(0, 0, 4, 4); img.onerror = null; img.src = c.toDataURL(); };
img.src = window.GESTOSC || 'gestosc.png';
})();
