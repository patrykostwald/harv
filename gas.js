/* Harvester: shader gazu. Jeden program: widok mapy (kolory sektorów, wiry-oczy, pył na granicach, mgła, pryzmat)
   i widok sektora (cztery wiry-porty, wstęgi do środka, mieszanka). Trzy warstwy z różną paralaksą = pół-3D.
   Struktura gazu z tapety (fbm + domain warping, mapa gęstości, fronty jonizacji). */
(function () {
'use strict';
const NS = 16;
const MAPA = 1720 / 720;

const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;

const makeFS = (NT) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define NS ${NS}
#define NT ${NT}
#define MAPA ${MAPA.toFixed(5)}
varying vec2 v;
uniform vec2 uRes; uniform float uT, uOct, uMode, uMatch, uPrismG, uS0, uScale, uPortR, uRot, uPortRX;
uniform vec2 uCam;
uniform sampler2D uMap;
uniform vec4 uSec[NS];      // xy = pozycja oka, z = przejęcie 0..1, w = dostępność 0..1 (ujemne = dziura odpoczywa, moduł = postęp odpoczynku)
uniform vec3 uCol[NS];      // kolor wyświetlany sektora
uniform vec3 uSlot[4];      // kolory czterech portów (N,E,S,W)
uniform vec4 uSlotFx;       // błyski portów
uniform vec3 uTgt;
uniform float uFill, uBeat;
uniform vec3 uMix;          // bieżąca mieszanka
uniform vec2 uTrailD[NT];   // kierunek ruchu w chwili emisji punktu sladu
uniform vec4 uTrail[NT];   // slad statku: xy = swiat, z = wiek, w = sila
uniform vec4 uShip;         // xy = pozycja (przestrzen ekranu c), z = promien, w = widocznosc
uniform vec4 uShipV;        // xy = kierunek, z = predkosc 0..1
uniform vec4 uWave;         // x = wiek fali (<0 = brak), y = amplituda, z = teczowa
uniform vec4 uOrb;          // x = promien orbu portu, y = promien srodka
uniform vec2 uDrop[4];      // krople rteci za statkiem (przestrzen c)
uniform vec3 uSel;          // xy = świat, z = siła podświetlenia
uniform vec3 uTouch;        // reakcja na dotyk: xy = punkt w przestrzeni c, z = siła (gaśnie po puszczeniu)

const vec3 PR = vec3(1., .24, .41), PG = vec3(.12, .84, .63), PB = vec3(.29, .36, 1.);
// lattice hash tolerant of mobile-GPU reassociation: small inputs (mod 289) scaled down before fract, so neighbouring cells stay consistent
float hash(vec2 p){ p = mod(p, 289.); vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float hashPx(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
const mat2 M = mat2(.8,.6,-.6,.8);
float fbm(vec2 p){ float a = .5, s = 0., n = 0.; for(int i=0;i<8;i++){ float w = clamp(uOct - float(i), 0., 1.);
  if (w <= 0.) break;
  s += a*w*noise(p); n += a*w; p = M*p*2.03 + vec2(1.7,9.2); a *= .5; } return s/n; }
float fbm3(vec2 p){ float a = .5, s = 0.; for(int i=0;i<3;i++){ s += a*noise(p); p = M*p*2.03 + vec2(1.7,9.2); a *= .5; } return s/.875; }
float ridge(vec2 p){ float a = .5, s = 0.; for(int i=0;i<5;i++){ float n = 1.-abs(noise(p)*2.-1.); s += a*n*n; p = M*p*2.11 + 3.1; a *= .5; } return s; }
float ridge3(vec2 p){ float a = .5, s = 0.; for(int i=0;i<3;i++){ float n = 1.-abs(noise(p)*2.-1.); s += a*n*n; p = M*p*2.11 + 3.1; a *= .5; } return s/.875; }
vec3 hueShift(vec3 c, float a){ float cs = cos(a), sn = sin(a); vec3 k = vec3(.57735); return c*cs + cross(k,c)*sn + k*dot(k,c)*(1.-cs); }
vec4 over(vec4 top, vec4 under){ return top + under*(1.-top.a); }
vec2 rot(vec2 d, float a){ float c = cos(a), s = sin(a); return vec2(c*d.x - s*d.y, s*d.x + c*d.y); }
vec2 portPos(int k){ if(k==0) return vec2(0., uPortR); if(k==1) return vec2(uPortRX, 0.); if(k==2) return vec2(0., -uPortR); return vec2(-uPortRX, 0.); }   // E/W wg uPortRX (szerzej na szerokim ekranie), N/S wg uPortR
// wzorzec warstwy: wspólny środek kamery, współczynnik e = jak szybko warstwa "pędzi" przy nurkowaniu (blisko = więcej)
vec2 pat(vec2 c, float e){ return uCam + c*uS0*pow(uScale/uS0, e); }


// srodowisko lustra: gradient horyzontu, softboxy, a w sektorze cztery kolorowe punkty jako zrodla swiatla
vec3 chromeEnv(vec3 R, vec3 scL, float sec){
  vec3 Rn = normalize(R);
  float up = Rn.y*.5 + .5 + .12*noise(Rn.xy*3. + uT*.07);
  vec3 dark = vec3(.02, .014, .06) + scL*.1 + vec3(.25, .05, .2)*smoothstep(.45, .1, up)*.5;
  vec3 bright = scL*.9 + vec3(.35, .5, .8)*.75; bright = mix(bright, bright*1.5 + .1, smoothstep(.62, 1., up));
  vec3 col = mix(dark, bright, smoothstep(.44, .56, up));
  col += pow(max(dot(Rn, normalize(vec3(-.45, .72, .52))), 0.), 70.)*vec3(1., .97, .93)*1.7;
  col += pow(max(dot(Rn, normalize(vec3(.7, -.25, .66))), 0.), 28.)*(scL*1.1 + .15);
  if (sec > 0.) {
    vec3 pe = uSlot[0]*pow(max(dot(Rn, vec3(0., .8, .6)), 0.), 4.) + uSlot[1]*pow(max(dot(Rn, vec3(.8, 0., .6)), 0.), 4.)
            + uSlot[2]*pow(max(dot(Rn, vec3(0., -.8, .6)), 0.), 4.) + uSlot[3]*pow(max(dot(Rn, vec3(-.8, 0., .6)), 0.), 4.);
    col = mix(col, col*.3 + pe*1.8 + uMix*.18, sec);
  }
  return col;
}
// ciekly orb: sfera, odbicie otoczenia, emisyjny rdzen, rabek Fresnela
vec4 liquidOrb(vec2 c, vec2 ctr, float r, vec3 core, float fx, vec3 scL, float sec){
  vec2 q = (c - ctr)/r; float d2 = dot(q, q);
  float rr = 1. + .035*sin(uT*2.1 + ctr.x*9. + ctr.y*5.) + fx*.1*sin(uT*17.);
  if (d2 > rr*rr) return vec4(0.);
  float dd = sqrt(d2), h = sqrt(max(0., rr*rr - d2));
  vec3 n = normalize(vec3(q, h*.9));
  vec3 R = reflect(vec3(0., 0., -1.), n);
  vec3 env = vec3(chromeEnv(R, scL, sec).r, chromeEnv(vec3(rot(R.xy, .05), R.z), scL, sec).g, chromeEnv(vec3(rot(R.xy, -.05), R.z), scL, sec).b);
  float fr = pow(1. - n.z, 2.4);
  vec3 col = env*(.5 + .5*fr) + core*(.2 + .8*smoothstep(1., 0., dd))*(1. + fx*.8) + fr*core*.55;
  return vec4(col, smoothstep(rr, rr - .07, dd));
}
vec3 spec(float x){ return .5 + .5*cos(6.2832*(x + vec3(0., .33, .67))); }
// czarna dziura w sercu sektora: dysk akrecyjny w kolorach czterech punktów, wnętrze napełnia się barwą od brzegu (fill = postęp, liniowo względem pola), przy pełnym przechodzi w perłowy pryzmat
void blackHole(vec2 c, float rh, vec3 tg, vec3 mx, float fill, float m, float bt, out vec3 add, out float hole, out vec3 inner){
  add = vec3(0.); inner = vec3(0.); hole = 0.;
  float d = length(c), q = d/rh;
  if (q > 4.) return;
  vec2 u = vec2(c.x, c.y/.4); float ud = length(u)/rh, ua = atan(u.y, u.x + 1e-4);
  float sp = ua + log(max(ud, .6))*3.2 - uT*.5/max(ud, 1.);
  float str = fbm3(vec2(cos(sp), sin(sp))*1.3 + vec2(ud*2.2 + 31.7 + uT*.03, 13.3));         // okres 2π: bez szwu na osi -X
  float band = (1. - smoothstep(1.5, 2.6, ud))*smoothstep(1.1, 1.5, ud);
  float dop = .7 + .45*cos(ua - .5);
  vec3 pc = vec3(0.); float ws = 0.;
  for (int k = 0; k < 4; k++) { float ak = k == 0 ? 1.5708 : k == 1 ? 0. : k == 2 ? -1.5708 : 3.1416; float w = .5 + .5*cos(ua - ak); w *= w; pc += uSlot[k]*w; ws += w; }
  pc /= ws;
  vec3 dc = mix(pc, tg, fill*.45);
  dc = mix(dc, mix(spec(ud*.35 + .2*sin(ua*2.) + uT*.04), vec3(.85, .88, 1.), .35), smoothstep(.6, 1., fill)*.5);
  float I = band*(.3 + 1.5*str)*dop*(.5 + .9*fill + .5*m)*(1. + .35*bt);
  add += dc*I*1.1;
  float wOn = step(.5, uOrb.w), wPulse = max(uOrb.w - 1., 0.), a1 = (q - 1.07)/(.06 + .035*wOn), a2 = (q - 1.45)/.22;
  float wmask = 1.;      // okno podejścia: jasny łuk rantu skraca się zgodnie z ruchem wskazówek (rem = uOrb.z), ostatnie 28% okna łagodnie ciemnieje; bez cyfr i czerwieni
  if (wOn > .5) { float fr = fract((1.5708 - atan(c.y, c.x + 1e-4))/6.2832), wl = 1. - smoothstep(uOrb.z - .012, uOrb.z + .012, fr), dim = .55 + .45*smoothstep(0., .28, uOrb.z);
    wmask = (.16 + .84*wl)*dim; float a3 = (q - 1.2)/(.035 + .05*wl*dim);      // łuk grubnieje i jaśnieje z rezerwą, w ostatnich 28% cienieje i gaśnie; na starcie okna jednorazowy impuls
    add += mix(dc, vec3(1., .96, .85), .7)*exp(-a3*a3)*(.03 + 1.7*wl*dim*dim)*(1. + 1.6*wPulse*wl); }      // osobny jasny łuk okna tuż nad dziurą: kurczy się, w ostatnich 28% ciemnieje
  add += mix(dc, vec3(1.), .3)*exp(-a1*a1)*(.7 + .8*fill + .5*bt)*(1. + .25*wOn)*wmask;                                   // pierścień fotonowy: jasny rant dziury
  add += dc*exp(-a2*a2)*smoothstep(-.1, .6, c.y/rh)*(.4 + .8*fill)*(.4 + .8*str);                   // łuk dysku nad cieniem (soczewkowanie)
  add = 1. - exp(-add*1.25);
  float an = atan(c.y, c.x + 1e-4);
  float qw = q + .018*sin(an*5. + uT*.6) + .012*sin(an*9. - uT*.4);                                   // brzeg horyzontu nie jest idealnym okręgiem
  hole = 1. - smoothstep(.96, 1.05, qw);
  if (hole > 0.) {
    float edge = 1. - q;
    float lev = 1. - sqrt(max(1. - fill, 0.));                                                      // fill liniowy względem pola powierzchni
    float n = fbm3(c/rh*1.6 + vec2(11.7 + uT*.05, 7.3 - uT*.04));
    float depth = edge*(.85 + .35*n);
    float cov = max(clamp((lev*1.15 - depth)*3.2, 0., 1.), smoothstep(.97, 1., fill));
    float sw = an + 5.*edge - uT*.35;
    vec3 pz = mix(mix(hueShift(tg, (n - .5)*.9 + edge*.6), vec3(.9, .92, 1.), .25), spec(edge*.55 + .15*sin(an*2.) - uT*.04 + n*.5), .22);   // pryzmat: perłowy, wąskie pasmo wokół barwy celu
    vec3 b2 = mix(tg*1.25, pz, smoothstep(.55, 1., fill)*.85);                                    // wnętrze w barwie celu
    float sm = fbm3(rot(c/rh, -uT*.15)*2.4 + vec2(23.1, 15.6));
    float w1 = .5 + .5*cos(sw*2.);
    inner = b2*cov*(.1 + .55*w1*sqrt(w1) + .35*n + .35*sm)*(.75 + .35*bt);
    inner += mix(b2, vec3(1.), .12)*exp(-q*q*4.)*pow(fill, 4.)*(.28 + .2*bt);
    inner = 1. - exp(-inner*1.5);
    { float rq = (q - .93)/.1; inner += spec(an/6.2832 + uT*.08)*exp(-rq*rq)*smoothstep(.75, 1., fill)*.8; }      // tęczowy rant pryzmatu: szeroki, po tonemappingu
    float sh = (lev*1.15 - depth)/.22;                                                              // brzeg napełnienia: widoczna linia postępu
    inner += mix(b2, vec3(1.), .35)*exp(-sh*sh)*step(.02, lev)*(.8 + .4*bt);
  }
}
void main(){
  float asp = uRes.x/uRes.y;
  vec2 c = (v - .5)*vec2(asp, 1.);
  float t = uT;
  vec2 cs = uRot > .5 ? vec2(-c.y, c.x) : c;          // tryb pionowy: mapa obrócona o 90 stopni
  vec2 P = uCam + cs*uScale;                         // pozycja w świecie
  vec2 p = pat(cs, .55)*1.15*(1. + 1.3*uMode);
  float ft = t*.012;
  vec2 flow = vec2(t*.003, -t*.0012);
  vec2 pp = p*1.6 + flow;

  // wiry: oczy sektorów na mapie, cztery porty w widoku sektora
  vec2 tw = vec2(0.);
  float d1 = 9., d2 = 9.;
  for (int i = 0; i < NS; i++) {
    vec2 dv = P - uSec[i].xy; float dd = dot(dv, dv);
    float th = (1.3 + .55*sin(t*.35 + float(i)*1.7))*exp(-dd*70.)*(.5 + .5*abs(uSec[i].w))*(1. + .9*uSec[i].z);
    tw += (rot(dv, th) - dv);
    float d = sqrt(dd);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  vec2 twS = vec2(0.);
  for (int k = 0; k < 4; k++) {
    vec2 dv = c - portPos(k); float dd = dot(dv, dv);
    float th = (1.5 + .6*sin(t*(.5 + .1*float(k)) + float(k)))*exp(-dd*34.)*(k == 1 || k == 3 ? -1. : 1.);
    twS += (rot(dv, th) - dv);
  }
  pp += (tw*(1. - uMode)*1.7 + twS*uMode*1.5);
  { float rhL = uOrb.y*1.35, dL = dot(c, c); float kL = (rhL*rhL)/(dL + rhL*rhL*.3); pp += (normalize(c + 1e-4)*.5 + rot(c, .9*kL) - c)*kL*uMode; }   // gaz wygina się wokół horyzontu
  if (uTouch.z > .001 && uMode > .02) { vec2 td = c - uTouch.xy; float tl = length(td); float fall = exp(-tl*tl*6.); pp += normalize(td + 1e-4)*sin(tl*22. - uT*7.)*fall*uTouch.z*.13*uMode; }   // palec/mysz: miękkie fale rozchodzą się po gazie, gasną po puszczeniu (gra jest o mieszaniu światła)
  vec2 wk = vec2(0.); float wh = 0., wg = 0.;
  // fala celebracji: pierscien swiatla przesuwajacy gaz
  float wA = uWave.x, wr = length(c), wD = wr - wA*1.05;
  float wband = wA >= 0. ? exp(-wD*wD/(.012 + .045*wA))*exp(-wA*.85)*uWave.y : 0.;
  pp += wk*(1. - uMode)*2.2 + normalize(c + vec2(1e-4))*wband*.45;


  vec2 q = vec2(fbm(pp + ft), fbm(pp + vec2(5.2,1.3) - ft));
  vec2 r = vec2(fbm(pp + 2.4*q + vec2(1.7,9.2) + ft*1.3), fbm(pp + 2.4*q + vec2(8.3,2.8) - ft*.7));
  float f = fbm(p*1.6 + 2.2*r);

  // mapa gęstości tapety (współrzędne świata, przycięta do krawędzi)
  vec2 muv = vec2(P.x/MAPA, P.y) + (r - .5)*.08;
  muv = abs(mod(muv + 1., 2.) - 1.);   // lustrzane odbicie poza mapa (bez rozciagnietych smug)
  float m = clamp(texture2D(uMap, vec2(muv.x, 1. - muv.y)).r + (f - .5)*.35, 0., 1.);

  // ---- kolor pola: sektory (mapa) albo cztery porty (sektor) ----
  vec2 Pw = P + (r - .5)*.34 + (q - .5)*.12;
  vec3 colS = vec3(0.); float cl = 0., rc = 0., ws = 0.; vec3 eye = vec3(0.);
  float e1 = 9.;
  for (int i = 0; i < NS; i++) { float d = length(Pw - uSec[i].xy); e1 = min(e1, d); }
  float e2 = 9.;
  for (int i = 0; i < NS; i++) {
    vec2 dv = Pw - uSec[i].xy; float d = length(dv);
    float w = exp(-(d - e1)*8.5);
    colS += uCol[i]*w; cl += uSec[i].z*w; rc += abs(uSec[i].w)*w; ws += w;
    if (d > e1 + .0001) e2 = min(e2, d);
    eye += uCol[i]*exp(-dot(P - uSec[i].xy, P - uSec[i].xy)*420.)*(.35 + .65*abs(uSec[i].w));
  }
  colS /= ws; cl /= ws; rc /= ws;
  float bord = 1. - smoothstep(0., .11, e2 - e1);   // pył na granicach sektorów

  vec3 sf = vec3(0.);
  for (int k = 0; k < 4; k++) {
    vec2 pk = portPos(k);
    vec2 dc = c - pk + (r - .5)*.24;
    float blob = exp(-dot(dc, dc)*2.3);
    vec2 pe = -pk; float tt = clamp(dot(c - pk, pe)/dot(pe, pe), 0., 1.);
    vec2 off = c - pk - pe*tt + (q - .5)*.10;
    float stream = exp(-dot(off, off)*26.)*(.35 + .65*tt)*(.5 + .9*q.x);
    float fx = k == 0 ? uSlotFx.x : k == 1 ? uSlotFx.y : k == 2 ? uSlotFx.z : uSlotFx.w;
    sf += uSlot[k]*(blob*1.05 + stream*.75)*(1. + fx*1.4);
  }
  sf += uMix*(.55*exp(-dot(c, c)*2.4) + .07);
  float mxs = max(sf.r, max(sf.g, sf.b)); sf *= mxs > .8 ? .8/mxs : 1.;      // bez przepalenia: zachowaj odcień
  sf = max(mix(vec3(dot(sf, vec3(.3, .55, .15))), sf, 1.5), 0.);
  float outM = smoothstep(.0, .3, max(max(-P.y, P.y - 1.), max(-P.x, P.x - MAPA)));
  colS = mix(colS, vec3(.2, .26, .6)*.55, outM*.75);
  vec3 sc = mix(colS, sf, uMode);

  // ---- gaz (jak na tapecie, kolory z sektorów) ----
  float dens = smoothstep(.2, .95, m);
  float fil = ridge(p*3.6 + 2.2*r + ft*.25);
  float wisps = pow(fil, 2.2);
  float detail = fbm3(p*7.5 + r*2.);
  float band = smoothstep(.2, .36, m)*(1. - smoothstep(.4, .62, m));
  float core = smoothstep(.55, .95, m);
  float h1 = fbm3(p*.55 + 23.), h2 = fbm3(p*.9 + 41.);
  float hs = 1. - .55*uMode;
  vec3 rimCol = hueShift(sc, (h1 - .5)*1.1*hs)*1.2;
  vec3 inA = hueShift(sc, ((q.x - .5)*1.3 + .25)*hs), inB = hueShift(sc, ((r.y - .5)*1.3 - .35)*hs)*.9;
  float dA = smoothstep(.35, .75, fbm3(p*2.2 + r*1.5 + flow)), dB = smoothstep(.4, .8, fbm3(p*3.4 - q*1.2 - flow*1.3));
  vec3 inner = inA*dA*.17 + inB*dB*.12 + sc*.04;
  vec3 em = (rimCol*band*(.3 + wisps*1.45) + inner*dens*(.6 + wisps*1.1))*(.5 + detail*.9);
  em += mix(sc, vec3(1., .95, .9), .35)*pow(clamp(band*f*1.3, 0., 1.), 3.)*.75;
  em += mix(vec3(.30,.10,.05), sc*.35, .5)*core*(.25 + wisps*.9);
  float cav = (1. - m)*smoothstep(.15, .85, fbm3(p*1.2 - ft));
  em += mix(sc, vec3(.75,.85,1.), .35)*cav*(.3 + detail*.25);
  float dust = core*smoothstep(.4, .75, fbm(p*2.6 + r*3.2 + 4.));
  em *= 1. - dust*.7;
  float vf = smoothstep(.25, .75, f);
  vec3 veil = hueShift(sc, ((h2 - .5)*1.3 + .1)*hs)*(.13 + .22*vf)*(.55 + detail*.7);
  em += veil*(1. - core*.55);
  em += vec3(.07, .10, .30)*(.55 + .6*f)*(1. - .6*uMode)*(1. - dens*.5);   // niebieski rdzen jak na tapecie
  em += eye*(1. - uMode)*(.55 + .45*wisps);                                  // rdzenie oczu sektorów
  if (uMode > .02) {                                                       // gaz wypływa z czterech punktów i płynie do środka, barwiąc pole
    vec3 pls = vec3(0.);
    for (int k = 0; k < 4; k++) {
      float fxk = k == 0 ? uSlotFx.x : k == 1 ? uSlotFx.y : k == 2 ? uSlotFx.z : uSlotFx.w;
      vec2 pk = portPos(k); float pl = max(length(pk), 1e-3); vec2 ax = -pk/pl, dv = c - pk;
      float sN = dot(dv, ax)/pl, pr = dot(dv, vec2(-ax.y, ax.x));
      float cone = exp(-pow(pr/(.08 + .34*clamp(sN, 0., 1.)), 2.));
      float inside = smoothstep(-.08, .06, sN)*(1. - smoothstep(.5, 1.02, sN));
      float flw = smoothstep(.28, .82, fbm3(vec2(sN*3.2 - t*.3 + float(k)*4.1, pr*4.5) + (r - .5)*2.2));
      pls += uSlot[k]*cone*inside*(.2 + .85*flw)*(1. + fxk*1.1);
    }
    em += pls*uMode*.8;
  }
  float lane = bord*smoothstep(.25, .65, fbm3(p*3. + 7.))*(1. - uMode);
  em *= 1. - lane*.7;
  // polysk na grzbietach fal i smuga barwy za statkiem
  em += (uMix*.55 + vec3(.45, .55, .85)*.35)*max(wh, 0.)*.3*(1. - uMode) + uMix*length(wk)*5.*(1. - uMode);
  em += uMix*wg*1.3*(1. - uMode);
  float wn = .45 + .9*fbm3(c*5. + t*.3);
  vec3 wcol = uWave.z > .5 ? .5 + .5*cos(6.2832*(wr*1.4 - t*.25 + vec3(0., .33, .67))) : uMix*1.5;
  em += wcol*wband*wn*1.25;
  // katowe promienie swiatla ze srodka sektora
  { float ang = atan(c.y, c.x), rays = pow(clamp(noise(vec2(ang*6. + t*.12, 3.))*.6 + noise(vec2(ang*17., -t*.25))*.4, 0., 1.), 2.6);
    em += uMix*rays*exp(-wr*2.1)*(.12 + .4*uMatch)*uMode; }
  float sel = uSel.z*exp(-dot(P - uSel.xy, P - uSel.xy)*26.);
  em *= 1. + sel*.8;

  // mgła nieodkrytych
  float fog = (1. - rc)*(1. - uMode);
  float lum = dot(em, vec3(.3, .55, .15));
  em = mix(em, mix(vec3(lum)*vec3(.6, .7, 1.), em, .45), fog*.7)*(1. - fog*.1);

  // ---- pryzmat: dyspersja na gradiencie włókien + cienka warstwa, perłowe wnętrze ----
  float pg = clamp(cl*(1. - uMode) + uPrismG*uMode, 0., 1.);
  if (pg > .004) {
    vec2 o = vec2(cos(t*.07), sin(t*.07))*.05;
    float wR = ridge3(p*2.5 + 2.2*r + o), wG = ridge3(p*2.5 + 2.2*r), wB = ridge3(p*2.5 + 2.2*r - o);
    // rozszczepienie na składowe: trzy kolory podstawowe rozchodzą się wzdłuż gradientu włókien i sumują do perły
    float aR = pow(wR, 3.), aG = pow(wG, 3.), aB = pow(wB, 3.);
    vec3 dsp = PR*aR + PG*aG + PB*aB;
    float film = h1*2.2 + q.x*1.2 + t*.015;
    vec3 irid = .5 + .5*cos(6.2832*(film*vec3(1., 1.12, 1.3) + vec3(0., .14, .3)));
    irid = mix(vec3(dot(irid, vec3(.33))), irid, .7);
    float edge = clamp(abs(wR - wB)*5.5, 0., 1.);
    vec3 pearl = vec3(.91, .89, 1.);
    vec3 pe = (dsp*1.05 + pearl*(aR*aG*aB)*3. + irid*edge*.3 + pearl*wisps*.08)*(.45 + detail*.8);
    pe *= mix(vec3(1.), clamp(sc*1.7, 0., 1.5), .55);   // region zachowuje swoją barwę
    em = em*(1. - pg*.5) + pe*pg*1.15 + pearl*dens*.03*pg;
  }

  // ---- warstwa środkowa: smugi z większą paralaksą ----
  vec2 p1 = uCam*.6 + cs*uS0*pow(uScale/uS0, .9)*1.9 + vec2(3.1, -1.7);
  vec2 q1 = vec2(fbm(p1 + vec2(t*.015, -t*.005)), fbm(p1 + vec2(2.4, 7.7) - t*.012));
  float f1 = fbm(p1*1.3 + 2.8*q1);
  float w1 = smoothstep(.55, .85, f1)*smoothstep(.35, .75, m*.6 + .4*q1.y);
  float fil1 = ridge(p1*2.4 + 2.*q1);
  vec3 c1 = hueShift(sc, q1.x*1.6 - .8 + .3)*1.1;
  vec4 L1 = vec4(c1*w1*(.3 + fil1*.55), w1*.42);
  // ---- warstwa bliska: miękka mgła, najszybsza ----
  vec2 p2 = uCam*1.4 + cs*uS0*pow(uScale/uS0, 1.25)*.85 + vec2(-7., 2.);
  float f2 = fbm3(p2 + vec2(t*.015, -t*.006) + fbm3(p2*1.7 - t*.01));
  float w2 = smoothstep(.45, .9, f2);
  vec3 c2 = mix(hueShift(sc, .5)*.55, vec3(.32, .36, .9), .45)*mix(.7, 1.2, uMode);
  vec4 L2 = vec4(c2*w2*.14, w2*.17);

  // ---- sektory jako wiry w gazie: kolor (do zrobienia) albo pryzmat (przejęty); lekkie halo na kilku warstwach ----
  vec3 hal1 = vec3(0.), hal2 = vec3(0.); float hm = 0.; vec3 hadd = vec3(0.);
  if (uMode < .98) {
    vec3 vor = vec3(0.);
    for (int i = 0; i < NS; i++) {
      vec2 dv = P - uSec[i].xy; float r2 = dot(dv, dv), rr = sqrt(r2);
      float rs = step(uSec[i].w, -.001), av = mix(uSec[i].w, 1., rs), rp = abs(uSec[i].w)*rs, cz = uSec[i].z;
      vec3 irid = .5 + .5*cos(6.2832*(t*.03 + float(i)*.13 + rr*2.4 + vec3(0., .33, .67)));
      irid = mix(irid, vec3(.94, .92, 1.), .28);
      vec3 hc = mix(uCol[i]*1.25, irid, clamp(cz*1.4, 0., 1.));
      float sbi = uSel.z*step(length(uSel.xy - uSec[i].xy), .01);
      float ki = (.35 + .65*av)*(1. + .6*cz)*(1. + .8*sbi);
      if (r2 < .1) {
        float an = atan(dv.y, dv.x + 1e-4);
        float ph = 2.*an + 11.*rr - t*(.4 + .2*cz) + float(i);
        float arms = pow(.5 + .5*cos(ph + 1.4*sin(an*2. + t*.3)), 2.);
        float cvx = smoothstep(.85, 1., cz);      // wir z ramionami tylko dla przejętych (pryzmat); reszta to czarne dziury
        vor += hc*(arms*exp(-r2*85.)*(.55 + .8*wisps) + exp(-r2*900.)*.66)*ki*1.12*cvx;      // przejęty wir lekko ściszony, żeby nie krzyczał głośniej niż dostępny cel
        vor += irid*cz*exp(-r2*40.)*pow(.5 + .5*cos(ph*.5 - 2.*rr*14.), 3.)*.6*cvx;
      }
      float hz = 1. - smoothstep(.85, 1., cz);
      if (hz > .002 && r2 < .05) {      // czarna dziura na mapie: ciemny dysk, rant w kolorze celu, wnętrze zalane wg claim; odpoczynek = szary rant z łukiem-zegarem
        float rh = .06*mix(.62, 1., av), q = rr/rh;
        if (q < 3.5) {
          float an = atan(dv.y, dv.x + 1e-4), pw = 1.4*uScale/(uRes.y*rh);      // pw = szerokość piksela w jednostkach promienia: brzeg idealnego koła, ostry co do piksela
          float hole = (1. - smoothstep(1. - pw, 1. + pw, q))*hz;
          float edq = max(1. - q, 0.);          // gaz wsiąka w dziurę tylko tuż za rantem: język przy brzegu, który rozpływa się w głąb
          float leak = 0.; if (q < 1.) leak = exp(-edq*edq*55.)*(.25 + .75*noise(vec2(an*3. + float(i)*5.3 + t*.12, edq*6. + t*.4)))*(1. - rs);
          float brt = (1. + .12*sin(t*1.1 + float(i)*2.1)*av*(1. - rs));      // dostępna dziura powoli oddycha rantem (wolniej, mocniej) -> woła do wejścia
          vec3 rimc = mix(uCol[i]*1.45, vec3(.62, .56, .80), rs);
          float a1 = (q - 1.06)/.07, arc = 1.;
          if (rs > .5) { float fr = fract((1.5708 - an)/6.2832); arc = .35 + .65*(1. - smoothstep(rp - .012, rp + .012, fr)); rimc = mix(rimc, uCol[i]*1.6, step(fr, rp)*.8); }
          float rim = exp(-a1*a1)*(.26 + .72*av + .5*sbi)*brt*arc;      // śpiąca dziura ma widoczniejszy rant (gracz widzi dalszy ciąg mapy), dostępna wciąż jaśniejsza
          float aura = av*(1. - rs)*exp(-(q - 1.36)*(q - 1.36)*1.9)*.3*brt;      // dostępna dziura ma kolorową poświatę na zewnątrz rantu -> woła jako cel (hierarchia); umiar, żeby nie dominowała gdy kilka obok siebie
          float lev = 1. - sqrt(max(1. - cz, 0.)), edge = max(1. - q, 0.);
          vec3 inc = vec3(0.);
          if (q < 1.06) {
            float nn = noise(dv/rh*1.6 + vec2(11.7 + t*.05, 7.3 - t*.04));
            float depth = edge*(.85 + .35*nn), cov = clamp((lev*1.15 - depth)*3.2, 0., 1.);
            inc = uCol[i]*1.3*cov*(.25 + .75*noise(dv/rh*2.4 + t*.1)) + uCol[i]*leak*.3*(.4 + .6*nn);
            float sh = (lev*1.15 - depth)/.22; inc += mix(uCol[i], vec3(1.), .35)*exp(-sh*sh)*step(.02, lev)*.8*step(q, 1.02);
            inc += vec3(.55, .5, .75)*exp(-q*q*30.)*.45*rs;      // odpoczynek: dziura zamknięta, w środku tylko szary żar
          }
          hm = max(hm, hole*(.4 + .6*av)*(1. - .75*leak));
          hadd += (rimc*(rim*1.15 + aura + exp(-(q - 1.)*(q - 1.)*.9)*(.04 + .16*av)*(1. - .6*rs)*hz) + inc*hole)*hz;
        }
      }
      float hw = av*(1. - cz)*(.2 + .25*sbi) + cz*.1;
      vec2 d1 = dv + cs*uScale*.06, d2 = dv - cs*uScale*.09;
      em += hc*hw*exp(-r2*26.)*.55;
      hal1 += hc*hw*exp(-dot(d1, d1)*14.);
      hal2 += hc*hw*exp(-dot(d2, d2)*7.)*.7;
    }
    em += vor*(1. + sel*1.2)*(1. - uMode);
  }
  L1.rgb += hal1*.45; L1.a = max(L1.a, dot(hal1, vec3(.33))*.5);
  L2.rgb += hal2*.3; L2.a = max(L2.a, dot(hal2, vec3(.33))*.35);
  vec4 L0 = vec4(em, clamp(.5 + .22*vf + dens*.3 + core*.1 + dust*.2 + cav*.1 + band*.1, 0., .96));
  vec4 o = over(L2, over(L1, L0));
  o.rgb *= 1. - .93*hm*(1. - uMode); o.rgb += hadd*(1. - uMode);      // czarne dziury na mapie
  // dopasowanie: łagodny rozbłysk całego gazu
  o.rgb += uMix*exp(-dot(c, c)*3.)*uMatch*.22*uMode;
  o.rgb = 1. - exp(-o.rgb*1.28);
  o.rgb = max(mix(vec3(dot(o.rgb, vec3(.3,.55,.15))), o.rgb, mix(1.35, 1.08, uMode)), 0.);
  { float lm = dot(o.rgb, vec3(.3, .55, .15)), l2 = lm < .55 ? lm : .55 + .3*(1. - exp(-(lm - .55)/.3)); o.rgb *= mix(1., l2/max(lm, 1e-3), uMode); }      // ogranicznik jasności monotoniczny z kolanem: biel nie zjada dziury
  if (uMode > .02) {
    vec3 thr = vec3(0.);
    for (int k = 0; k < 4; k++) {
      float fxk = k == 0 ? uSlotFx.x : k == 1 ? uSlotFx.y : k == 2 ? uSlotFx.z : uSlotFx.w;
      vec2 pk = portPos(k); float tt = clamp(dot(c, pk)/dot(pk, pk), 0., 1.);
      vec2 perp = normalize(vec2(-pk.y, pk.x));
      float wav = (noise(vec2(tt*5. + float(k)*3.1, uT*.55)) - .5)*.07*sin(3.1416*tt);
      float dd2 = dot(c - pk*tt, perp) - wav, wdt = (.005 + .004*sin(3.1416*tt))*(1. + fxk*2.2);
      float pulse = exp(-pow((tt - fract(uT*.55 + float(k)*.25))*6.5, 2.));
      float vis = sin(3.1416*tt);
      thr += mix(uSlot[k], uMix, tt)*exp(-dd2*dd2/(wdt*wdt))*(.025 + 1.5*pulse + fxk*1.4)*vis*(.55 + .7*noise(vec2(tt*11., uT*.7 + float(k))));
    }
    o.rgb += thr*uMode;
    for (int k = 0; k < 4; k++) {
      float fxk = k == 0 ? uSlotFx.x : k == 1 ? uSlotFx.y : k == 2 ? uSlotFx.z : uSlotFx.w;
      vec4 po = liquidOrb(c, portPos(k), uOrb.x*(1. + fxk*.18), uSlot[k], fxk, sc, 0.);
      o.rgb = mix(o.rgb, po.rgb, po.a*uMode); o.a = max(o.a, po.a*uMode);
    }
    float rh = uOrb.y*1.35*(1. + .06*uBeat), qd = length(c)/rh;
    o.rgb *= 1. - .7*(1. - smoothstep(.9, 3.6, qd))*uMode;
    { float mq = (qd - 1.04)/.07; o.rgb *= 1. - .6*exp(-mq*mq)*uMode; }      // ciemna fosa tuż przed pierścieniem fotonowym: kontrast na każdym tle                                    // ciemna kieszeń w gazie
    vec3 bAdd, bIn; float bHole;
    blackHole(c, rh, uTgt, uMix*1.1, uFill, uMatch, uBeat, bAdd, bHole, bIn);
    o.rgb += bAdd*uMode;
    o.rgb = mix(o.rgb, bIn + vec3(.004), bHole*uMode); o.a = max(o.a, bHole*uMode);
    { float pr = length(c)/max(uPortRX, .05), vg = smoothstep(1.25, 2.7, pr)*(1. - .55*bHole);
      vec3 dk = o.rgb*vec3(.52, .56, .82) + (uTgt*.034 + vec3(.016, .013, .05))*vg;      // cień sektora stygnie ku barwie DZIURY (uTgt) z nutą granatu -> mapa i sektor się zespalają; umiar, żeby tło nie zlało się w jedną barwę i zostało bogactwo
      o.rgb = mix(o.rgb, dk, vg*.82);
      o.rgb += uTgt*vg*.02*(.6 + .4*sin(uT*.5)); }      // delikatny oddech barwy celu na brzegach -> tło podporządkowane kolorowi dziury
  }
  o.rgb += (hashPx(floor(v*uRes) + floor(fract(t)*97.)*13.) - .5)/255.;
  gl_FragColor = vec4(o.rgb, clamp(o.a, 0., 1.));
}`;

const FS_BLUR = `
precision mediump float;
varying vec2 v; uniform sampler2D uTex; uniform vec2 uDir; uniform float uThr;
vec3 tap(vec2 uv){ vec3 c = texture2D(uTex, uv).rgb; return max(c - uThr, 0.)/max(1. - uThr, .1); }
void main(){
  vec3 s = tap(v)*.227027;
  s += (tap(v + uDir) + tap(v - uDir))*.1945946;
  s += (tap(v + uDir*2.) + tap(v - uDir*2.))*.1216216;
  s += (tap(v + uDir*3.) + tap(v - uDir*3.))*.054054;
  s += (tap(v + uDir*4.) + tap(v - uDir*4.))*.016216;
  gl_FragColor = vec4(s, 1.);
}`;
const FS_COMP = `
precision highp float;
varying vec2 v; uniform sampler2D uScene, uBloom; uniform vec4 uPost; uniform vec2 uGodC, uRes; uniform float uT;
float hashPx(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
void main(){
  vec2 d = v - .5; float ab = uPost.x*(.35 + dot(d, d)*3.);
  vec4 s0 = texture2D(uScene, v);
  vec3 s = vec3(texture2D(uScene, v + d*ab).r, s0.g, texture2D(uScene, v - d*ab).b);
  vec3 bl = texture2D(uBloom, v).rgb;
  vec3 gr = vec3(0.); vec2 st = (uGodC - v)/14., p = v; float wg = 1.;
  for (int i = 0; i < 14; i++) { p += st; gr += texture2D(uBloom, p).rgb*wg; wg *= .93; }
  vec3 col = s + bl*uPost.y + gr*uPost.z*.16;
  col += (hashPx(gl_FragCoord.xy + uT*37.) - .5)/160.;
  gl_FragColor = vec4(col, clamp(max(s0.a, dot(bl, vec3(.33))*uPost.y), 0., 1.));
}`;

function Gas(canvas, mapImg) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('Brak WebGL');
  this.gl = gl; this.canvas = canvas;
  const mu = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS); this.maxUniforms = mu;
  const NT = this.NT = mu >= 128 ? 14 : mu >= 96 ? 8 : 4;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const build = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  this.pMain = build(makeFS(NT)); this.pBlur = build(FS_BLUR); this.pComp = build(FS_COMP);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, mapImg);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const loc = (p, names) => { const o = {}; for (const n of names) o[n] = gl.getUniformLocation(p, n); return o; };
  this.U = loc(this.pMain, ['uRes', 'uT', 'uOct', 'uMode', 'uMatch', 'uPrismG', 'uS0', 'uScale', 'uPortR', 'uPortRX', 'uRot', 'uCam', 'uMap', 'uSec', 'uCol',
    'uSlot', 'uSlotFx', 'uMix', 'uTgt', 'uFill', 'uBeat', 'uSel', 'uTrail', 'uTrailD', 'uShip', 'uShipV', 'uWave', 'uOrb', 'uDrop', 'uTouch']);
  this.UB = loc(this.pBlur, ['uTex', 'uDir', 'uThr']);
  this.UC = loc(this.pComp, ['uScene', 'uBloom', 'uPost', 'uGodC', 'uT', 'uRes']);
  gl.useProgram(this.pMain); gl.uniform1i(this.U.uMap, 0);
  this.secBuf = new Float32Array(NS*4); this.colBuf = new Float32Array(NS*3); this.slotBuf = new Float32Array(12);
  this.trBuf = new Float32Array(NT*4); this.trDBuf = new Float32Array(NT*2); this.dropBuf = new Float32Array(8);
  this.tw = 0; this.th = 0;
}
Gas.prototype.ensure = function (w, h) {
  const gl = this.gl; if (this.tw === w && this.th === h) return;
  for (const k of ['sceneTex', 'bloomTexA', 'bloomTexB']) if (this[k]) gl.deleteTexture(this[k]);
  for (const k of ['sceneFbo', 'bloomFboA', 'bloomFboB']) if (this[k]) gl.deleteFramebuffer(this[k]);
  const mk = (tw, th) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const fb = t => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; };
  this.tw = w; this.th = h; this.bw = Math.max(2, w >> 2); this.bh = Math.max(2, h >> 2);
  gl.activeTexture(gl.TEXTURE1);
  this.sceneTex = mk(w, h); this.sceneFbo = fb(this.sceneTex);
  this.bloomTexA = mk(this.bw, this.bh); this.bloomFboA = fb(this.bloomTexA);
  this.bloomTexB = mk(this.bw, this.bh); this.bloomFboB = fb(this.bloomTexB);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.activeTexture(gl.TEXTURE0);
};
// s: stan do narysowania (patrz game.js)
Gas.prototype.draw = function (s) {
  const gl = this.gl, U = this.U, w = this.canvas.width, h = this.canvas.height; this.ensure(w, h);
  gl.useProgram(this.pMain); gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo); gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(U.uRes, w, h);
  gl.uniform1f(U.uT, s.t); gl.uniform1f(U.uOct, s.oct); gl.uniform1f(U.uMode, s.mode); gl.uniform1f(U.uMatch, s.match);
  gl.uniform1f(U.uPrismG, s.prismG); gl.uniform1f(U.uS0, s.s0); gl.uniform1f(U.uScale, s.scale); gl.uniform1f(U.uPortR, s.portR); gl.uniform1f(U.uPortRX, s.portRX == null ? s.portR : s.portRX); gl.uniform1f(U.uRot, s.rot ? 1 : 0);
  gl.uniform2f(U.uCam, s.cam[0], s.cam[1]);
  const sb = this.secBuf, cb = this.colBuf;
  for (let i = 0; i < NS; i++) {
    const e = i < s.sectors.length ? s.sectors[i] : { x: 1e3, y: 1e3, claimV: 0, reachV: 0, col: [0, 0, 0] };   // puste miejsce poza światem
    sb[i*4] = e.x; sb[i*4 + 1] = e.y; sb[i*4 + 2] = e.claimV; sb[i*4 + 3] = e.rest ? -e.rest : e.reachV;
    cb[i*3] = e.col[0]; cb[i*3 + 1] = e.col[1]; cb[i*3 + 2] = e.col[2];
  }
  gl.uniform4fv(U.uSec, sb); gl.uniform3fv(U.uCol, cb);
  const sl = this.slotBuf; for (let k = 0; k < 4; k++) { sl[k*3] = s.slot[k][0]; sl[k*3 + 1] = s.slot[k][1]; sl[k*3 + 2] = s.slot[k][2]; }
  gl.uniform3fv(U.uSlot, sl);
  gl.uniform4f(U.uSlotFx, s.fx[0], s.fx[1], s.fx[2], s.fx[3]);
  gl.uniform3f(U.uMix, s.mix[0], s.mix[1], s.mix[2]); gl.uniform3f(U.uTgt, s.tgt[0], s.tgt[1], s.tgt[2]); gl.uniform1f(U.uFill, s.fill || 0); gl.uniform1f(U.uBeat, s.beat || 0);
  gl.uniform3f(U.uSel, s.sel[0], s.sel[1], s.sel[2]);
  gl.uniform3f(U.uTouch, s.touch ? s.touch[0] : 0, s.touch ? s.touch[1] : 0, s.touch ? s.touch[2] : 0);
  const tb = this.trBuf; tb.fill(0); const tr = s.trail || [], n0 = Math.max(0, tr.length - this.NT);
  for (let i = n0; i < tr.length; i++) { const j = i - n0; tb[j*4] = tr[i].x; tb[j*4 + 1] = tr[i].y; tb[j*4 + 2] = tr[i].age; tb[j*4 + 3] = tr[i].str; }
  gl.uniform4fv(U.uTrail, tb);
  const td = this.trDBuf; td.fill(0); for (let i = n0; i < tr.length; i++) { const j = i - n0; td[j*2] = tr[i].dx || 0; td[j*2 + 1] = tr[i].dy || 0; }
  gl.uniform2fv(U.uTrailD, td);
  const sp = s.ship; gl.uniform4f(U.uShip, sp.x, sp.y, sp.r, sp.a); gl.uniform4f(U.uShipV, sp.dx, sp.dy, sp.sp, 0);
  const db = this.dropBuf; for (let i = 0; i < 4; i++) { db[i*2] = s.drops[i][0]; db[i*2 + 1] = s.drops[i][1]; } gl.uniform2fv(U.uDrop, db);
  gl.uniform4f(U.uWave, s.wave[0], s.wave[1], s.wave[2], 0); gl.uniform4f(U.uOrb, s.orb[0], s.orb[1], s.orb[2] == null ? 1 : s.orb[2], s.orb[3] || 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // bloom: jasne partie -> rozmycie (1/4 rozdzielczosci)
  const UB = this.UB, bw = this.bw, bh = this.bh;
  gl.useProgram(this.pBlur); gl.activeTexture(gl.TEXTURE1); gl.uniform1i(UB.uTex, 1);
  const pass = (src, dst, dw, dh, dx, dy, thr) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst); gl.viewport(0, 0, dw, dh); gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform2f(UB.uDir, dx, dy); gl.uniform1f(UB.uThr, thr); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  pass(this.sceneTex, this.bloomFboA, bw, bh, 3 / w, 0, .66);
  pass(this.bloomTexA, this.bloomFboB, bw, bh, 0, 1.4 / bh, 0);
  pass(this.bloomTexB, this.bloomFboA, bw, bh, 1.4 / bw, 0, 0);
  pass(this.bloomTexA, this.bloomFboB, bw, bh, 0, 1.4 / bh, 0);
  // kompozyt: aberracja chromatyczna, bloom, promienie, ziarno
  const UC = this.UC; gl.useProgram(this.pComp); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.bloomTexB);
  gl.uniform1i(UC.uScene, 1); gl.uniform1i(UC.uBloom, 2);
  gl.uniform4f(UC.uPost, s.post[0], s.post[1], s.post[2], 0); gl.uniform2f(UC.uGodC, .5, .5); gl.uniform1f(UC.uT, s.t); gl.uniform2f(UC.uRes, w, h);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.activeTexture(gl.TEXTURE0);
};
window.Gas = Gas; window.GAS_NS = NS; window.MAPA = MAPA;
})();
