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
wraps `python3 -m http.server` — there's no other build step.

## Games

- **Blockfall** — a Tetris-style falling block game. Arrow keys to
  move/rotate, space to hard-drop.
- **Maze Muncher** — a Pac-Man-style maze chase. Arrow keys to move, eat
  every dot while avoiding the ghosts.
- **Oval Dash** — a top-down racer. Arrow keys / WASD to drive laps
  around the oval track.

## Adding a game

See [games/README.md](games/README.md).

## Project layout

```
index.html             launcher page (game-select grid + viewport)
css/style.css           styling
js/app.js               launcher logic: render grid, mount/unmount
js/registry.js          the list of registered games
games/<slug>/game.js    one module per game (the game contract)
games/tetris/           Blockfall
games/pacman/           Maze Muncher
games/racer/            Oval Dash
games/_template/        copy-paste starting point for a new game
```
