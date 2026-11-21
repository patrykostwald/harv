# Harv

A calm, beautiful arcade-puzzle game about mixing light in the coloured gases of a nebula. No deaths, no counters. The interface is in Polish.

**Play:** https://zbudujmi.com/harv/

## Status

Live as an installable PWA. The bot-tested campaign covers a series of nebulae with growing difficulty.

## Features

- 15 sectors per nebula, four ports that act as gas sources, and turbulence that bends the flow
- Colour mixing: carry a mix of light, rotate it and take over each sector
- Follow-up nebulae after the first run: Calm, Wind, Frost, Storm and Zenith, each with its own rules and seed
- Map selection by click, touch, arrow keys or WASD
- Short tutorial, contextual hints, a colour-blind aid, a calm mode and haptic feedback on supported devices
- Synthesized sound (Web Audio) with a motif for each takeover
- Works offline after the first visit

## Stack

Plain JavaScript and HTML with a WebGL 1 fragment shader for the gas and a 2D canvas overlay. Sound is generated with the Web Audio API. Fonts (Manrope and Unbounded) are bundled as woff2 files. No build step, no dependencies.

## Run locally

Serve the folder with any static file server. A small server that disables caching is included:

```
python serwer.py 8791
```

Then open `http://127.0.0.1:8791/index.html`. Add `?mute=1` to start without sound. The service worker is not registered on `localhost`.

## Structure

```
index.html              page and menus
game.js                 game logic, input, 2D overlay
gas.js                  WebGL gas shader
colors.js               palette and light mixing
audio.js                Web Audio sound
bg.js, gestosc.*        background and density map
fonts/                  bundled woff2 fonts and fonts.css
sw.js                   service worker (offline cache)
manifest.webmanifest    PWA manifest
icon-*.png              app icons
serwer.py               local no-cache static server
```

## License

All rights reserved. The bundled fonts keep their own open licences (SIL OFL).
