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

// A level's size wobbles by nought, one or two, off the level
// number rather than off a hash of it. A hash scatters nicely
// over a hundred levels and says nothing about any two in a
// row, so it handed levels one and two the same three wheels —
// and the first two boards a player ever sees are the two it
// matters most to tell apart. Consecutive numbers cannot share
// a remainder, so consecutive levels cannot share a wobble.
function jitter(level) {
	return (level + 2) % 3
}

// The first six are written out rather than ramped. Three
// wheels on a short-reach lattice has only two distinct shapes
// in it — a line and an elbow — so a board of three can be
// shown once and never again without repeating itself, and the
// ramp was handing one out every third level. One at the top,
// then four upward, where there is room to be different.
const EARLY = [3, 4, 5, 4, 5, 6]

function wheelsFor(n) {
	if (n <= EARLY.length) return EARLY[n - 1]
	return Math.min(13, rampInt(n, 4, 11) + jitter(n))
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

// Never more than half the wheels. Asking a three wheel board
// for three feeds means every wheel has to touch the gutter,
// which can only be done by putting them all in the top row —
// which is how the first eight levels came to be the same
// board eight times over.
function feedsFor(n, wheels) {
	return Math.max(
		2,
		Math.min(rampInt(n, 3, 2), Math.ceil(wheels / 2)))
}

// The three extra pieces, and the pattern grid. The grid stays
// off a board of three: while it is lit nothing breaks on
// colour, so the player needs a wheel they can afford to empty
// and refill to the pattern, and with twelve slots in total
// there is no such wheel.
function piecesFor(n, wheels) {
	return {
		crossings: rampFrom(n, FIRST_CROSSING, 1, 4),
		booths: rampFrom(n, FIRST_BOOTH, 1, 3),
		blocks: rampFrom(n, FIRST_BLOCK, 1, 4),
		hasPattern: n >= FIRST_PATTERN && wheels >= 4,
		// How long the grid stays dark between lightings. It
		// stays lit until a wheel matches it, so this is the
		// only timing the pattern has.
		darkMs: rampInt(n, 45000, 16000),
	}
}

// How far growth may reach for its next site. Two is
// adjacent, and a board built entirely of twos is compact —
// short runs, marbles that arrive while the player is still
// looking at where they sent them. Longer reaches make
// handsome sprawling boards that take four times as long to
// clear, which is the wrong trade on the levels that have to
// teach the rules.
function reachFor(n) {
	return n <= 10 ? 2 : 4
}

export function tierFor(level) {
	const n = Math.min(LEVELS, Math.max(1, level))
	const wheels = wheelsFor(n)
	return {
		level: n,
		wheels,
		reach: reachFor(n),
		extraRuns: rampInt(n, 2, 0),
		feeds: feedsFor(n, wheels),
		colours: coloursFor(n),
		gutterMs: gutterFor(n),
		...piecesFor(n, wheels),
	}
}
