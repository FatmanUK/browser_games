# Adding a game

Each game is a self-contained folder under `games/` that exports a module
implementing this contract (see `games/_template/game.js` for a working
stub):

```js
export default {
  id: 'unique-slug',
  title: 'Display Name',
  description: 'One-line blurb shown on the selector card',

  init(container, controls) {
    // Mount the game's DOM/state into `container`. Called when the player
    // picks this game from the launcher.
    // `controls.back()` returns to the launcher (call it from your own
    // "Back to games" button — see games/_shared/chrome.js).
  },

  destroy() {
    // Optional. Called when the player returns to the launcher — stop
    // timers/animation frames, remove listeners added outside `container`.
  },
}
```

## Shared helpers

Not part of the contract, but all three bundled games use them and new
games should too, for a consistent look:

- `games/_shared/chrome.js` — `createChrome(container, { title, onNewGame,
  onBack })` builds the two-column layout (game on the left, title +
  "New game" + "Back to games" buttons on the right) and returns
  `{ main, side }` elements to mount your game/stats into.
  `createStat(side, label)` adds a `"Label: value"` line to the sidebar
  and returns a setter function.
- `games/_shared/storage.js` — `loadNumber(key, fallback)` /
  `saveNumber(key, value)` wrap `localStorage` (with try/catch) for
  persisting a high score or best time across visits.

## Steps

1. Copy `games/_template/` to `games/<slug>/`.
2. Implement `init`/`destroy` in `games/<slug>/game.js`.
3. Register it in [js/registry.js](../js/registry.js):

   ```js
   import myGame from '../games/<slug>/game.js'

   export const games = [myGame]
   ```

No other launcher code needs to change.
