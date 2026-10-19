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
- `games/_shared/hud.js` — the shared game window and the
  pieces for drawing a HUD on the canvas. `buildWindow(
  container, { title, onNewGame, onBack })` builds a canvas of
  the suite's standard size (`WIDTH` x `HEIGHT`) with the
  title and buttons laid over the top of it, and returns
  `{ main: canvas, controlsRow }` — pass `controlsRow` to
  `createAudioToggles`. A game whose playfield is a different
  shape centres inside that window with `fitBoard(ctx, boardW,
  boardH, insetTop, insetBottom)` rather than resizing the
  canvas, so every game in the launcher opens the same size.
  `readout(ctx, x, y, label, value, size, align)`,
  `label(...)` and `brackets(...)` draw meters in the shared
  palette. Prefer this to chrome.js for anything that wants to
  look like a game rather than a form; chrome.js is still
  there for the plainer option.
- `games/_shared/music.js` — `createMusic(getContext, {
  baseUrl, tracks, fallback })` plays ProTracker modules.
  Modules are real `.mod` files in the game's own `music/`
  folder, so the music can be replaced without touching code;
  `fallback` is the base64 of one built in, used when no file
  loads. The returned object has the same `isOn`/`setOn`
  shape the engine's music state does, so pass a façade to
  `createAudioToggles` — `{ isSoundOn, setSoundOn } ` from
  `createAudio` plus `{ isMusicOn: music.isOn, setMusicOn:
  music.setOn }` — and Music drives the tracker instead of the
  melody loop. `createAudio` takes `[null]` as its melody in
  that case, and `getContext` is `audio.context`.
  `games/_shared/modplayer.js` renders a module to a buffer and
  `modfx.js` documents which ProTracker effects it supports.
  `tools/generate_mod.py` generates the bundled modules.
- `games/_shared/storage.js` — `loadNumber(key, fallback)` /
  `saveNumber(key, value)` wrap `localStorage` (with try/catch) for
  persisting a high score or best time across visits.
- `games/_shared/audio.js` — if your game wants sound:
  `createAudio(melody, noteMs)` gives you `tone(freq, duration,
  type, volume)` and `toneSequence(notes, type, volume, gapMs)`
  for one-off SFX, plus independent `isSoundOn`/`setSoundOn` and
  `isMusicOn`/`setMusicOn` state (Sound defaults on, Music off —
  keep it that way, music is the more intrusive one to default
  on). Call `audio.stop()` from your `destroy()`. It also stops
  itself on `pagehide` as a safety net, so a stray tab closed
  without going through `destroy()` can't leave audio running.
  `createAudioToggles(side, audio)` adds the "Sound"/"Music"
  buttons to your sidebar. `melody` is just an array of
  frequencies (or `null` for a rest) looped at `noteMs` per note —
  write your own per game; everything here synthesizes tones, so
  there's nothing to source/license, but swap in real tracks or
  sampled SFX later by changing what `tone()`/`toneSequence()` are
  called with (see `games/tetris/audio.js` for a worked example —
  keep your game's own sound choices in a same-shaped file rather
  than in `game.js` itself). **Important:** call `audio.unlock()`
  synchronously from your real keydown (or other input) handler —
  not from inside a timer callback. Browsers only allow the
  AudioContext to actually start inside a trusted gesture's own
  call stack; if every `tone()` call happens inside your game's
  tick loop (as in a game whose player input only sets a flag
  that a `setInterval` reads later), the context can end up
  created-but-silently-suspended with no error at all. Also
  remember to re-export `unlock` (and anything else you need) from
  your own `setupSound()` wrapper — it isn't on `createAudio()`'s
  return value by accident, it has to be forwarded explicitly.
  If your game's music is something this engine can't express as
  a melody of frequencies — a tracker module, a recorded track —
  `context()` hands you the same AudioContext to mix into rather
  than opening a second one, and the toggles will take a façade
  object in place of the engine (same four `is*On`/`set*On`
  members) if Music should drive your player instead of the
  melody loop. `games/beltbreaker/audio.js` does both.

## Steps

1. Copy `games/_template/` to `games/<slug>/`.
2. Implement `init`/`destroy` in `games/<slug>/game.js`.
3. Register it in [js/registry.js](../js/registry.js):

   ```js
   import myGame from '../games/<slug>/game.js'

   export const games = [myGame]
   ```

No other launcher code needs to change.
