/* Harv: dźwięk generatywny (WebAudio, bez plików). Wolny, kosmiczny, miękki.
   Tło: akordy D-dur z atakiem ~9 s i pogłosem 8 s (jak w komet.run, ale reaktywne), każdy przejęty sektor dodaje sustained głos.
   Mieszanka: R = D, G = F#, B = A (triada); pad z trzech sinusów zależny od liczników slotów, filtr otwiera się przy zbliżaniu do celu,
   powolne dudnienie (detune) znika, gdy cel jest trafiony. Efekty to szklane dzwonki skali pentatonicznej. */
(function () {
'use strict';
const muteParam = new URLSearchParams(location.search).has('mute');
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [62, 64, 66, 69, 71];                          // D E F# A B
const CHORDS = [[38, 45, 54, 64], [35, 42, 50, 61], [43, 50, 59, 66], [45, 52, 61, 64]];   // I, vi, IV, V7 (wolne)
let ctx = null, master = null, bus = null, dryLp = null, revS = null, revL = null, muted = muteParam;
let bed = null, bedOut = null, bedLevel = .7, chordIdx = 0, nextChord = 0, mix = null, layers = [], claimedN = 0, moveN = null, noiseBuf = null;
let winPad = null, lastWin = 0, winWarned = false, songs = [], songI = 0, nextSong = 0;
let drone = null, lastU = 0, menuOn = false, inSec = false, lastDrip = 0, duckUntil = 0;

function panner(p) { if (ctx.createStereoPanner) { const n = ctx.createStereoPanner(); n.pan.value = p || 0; return n; } return ctx.createGain(); }
function impulse(sec, decay, dark) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let y = 0;
    for (let i = 0; i < len; i++) { const u = i / len, x = (Math.random() * 2 - 1) * Math.exp(-decay * u) * (1 - u); y += (x - y) * (.9 - .8 * u * dark); d[i] = y * 1.8; } }
  return b;
}
function make() {
  if (ctx || muteParam) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : .6;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.knee.value = 24; comp.ratio.value = 3.5; comp.attack.value = .02; comp.release.value = .4;
    dryLp = ctx.createBiquadFilter(); dryLp.type = 'lowpass'; dryLp.frequency.value = 8200; dryLp.Q.value = .4;
    bus = ctx.createGain(); bus.gain.value = 1;
    bus.connect(dryLp); dryLp.connect(master); master.connect(comp); comp.connect(ctx.destination);
    const sS = ctx.createGain(); sS.gain.value = .22; revS = ctx.createConvolver(); revS.buffer = impulse(1.9, 6, .6); bus.connect(sS); sS.connect(revS); revS.connect(master);
    const sL = ctx.createGain(); sL.gain.value = .62; revL = ctx.createConvolver(); revL.buffer = impulse(8.5, 3.6, .9); bus.connect(sL); sL.connect(revL); revL.connect(master);
    // chorus: dwie modulowane linie opóźnienia rozrzucone w stereo, szeroko i miękko
    [[.022, .17, -.6], [.029, .23, .6]].forEach(([dl, f, p]) => { const d = ctx.createDelay(.1), l = ctx.createOscillator(), lg = ctx.createGain(), w = ctx.createGain(), pn = panner(p);
      d.delayTime.value = dl; l.frequency.value = f; lg.gain.value = .006; w.gain.value = .5; l.connect(lg); lg.connect(d.delayTime); l.start(); bus.connect(d); d.connect(w); w.connect(pn); pn.connect(master); w.connect(sL); });
    const nb = Math.ceil(ctx.sampleRate * 3); noiseBuf = ctx.createBuffer(1, nb, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nb; i++) nd[i] = Math.random() * 2 - 1;
    bedOut = ctx.createGain(); bedOut.gain.value = 0; bedOut.connect(bus);
    startMix(); startMove(); startBed(); setLayers(claimedN);
  } catch (e) { ctx = null; }
}
// ---- głosy ----
function bell(f, t, vol, pan, dur) {
  const out = ctx.createGain(), pn = panner(pan); out.gain.value = vol; out.connect(pn); pn.connect(bus);
  const parts = [[1, 1, dur], [2.756, .3, dur * .55], [5.404, .11, dur * .3], [8.93, .045, dur * .18]]; let last = null;
  parts.forEach(([m, a, dd]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + .005); g.gain.exponentialRampToValueAtTime(.0004, t + dd); o.connect(g); g.connect(out); o.start(t); o.stop(t + dd + .05); if (!last) last = o; });
  last.onended = () => { try { out.disconnect(); pn.disconnect(); } catch (e) {} };
}
function sweep(f0, f1, t, dur, vol, type, pan, att) {
  const o = ctx.createOscillator(), g = ctx.createGain(), pn = panner(pan); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (att || dur * .4)); g.gain.exponentialRampToValueAtTime(.0004, t + dur); o.connect(g); g.connect(pn); pn.connect(bus); o.start(t); o.stop(t + dur + .05);
  o.onended = () => { try { g.disconnect(); pn.disconnect(); } catch (e) {} };
}
function noiseSweep(f0, f1, t, dur, vol, q, pan) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const bp = ctx.createBiquadFilter(), g = ctx.createGain(), pn = panner(pan);
  bp.type = 'bandpass'; bp.Q.value = q || 1.2; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .5); g.gain.linearRampToValueAtTime(0, t + dur); s.connect(bp); bp.connect(g); g.connect(pn); pn.connect(bus); s.start(t, Math.random() * 1.5, dur + .05);
  s.onended = () => { try { g.disconnect(); pn.disconnect(); } catch (e) {} };
}
function padVoice(m, vol, att, cutoff, pan, dest) {
  const t = ctx.currentTime, f = mtof(m), out = ctx.createGain(), lp = ctx.createBiquadFilter(), pn = panner(pan), oscs = [];
  lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = .4; out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol, t + att);
  [['triangle', -6, 1], ['triangle', 7, .8], ['sine', 0, 1], ['sine', 1200, .22]].forEach(([ty, dt, a]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = ty; o.frequency.value = f; o.detune.value = dt; g.gain.value = a * .5; o.connect(g); g.connect(lp); o.start(t); oscs.push(o); });
  const lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = .06 + Math.random() * .08; lg.gain.value = vol * .22; lf.connect(lg); lg.connect(out.gain); lf.start(t);
  lp.connect(out); out.connect(pn); pn.connect(dest || bedOut);
  return { stop(rel) { const n = ctx.currentTime; out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.setTargetAtTime(0, n, rel / 3.2);
    oscs.forEach(o => o.stop(n + rel + .5)); lf.stop(n + rel + .5); oscs[0].onended = () => { try { out.disconnect(); pn.disconnect(); lp.disconnect(); } catch (e) {} }; } };
}
// ---- tło: wolne akordy ----
function startBed() { bed = null; nextChord = 0; }
function tickBed() {
  if (!ctx || muted) return; const now = ctx.currentTime;
  bedOut.gain.setTargetAtTime((menuOn ? .95 : inSec ? 1 : .7) * (.45 + Math.min(.55, claimedN * .04)) * .55 * (now < duckUntil ? .22 : 1), now, now < duckUntil ? .15 : 1.5);
  tickSongs(now);
  if (now >= nextChord) {
    const old = bed; chordIdx = (chordIdx + (bed ? 1 : 0)) % CHORDS.length; const ch = CHORDS[chordIdx];
    bed = ch.map((m, i) => padVoice(m, i === 0 ? .1 : .06, 9, 700 + i * 260, [-.5, .1, -.15, .45][i]));
    if (old) old.forEach(v => v.stop(11)); nextChord = now + 26;
  }
}
// ---- pieśni przejętych dziur: cztery nuty (kolor -> R=D, G=F#, B=A), cicho, na mapie, po jednej co ok. 13 s po kolei ----
function tickSongs(now) {
  if (!songs.length || inSec || menuOn || now < nextSong) return;
  const sg = songs[songI++ % songs.length]; nextSong = now + 13 + (songs.length < 3 ? 5 : 0);
  sg.n.forEach((c, i) => bell(mtof([74, 78, 81][c % 3] + (i === sg.n.length - 1 ? 12 : 0)), now + .2 + i * .72, .024, sg.p, 3.4));
}
// ---- warstwy przejętych sektorów ----
function setLayers(n) {
  claimedN = n; if (!ctx) return;
  while (layers.length < n) { const i = layers.length, m = PENTA[(i * 2) % 5] + 12 + 12 * (Math.floor(i / 5) % 2); layers.push(padVoice(m, .016, 8, 1800, Math.sin(i * 1.7) * .6)); }
  while (layers.length > n) layers.pop().stop(3);
}
// ---- pad mieszanki: trzy sinusy R/G/B ----
function startMix() {
  const f = ctx.createBiquadFilter(), out = ctx.createGain(), tr = ctx.createGain(), lf = ctx.createOscillator(), lg = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = .5; out.gain.value = 0;
  lf.frequency.value = 4; lg.gain.value = 0; lf.connect(lg); lg.connect(tr.gain); tr.gain.value = 1; lf.start(); f.connect(tr); tr.connect(out); out.connect(bus);
  const voices = [50, 54, 57].map((m, i) => { const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m - 12);
    g.gain.value = 0; o.connect(g); o2.connect(g); g.connect(f); o.start(); o2.start(); return { o, o2, g }; });
  mix = { f, out, lf, lg, voices };
}
// ---- szum lotu i krople ----
function startMove() {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), pn = panner(0);
  bp.type = 'bandpass'; bp.Q.value = .8; bp.frequency.value = 400; lp.type = 'lowpass'; lp.frequency.value = 900; g.gain.value = 0; s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(pn); pn.connect(bus); s.start();
  const hum = ctx.createOscillator(), hg = ctx.createGain(); hum.type = 'sine'; hum.frequency.value = 70; hg.gain.value = 0; hum.connect(hg); hg.connect(bus); hum.start();
  moveN = { bp, lp, g, hum, hg };
}
const A2 = {
  unlock() { make(); if (ctx && ctx.state !== 'running') ctx.resume(); },
  setMute(m) { muted = m || muteParam; if (master) master.gain.setTargetAtTime(muted ? 0 : .6, ctx.currentTime, .08); },
  toggle() { this.setMute(!muted); return muted; },
  isMuted() { return muted; },
  menu(on) { menuOn = !!on; },
  layers(n) { setLayers(n); },
  songs(list) { songs = list || []; if (songI >= songs.length) songI = 0; if (ctx && nextSong < ctx.currentTime + 4) nextSong = ctx.currentTime + 4; },      // pieśni zdobytych dziur (z gry)
  // pad mieszanki i nastrój; d = odległość do celu, sec = czy w sektorze
  update(cnt, d, sec, vis) {
    if (!ctx || muted) return; const t = ctx.currentTime; if (t - lastU < .08) return; lastU = t; inSec = sec; tickBed();
    const on = sec ? 1 : .22 * (1 - vis), tot = cnt[0] + cnt[1] + cnt[2] || 1;
    mix.voices.forEach((v, i) => { v.g.gain.setTargetAtTime(.2 * cnt[i] / tot * on, t, .6); v.o.detune.setTargetAtTime((i - 1) * Math.min(d, 4) * 7, t, .4); });
    mix.f.frequency.setTargetAtTime(380 + (4 - Math.min(d, 4)) * 900, t, .5); mix.out.gain.setTargetAtTime(.55, t, .8);
    mix.lf.frequency.setTargetAtTime(Math.max(.25, d * .9), t, .4); mix.lg.gain.setTargetAtTime(d > 0 ? .22 : 0, t, .3);
  },
  // lot statku: szum, mruczenie i krople rtęci; sp 0..1, bog = grzęźnie, a = widoczność mapy
  move(sp, bog, a) {
    if (!ctx || muted || !moveN) return; const t = ctx.currentTime, v = Math.pow(sp, 1.3) * a;
    moveN.g.gain.setTargetAtTime(v * .07 + (bog ? .05 * a * (.4 + sp) : 0), t, .2);
    moveN.bp.frequency.setTargetAtTime(bog ? 130 : 220 + 1500 * sp, t, .25); moveN.lp.frequency.setTargetAtTime(bog ? 220 : 700 + 2200 * sp, t, .25);
    moveN.hum.frequency.setTargetAtTime(52 + 60 * sp, t, .3); moveN.hg.gain.setTargetAtTime(v * .05 + (bog ? .03 * a : 0), t, .3);
    if (sp > .12 && a > .5 && t - lastDrip > .8 && Math.random() < .03 + sp * .08) { lastDrip = t; bell(mtof(PENTA[(Math.random() * 5) | 0] + 12 + 12 * (Math.random() < .5 ? 1 : 0)), t, .008 + sp * .005, Math.random() * 1.2 - .6, 1.4); }
  },
  press(k, state, cur, tgt, delay) { if (!ctx || muted) return;
    if (delay !== undefined) { const m = [74, 78, 81][state % 3] + (k === 0 ? 12 : k === 2 ? -12 : 0); bell(mtof(m), ctx.currentTime + delay, .11, k === 1 ? .5 : k === 3 ? -.5 : 0, 3); return; }      // Puls: kolor -> nuta triady D-dur, na siatce
    const t = ctx.currentTime + (delay || 0), idx = (state * 2 + k) % 5, m = PENTA[idx] + (k < 2 ? 24 : 12);
    bell(mtof(m), t, .11, k === 1 ? .5 : k === 3 ? -.5 : 0, 3); sweep(mtof(m - 24), mtof(m - 24) * .8, t, .35, .05, 'sine', 0, .02); },
  // tryb Puls: wspólny puls (delay = sekundy do uderzenia na siatce, już z kalibracją), arpeggio z kolorów punktów i akord
  now() { return ctx ? ctx.currentTime : null; },
  latency() { return ctx ? Math.min(.4, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)) : 0; },
  tick(delay, accent, v) { if (!ctx || muted) return; const t = ctx.currentTime + (delay || 0), vol = (accent ? .06 : .035) * (v == null ? 1 : v), g = ctx.createGain(), o = ctx.createOscillator();      // sucha ścieżka (bez pogłosu), wyższy klik
    o.type = 'sine'; o.frequency.setValueAtTime(accent ? 1300 : 1700, t); o.frequency.exponentialRampToValueAtTime(accent ? 700 : 900, t + .05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .002); g.gain.exponentialRampToValueAtTime(.0004, t + .09); o.connect(g); g.connect(dryLp); o.start(t); o.stop(t + .1);
    if (accent) { const o2 = ctx.createOscillator(), g2 = ctx.createGain(); o2.type = 'sine'; o2.frequency.setValueAtTime(147, t); o2.frequency.exponentialRampToValueAtTime(73.4, t + .18);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 1.4, t + .004); g2.gain.exponentialRampToValueAtTime(.0004, t + .2); o2.connect(g2); g2.connect(dryLp); o2.start(t); o2.stop(t + .22); o2.onended = () => { try { g2.disconnect(); } catch (e) {} }; }
    o.onended = () => { try { g.disconnect(); } catch (e) {} }; },
  fillV(v) { if (!ctx || muted) return; if (!drone) { const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 200; g.gain.value = 0;
      [[38, 'sine'], [45, 'sine'], [50, 'triangle'], [57, 'triangle']].forEach(([m, ty]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = ty; o.frequency.value = mtof(m); og.gain.value = ty === 'sine' ? 1 : .45; o.connect(og); og.connect(f); o.start(); }); f.connect(g); g.connect(bus); drone = { f, g }; }
    const t = ctx.currentTime, x = Math.max(0, v); drone.g.gain.setTargetAtTime(x > .02 ? .025 + .13 * x : 0, t, .3); drone.f.frequency.setTargetAtTime(220 + x * 1500, t, .4); },      // bas z napełniania dziury: liniowo, słyszalny od początku (oktawa i kwinta wyżej)
  arp(c, delay, vol, pan, oct) { if (!ctx || muted) return; const t = ctx.currentTime + (delay || 0), m = [74, 78, 81][c % 3] + (oct || 0); bell(mtof(m), t, .06 + .05 * (vol == null ? 1 : vol), pan || 0, 2.6); },
  chord(delay) { if (!ctx || muted) return; const t = ctx.currentTime + (delay || 0); [62, 66, 69, 74].forEach((m, i) => bell(mtof(m + 12), t + i * .035, .07, [-.3, .1, -.1, .3][i], 3.6)); [50, 57, 62].forEach((m, i) => bell(mtof(m), t + i * .02, .06, 0, 4.5)); sweep(mtof(38), mtof(38) * 1.02, t, 1.6, .1, 'sine', 0, .02); },
  warn(k, from, to) { if (!ctx || muted) return; const t = ctx.currentTime;
    if (to != null) { const m0 = [74, 78, 81][from % 3], m1 = [74, 78, 81][to % 3], pn = k === 1 ? .4 : k === 3 ? -.4 : 0;      // zapowiedź: duch nowego koloru: glissando ze starej nuty na nową, potem trzyma
      sweep(mtof(m0), mtof(m1), t, .45, .06, 'sine', pn, .3); sweep(mtof(m1), mtof(m1) * 1.003, t + .45, .8, .035, 'sine', pn, .3); return; }
    const m = PENTA[k % 5] + 24; sweep(mtof(m), mtof(m + 7), t, .65, .07, 'sine', k === 1 ? .4 : k === 3 ? -.4 : 0, .5); },
  fb(better, worse, delay, state) { if (!ctx || muted) return; const t = ctx.currentTime + (delay || 0), m = [74, 78, 81][state % 3];      // wynik wciśnięcia: bliżej = jasna kwinta w górę, dalej = krótkie przytłumione E5, bez dysonansu
    if (better) bell(mtof(m + 12), t + .02, .05, 0, 1.4); else if (worse) sweep(mtof(76), mtof(74), t, .3, .03, 'sine', 0, .02); },
  boost(i, delay, perfect) { if (!ctx || muted) return; const t = ctx.currentTime + (delay || 0), m = [74, 78, 81, 86, 90][Math.max(0, i) % 5];      // podbicie: kolejny stopień drabinki D-F#-A-D-F#
    bell(mtof(m), t, perfect ? .1 : .075, 0, 3.2); if (perfect) bell(mtof(m + 12), t + .02, .04, .2, 2.4); },
  pearl(k) { if (!ctx || muted) return; const t = ctx.currentTime, pn = k === 1 ? .3 : k === 3 ? -.3 : 0; bell(mtof(86), t, .075, pn, 1.8); sweep(mtof(62), mtof(74), t, .5, .03, 'sine', pn, .3); },      // słyszalny dzwonek iskry
  breath() { if (!ctx || muted) return; noiseSweep(900, 250, ctx.currentTime, .4, .03, .8, 0); },      // miękki wydech: perła zgasła lub chybiona
  pearlNow(k) { if (!ctx || muted) return; const t = ctx.currentTime, pn = k === 1 ? .3 : k === 3 ? -.3 : 0; bell(mtof(93), t, .04, pn, .9); },      // Spokojny: cichy ping w chwili, gdy pierścień iskry zaczyna być „idealny"
  // okno podejścia: pad D-dur, który ubywa od góry wraz z rezerwą rem (1..0; <0 = wyłączony); dopasowanie (hold) rozjaśnia; jeden dzwonek A5 przy ~10% i nigdy tykanie
  win(rem, hold) { if (!ctx || muted) return; const t = ctx.currentTime; if (t - lastWin < .08) return; lastWin = t;
    if (!winPad) { const lp = ctx.createBiquadFilter(), out = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 450; lp.Q.value = .3; out.gain.value = 0; lp.connect(out); out.connect(bus);
      const lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = .12; lg.gain.value = .0; lf.connect(lg); lg.connect(out.gain); lf.start();
      const vs = [[50, 0], [57, .15], [66, .4], [74, .6]].map(([m, th]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(m); g.gain.value = 0; o.connect(g); g.connect(lp); o.start(); return { g, th }; });
      winPad = { lp, out, vs, lg, lf }; }
    const on = rem >= 0;
    winPad.out.gain.setTargetAtTime(on ? (hold ? .045 : .034) : 0, t, on ? 1.4 : .8);
    if (!on) { winWarned = false; return; }
    winPad.vs.forEach(v => v.g.gain.setTargetAtTime(rem > v.th ? 1 : 0, t, 1.2));
    winPad.lp.frequency.setTargetAtTime(450 + 2150 * rem + (hold ? 600 : 0), t, .6);
    winPad.lg.gain.setTargetAtTime(.006 + .012 * (1 - rem), t, 1); winPad.lf.frequency.setTargetAtTime(.13 - .05 * (1 - rem), t, 1);
    if (rem < .1 && rem > 0 && !winWarned) { winWarned = true; bell(mtof(81), t, .04, 0, 4); } else if (rem > .3) winWarned = false; },
  // wydech dziury: opadający trójdźwięk (rozwiązanie na tonikę), miękko, bez kary
  fail() { if (!ctx || muted) return; const t = ctx.currentTime; noiseSweep(900, 250, t, .5, .03, .8, 0); [[81, -.2, .05], [78, 0, .04], [74, .2, .03]].forEach(([m, pn, v], i) => bell(mtof(m), t + .15 + i * .5, v, pn, 3)); sweep(mtof(50), mtof(38), t, 2.4, .06, 'sine', 0, .6); },
  ready(c) { if (!ctx || muted) return; const t = ctx.currentTime, m = [74, 78, 81][(c | 0) % 3]; bell(mtof(m), t, .05, 0, 3.5); bell(mtof(m + 12), t + .12, .02, .2, 2.5); },      // odpoczynek skończony: dzwonek w nucie koloru sektora
  flood(q) { if (!ctx || muted) return; const t = ctx.currentTime; bell(mtof([74, 78, 81][(q - 1) % 3] + 12), t, .06, 0, 3); },      // kamienie milowe zalewania .25/.5/.75
  hit() { if (!ctx || muted) return; const t = ctx.currentTime; sweep(120, 52, t, .45, .13, 'sine', 0, .02); noiseSweep(500, 150, t, .3, .03, .6, 0); },
  match() { if (!ctx || muted) return; const t = ctx.currentTime; [74, 78, 81, 86].forEach((m, i) => bell(mtof(m), t + i * .22, .085 - i * .008, [-.3, .2, -.1, .35][i], 4)); noiseSweep(1500, 6000, t, 1.4, .012, 1.5, 0); },
  catch2(perfect) { if (!ctx || muted) return; const t = ctx.currentTime; [90, 93].forEach((m, i) => bell(mtof(m), t + i * .09, .06, i ? .3 : -.3, 2)); if (perfect) bell(mtof(97), t + .2, .05, 0, 2.5); },
  claim() { if (!ctx || muted) return; const t = ctx.currentTime; duckUntil = t + .8; setLayers(claimedN + 1);
    const MOT = [74, 78, 81, 76, 78], nm = Math.min(5, 1 + Math.ceil(claimedN / 3)); for (let i = 0; i < nm; i++) bell(mtof(MOT[i]), t + .8 + i * .55, .07, [-.2, .2, 0, -.15, .15][i], 4.5);
    for (let i = 0; i < 9; i++) bell(mtof(PENTA[i % 5] + 12 + 12 * Math.floor(i / 5) + 12), t + i * .26, .09, Math.sin(i) * .5, 5);
    [50, 57, 66, 74].forEach((m, i) => { const v = padVoice(m, .05, 1.8, 900 + i * 220, [-.4, .3, -.2, .5][i], bus); setTimeout(() => v.stop(5), 2600); });
    sweep(mtof(38), mtof(38) * 1.03, t, 3.2, .13, 'sine', 0, 1.2); noiseSweep(800, 9000, t, 2.6, .02, 1.8, 0); },
  finale() { if (!ctx || muted) return; const t = ctx.currentTime; duckUntil = t + 1.2; [74, 78, 81, 86, 78, 74].forEach((m, i) => bell(mtof(m), t + 1.2 + i * .7, .075, Math.sin(i) * .4, 6)); sweep(mtof(38), mtof(38) * 1.01, t + 1, 6, .1, 'sine', 0, 2.5); },
  dive() { if (!ctx || muted) return; const t = ctx.currentTime; noiseSweep(180, 3200, t, 1.3, .05, 1, 0); sweep(70, 320, t, 1.1, .06, 'sine', 0, .6); bell(mtof(81), t + 1.05, .05, 0, 3); },
  surface() { if (!ctx || muted) return; const t = ctx.currentTime; noiseSweep(3000, 180, t, .9, .04, 1, 0); sweep(300, 70, t, .8, .05, 'sine', 0, .3); },
  ui(kind) { if (!ctx || muted) return; const t = ctx.currentTime;
    if (kind === 'hover') bell(mtof(95), t, .028, 0, .9); else if (kind === 'back') { bell(mtof(78), t, .05, 0, 1.6); } else { bell(mtof(86), t, .06, 0, 2.4); bell(mtof(74), t + .08, .04, 0, 2.4); } },
};
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume(); });
const stub = { unlock() {}, setMute() {}, toggle() { return true; }, isMuted() { return true; }, menu() {}, layers() {}, songs() {}, update() {}, move() {}, press() {}, warn() {}, fb() {}, boost() {}, pearl() {}, pearlNow() {}, breath() {}, tick() {}, arp() {}, chord() {}, fillV() {}, now() { return null; }, latency() { return 0; }, hit() {}, win() {}, fail() {}, ready() {}, flood() {}, match() {}, catch2() {}, claim() {}, finale() {}, dive() {}, surface() {}, ui() {} };
window.Audio2 = muteParam ? stub : A2;
})();
