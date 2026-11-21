/* Tlo Harvestera: kod wyciety z zywej tapety Pulpitu (pulpit-kosmos/index.html), generowany skryptem mkbg.py.
   Nie edytuj recznie - zmiany robimy w harvester-bg-patch (konfiguracja na dole) lub ponownie generujemy. */
(function () {
'use strict';
const qs = new URLSearchParams(location.search);
const FIXED_W = 0, FIXED_H = 0;
let W = 0, H = 0, DPR = 1;
let far, bg, fg, glc2, rx, bx, fx, gl2, U2;
// ---------- seeded random ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(20261031);
const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };


// ---------- star colours (temperature + a few nebula-tinted) ----------
const STAR_COLS = [
  [155, 176, 255], [170, 191, 255], [202, 215, 255], [248, 247, 255], [255, 244, 234],
  [255, 226, 190], [255, 204, 140], [255, 170, 110], [255, 140, 120], [190, 140, 255], [255, 150, 220], [140, 235, 255]];
const COL_W = [6, 8, 10, 14, 12, 9, 6, 4, 2, 2, 2, 2];
function pickCol() { let s = COL_W.reduce((a, b) => a + b), r = R() * s;
  for (let i = 0; i < COL_W.length; i++) { r -= COL_W[i]; if (r <= 0) return i; } return 3; }
const css = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function glowSprite(c, size) {
  const s = document.createElement('canvas'); s.width = s.height = size; const x = s.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.08, css(c, .95)); g.addColorStop(.25, css(c, .35));
  g.addColorStop(.6, css(c, .06)); g.addColorStop(1, css(c, 0));
  x.fillStyle = g; x.fillRect(0, 0, size, size); return s;
}
// diffraction spikes: kind 4 = classic cross, kind 8 = six + two short (JWST-like)
function spikeSprite(c, size, kind, soft = 0) {
  const s = document.createElement('canvas'); s.width = s.height = size; const x = s.getContext('2d'); const m = size / 2;
  x.globalCompositeOperation = 'lighter';
  if (soft) x.filter = `blur(${soft}px)`;
  const arms = kind === 8 ? [[90, 1], [30, 1], [150, 1], [0, .38]] : [[0, 1], [90, 1]];
  for (const [deg, len] of arms) {
    x.save(); x.translate(m, m); x.rotate(deg * Math.PI / 180);
    const L = m * len; const g = x.createLinearGradient(-L, 0, L, 0);
    g.addColorStop(0, css(c, 0)); g.addColorStop(.4, css(c, .12)); g.addColorStop(.5, 'rgba(255,255,255,.8)');
    g.addColorStop(.6, css(c, .12)); g.addColorStop(1, css(c, 0));
    x.fillStyle = g; x.beginPath(); x.moveTo(-L, 0); x.lineTo(0, -size * .007); x.lineTo(L, 0); x.lineTo(0, size * .007); x.fill();
    x.restore();
  }
  x.drawImage(glowSprite(c, size * .4), size * .3, size * .3);
  return s;
}
const GLOW = STAR_COLS.map(c => glowSprite(c, 64));
const NOVA_SPR = spikeSprite([200, 220, 255], 96, 4);

// ---------- distant galaxies ----------
// spiral: warm core, faint disc, log-spiral arms of blue-white star clouds with pink HII knots
function galaxySprite(arms, n, core = 1) {
  const s = document.createElement('canvas'); s.width = s.height = n; const x = s.getContext('2d'), m = n / 2;
  x.globalCompositeOperation = 'lighter';
  let g = x.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, `rgba(255,232,200,${.55 * core})`); g.addColorStop(.12, `rgba(255,220,190,${.22 * Math.sqrt(core)})`);
  g.addColorStop(.45, 'rgba(180,195,255,.06)'); g.addColorStop(1, 'rgba(180,195,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
  const twist = 2 + R() * 1.2;
  for (let a = 0; a < arms; a++)
    for (let i = 0; i < 900; i++) {
      const tt = Math.pow(R(), .8), r = m * (.08 + tt * .82);
      const th = a * 6.283 / arms + Math.log(r / (m * .08)) * twist + gauss() * .22;
      const knot = R() < .04, c = knot ? [255, 140, 190] : (R() < .8 ? [175, 195, 255] : [255, 240, 220]);
      x.globalAlpha = (knot ? .5 : .2) * (1 - tt * .8); x.fillStyle = css(c, 1);
      const d = n / 110 * (knot ? 1.4 : .5 + R() * .7);
      x.fillRect(m + Math.cos(th) * r - d / 2, m + Math.sin(th) * r - d / 2, d, d);
    }
  x.globalAlpha = core;
  x.drawImage(glowSprite([255, 230, 200], n * .22), m - n * .11, m - n * .11);
  x.globalAlpha = 1;
  return s;
}
// elliptical: smooth warm glow
function ellipticalSprite(n) {
  const s = document.createElement('canvas'); s.width = s.height = n; const x = s.getContext('2d'), m = n / 2;
  const g = x.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,238,215,.75)'); g.addColorStop(.1, 'rgba(255,225,195,.3)');
  g.addColorStop(.4, 'rgba(255,215,185,.07)'); g.addColorStop(1, 'rgba(255,215,185,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n); return s;
}

// ---------- deepest star layer: behind the distant nebula, pre-rendered once ----------
const DEEP_M = 48;   // margin for parallax
let deep = null, deepTw = [];
function buildDeep() {
  const area = W * H / (1920 * 1080), k = Math.max(1, Math.sqrt(area) * .9);
  deep = document.createElement('canvas'); deep.width = W + DEEP_M * 2; deep.height = H + DEEP_M * 2;
  const x = deep.getContext('2d'); x.globalCompositeOperation = 'lighter';
  const COLS = [0, 1, 2, 2, 3, 3, 3, 4, 4, 5, 6, 11];
  const dot = (px, py, r, a, c) => { x.globalAlpha = a; x.fillStyle = css(STAR_COLS[c], 1); x.fillRect(px - r / 2, py - r / 2, r, r); };
  const D = deep.width, E = deep.height;
  // one diagonal band across the whole frame, corner to corner
  const band = u => (.04 + u * .9) * E, wid = u => .1 * E * (1 + .45 * Math.sin(u * 9 + .6));
  const blob = (px, py, rad, c, a) => { const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, css(c, a)); g.addColorStop(.5, css(c, a * .4)); g.addColorStop(1, css(c, 0));
    x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); };
  for (let i = 0; i < 9000 * area; i++)
    dot(R() * deep.width, R() * deep.height, (.5 + R() * .45) * k, .18 + R() * .4, COLS[(R() * COLS.length) | 0]);
  // a few brighter resolved stars along the band
  for (let i = 0; i < 2500 * area; i++) {
    const u = R();
    dot(u * D, band(u) + gauss() * wid(u) * .5, (.55 + R() * .4) * k, .2 + R() * .35, COLS[(R() * COLS.length) | 0]);
  }
  x.globalAlpha = 1;
  // Milky Way: rendered once on the GPU (smooth glow, clumpy star clouds, lit gas, dust rift);
  // hundreds of stacked canvas gradients used to add up their dither pattern into a visible grid
  const mw = renderMilkyWay(D, E);
  if (mw) { x.globalCompositeOperation = 'source-over'; x.drawImage(mw.canvas, 0, 0); mw.free(); x.globalCompositeOperation = 'lighter'; }
  // distant galaxies, away from the Milky Way's plane (where real ones are hidden by dust)
  // galaxies are slightly soft and dim, so they sink into the sky instead of sitting on it
  const gal = (px, py, sz, spr, rot, inc, a) => { x.save(); x.translate(px, py); x.rotate(rot); x.scale(1, inc);
    x.filter = 'blur(.6px)'; x.globalAlpha = a; x.drawImage(spr, -sz / 2, -sz / 2, sz, sz); x.restore(); };
  gal(.4 * W + DEEP_M, .25 * H + DEEP_M, 85 * k, galaxySprite(2, 200, .35), -.55, .36, .42);   // the big neighbour
  const free = (gx, gy) => Math.abs(gy * H + DEEP_M - band((gx * W + DEEP_M) / D)) > wid((gx * W + DEEP_M) / D) * 1.3;
  for (let i = 0, n = 0; i < 400 && n < 14; i++) {
    const gx = .03 + R() * .94, gy = .04 + R() * .92; if (!free(gx, gy)) continue; n++;
    const kind = R(), sz = (n < 4 ? 28 + R() * 18 : 10 + R() * 14) * k;
    const spr = kind < .65 ? galaxySprite(R() < .5 ? 2 : 3, 96, .45) : ellipticalSprite(64);
    gal(gx * W + DEEP_M, gy * H + DEEP_M, sz, spr, R() * 6.28, kind < .65 ? .2 + R() * .7 : .5 + R() * .4, .22 + R() * .2);
  }
  x.globalAlpha = 1;
  // a quiet black hole far away: dark shadow, thin lensed photon ring, tilted accretion disc
  // that is brighter on the side turning towards us
  { const r = 4.5 * k; x.save(); x.translate(.445 * W + DEEP_M, .6 * H + DEEP_M); x.rotate(-.28);
    blob(0, 0, r * 7, [255, 180, 130], .045);
    const hot = (a) => { const g = x.createLinearGradient(-r * 3.5, 0, r * 3.5, 0);
      g.addColorStop(0, css([255, 236, 210], a)); g.addColorStop(.45, css([255, 175, 110], a * .6)); g.addColorStop(1, css([210, 100, 60], a * .2)); return g; };
    x.filter = `blur(${(r * .3).toFixed(1)}px)`;
    x.lineWidth = r * .5; x.strokeStyle = hot(.32); x.beginPath(); x.arc(0, 0, r * 1.45, 0, 6.283); x.stroke();
    x.lineWidth = r * .7; x.strokeStyle = hot(.16); x.beginPath(); x.ellipse(0, 0, r * 3.2, r * .55, 0, 0, 6.283); x.stroke();
    x.globalCompositeOperation = 'destination-out'; x.filter = `blur(${(r * .15).toFixed(1)}px)`;
    x.fillStyle = 'rgba(0,0,0,.9)'; x.beginPath(); x.arc(0, 0, r * 1.15, 0, 6.283); x.fill();
    x.globalCompositeOperation = 'lighter'; x.filter = `blur(${(r * .3).toFixed(1)}px)`;
    x.lineWidth = r * .7; x.strokeStyle = hot(.34); x.beginPath(); x.ellipse(0, 0, r * 3.2, r * .55, 0, .05, 3.09); x.stroke();
    x.restore(); x.filter = 'none'; }
  // a few of them twinkle, very gently
  deepTw = [];
  for (let i = 0; i < 260 * area; i++)
    deepTw.push({ x: R(), y: R(), r: (.45 + R() * .4) * k, a: .25 + R() * .3, c: COLS[(R() * COLS.length) | 0], f: .2 + R() * .7, p: R() * 6.28 });
}

// ---------- star field ----------
// realistic shimmer: three incommensurate slow frequencies per star, never a regular blink
const shimmer = () => ({ f: [.15 + R() * .35, .5 + R() * .9, 1.3 + R() * 1.6], p: [R() * 6.28, R() * 6.28, R() * 6.28] });
const shine = (s, t) => .55 * Math.sin(t * s.f[0] + s.p[0]) + .3 * Math.sin(t * s.f[1] + s.p[1]) + .15 * Math.sin(t * s.f[2] + s.p[2]);
let stars = [], bright = [], pulsars = [], motes = [];
function buildStars() {
  buildSky();
  buildDeep();
  const area = W * H / (1920 * 1080);
  stars = [];
  const n = Math.round(2800 * area);
  for (let i = 0; i < n; i++) {
    const big = R() < .1;
    stars.push({ x: R() * 1.1 - .05, y: R() * 1.1 - .05, d: .2 + R() * .8, c: pickCol(),
      r: big ? 0.8 + R() * 0.8 : 0.45 + R() * 0.55, a: big ? .7 + R() * .3 : .35 + R() * .5,
      f: .15 + R() * .9, p: R() * 6.28, tw: R() < .3 ? .14 : .06, glow: big && R() < .4 });
  }
  // a few clusters
  for (const [cx, cy, k, sp] of [[.18, .72, 140, .035], [.63, .22, 110, .03], [.86, .66, 90, .025]]) {
    for (let i = 0; i < k * area; i++) {
      stars.push({ x: cx + gauss() * sp * (H / W) * 1.8, y: cy + gauss() * sp, d: .5, c: R() < .6 ? 1 + (R() * 3 | 0) : pickCol(),
        r: .3 + R() * .6, a: .3 + R() * .5, f: .2 + R() * .8, p: R() * 6.28, tw: .08, glow: R() < .15 });
    }
  }
  // red giants / blue giants: large soft
  for (let i = 0; i < 10 * area; i++) {
    const red = R() < .55;
    stars.push({ x: R(), y: R(), d: .6, c: red ? 8 : 0, r: 1.1 + R() * .8, a: .45 + R() * .25, f: .08 + R() * .15, p: R() * 6.28, tw: .06, glow: true });
  }
  for (const s of stars) Object.assign(s, shimmer(), { tw: .06 + R() * .16 });
  // bright foreground stars with spikes, embedded in front of the nebula
  bright = [];
  const BC = [[255, 160, 235], [200, 170, 255], [170, 205, 255], [255, 236, 210], [255, 205, 150], [160, 230, 255]];
  // smaller, softer and dimmer than before, so they sit in the cloud instead of on top of it
  for (let i = 0; i < Math.round(12 * area); i++) {
    const c = BC[(R() * BC.length) | 0], kind = R() < .45 ? 8 : 4, sz = 13 + R() * 15;
    bright.push({ x: .03 + R() * .94, y: .08 + R() * .88, c, kind, sz: sz * (R() < .12 ? 1.45 : 1), spr: spikeSprite(c, 128, kind, .6),
      gl: GLOW[[0, 2, 3, 4, 9, 11][(R() * 6) | 0]], a: .38 + R() * .24, ...shimmer() });
  }
  // pulsars: rotating beams + periodic flash
  pulsars = [
    { x: .72, y: .40, c: [140, 230, 255], per: 3.2, rot: .35, tilt: .5, len: 110, inc: .4 },
    { x: .31, y: .63, c: [215, 160, 255], per: 2.6, rot: .5, tilt: -.7, len: 90, inc: .32 },
    { x: .92, y: .18, c: [255, 205, 150], per: 4.1, rot: .25, tilt: 1.1, len: 95, inc: .45 },
    { x: .47, y: .86, c: [255, 160, 210], per: 3.6, rot: .4, tilt: .2, len: 80, inc: .35 }];
  for (const p of pulsars) { p.spr = spikeSprite(p.c, 96, 4); p.beam = beamSprite(p.c); p.halo = haloSprite(p.c); }
  // dust motes drifting towards the viewer
  motes = [];
  for (let i = 0; i < 45; i++) motes.push(newMote(true));
}
function newMote(init) {
  const a = R() * 6.28, r = init ? R() * .7 : R() * .08;
  return { a, r, z: init ? R() : 0, s: .0008 + R() * .0018, o: .03 + R() * .05, c: STAR_COLS[[0, 2, 9, 10, 11, 5][(R() * 6) | 0]] };
}


const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;
const HEAD = `
precision highp float;
varying vec2 v;
uniform vec2 uRes; uniform float uT; uniform vec2 uCam; uniform sampler2D uMap;

// lattice hash tolerant of mobile-GPU reassociation: small inputs (mod 289) scaled down before fract, so neighbouring cells stay consistent
float hash(vec2 p){ p = mod(p, 289.); vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
// per-pixel hash without periodic patterns on integer coordinates (hash() repeats every few pixels there)
float hashPx(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
const mat2 M = mat2(.8,.6,-.6,.8);
float fbm(vec2 p){ float a = .5, s = 0.; for(int i=0;i<5;i++){ s += a*noise(p); p = M*p*2.03 + vec2(1.7,9.2); a *= .5; } return s; }
float fbm3(vec2 p){ float a = .5, s = 0.; for(int i=0;i<3;i++){ s += a*noise(p); p = M*p*2.03 + vec2(1.7,9.2); a *= .5; } return s/.875; }
float ridge(vec2 p){ float a = .5, s = 0.; for(int i=0;i<5;i++){ float n = 1.-abs(noise(p)*2.-1.); s += a*n*n; p = M*p*2.11 + 3.1; a *= .5; } return s; }
vec4 over(vec4 top, vec4 under){ return top + under*(1.-top.a); }
`;

// distant nebula between the two star layers: bigger, slower, cooler and paler hues (OIII teal, sea green, ice,
// lilac, deep H-alpha crimson), with dark lanes that hide some of the deepest stars
const FS2 = HEAD + `
const vec3 D_TEAL = vec3(.10,.55,.58), D_SEA = vec3(.14,.58,.40), D_ICE = vec3(.50,.66,.92),
           D_LILAC = vec3(.46,.34,.74), D_CRIM = vec3(.62,.12,.24), D_INDIGO = vec3(.20,.22,.66);
vec3 farHue(float h){
  h = fract(h)*6.;
  if (h < 1.) return mix(D_TEAL, D_SEA, h);
  if (h < 2.) return mix(D_SEA, D_ICE, h-1.);
  if (h < 3.) return mix(D_ICE, D_LILAC, h-2.);
  if (h < 4.) return mix(D_LILAC, D_CRIM, h-3.);
  if (h < 5.) return mix(D_CRIM, D_INDIGO, h-4.);
  return mix(D_INDIGO, D_TEAL, h-5.);
}
void main(){
  float asp = uRes.x/uRes.y;
  vec2 c = v - .5; c.x *= asp;
  float t = uT, ft = t*.005;
  vec2 p = c*.8 + uCam*.1 + vec2(13., -4.);
  vec2 q = vec2(fbm(p + ft), fbm(p + vec2(5.2,1.3) - ft));
  vec2 r = vec2(fbm(p + 3.*q + vec2(1.7,9.2) + ft*.6), fbm(p + 3.*q + vec2(8.3,2.8) - ft*.5));
  float f = fbm(p + 2.6*r);
  float veil = mix(.3, 1., smoothstep(.3, .65, fbm3(p*.45 + r*.5 + 31.)));   // denser in some regions
  float cloud = smoothstep(.34, .74, f)*veil;
  float fil = pow(1. - abs(fbm3(p*2.2 + r*2. + ft)*2. - 1.), 6.);       // thin pale veils
  vec3 colA = farHue(fbm3(p*.35 + 7.)*2.2 + r.x*.8 + q.y*.5);
  vec3 colB = farHue(fbm3(p*.6 + 19.)*2.5 + .45 + ft*.3);
  float lane = smoothstep(.55, .82, fbm(p*1.7 - r*1.4 + 3.))*cloud;  // dark dust lanes
  vec3 em = (colA*cloud*.85 + colB*fil*cloud*.75 + colA*veil*.06)*(1. - lane*.75);
  float a = clamp(cloud*.4 + lane*.35, 0., .65);
  em = 1. - exp(-em*1.15);
  em = max(mix(vec3(dot(em, vec3(.3,.55,.15))), em, 1.15), 0.);
  em += (hashPx(floor(v*uRes) + floor(fract(t)*97.)*13.) - .5)/255.;
  gl_FragColor = vec4(em, a);
}`;

// Milky Way, drawn once into the deepest layer. Band geometry matches band()/wid() in buildDeep
// (centre line y = .04 + .9 x in canvas fractions). Output is premultiplied: rgb = light, alpha = dust that hides stars behind.
const FS_MW = HEAD + `
void main(){
  vec2 uv = vec2(v.x, 1. - v.y);
  float asp = uRes.x/uRes.y;
  vec2 P = vec2(uv.x*asp, uv.y);
  float s = .9/asp, n = sqrt(1. + s*s);
  float dist = (P.y - .04 - s*P.x)/n, along = (P.x + s*(P.y - .04))/n;
  float wdt = .075*(1. + .4*sin(along*3.4 + .6))*(.8 + .4*fbm3(vec2(along*1.5, 7.)));
  float prof = exp(-dist*dist/(2.*wdt*wdt));
  vec2 q = vec2(along*3.2, dist*7.);
  float cl = fbm(q + 1.3*vec2(fbm(q*1.7 + 3.), fbm(q*1.7 + 9.)));
  float clumps = smoothstep(.42, .8, cl);
  float bx = (.58*asp + s*.9*.58)/n;
  float bulge = exp(-pow((along - bx)/.35, 2.))*exp(-dist*dist/(2.*pow(wdt*1.3, 2.)));
  float dens = prof*(.25 + clumps) + bulge*.5;
  vec3 col = mix(vec3(.62,.70,1.), vec3(1.,.84,.66), clamp(bulge*1.2 + clumps*.15, 0., 1.));
  vec3 em = col*(prof*.07 + dens*.19);
  // gas lit by the densest star clouds: broad soft glow, pink (hydrogen) or blue (reflection)
  float gas = smoothstep(.45, .8, fbm(q*.45 + 17.))*(prof*.7 + .3*exp(-dist*dist/(2.*pow(wdt*2.2, 2.))));
  em += mix(vec3(.95,.45,.62), vec3(.45,.62,1.), fbm3(q*.3 + 4.))*gas*.17*(.45 + clumps);
  // unresolved stars, denser in the clouds
  vec2 px = floor(v*uRes);
  float st = step(1. - dens*.05, hashPx(px + 3.7));
  em += st*mix(vec3(.75,.82,1.), vec3(1.,.9,.78), hashPx(px + 517.1))*(.12 + pow(hashPx(px + 1311.3), 4.)*.8);
  // dark dust rift winding through the middle of the band
  float off = wdt*.22*sin(along*7.) + wdt*.1*sin(along*19.);
  float core = exp(-pow(dist - off, 2.)/(2.*pow(wdt*.3, 2.)));
  float lane = smoothstep(.45, .72, fbm(vec2(along*5., (dist - off)*16.) + .8*fbm(vec2(along*9., dist*20.))));
  float rift = core*lane*smoothstep(-.3, .3, sin(along*2.3 + 1.))*.9;
  em *= 1. - rift;
  em += (hashPx(px + 2741.) - .5)/255.;   // random (not ordered) dither
  gl_FragColor = vec4(max(em, 0.), rift*.85);
}`;
function renderMilkyWay(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
  if (!g) return null;
  drawGL(setupGL(g, FS_MW), c, 0, [0, 0]);
  return { canvas: c, free: () => { const e = g.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } };
}


function setupGL(gl, fs) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog); gl.useProgram(prog);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return { gl, uRes: gl.getUniformLocation(prog, 'uRes'), uT: gl.getUniformLocation(prog, 'uT'), uCam: gl.getUniformLocation(prog, 'uCam') };
}
function drawGL(u, cv, t, cam) {
  const g = u.gl; g.viewport(0, 0, cv.width, cv.height);
  g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT);
  g.uniform2f(u.uRes, cv.width, cv.height); g.uniform1f(u.uT, t); g.uniform2f(u.uCam, cam[0], cam[1]);
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
}

// sky gradient, built once with random dither (canvas gradients use an ordered dither that can show as a fine grid)
let sky = null;
function buildSky() {
  sky = document.createElement('canvas'); sky.width = W; sky.height = H;
  const x = sky.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  const S = [[0, [7, 11, 28]], [.55, [11, 20, 48]], [1, [14, 24, 56]]];
  for (let y = 0; y < H; y++) {
    const f = y / (H - 1), j = f < S[1][0] ? 0 : 1, u = (f - S[j][0]) / (S[j + 1][0] - S[j][0]);
    const c = S[j][1].map((v, i) => v + (S[j + 1][1][i] - v) * u);
    for (let xx = 0, o = y * W * 4; xx < W; xx++, o += 4) {
      const n = Math.random() - .5;
      d[o] = c[0] + n; d[o + 1] = c[1] + n; d[o + 2] = c[2] + n; d[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
}
// sky + the deepest stars (barely any parallax)
function drawFar(t, cam) {
  rx.globalCompositeOperation = 'source-over'; rx.globalAlpha = 1; rx.drawImage(sky, 0, 0);
  rx.globalCompositeOperation = 'lighter';
  const ox = -DEEP_M - cam[0] * .012 * W, oy = -DEEP_M - cam[1] * .012 * H;
  rx.drawImage(deep, ox, oy);
  for (const s of deepTw) {
    rx.globalAlpha = s.a * (.55 + .45 * Math.sin(t * s.f + s.p)); rx.fillStyle = css(STAR_COLS[s.c], 1);
    rx.fillRect(s.x * W + ox + DEEP_M - s.r / 2, s.y * H + oy + DEEP_M - s.r / 2, s.r, s.r);
  }
  rx.globalAlpha = 1;
  drawEvents(rx, t, cam, 0);
}

function drawBg(t, cam) {
  bx.globalCompositeOperation = 'source-over'; bx.clearRect(0, 0, W, H);
  bx.globalCompositeOperation = 'lighter';
  const k = Math.max(1, DPR * Math.sqrt(W * H / (1920 * 1080 * DPR * DPR)) * .9);
  for (const s of stars) {
    const x = (s.x - cam[0] * .05 * s.d) * W, y = (s.y - cam[1] * .05 * s.d) * H;
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const a = s.a * (1 + s.tw * shine(s, t)), r = s.r * k;
    if (s.glow) { const sz = r * 6; bx.globalAlpha = a * .9; bx.drawImage(GLOW[s.c], x - sz / 2, y - sz / 2, sz, sz); }
    else { bx.globalAlpha = a; bx.fillStyle = css(STAR_COLS[s.c], 1); bx.fillRect(x - r / 2, y - r / 2, r, r); }
  }
  bx.globalAlpha = 1;
  drawEvents(bx, t, cam, 1);
}

// one pulsar beam (both cones live in one sprite, pointing +x), blurred so it has no hard edges
const BEAM_L = 256, BEAM_H = 128;
function beamSprite(c) {
  const s = document.createElement('canvas'); s.width = BEAM_L; s.height = BEAM_H; const x = s.getContext('2d');
  x.filter = 'blur(5px)'; x.globalCompositeOperation = 'lighter'; const m = BEAM_H / 2;
  for (const [len, w, a] of [[1, .2, .5], [.7, .07, .7]]) {
    const L = BEAM_L * len * .92, g = x.createLinearGradient(0, 0, L, 0);
    g.addColorStop(0, css(c, a)); g.addColorStop(.3, css(c, a * .35)); g.addColorStop(.7, css(c, a * .08)); g.addColorStop(1, css(c, 0));
    x.fillStyle = g; x.beginPath(); x.moveTo(0, m);
    x.quadraticCurveTo(L * .5, m - BEAM_L * w * .5, L, m - BEAM_L * w); x.lineTo(L, m + BEAM_L * w);
    x.quadraticCurveTo(L * .5, m + BEAM_L * w * .5, 0, m); x.fill();
  }
  return s;
}
// wind-nebula halo: gaussian-like falloff, faint coloured ring, no visible disc edge
function haloSprite(c) {
  const n = 128, s = document.createElement('canvas'); s.width = s.height = n; const x = s.getContext('2d');
  const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  const w = [255, 255, 255];
  g.addColorStop(0, css(w, .5)); g.addColorStop(.06, css(c, .32)); g.addColorStop(.18, css(c, .12));
  g.addColorStop(.36, css(c, .05)); g.addColorStop(.42, css(c, .065)); g.addColorStop(.5, css(c, .03));
  g.addColorStop(.75, css(c, .008)); g.addColorStop(1, css(c, 0));
  x.fillStyle = g; x.fillRect(0, 0, n, n); return s;
}

// pulsars sit in front of the nebula (they are compact and bright), kept quiet
function drawPulsars(ctx, t, cam, k) {
  for (const p of pulsars) {
    const x = (p.x - cam[0] * .03) * W, y = (p.y - cam[1] * .03) * H, L = p.len * k;
    const ang = t * p.rot * Math.PI * 2 / 4;
    const flash = Math.pow(.5 + .5 * Math.cos(t * Math.PI * 2 / p.per), 8);
    const hs = L * (.9 + flash * .08);
    ctx.globalAlpha = .42 + flash * .18; ctx.drawImage(p.halo, x - hs / 2, y - hs / 2, hs, hs);
    // two beams on a precessing cone, squashed for a 3D look
    const bl = L * .42, bh = bl * BEAM_H / BEAM_L;
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.tilt); ctx.scale(1, p.inc);
    ctx.globalAlpha = .34 + flash * .2;
    for (const off of [0, Math.PI]) {
      ctx.save(); ctx.rotate(ang + off); ctx.drawImage(p.beam, 0, -bh / 2, bl, bh); ctx.restore();
    }
    ctx.restore();
    const cs = (9 + flash * 6) * k; ctx.globalAlpha = .22 + flash * .22;
    ctx.drawImage(p.spr, x - cs / 2, y - cs / 2, cs, cs);
    const cg = (5.5 + flash * 3) * k; ctx.globalAlpha = .85;
    ctx.drawImage(GLOW[3], x - cg / 2, y - cg / 2, cg, cg);
  }
  ctx.globalAlpha = 1;
}

// ---------- comets: one now and then, far away, slow, with an ion tail and a curved dust tail ----------
const COM_L = 440, COM_H = 150, COM_HX = 400;   // sprite size, head position
function cometSprite(ion, dust) {
  const s = document.createElement('canvas'); s.width = COM_L; s.height = COM_H; const x = s.getContext('2d');
  x.globalCompositeOperation = 'lighter'; const m = COM_H / 2;
  // dust tail: a wide, warm fan curving away from the path
  x.filter = 'blur(4px)';
  let g = x.createLinearGradient(COM_HX, 0, 30, 0);
  g.addColorStop(0, css(dust, .5)); g.addColorStop(.2, css(dust, .2)); g.addColorStop(.6, css(dust, .06)); g.addColorStop(1, css(dust, 0));
  x.fillStyle = g; x.beginPath(); x.moveTo(COM_HX, m - 3);
  x.quadraticCurveTo(250, m - 12, 40, m + 6); x.lineTo(70, m + 52); x.quadraticCurveTo(240, m + 22, COM_HX, m + 3); x.fill();
  // ion tail: thin, straight, blue-teal, the longest
  x.filter = 'blur(1.5px)';
  g = x.createLinearGradient(COM_HX, 0, 0, 0);
  g.addColorStop(0, css(ion, .65)); g.addColorStop(.3, css(ion, .2)); g.addColorStop(1, css(ion, 0));
  x.fillStyle = g; x.beginPath(); x.moveTo(COM_HX, m - 1.5); x.lineTo(0, m - 9); x.lineTo(0, m - 1); x.lineTo(COM_HX, m + 1.5); x.fill();
  // coma: soft glowing head with a small bright nucleus
  x.filter = 'none';
  x.drawImage(glowSprite(ion, 70), COM_HX - 35, m - 35);
  x.drawImage(glowSprite([255, 250, 240], 18), COM_HX - 9, m - 9);
  return s;
}
// ---------- sky events on three depths: 0 = behind the distant nebula, 1 = between the nebulae, 2 = in front ----------
// the farther the layer, the smaller, slower, dimmer and the less parallax
const DEPTH = [{ sc: [.16, .24], par: .012, a: .45, sp: .55 }, { sc: [.25, .34], par: .05, a: .6, sp: .8 },
               { sc: [.36, .48], par: .09, a: .7, sp: 1 }];
let comets = [], novae = [], nextComet = 14, nextNova = 70;   // t starts at 40: first comet after ~8 s
const pickDepth = () => { const r = Math.random(); return r < .4 ? 0 : r < .75 ? 1 : 2; };
function spawnComet(t, layer = pickDepth()) {
  const rr = Math.random, edge = rr() < .5, L = DEPTH[layer];
  // start near a top or side edge, cross a part of the screen diagonally
  const x0 = edge ? rr() * .8 + .1 : (rr() < .5 ? -.05 : 1.05), y0 = edge ? -.05 : rr() * .5;
  const tx = .2 + rr() * .6, ty = .35 + rr() * .5, d = Math.hypot(tx - x0, (ty - y0) * H / W) || 1;
  const life = 16 + rr() * 10, sp = (.28 + rr() * .2) * L.sp / life;
  comets.push({ layer, x0, y0, vx: (tx - x0) / d * sp, vy: (ty - y0) / d * sp * W / H, t0: t, life,
    sc: L.sc[0] + rr() * (L.sc[1] - L.sc[0]),
    spr: cometSprite(rr() < .5 ? [130, 190, 255] : [120, 235, 230], rr() < .5 ? [255, 236, 205] : [255, 220, 235]) });
  nextComet = t + life + 15 + rr() * 30;
}
// a distant supernova: a star flares up over a few seconds, then slowly fades
function spawnNova(t, layer = Math.random() < .6 ? 0 : 1) {
  const rr = Math.random;
  novae.push({ layer, x: .06 + rr() * .88, y: .08 + rr() * .84, t0: t, rise: 2.5 + rr() * 2, fade: 7 + rr() * 5,
    c: [[200, 220, 255], [255, 240, 220], [190, 240, 255]][(rr() * 3) | 0], sz: 1 + rr() * .6 });
  nextNova = t + 70 + rr() * 80;
}
function updateEvents(t) {
  if (qs.has('static')) return;
  if (t > nextComet) spawnComet(t);
  if (t > nextNova) spawnNova(t);
  comets = comets.filter(c => t - c.t0 < c.life);
  novae = novae.filter(n => t - n.t0 < n.rise + n.fade * 5);
}
function drawEvents(ctx, t, cam, layer) {
  const k = Math.max(1, Math.sqrt(W * H / (1920 * 1080))), L = DEPTH[layer];
  for (const c of comets) {
    if (c.layer !== layer) continue;
    const a = (t - c.t0) / c.life, env = Math.pow(Math.sin(Math.PI * a), 1.5);
    const x = (c.x0 + c.vx * (t - c.t0) - cam[0] * L.par) * W, y = (c.y0 + c.vy * (t - c.t0) - cam[1] * L.par) * H;
    const s = c.sc * k;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(c.vy * H, c.vx * W));
    ctx.globalAlpha = L.a * env; ctx.drawImage(c.spr, -COM_HX * s, -COM_H / 2 * s, COM_L * s, COM_H * s);
    ctx.restore();
  }
  for (const n of novae) {
    if (n.layer !== layer) continue;
    const dt = t - n.t0, env = dt < n.rise ? Math.pow(dt / n.rise, 2) : Math.exp(-(dt - n.rise) / n.fade);
    const x = (n.x - cam[0] * L.par) * W, y = (n.y - cam[1] * L.par) * H;
    const g = (3 + env * 14) * n.sz * k * (layer ? 1.3 : 1);
    ctx.globalAlpha = .9 * env; ctx.drawImage(GLOW[2], x - g / 2, y - g / 2, g, g);
    if (layer) { const s = g * 1.6; ctx.globalAlpha = .35 * env; ctx.drawImage(NOVA_SPR, x - s / 2, y - s / 2, s, s); }
  }
  ctx.globalAlpha = 1;
}

function drawFg(t, cam, dt) {
  fx.clearRect(0, 0, W, H);
  fx.globalCompositeOperation = 'lighter';
  const k = Math.sqrt(W * H / (1920 * 1080));
  drawEvents(fx, t, cam, 2);
  drawPulsars(fx, t, cam, Math.max(1, k * .9));
  for (const b of bright) {
    const x = (b.x - cam[0] * .09) * W, y = (b.y - cam[1] * .09) * H;
    const v = shine(b, t), sz = b.sz * k * (1 + v * .06);
    // soft halo melts the star into the gas around it; the spikes breathe a little with the brightness
    const hs = sz * .9; fx.globalAlpha = b.a * .22 * (1 + v * .2); fx.drawImage(b.gl, x - hs / 2, y - hs / 2, hs, hs);
    fx.globalAlpha = b.a * (1 + v * .16); fx.drawImage(b.spr, x - sz / 2, y - sz / 2, sz, sz);
  }
  // motes: fly outward from the centre, grow and fade = moving forward through the cloud
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i]; m.z += m.s * dt * 30; m.r += m.s * dt * 30 * (.25 + m.r);
    if (m.z > 1 || m.r > 1.2) { motes[i] = newMote(false); continue; }
    const x = W * .5 + Math.cos(m.a) * m.r * W * .6 - cam[0] * W * .15 * m.z;
    const y = H * .5 + Math.sin(m.a) * m.r * H * .9 - cam[1] * H * .15 * m.z;
    const sz = (1.2 + m.z * m.z * 9) * k, a = Math.sin(m.z * Math.PI) * m.o;
    fx.globalAlpha = a; fx.drawImage(GLOW[3], x - sz / 2, y - sz / 2, sz, sz);
  }
  fx.globalAlpha = 1;
}



// czarna dziura (ta sama co na tapecie: .445 x .6, pochylenie -.28): światło krąży po dysku, strona zbliżająca się jaśniejsza
function drawBlackHole(t) {
  const k = Math.max(1, Math.sqrt(W * H / (1920 * 1080))), r = 4.5 * k, cx = .445 * W, cy = .6 * H, rot = -.28, prev = fx.globalCompositeOperation;
  fx.globalCompositeOperation = 'lighter'; fx.save(); fx.translate(cx, cy); fx.rotate(rot);
  for (let i = 0; i < 5; i++) {
    const ph = t * (.32 - i * .03) + i * 1.9, x = Math.cos(ph) * r * 3.2, y = Math.sin(ph) * r * .55, side = Math.sin(ph), br = .28 + .22 * side + .06 * Math.sin(t * 1.7 + i);
    const s = r * (2.6 - i * .25); fx.globalAlpha = Math.max(0, br) * (side < -.7 ? .45 : 1); fx.drawImage(GLOW[side > 0 ? 7 : 6], x - s / 2, y - s / 2 * .45, s, s * .45);
  }
  fx.restore(); fx.globalAlpha = 1; fx.globalCompositeOperation = prev;
}
const Backdrop = {
  init() {
    far = document.getElementById('far'); bg = document.getElementById('bg'); fg = document.getElementById('fg'); glc2 = document.getElementById('gl2');
    rx = far.getContext('2d'); bx = bg.getContext('2d'); fx = fg.getContext('2d');
    gl2 = glc2.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: false, antialias: false });
    U2 = setupGL(gl2, FS2);
    this.resize(innerWidth, innerHeight, Math.min(window.devicePixelRatio || 1, 2));
  },
  resize(w, h, dpr) {
    DPR = Math.min(dpr, 1.5); W = Math.round(w * DPR); H = Math.round(h * DPR);
    for (const c of [far, bg, fg]) { c.width = W; c.height = H; }
    glc2.width = Math.round(W * .25); glc2.height = Math.round(H * .25);
    stars = []; buildStars(); motes = [];
  },
  frame(t, cam, dt, slow) {
    updateEvents(t);
    if (slow) { drawFar(t, cam); drawGL(U2, glc2, t, cam); drawBg(t, cam); }
    drawFg(t, cam, dt);
    drawBlackHole(t);
  },
};
window.Backdrop = Backdrop;
})();
