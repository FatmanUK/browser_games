// What a level of a given number is made of.
//
// One table, read by level.js for the layout and by world.js
// for the timings. Keeping it here rather than scattered
// through the generator means the whole hundred-level curve
// can be read in one screen, and tuned without touching the
// code that builds anything.
//
// Two of these ramp in the direction that looks wrong at
// first. Extra runs ramp DOWN: a bare spanning tree is the
// tight case, because it leaves the fewest routes for shuffling
// marbles about and the least pipe to park them in. Gutter
// feeds ramp down too, but stop at two — with a single feed one
// full pipe at that column means the gutter cannot dispose at
// all, and the level dies to something the player cannot route
// around.
//
// Colours ramp UP, and that is the biggest lever of the lot:
// four colours in the supply makes assembling four of one far
// slower than two does. The first eight levels stay at two
// colours because that is what makes them teachable, and it
// never ramps back down.

import { LEVELS } from './code.js'

// Easiest first, which is also cheapest to teach first.
// Crossings add nothing to learn — with intangible marbles
// they are purely something to look at. Booths are a gift,
// arriving just as the third colour starts to hurt. One-way
// blocks are the genuinely restrictive piece, so they land
// last, once routing is second nature.
const FIRST_CROSSING = 10
const FIRST_PATTERN = 15
const FIRST_BOOTH = 25
const FIRST_BLOCK = 40

function ramp(level, from, to) {
	const k = (level - 1) / (LEVELS - 1)
	return from + (to - from) * k
}

function rampInt(level, from, to) {
	return Math.round(ramp(level, from, to))
}

// Ramps over [first, LEVELS] rather than [1, LEVELS], so a
// piece actually turns up on the level it is gated to instead
// of waiting for a whole-ladder ramp to round up to one.
function rampFrom(level, first, from, to) {
	if (level < first) return 0
	const k = (level - first) / (LEVELS - first)
	return Math.round(from + (to - from) * k)
}

export function coloursFor(level) {
	if (level <= 8) return 2
	if (level <= 30) return 3
	return 4
}

export function tierFor(level) {
	const n = Math.min(LEVELS, Math.max(1, level))
	return {
		level: n,
		wheels: rampInt(n, 3, 12),
		extraRuns: rampInt(n, 2, 0),
		feeds: Math.max(2, rampInt(n, 3, 2)),
		colours: coloursFor(n),
		gutterMs: rampInt(n, 20000, 9000),
		crossings: rampFrom(n, FIRST_CROSSING, 1, 4),
		booths: rampFrom(n, FIRST_BOOTH, 1, 3),
		blocks: rampFrom(n, FIRST_BLOCK, 1, 4),
		hasPattern: n >= FIRST_PATTERN,
		// How long the grid stays dark between lightings.
		// It stays lit until a wheel matches it, so this is
		// the only timing the pattern has.
		darkMs: rampInt(n, 45000, 16000),
	}
}
