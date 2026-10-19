// Builds one of the hundred levels from its number.
//
// Nothing is committed: a level is a seed, as a Dash track is
// (games/racer/track.js), walked forward until a layout passes
// every check. That means no level data to migrate when this
// file changes, and it means a level keeps its layout for as
// long as seedForLevel does — which is what makes an access
// code worth writing down.
//
// Wheels are grown outward from one cell, each new one placed
// two to four cells from an existing one with clear cells in
// between — so the run that placed it connects it, and the
// board is connected because of how it was built rather than
// because a check said so afterwards.
//
// The one hard rule on placement is that no two wheels may be
// orthogonally adjacent. Two wheels one cell apart across the
// grid would overlap outright (90 of diameter in a 150 cell
// does not fit twice) and one cell apart down it would leave a
// twenty-unit sliver. A gap of two is also what gives every
// run real pipe to hold marbles in.
//
// A strict parity lattice was tried first and thrown out. It
// placed wheels beautifully, but every horizontal pipe cell
// then had one column parity and every vertical pipe cell the
// other, so the two could never share a cell and a crossing
// was not merely rare but impossible. Reaches of three break
// the parity, which is what lets runs cross at all.

import { rng } from '../_shared/art.js'
import {
	COLS, ROWS, COLOURS, DX, DY, at, put, inside, newGrid,
	newWheel, isVertical, accepts,
} from './board.js'
import {
	labelSegments, allWheelsFed, noTraps, feedColumns,
} from './topology.js'
import { tierFor } from './tiers.js'
import { seedForLevel } from './progress.js'

const TRIES = 240
const GROW_GUARD = 1200

function pick(rand, list) {
	return list[(rand() * list.length) | 0]
}

function shuffled(rand, list) {
	const out = list.slice()
	for (let i = out.length - 1; i > 0; i--) {
		const j = (rand() * (i + 1)) | 0
		const t = out[i]
		out[i] = out[j]
		out[j] = t
	}
	return out
}

function newPipe() {
	return {
		kind: 'pipe', h: false, v: false,
		segH: -1, segV: -1,
	}
}

// Free, empty, and no wheel next to it.
function siteFree(grid, c, r) {
	if (!inside(c, r) || at(grid, c, r)) return false
	for (let d = 0; d < 4; d++) {
		const cell = at(grid, c + DX[d], r + DY[d])
		if (cell && cell.kind === 'wheel') return false
	}
	return true
}

function reach(rand) {
	const k = rand()
	if (k < 0.62) return 2
	return k < 0.9 ? 3 : 4
}

// The cells strictly between the two ends of a would-be run.
// Crossing a perpendicular run is allowed only when the tier
// says so: marbles are intangible, so a crossing costs nothing
// to play, but it costs something to read, and the first ten
// levels should read plainly.
function pathClear(grid, c, r, dir, len, cross) {
	for (let i = 1; i < len; i++) {
		const cc = c + DX[dir] * i
		const rr = r + DY[dir] * i
		if (!inside(cc, rr)) return false
		const cell = at(grid, cc, rr)
		if (!cell) continue
		if (cell.kind !== 'pipe') return false
		if (isVertical(dir) ? cell.v : cell.h) return false
		if (!cross) return false
	}
	return true
}

function claimPath(grid, c, r, dir, len) {
	for (let i = 1; i < len; i++) {
		const cc = c + DX[dir] * i
		const rr = r + DY[dir] * i
		let cell = at(grid, cc, rr)
		if (!cell) {
			cell = newPipe()
			put(grid, cc, rr, cell)
		}
		if (isVertical(dir)) cell.v = true
		else cell.h = true
	}
}

function addWheel(grid, wheels, c, r) {
	const id = wheels.length
	put(grid, c, r, { kind: 'wheel', id })
	wheels.push(newWheel(id, c, r))
}

// Always the nearest site, never a longer reach. A run of four
// cells passes straight over the site halfway along it and
// buries it under pipe, and a generator that eats its own
// wheel sites cannot build a dense board — which is what kept
// the late levels down to three wheels and the easy fallback.
function extend(grid, wheels, rand, cross) {
	const from = pick(rand, wheels)
	const dir = (rand() * 4) | 0
	const len = reach(rand)
	const c = from.c + DX[dir] * len
	const r = from.r + DY[dir] * len
	if (!siteFree(grid, c, r)) return false
	// From the source, not the target: measuring the clear
	// cells from the wrong end checks the cell beyond the new
	// wheel instead of the ones the pipe has to go through,
	// which both let runs collide and blocked moves that were
	// fine.
	if (!pathClear(grid, from.c, from.r, dir, len, cross)) {
		return false
	}
	claimPath(grid, from.c, from.r, dir, len)
	addWheel(grid, wheels, c, r)
	return true
}

// Grown outward from one seed cell, so the wheels are
// connected by the runs that placed them. Connectivity is a
// property of how the board was built, not something checked
// afterwards and hoped for.
function growWheels(grid, rand, tier) {
	const wheels = []
	const c0 = (rand() * COLS) | 0
	const r0 = (rand() * ROWS) | 0
	addWheel(grid, wheels, c0, r0)
	const cross = tier.crossings > 0
	let guard = GROW_GUARD
	while (wheels.length < tier.wheels && guard-- > 0) {
		extend(grid, wheels, rand, cross)
	}
	return wheels
}

// A vertical run from the gutter down to the topmost wheel in
// a column. Wheels in row 0 need none: the gutter lets onto
// them directly, dropping into whichever slot is facing up.
function topmost(wheels) {
	const best = new Map()
	for (const w of wheels) {
		const was = best.get(w.c)
		if (!was || w.r < was.r) best.set(w.c, w)
	}
	return [...best.values()]
}

function addFeeds(grid, wheels, rand, tier) {
	const cross = tier.crossings > 0
	for (const w of shuffled(rand, topmost(wheels))) {
		if (feedColumns(grid).length >= tier.feeds) break
		if (w.r === 0) continue
		if (!pathClear(grid, w.c, -1, 2, w.r + 1, cross)) {
			continue
		}
		claimPath(grid, w.c, -1, 2, w.r + 1)
	}
	return feedColumns(grid).length
}

function runBetween(grid, a, b, cross) {
	const line = lineBetween(a, b)
	if (!line) return false
	const { dir, len } = line
	if (!pathClear(grid, a.c, a.r, dir, len, cross)) return false
	claimPath(grid, a.c, a.r, dir, len)
	return true
}

// Cycles beyond the spanning tree. These ramp DOWN with the
// level: a bare tree is the tight board, because it leaves the
// fewest ways to shuffle marbles about and the least pipe to
// park them in.
function addExtras(grid, wheels, rand, tier) {
	const cross = tier.crossings > 0
	let left = tier.extraRuns
	for (let i = 0; i < 120 && left > 0; i++) {
		const a = pick(rand, wheels)
		const b = pick(rand, wheels)
		if (runBetween(grid, a, b, cross)) left--
	}
}

// How many perpendicular runs a would-be run would cut across.
// Crossings do not arise on their own often enough to be worth
// waiting for: growth only ever reaches the next site, so its
// one intermediate cell is almost never already in use. They
// have to be asked for.
function crossingsOf(grid, a, dir, len) {
	let n = 0
	for (let i = 1; i < len; i++) {
		const cell = at(
			grid, a.c + DX[dir] * i, a.r + DY[dir] * i)
		if (!cell || cell.kind !== 'pipe') continue
		if (isVertical(dir) ? cell.h : cell.v) n++
	}
	return n
}

function lineBetween(a, b) {
	if (a === b) return null
	if (a.c !== b.c && a.r !== b.r) return null
	const dir = a.c === b.c
		? (b.r > a.r ? 2 : 0)
		: (b.c > a.c ? 1 : 3)
	const len = Math.abs(a.c - b.c) + Math.abs(a.r - b.r)
	return { dir, len }
}

// A spur: pipe off a wheel that stops at nothing. A marble
// fired into one bounces off the far end and comes back, so it
// is a siding to park marbles in — and, routed across an
// existing run, it is where a crossing comes from on a board
// too dense for two wheels to see each other past a third.
function addSpur(grid, wheels, rand) {
	const w = pick(rand, wheels)
	const dir = (rand() * 4) | 0
	const len = 2 + ((rand() * 3) | 0)
	const n = crossingsOf(grid, w, dir, len + 1)
	if (n < 1) return 0
	if (!pathClear(grid, w.c, w.r, dir, len + 1, true)) {
		return 0
	}
	claimPath(grid, w.c, w.r, dir, len + 1)
	return n
}

function addCrossRuns(grid, wheels, rand, tier) {
	let left = tier.crossings
	for (let i = 0; i < 300 && left > 0; i++) {
		left -= addSpur(grid, wheels, rand)
	}
	for (let i = 0; i < 300 && left > 0; i++) {
		const a = pick(rand, wheels)
		const b = pick(rand, wheels)
		const line = lineBetween(a, b)
		if (!line) continue
		const { dir, len } = line
		const n = crossingsOf(grid, a, dir, len)
		if (n < 1) continue
		const ok = pathClear(grid, a.c, a.r, dir, len, true)
		if (!ok) continue
		claimPath(grid, a.c, a.r, dir, len)
		left -= n
	}
}

function pipeCells(grid, want) {
	const out = []
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const cell = at(grid, c, r)
			if (!cell || cell.kind !== 'pipe') continue
			if (want === 'cross' && !(cell.h && cell.v)) {
				continue
			}
			out.push([c, r, cell])
		}
	}
	return out
}

function addBooths(grid, rand, tier, palette) {
	const spots = shuffled(rand, pipeCells(grid, 'any'))
	for (let i = 0; i < tier.booths && i < spots.length; i++) {
		const [, , cell] = spots[i]
		cell.kind = 'booth'
		cell.colour = pick(rand, palette)
	}
}

// A block goes on any pipe cell, pointing anywhere that has
// something to receive a marble — along the pipe, which makes
// it a valve, or off it into a crossing run or a neighbouring
// wheel, which makes it a divert. Restricting it to crossings
// was tried first and produced almost none, because a crossing
// is itself scarce.
//
// The arrow must point somewhere that accepts, or a marble
// would be sent at a wall, bounce straight back in, and be
// sent again for ever. Any block that cuts the board in two or
// strands a marble in a loop with no wheel on it is put back:
// easier than predicting which ones will.
function blockDirs(grid, c, r) {
	const out = []
	for (let d = 0; d < 4; d++) {
		const res = accepts(grid, c, r, d)
		if (res.act !== 'bounce') out.push(d)
	}
	return out
}

function tryBlock(grid, wheels, rand, c, r, cell) {
	const dirs = blockDirs(grid, c, r)
	if (!dirs.length) return false
	const dir = pick(rand, dirs)
	put(grid, c, r, { kind: 'block', dir })
	if (allWheelsFed(grid, wheels) && noTraps(grid)) return true
	put(grid, c, r, cell)
	return false
}

function addBlocks(grid, wheels, rand, tier) {
	const spots = shuffled(rand, pipeCells(grid, 'any'))
	let left = tier.blocks
	for (const [c, r, cell] of spots) {
		if (left <= 0) break
		if (tryBlock(grid, wheels, rand, c, r, cell)) left--
	}
}

function tryBuild(seed, tier) {
	const rand = rng(seed)
	const grid = newGrid()
	const palette = shuffled(rand, COLOURS)
		.slice(0, tier.colours)
	const wheels = growWheels(grid, rand, tier)
	if (wheels.length < Math.max(3, tier.wheels - 1)) {
		return null
	}
	if (addFeeds(grid, wheels, rand, tier) < tier.feeds) {
		return null
	}
	addCrossRuns(grid, wheels, rand, tier)
	addExtras(grid, wheels, rand, tier)
	addBooths(grid, rand, tier, palette)
	addBlocks(grid, wheels, rand, tier)
	labelSegments(grid)
	if (!allWheelsFed(grid, wheels)) return null
	if (!noTraps(grid)) return null
	return { grid, wheels, palette, feeds: feedColumns(grid) }
}

// The seed walk. Dash does the same thing for the same reason:
// most seeds are fine, a few are not, and stepping to the next
// one is cheaper than a generator that can never fail.
function walkSeeds(base, stride, tier, out) {
	for (let k = 0; k < TRIES; k++) {
		const seed = (base + k * stride) >>> 0
		const built = tryBuild(seed, tier)
		if (!built) continue
		return { ...built, tier: out, level: out.level }
	}
	return null
}

export function buildLevel(level) {
	const tier = tierFor(level)
	const base = seedForLevel(tier.level)
	const found = walkSeeds(base, 7919, tier, tier)
	if (found) return found
	// Nothing has needed this yet, but a level that cannot be
	// built is a game that cannot start, so fall back to the
	// smallest board the tier will accept rather than throw.
	const easy = { ...tier, wheels: 3, extraRuns: 1, feeds: 2 }
	return walkSeeds(base, 104729, easy, tier)
}
