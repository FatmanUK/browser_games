# Belt Breaker music

Drop ProTracker 2 modules (`.mod`) in this directory and list
their filenames in `TRACKS` at the top of `../music.js`. The
first one that loads is the music; anything that fails to load
(missing, or not a 4-channel 31-sample module) is skipped, and
if none load the game falls back to the module built into
`../music-data.js`.

`belt-breaker.mod` is the one that ships with the game. It is
generated — `tools/generate_mod.py` writes both it and the
base64 fallback — so re-running that script overwrites it.
Replacing it with your own module is fine; just don't expect
the generator to leave it alone.

## What the player supports

`../modplayer.js` renders the whole module to one buffer and
loops it, rather than streaming it. It handles 4-channel,
31-sample modules (`M.K.`, `M!K!`, `FLT4`, `4CHN`) and these
effects:

```
0xy arpeggio          1xx portamento up
2xx portamento down   3xx tone portamento
4xy vibrato           5xy tone porta + volume slide
6xy vibrato + volume slide
7xy tremolo           9xx sample offset
Axy volume slide      Bxx position jump
Cxx set volume        Dxx pattern break
E1x/E2x fine portamento
EAx/EBx fine volume slide
EEx pattern delay     Fxx speed / tempo
```

Anything else is ignored rather than mis-played, so a module
leaning on E9x retrigger or the funk repeat will play, just not
quite as its author intended.
