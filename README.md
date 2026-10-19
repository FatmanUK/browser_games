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

Every game shares one window size, draws its meters on the canvas
rather than in a sidebar, and takes its music from replaceable `.mod`
files in its own `music/` folder — see
[games/README.md](games/README.md) for the helpers that do it.

- **Blockfall** — a Tetris-style falling block game with a 7-bag
  randomizer and a next-piece preview. Arrow keys to move/rotate,
  space to hard-drop. Has separate "Sound" (SFX, on by default)
  and "Music" (off by default) toggles: the effects are
  synthesized, the music is a replaceable ProTracker module in
  `games/tetris/music/`.
- **Maze Muncher** — a Pac-Man-style maze chase with 3 lives and a
  start countdown. Arrow keys to move, eat every dot while avoiding
  the ghosts. Clearing a maze advances to the next level (3 maze
  layouts, cycling with ghosts getting faster/more numerous each
  time) rather than ending the game. Has its own "Sound"/"Music"
  toggles, with a replaceable ProTracker module in
  `games/pacman/music/` for the music.
- **Dash** — a three-lap race against five rivals on a large
  track generated from a seed when the game loads
  (`games/racer/track.js`; no track data is committed), from a
  six-car grid on a straight before the line.
  The lights hold the field until they go out; the rivals
  steer at a point a speed-scaled lookahead further round the
  lap, each on its own line across the road and at its own
  pace, so the field strings out instead of running as a
  block, and leaning on one through a corner costs you both
  speed. They have names and a standings board, so the blue one
  is Voss rather than the blue one. Twelve checkpoint gates are
  painted across the road, and a lap only counts if every one
  of them was passed *on* the road — swept angle alone cannot
  tell a lap from a straight line across the infield, because
  the shortcut sweeps exactly the same angle. Amber chevrons
  warn of the sharper corners, pointing the way they bend. Their lamps are drawn over the dusk rather than
  under it, so a car outside your headlights is still
  something you can see coming. Crossing the line for the
  third time ends your race with a finishing place. Win one
  and the next track opens; `[` and `]` step between the ones
  you have opened, and each keeps its own best lap. Progress
  is one number in `localStorage`, because a level is a seed. Dusk
  setting, with the camera zoomed in and following the car (you
  can't see the whole track at once) and twin headlight beams
  cutting through the dim to light up whatever's ahead with its
  true colours, not a white wash. Title and buttons overlay the
  top of the canvas rather than sitting beside it, and the
  Lap/Speed/Best lap meters are drawn on the canvas itself as a
  dashboard, so the canvas can fill the window. Bounded by
  a thick treeline that stops the car dead if you plough into
  it, with hard obstacles (small tyres/barrels, smaller than the
  car; big trees; and solid buildings filling out the middle)
  scattered off the track surface — either in the infield or out
  past the rumble strips — and water hazards that drag rather
  than block. Tyres bounce the car off; everything else stops it
  dead. Sand traps sit off-track in the verge (higher friction
  than anything else, hauling the car down to a stop fast but
  not instantly), so you only hit one by running wide. Nothing
  is scattered on the track surface itself. Each generated track keeps its
  own best-lap time, keyed by its seed. Arrow keys / WASD to
  drive; the lap counter never decreases. Has its own "Sound"/"Music" toggles, with a
  replaceable ProTracker module in `games/racer/music/` for the
  music.
- **Belt Breaker** — an Asteroids-style rock shoot with a
  pre-rendered, fake-3D look. Three ships, a 3-2-1 countdown at
  the start of each level, then three phases per level: clear a
  belt of silver, gold and red rocks (gold is armoured, red is
  fast and bursts into three), fly a zooming wormhole dodging
  rocks and drones, then fight the level guardian. Arrows/WASD to
  fly, space to fire, shift for hyperspace; title, buttons and
  meters overlay the canvas as in Dash. Break a rock all the way
  down to its smallest fragment and it may leave something:
  silver drops nothing, gold drops money (every 500 buys a
  ship), red drops a gun upgrade (four levels, from the single
  forward gun to a four-barrel spread — losing a ship costs one
  level). The rocks are shaded as real geometry rather than
  drawn: a convex solid cut from a sphere by a dozen-odd planes
  and flat-shaded facet by facet against a fixed light
  (`mesh.js`), so the edges are hard and silver and gold read as
  metal where red reads as rough stone. All of the art bakes to
  offscreen canvases on first play (`sprites.js`), the sound
  effects are rendered waveforms (`samples.js`) and the music is
  a ProTracker 2 module: drop your own `.mod` files into
  `games/beltbreaker/music/` and list them in `music.js` (see
  that directory's README for the effects the player supports).
  The one that ships there is generated by
  `tools/generate_mod.py`, which also writes the base64 fallback
  in `music-data.js`. Has its own "Sound"/"Music" toggles.

## Adding a game

See [games/README.md](games/README.md).

## Project layout

```
Containerfile           image for the container (make pod-build)
tools/dev_server.py     static server: local dev and the container
tools/generate_mod.py   generates each game's music/*.mod
                        and its music-data.js fallback
index.html              launcher page (game-select grid + viewport)
css/style.css           styling
js/app.js               launcher logic: render grid, mount/unmount
js/registry.js          the list of registered games
games/<slug>/game.js    one module per game (the game contract)
games/_shared/          art.js + mesh.js + bake.js (the
                        fake-3D sprite pipeline),
                        chrome.js (title/buttons sidebar),
                        hud.js (shared game window + canvas
                        HUD drawing), storage.js (localStorage
                        high scores), audio.js (Web Audio
                        sound/music engine), music.js +
                        modplayer.js + modfx.js (ProTracker
                        module playback) — used by the bundled
                        games, optional
games/tetris/           Blockfall (+ audio.js/hud.js and its
                        own music/, built on games/_shared/)
games/pacman/           Maze Muncher (+ audio.js/hud.js and
                        its own music/, same pattern)
games/racer/            Dash (+ audio.js, same pattern;
                        car.js/geom.js the car and the track
                        geometry, rivals.js the AI field,
                        race.js the countdown/laps/places,
                        view.js the camera, models.js +
                        sprites.js the baked art, track.js +
                        spline.js + hazards.js the generator,
                        progress.js the track ladder)
games/beltbreaker/      Belt Breaker (rocks.js/craft.js/
                        sprites.js pre-render the art over
                        games/_shared/mesh.js;
                        common.js/belt.js/tunnel.js/boss.js/
                        world.js the rules; render*.js + hud.js
                        the drawing; audio.js + samples.js +
                        music.js + modplayer.js + modfx.js the
                        sound, over music/*.mod)
games/_template/        copy-paste starting point for a new game
```
