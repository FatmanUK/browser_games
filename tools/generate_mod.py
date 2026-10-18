#!/usr/bin/env python3
"""Generates Belt Breaker's background music: a ProTracker 2
module (4 channels, 31 sample slots, "M.K.").

Writes it twice. games/beltbreaker/music/belt-breaker.mod is
the file the game loads and the one to open in a tracker (or
replace with your own — see that directory's README).
games/beltbreaker/music-data.js is the same bytes base64'd,
which the game falls back to when the .mod cannot be fetched.

The repo ships no binary assets, so the module — instruments
included — is synthesized here rather than sourced: every
sample is a waveform written by this script, which makes the
result ours to licence and keeps the whole tune diffable as
code. Re-run after editing the score:

	tools/generate_mod.py [--mod out.mod]

--mod writes an extra copy somewhere else, for inspection.
"""
import argparse
import base64
import math
import os
import random
import struct

OUT_JS = 'games/beltbreaker/music-data.js'
OUT_MOD = 'games/beltbreaker/music/belt-breaker.mod'

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


# One pattern per chord: A minor, F, C, G — four bars each.
CHORDS = ['A-1', 'F-1', 'C-2', 'G-1']
PADS = ['A-2', 'F-2', 'C-3', 'G-2']
LEAD = [
	'A-2', 'B-2', 'C-3', 'D-3',
	'E-3', 'F-3', 'G-3', 'A-3',
]

# (row, scale degree) — the melody, written as degrees so it
# stays in key no matter which chord is under it.
RIFFS = [
	[(0, 0), (4, 2), (6, 4), (8, 7), (12, 6), (14, 4),
		(16, 0), (20, 2), (22, 4), (24, 3), (28, 2),
		(32, 0), (36, 2), (38, 4), (40, 7), (44, 6),
		(48, 4), (52, 3), (56, 2), (60, 0)],
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
		(32, 4), (36, 6), (40, 7), (42, 6), (44, 7),
		(48, 6), (52, 4), (56, 2), (60, 0)],
]

KICK_ROWS = (0, 6, 10)
SNARE_ROWS = (4, 12)


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


def lay_lead(pat, riff):
	for row, degree in riff:
		put(pat, row, 1, 2, LEAD[degree])


def lay_pad(pat, note):
	for row in (0, 32):
		put(pat, row, 2, 3, note)


def lay_drums(pat):
	for row in range(ROWS):
		bar = row % 16
		if bar in KICK_ROWS:
			put(pat, row, 3, 4, 'C-2')
		elif bar in SNARE_ROWS:
			put(pat, row, 3, 5, 'C-2')
		elif row % 2 == 0:
			put(pat, row, 3, 6, 'C-2')


def build_patterns():
	pats = []
	for i, root in enumerate(CHORDS):
		pat = empty_pattern()
		lay_bass(pat, root)
		lay_lead(pat, RIFFS[i])
		lay_pad(pat, PADS[i])
		lay_drums(pat)
		pats.append(pat)
	# Fxx with a parameter under 32 sets ticks per row; 6 is
	# the ProTracker default and makes a row a 16th at the
	# default 125 BPM.
	first = pats[0][0][0]
	pats[0][0][0] = (first[0], first[1], 0x0F, 6)
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


def write_js(path, blob):
	b64 = base64.b64encode(blob).decode('ascii')
	lines = [
		b64[i:i + 56] for i in range(0, len(b64), 56)
	]
	body = "'" + "' +\n\t'".join(lines) + "'"
	with open(path, 'w') as fh:
		fh.write(
			'// GENERATED by tools/generate_mod.py — do '
			'not edit by hand.\n'
			'//\n'
			'// Belt Breaker\'s background music as a '
			'ProTracker 2 module\n'
			'// (4 channels, 31 sample slots, "M.K."), '
			'base64-encoded.\n'
			'// Every instrument in it is a waveform '
			'synthesized by that\n'
			'// script, so the tune is ours and the repo '
			'stays free of\n'
			'// binary assets. Decoded and rendered by '
			'modplayer.js.\n\n'
			'export const MOD_BASE64 =\n\t'
			+ body + '\n')


def main():
	ap = argparse.ArgumentParser(
		description='Generate Belt Breaker music data.')
	ap.add_argument(
		'--mod', help='write an extra copy here too')
	args = ap.parse_args()

	samples = build_samples()
	patterns = build_patterns()
	blob = build_mod(
		'belt breaker', samples, patterns,
		list(range(len(patterns))))
	write_js(OUT_JS, blob)
	os.makedirs(os.path.dirname(OUT_MOD), exist_ok=True)
	for path in filter(None, [OUT_MOD, args.mod]):
		with open(path, 'wb') as fh:
			fh.write(blob)
	print(f'{OUT_MOD}: {len(blob)} bytes of module')
	print(f'{OUT_JS}: same bytes, base64 fallback')


if __name__ == '__main__':
	main()
