/* Harvester: paleta i matematyka mieszania barw.
   Trzy kolory podstawowe to ŚWIATŁO gazu (addytywnie: R+G=żółć, G+B=turkus, R+B=magenta, R+G+B=perła).
   Przepis = liczniki slotów [nR,nG,nB] o sumie 4 => 15 przepisów: 12 odcieni koła (pierścień trójkąta)
   + 3 pastele (2+1+1, wnętrze trójkąta). */
(function () {
'use strict';
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// koło 12 odcieni w kolejności: R, R3G1, Y, G3R1, G, G3B1, C, B3G1, B, B3R1, M, R3B1
const RING = ['#ff3d68', '#ff7a3a', '#ffc65a', '#c4e65c', '#1fd6a0', '#12c4bc', '#0fa8e6', '#4284ff',
              '#4a5cff', '#8a5cf0', '#e04bd0', '#f04b9a'].map(hex);
const PEARL = hex('#f4ecff');

// indeks na kole dla przepisu bez bieli (po odjęciu minimum)
function ringIndex(n) {                       // n = [r,g,b], co najmniej jedna współrzędna = 0
  const [r, g, b] = n, s = r + g + b;
  if (!s) return 0;
  // trzy sektory: R->G (indeksy 0..4), G->B (4..8), B->R (8..12)
  if (b === 0) return 4 * g / s;              // r:g
  if (r === 0) return 4 + 4 * b / s;          // g:b
  return 8 + 4 * r / s;                       // b:r
}
function ringColor(idx) {
  idx = ((idx % 12) + 12) % 12; const i = Math.floor(idx), f = idx - i, a = RING[i], c = RING[(i + 1) % 12];
  return [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f];
}
// kolor wypadkowy przepisu (sRGB 0..1)
function mixColor(n) {
  const k = Math.min(n[0], n[1], n[2]), m = [n[0] - k, n[1] - k, n[2] - k], s = m[0] + m[1] + m[2];
  if (!s) return PEARL.slice();               // 1+1+1(+1)
  const base = ringColor(ringIndex(m)), w = k * .5;   // pastel: domieszka perły
  return [base[0] + (PEARL[0] - base[0]) * w, base[1] + (PEARL[1] - base[1]) * w, base[2] + (PEARL[2] - base[2]) * w];
}

// wszystkie 15 przepisów (kolejność: pierścień, potem pastele)
const RECIPES = [];
for (let r = 4; r >= 0; r--) for (let g = 4 - r; g >= 0; g--) RECIPES.push([r, g, 4 - r - g]);
// odległość przepisów = minimalna liczba przestawień slotów (0..4): połowa sumy |różnic|
const dist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 2;
// kąt na kole (do sortowania i duchów): 0..12
const hue = n => { const k = Math.min(n[0], n[1], n[2]); return ringIndex([n[0] - k, n[1] - k, n[2] - k]) + (n[0] - k + n[1] - k + n[2] - k ? (n[0] - k && n[1] - k ? 0 : 0) : 0); };

window.HC = { RING, PEARL, RECIPES, mixColor, dist, hue, hex, ringColor, ringIndex,
  PRIM: [hex('#ff3d68'), hex('#1fd6a0'), hex('#4a5cff')] };
})();
