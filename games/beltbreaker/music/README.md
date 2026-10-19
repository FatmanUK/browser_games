# Belt Breaker music

Drop ProTracker 2 modules (`.mod`) in this directory and list
their filenames in `TRACKS` in `../audio.js`. The first that
loads is the music; anything that fails to load (missing, or
not a 4-channel 31-sample module) is skipped, and if none load
the game falls back to the module built into
`../music-data.js`.

`belt-breaker.mod` is generated — `tools/generate_mod.py` writes both it
and the base64 fallback — so re-running that script overwrites
it. Replacing it with your own module is fine; just don't
expect the generator to leave it alone.

`.mod` files in here are not tracked by git (see `.gitignore`),
so a fresh clone has none and falls back to the base64 until
the generator is run or a module is dropped in.

See `games/_shared/modfx.js` for the effects the player
supports. Anything outside that set is ignored rather than
mis-played.
