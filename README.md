# Browser Games

[![build](https://github.com/FatmanUK/browser_games/actions/workflows/build.yml/badge.svg)](https://github.com/FatmanUK/browser_games/actions/workflows/build.yml)
[![push](https://github.com/FatmanUK/browser_games/actions/workflows/push.yml/badge.svg)](https://github.com/FatmanUK/browser_games/actions/workflows/push.yml)

A minimal, extensible launcher for web-based games. Plain HTML/CSS/JS, no
build step.

## Running locally

ES module imports require `http(s)`, not `file://`, so the site must be
served rather than opened directly.

```bash
make run           # serves at http://localhost:8000/
make run PORT=9000 # or any other port
```

`make` with no target (or `make help`) lists available workflows. `run`
wraps `tools/dev_server.py`, a thin wrapper around `http.server` that
sends `Cache-Control: no-store` — plain `http.server` sends no cache
header at all, and browsers can still cache ES module imports across
requests (even across a server restart on the same port), hiding
fresh edits until a hard refresh. No other build step exists.

## Container

A `Containerfile` packages the site behind the same
`tools/dev_server.py` used for local dev (podman; `make help` shows
the full list):

```bash
make pod-build # build the image
make pod-run   # build, then run it at http://localhost:8000/
make pod-push  # push to ghcr.io/fatmanuk/browser_games (used by CI)
```

`.github/workflows/build.yml` builds the image on every push/PR;
`push.yml` also pushes it to GHCR on pushes to `mother`.

## Games

Each game keeps a high score / best time in `localStorage` (per game,
per browser) and has its own "New game" button next to its title.

- **Blockfall** — a Tetris-style falling block game with a 7-bag
  randomizer and a next-piece preview. Arrow keys to move/rotate,
  space to hard-drop. Has separate "Sound" (SFX, on by default)
  and "Music" (off by default) toggles — both synthesized via Web
  Audio, no sound files.
- **Maze Muncher** — a Pac-Man-style maze chase with 3 lives and a
  start countdown. Arrow keys to move, eat every dot while avoiding
  the ghosts. Clearing a maze advances to the next level (3 maze
  layouts, cycling with ghosts getting faster/more numerous each
  time) rather than ending the game. Has its own "Sound"/"Music"
  toggles.
- **Dash** — a top-down racer on a large, randomly generated
  track (built by `tools/generate_track.py` into
  `games/racer/track-data.js` — rerun it for a fresh layout),
  starting from a grid on a straight before the line. Dusk
  setting, with the camera zoomed in and following the car (you
  can't see the whole track at once) and twin headlight beams
  cutting through the dim to light up whatever's ahead with its
  true colours, not a white wash. Title, buttons and the
  Laps/Speed/Best lap meters overlay the top of the canvas
  itself (a translucent bar) rather than sitting beside it in
  the side panel, so the canvas can fill the window. Bounded by
  a thick treeline that stops the car dead if you plough into
  it, with hard obstacles (small tyres/barrels, smaller than the
  car; big trees; and solid buildings filling out the middle)
  scattered off the track surface — either in the infield or out
  past the rumble strips — and water hazards that drag rather
  than block. Tyres bounce the car off; everything else stops it
  dead. Oil blobs are the only hazard on the track surface
  itself: they're scattered over the corners (never the starting
  grid, and a new layout each game), and hitting one takes away
  your steering and brakes entirely while the car spins and
  slides on through the bend; sand traps sit
  off-track in the verge (higher friction than anything else,
  hauling the car down to a stop fast but not instantly), so you
  only hit one by running wide. Each generated track keeps its
  own best-lap time. Arrow keys / WASD to drive; the lap counter
  never decreases. Has its own "Sound"/"Music" toggles.
- **Belt Breaker** — an Asteroids-style rock shoot with a
  pre-rendered, fake-3D look. Each level is three phases: clear a
  belt of silver, gold and red rocks (gold is armoured, red is
  fast and bursts into three), fly a zooming wormhole dodging
  rocks and drones, then fight the level guardian. Arrows/WASD to
  fly, space to fire, shift for hyperspace; title, buttons and
  meters overlay the canvas as in Dash. Its sprites are baked to
  offscreen canvases on first play (`games/beltbreaker/
  sprites.js`), its sound effects are rendered waveforms
  (`samples.js`) and its music is a ProTracker 2 module built by
  `tools/generate_mod.py` into `games/beltbreaker/music-data.js`
  and mixed by `modplayer.js` — rerun that tool after editing the
  score. Has its own "Sound"/"Music" toggles.

## Adding a game

See [games/README.md](games/README.md).

## Project layout

```
Containerfile           image for the container (make pod-build)
tools/dev_server.py     static server: local dev and the container
tools/generate_track.py generates games/racer/track-data.js
tools/generate_mod.py   generates games/beltbreaker/music-data.js
index.html              launcher page (game-select grid + viewport)
css/style.css           styling
js/app.js               launcher logic: render grid, mount/unmount
js/registry.js          the list of registered games
games/<slug>/game.js    one module per game (the game contract)
games/_shared/          chrome.js (title/buttons sidebar),
                        storage.js (localStorage high scores),
                        audio.js (Web Audio sound/music engine)
                        — used by the bundled games, optional
games/tetris/           Blockfall (+ audio.js: its own melody/
                        SFX built on games/_shared/audio.js)
games/pacman/           Maze Muncher (+ audio.js, same pattern)
games/racer/            Dash (+ audio.js, same pattern; track
                        -data.js is generated, see tools/
                        generate_track.py)
games/beltbreaker/      Belt Breaker (art.js/rocks.js/craft.js/
                        sprites.js pre-render the art; common.js
                        /belt.js/tunnel.js/boss.js/world.js the
                        rules; render*.js the drawing; audio.js
                        + samples.js + music.js + modplayer.js
                        the sound, over generated music-data.js)
games/_template/        copy-paste starting point for a new game
```
