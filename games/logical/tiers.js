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

// A level's size wobbles by one either way. The early band is
// where the ramp barely moves, and eight levels of three
// wheels in a row is the same board eight times with a
// different code on it.
function jitter(level) {
	return (Math.imul(level, 2654435761) >>> 0) % 3 - 1
}

// Very long early and tight late, on a curve rather than a
// line. A line spends its first twenty levels barely below its
// starting value, which is exactly where a player needs the
// time; squaring it gives away most of the clock in the second
// half, where the board is big enough to need the pressure.
function gutterFor(level) {
	const k = (level - 1) / (LEVELS - 1)
	const slack = (1 - k) * (1 - k)
	return Math.round(9000 + 51000 * slack)
}

export function coloursFor(level) {
	if (level <= 8) return 2
	if (level <= 30) return 3
	return 4
}

export function tierFor(level) {
	const n = Math.min(LEVELS, Math.max(1, level))
	const wheels = Math.max(3, rampInt(n, 3, 12) + jitter(n))
	return {
		level: n,
		wheels,
		extraRuns: rampInt(n, 2, 0),
		// Never more than half the wheels. Asking a three
		// wheel board for three feeds means every wheel has
		// to touch the gutter, which can only be done by
		// putting them all in the top row — which is how the
		// first eight levels came to be the same board eight
		// times over.
		feeds: Math.max(
			2,
			Math.min(
				rampInt(n, 3, 2),
				Math.ceil(wheels / 2))),
		colours: coloursFor(n),
		gutterMs: gutterFor(n),
		crossings: rampFrom(n, FIRST_CROSSING, 1, 4),
		booths: rampFrom(n, FIRST_BOOTH, 1, 3),
		blocks: rampFrom(n, FIRST_BLOCK, 1, 4),
		// Not on a board of three. While the grid is lit
		// nothing breaks on colour, so the player needs a
		// wheel they can afford to empty and refill to the
		// pattern; with twelve slots in total there is no
		// such wheel.
		hasPattern: n >= FIRST_PATTERN && wheels >= 4,
		// How long the grid stays dark between lightings.
		// It stays lit until a wheel matches it, so this is
		// the only timing the pattern has.
		darkMs: rampInt(n, 45000, 16000),
	}
}
