#!/usr/bin/env python3
"""Generates the games' background music: ProTracker 2 modules
(4 channels, 31 sample slots, "M.K."), one tune per game.

Each is written twice. games/<game>/music/<name>.mod is the
file the game loads and the one to open in a tracker (or
replace with your own — see that directory's README).
games/<game>/music-data.js is the same bytes base64'd, which
the game falls back to when the .mod cannot be fetched.

The repo ships no binary assets, so the module — instruments
included — is synthesized here rather than sourced: every
sample is a waveform written by this script, which makes the
result ours to licence and keeps the whole tune diffable as
code. Re-run after editing the score:

	tools/generate_mod.py [game ...]

With no games named, every game's music is rebuilt.
"""
import argparse
import base64
import math
import os
import random
import struct



NOTES = [
	'C-', 'C#', 'D-', 'D#', 'E-', 'F-',
	'F#', 'G-', 'G#', 'A-', 'A#', 'B-',
]

# ProTracker period table, finetune 0, octaves 1-3.
PERIODS = [
	[856, 808, 762, 720, 678, 640,
		604, 570, 538, 508, 480, 453],
	[428, 404, 381, 360, 339, 320,
		302, 285, 269, 254, 240, 226],
	[214, 202, 190, 180, 170, 160,
		151, 143, 135, 127, 120, 113],
]

ROWS = 64
CHANNELS = 4


def period(name):
	"""'A-2' -> the ProTracker period for that note."""
	return PERIODS[int(name[2]) - 1][NOTES.index(name[:2])]


def clamp8(v):
	return max(-128, min(127, int(round(v))))


def single_cycle(length, shape):
	"""One cycle of a waveform, so pitch follows the period.

	At period 428 the Amiga plays 8287 samples/sec, so a
	128-byte cycle sounds at ~65Hz and a 64-byte one an
	octave above: that is what ties note names to octaves
	in the score below.
	"""
	out = bytearray()
	for i in range(length):
		out.append(
			clamp8(shape(i / length) * 120) & 0xFF)
	return bytes(out)


def saw(t):
	return 1 - 2 * t


def pulse(t):
	# Narrow pulse: more odd harmonics, cuts through the mix.
	return 1 if t < 0.32 else -0.85


def pad(t):
	a = math.sin(2 * math.pi * t)
	b = math.sin(4 * math.pi * t) * 0.4
	c = math.sin(6 * math.pi * t) * 0.22
	return (a + b + c) * 0.62


def kick(length):
	out = bytearray()
	phase = 0.0
	for i in range(length):
		k = i / length
		freq = 185 * math.exp(-4.2 * k) + 42
		phase += freq / 8287.0
		env = math.exp(-5.0 * k)
		v = math.sin(2 * math.pi * phase) * env * 124
		out.append(clamp8(v) & 0xFF)
	return bytes(out)


def snare(length, rand):
	out = bytearray()
	for i in range(length):
		k = i / length
		env = math.exp(-7.5 * k)
		tone = math.sin(2 * math.pi * 196 * i / 8287.0)
		noise = rand.uniform(-1, 1)
		v = (noise * 0.78 + tone * 0.3) * env * 118
		out.append(clamp8(v) & 0xFF)
	return bytes(out)


def hat(length, rand):
	out = bytearray()
	for i in range(length):
		env = math.exp(-26.0 * (i / length))
		out.append(
			clamp8(rand.uniform(-1, 1) * env * 96) & 0xFF)
	return bytes(out)


def build_samples():
	rand = random.Random(20261018)
	return [
		{
			'name': 'bb-bass', 'vol': 50, 'loop': True,
			'data': single_cycle(128, saw),
		},
		{
			'name': 'bb-lead', 'vol': 38, 'loop': True,
			'data': single_cycle(64, pulse),
		},
		{
			'name': 'bb-pad', 'vol': 24, 'loop': True,
			'data': single_cycle(64, pad),
		},
		{
			'name': 'bb-kick', 'vol': 56, 'loop': False,
			'data': kick(1400),
		},
		{
			'name': 'bb-snare', 'vol': 46, 'loop': False,
			'data': snare(1800, rand),
		},
		{
			'name': 'bb-hat', 'vol': 22, 'loop': False,
			'data': hat(640, rand),
		},
	]


# One song per game. Each is four 64-row patterns, one per
# chord of its progression, with the lead written as scale
# degrees so a riff stays in key under whatever chord is below
# it. Drums are named patterns (see DRUMS).
SONGS = {
	'beltbreaker': {
		'title': 'belt breaker',
		'dir': 'games/beltbreaker',
		'file': 'belt-breaker.mod',
		'speed': 6,
		'drums': 'drive',
		'chords': ['A-1', 'F-1', 'C-2', 'G-1'],
		'pads': ['A-2', 'F-2', 'C-3', 'G-2'],
		'scale': [
			'A-2', 'B-2', 'C-3', 'D-3',
			'E-3', 'F-3', 'G-3', 'A-3',
		],
		'riffs': [
			[(0, 0), (4, 2), (6, 4), (8, 7), (12, 6),
				(14, 4), (16, 0), (20, 2), (22, 4),
				(24, 3), (28, 2), (32, 0), (36, 2),
				(38, 4), (40, 7), (44, 6), (48, 4),
				(52, 3), (56, 2), (60, 0)],
			[(0, 3), (4, 5), (8, 7), (10, 5), (12, 3),
				(16, 2), (20, 4), (24, 5), (28, 4),
				(32, 3), (36, 5), (40, 7), (44, 5),
				(48, 4), (52, 2), (56, 3), (60, 1)],
			[(0, 2), (4, 4), (6, 6), (8, 4), (12, 2),
				(16, 1), (20, 3), (24, 4), (28, 6),
				(32, 7), (36, 6), (40, 4), (44, 2),
				(48, 4), (52, 6), (56, 7), (60, 6)],
			[(0, 4), (2, 6), (4, 7), (8, 6), (12, 4),
				(16, 5), (20, 3), (24, 1), (28, 3),
				(32, 4), (36, 6), (40, 7), (42, 6),
				(44, 7), (48, 6), (52, 4), (56, 2),
				(60, 0)],
		],
	},
	'tetris': {
		'title': 'blockfall',
		'dir': 'games/tetris',
		'file': 'blockfall.mod',
		'speed': 5,
		'drums': 'tight',
		'chords': ['E-1', 'C-2', 'G-1', 'D-2'],
		'pads': ['E-2', 'C-3', 'G-2', 'D-3'],
		'scale': [
			'E-2', 'F#2', 'G-2', 'A-2',
			'B-2', 'C-3', 'D-3', 'E-3',
		],
		'riffs': [
			[(0, 4), (2, 2), (4, 0), (8, 2), (10, 4),
				(12, 2), (16, 4), (20, 7), (24, 6),
				(28, 4), (32, 4), (34, 2), (36, 0),
				(40, 2), (44, 1), (48, 2), (52, 4),
				(56, 2), (60, 0)],
			[(0, 2), (4, 4), (8, 5), (12, 4), (16, 2),
				(20, 0), (24, 2), (28, 4), (32, 5),
				(36, 4), (40, 2), (44, 4), (48, 5),
				(52, 7), (56, 5), (60, 4)],
			[(0, 6), (2, 4), (4, 6), (8, 7), (12, 6),
				(16, 4), (20, 6), (24, 4), (28, 2),
				(32, 4), (36, 6), (40, 7), (44, 6),
				(48, 4), (52, 2), (56, 4), (60, 2)],
			[(0, 0), (4, 2), (8, 4), (10, 5), (12, 4),
				(16, 2), (20, 4), (24, 2), (28, 0),
				(32, 2), (36, 4), (40, 6), (44, 4),
				(48, 2), (52, 1), (56, 0), (60, 0)],
		],
	},
	'racer': {
		'title': 'dash',
		'dir': 'games/racer',
		'file': 'dash.mod',
		'speed': 5,
		'drums': 'tight',
		'chords': ['D-1', 'A-1', 'B-1', 'G-1'],
		'pads': ['D-2', 'A-2', 'B-2', 'G-2'],
		'scale': [
			'D-2', 'E-2', 'F#2', 'G-2',
			'A-2', 'B-2', 'C#3', 'D-3',
		],
		'riffs': [
			[(0, 0), (3, 2), (6, 4), (8, 2), (12, 4),
				(16, 7), (20, 6), (24, 4), (28, 2),
				(32, 0), (35, 2), (38, 4), (40, 6),
				(44, 7), (48, 6), (52, 4), (56, 2),
				(60, 4)],
			[(0, 4), (4, 6), (8, 7), (11, 6), (14, 4),
				(16, 2), (20, 4), (24, 6), (28, 4),
				(32, 7), (36, 6), (40, 4), (44, 6),
				(48, 7), (52, 5), (56, 4), (60, 2)],
			[(0, 1), (2, 3), (4, 5), (8, 3), (12, 1),
				(16, 3), (20, 5), (24, 6), (28, 5),
				(32, 3), (36, 5), (40, 6), (44, 5),
				(48, 3), (52, 1), (56, 3), (60, 5)],
			[(0, 6), (4, 4), (8, 2), (10, 4), (12, 6),
				(16, 7), (20, 4), (24, 2), (28, 0),
				(32, 2), (36, 4), (40, 6), (44, 4),
				(48, 2), (52, 4), (56, 2), (60, 0)],
		],
	},
	'pacman': {
		'title': 'maze muncher',
		'dir': 'games/pacman',
		'file': 'maze-muncher.mod',
		'speed': 6,
		'drums': 'bounce',
		'chords': ['C-2', 'A-1', 'F-1', 'G-1'],
		'pads': ['C-3', 'A-2', 'F-2', 'G-2'],
		'scale': [
			'C-2', 'D-2', 'E-2', 'F-2',
			'G-2', 'A-2', 'B-2', 'C-3',
		],
		'riffs': [
			[(0, 0), (2, 2), (4, 4), (6, 7), (8, 4),
				(12, 2), (16, 0), (18, 2), (20, 4),
				(24, 2), (28, 0), (32, 4), (34, 2),
				(36, 4), (40, 7), (44, 4), (48, 2),
				(52, 4), (56, 2), (60, 0)],
			[(0, 5), (4, 4), (8, 2), (12, 4), (16, 5),
				(20, 7), (24, 5), (28, 4), (32, 2),
				(36, 4), (40, 5), (44, 4), (48, 2),
				(52, 0), (56, 2), (60, 4)],
			[(0, 3), (2, 5), (4, 3), (8, 1), (12, 3),
				(16, 5), (20, 3), (24, 5), (28, 7),
				(32, 5), (36, 3), (40, 1), (44, 3),
				(48, 5), (52, 3), (56, 1), (60, 3)],
			[(0, 4), (4, 6), (8, 7), (12, 6), (16, 4),
				(20, 6), (24, 4), (28, 2), (32, 4),
				(36, 6), (40, 7), (44, 6), (48, 4),
				(52, 2), (56, 1), (60, 0)],
		],
	},
}

# bar is the row within each 16-row bar.
DRUMS = {
	'drive': {'kick': (0, 6, 10), 'snare': (4, 12), 'hat': 2},
	'tight': {'kick': (0, 7), 'snare': (4, 12), 'hat': 1},
	'bounce': {'kick': (0, 8), 'snare': (4, 12), 'hat': 2},
}


def empty_pattern():
	return [
		[(0, 0, 0, 0) for _ in range(CHANNELS)]
		for _ in range(ROWS)
	]


def put(pat, row, ch, sample, note, effect=0, param=0):
	pat[row][ch] = (sample, period(note), effect, param)


def lay_bass(pat, root):
	low = root
	high = root[:2] + str(int(root[2]) + 1)
	for row in range(0, ROWS, 4):
		bar = row % 16
		note = high if bar in (8, 12) else low
		put(pat, row, 0, 1, note)


def lay_lead(pat, riff, scale):
	for row, degree in riff:
		put(pat, row, 1, 2, scale[degree])


def lay_pad(pat, note):
	for row in (0, 32):
		put(pat, row, 2, 3, note)


def lay_drums(pat, kit):
	for row in range(ROWS):
		bar = row % 16
		if bar in kit['kick']:
			put(pat, row, 3, 4, 'C-2')
		elif bar in kit['snare']:
			put(pat, row, 3, 5, 'C-2')
		elif row % (kit['hat'] + 1) == 0:
			put(pat, row, 3, 6, 'C-2')


def build_patterns(song):
	kit = DRUMS[song['drums']]
	pats = []
	for i, root in enumerate(song['chords']):
		pat = empty_pattern()
		lay_bass(pat, root)
		lay_lead(pat, song['riffs'][i], song['scale'])
		lay_pad(pat, song['pads'][i])
		lay_drums(pat, kit)
		pats.append(pat)
	# Fxx with a parameter under 32 sets ticks per row; 6 is
	# the ProTracker default and makes a row a 16th at the
	# default 125 BPM.
	first = pats[0][0][0]
	pats[0][0][0] = (first[0], first[1], 0x0F, song['speed'])
	return pats


def encode_cell(cell):
	sample, per, effect, param = cell
	return bytes([
		(sample & 0xF0) | ((per >> 8) & 0x0F),
		per & 0xFF,
		((sample & 0x0F) << 4) | (effect & 0x0F),
		param & 0xFF,
	])


def sample_header(s):
	data = s['data']
	words = len(data) // 2
	if s['loop']:
		repeat, length = 0, words
	else:
		# A repeat length of one word is the convention for
		# "play once"; zero would loop the whole sample.
		repeat, length = 0, 1
	return (
		s['name'].encode('ascii').ljust(22, b'\0')
		+ struct.pack('>H', words)
		+ bytes([0, s['vol']])
		+ struct.pack('>HH', repeat, length))


def empty_header():
	return b'\0' * 22 + struct.pack('>H', 0) + bytes(
		[0, 0]) + struct.pack('>HH', 0, 1)


def build_mod(title, samples, patterns, order):
	out = bytearray(title.encode('ascii').ljust(20, b'\0'))
	for s in samples:
		out += sample_header(s)
	for _ in range(31 - len(samples)):
		out += empty_header()
	out += bytes([len(order), 127])
	out += bytes(order).ljust(128, b'\0')
	out += b'M.K.'
	for pat in patterns:
		for row in pat:
			for cell in row:
				out += encode_cell(cell)
	for s in samples:
		out += s['data']
	return bytes(out)


JS_HEADER = """\
// GENERATED by tools/generate_mod.py — do not edit by hand.
//
// "{title}" as a ProTracker 2 module (4 channels, 31
// sample slots, "M.K."), base64-encoded. This is the
// fallback: the game loads the .mod in music/ when it
// can, and only decodes this when that fetch fails.
// Replace the music by dropping a module in music/, not
// by editing this file.

export const MOD_BASE64 =
\t{body}
"""


def write_js(path, blob, title):
	b64 = base64.b64encode(blob).decode('ascii')
	lines = [
		b64[i:i + 56] for i in range(0, len(b64), 56)
	]
	body = "'" + "' +\n\t'".join(lines) + "'"
	with open(path, 'w') as fh:
		fh.write(JS_HEADER.format(title=title, body=body))


MUSIC_README = """# {title} music

Drop ProTracker 2 modules (`.mod`) in this directory and list
their filenames in `TRACKS` in `../audio.js`. The first that
loads is the music; anything that fails to load (missing, or
not a 4-channel 31-sample module) is skipped, and if none load
the game falls back to the module built into
`../music-data.js`.

`{file}` is generated — `tools/generate_mod.py` writes both it
and the base64 fallback — so re-running that script overwrites
it. Replacing it with your own module is fine; just don't
expect the generator to leave it alone.

`.mod` files in here are not tracked by git (see `.gitignore`),
so a fresh clone has none and falls back to the base64 until
the generator is run or a module is dropped in.

See `games/_shared/modfx.js` for the effects the player
supports. Anything outside that set is ignored rather than
mis-played.
"""


def write_song(slug, song):
	samples = build_samples()
	blob = build_mod(
		song['title'], samples, build_patterns(song),
		list(range(len(song['chords']))))
	js = os.path.join(song['dir'], 'music-data.js')
	mod = os.path.join(song['dir'], 'music', song['file'])
	os.makedirs(os.path.dirname(mod), exist_ok=True)
	write_js(js, blob, song['title'])
	with open(mod, 'wb') as fh:
		fh.write(blob)
	readme = os.path.join(song['dir'], 'music', 'README.md')
	text = MUSIC_README.format(
		title=song['title'].title(),
		file=song['file'])
	with open(readme, 'w') as fh:
		fh.write(text)
	print(f'{mod}: {len(blob)} bytes of module')


def main():
	ap = argparse.ArgumentParser(
		description='Generate the games\' music.')
	ap.add_argument(
		'games', nargs='*', choices=sorted(SONGS) + [[]],
		default=[], help='which games (default: all)')
	args = ap.parse_args()

	for slug in (args.games or sorted(SONGS)):
		write_song(slug, SONGS[slug])


if __name__ == '__main__':
	main()
