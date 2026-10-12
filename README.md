# Browser Games

A minimal, extensible launcher for web-based games. Plain HTML/CSS/JS, no
build step.

## Running locally

ES module imports require `http(s)`, not `file://`. Serve the directory with
any static server, e.g.:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Adding a game

See [games/README.md](games/README.md).

## Project layout

```
index.html          the launcher page (game-select grid + game viewport)
css/style.css        styling
js/app.js            launcher logic: render grid, mount/unmount selected game
js/registry.js        the list of registered games
games/<slug>/game.js  one module per game, implementing the game contract
games/_template/      copy-paste starting point for a new game
```
