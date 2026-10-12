# Adding a game

Each game is a self-contained folder under `games/` that exports a module
implementing this contract (see `games/_template/game.js` for a working
stub):

```js
export default {
  id: 'unique-slug',
  title: 'Display Name',
  description: 'One-line blurb shown on the selector card',

  init(container) {
    // Mount the game's DOM/state into `container`. Called when the player
    // picks this game from the launcher.
  },

  destroy() {
    // Optional. Called when the player returns to the launcher — stop
    // timers/animation frames, remove listeners added outside `container`.
  },
}
```

## Steps

1. Copy `games/_template/` to `games/<slug>/`.
2. Implement `init`/`destroy` in `games/<slug>/game.js`.
3. Register it in [js/registry.js](../js/registry.js):

   ```js
   import myGame from '../games/<slug>/game.js'

   export const games = [myGame]
   ```

No other launcher code needs to change.
