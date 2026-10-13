# Browser Games

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
- **Dash** — a top-down racer around an oval track bounded by trees,
  with obstacles (tyres, barrels, trees, water) blocking the infield
  shortcut and oil slicks / sand traps on the track itself. Arrow
  keys / WASD to drive; the lap counter never decreases.

## Adding a game

See [games/README.md](games/README.md).

## Project layout

```
index.html             launcher page (game-select grid + viewport)
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
games/racer/            Dash
games/_template/        copy-paste starting point for a new game
```
