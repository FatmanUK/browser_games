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
	newWheel, isVertical, accepts, carries,
} from './board.js'
import {
	labelSegments, allWheelsFed, noTraps, noDeadEnds,
	feedColumns,
} from './topology.js'
import { tierFor } from './tiers.js'
import { seedForLevel } from './progress.js'

const TRIES = 240
const GROW_GUARD = 1200

// How many levels back a layout has to look unlike. Six is
// enough that no two boards in view of each other repeat
// without being so strict that the early levels, where there
// are genuinely few ways to arrange three wheels, run out of
// seeds.
const LOOKBACK = 6

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

function reach(rand, max) {
	if (max <= 2) return 2
	const k = rand()
	if (k < 0.62) return 2
	return k < 0.9 ? 3 : max
}

// Direction weights, by shape: balanced, wide, tall. Picked
// once per level. Without it the early levels, where the wheel
// count barely moves, came out as eight boards of three wheels
// in a row — the same board eight times with a different code
// on it. A bias in where growth reaches changes the shape of a
// board far more than one more wheel does.
const SHAPES = [
	[1, 1, 1, 1],
	[1, 3, 1, 3],
	[3, 1, 3, 1],
]

function pickDir(rand, shape) {
	const w = SHAPES[shape]
	let roll = rand() * (w[0] + w[1] + w[2] + w[3])
	for (let d = 0; d < 4; d++) {
		roll -= w[d]
		if (roll < 0) return d
	}
	return 3
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
function extend(grid, wheels, rand, cross, shape, max) {
	const from = pick(rand, wheels)
	const dir = pickDir(rand, shape)
	const len = reach(rand, max)
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
function growWheels(grid, rand, tier, shape) {
	const wheels = []
	const c0 = (rand() * COLS) | 0
	const r0 = (rand() * ROWS) | 0
	addWheel(grid, wheels, c0, r0)
	const cross = tier.crossings > 0
	let guard = GROW_GUARD
	while (wheels.length < tier.wheels && guard-- > 0) {
		extend(grid, wheels, rand, cross, shape, tier.reach)
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

// Crossings come only from runs between two wheels that
// happen to cut across an existing one. Spurs — pipe off a
// wheel stopping at nothing — were built here on purpose
// because they made crossings easily, and they are gone: a run
// that ends at nothing reads as an unfinished board, and
// topology.js now refuses any level that has one.
// Every pair of wheels in line, not a few hundred random
// ones. There are at most sixty-six pairs on a full board, so
// the exhaustive answer is cheaper than the sampled one and,
// unlike it, never misses the only crossing a layout had.
function crossCandidates(grid, wheels) {
	const out = []
	for (let i = 0; i < wheels.length; i++) {
		for (let j = i + 1; j < wheels.length; j++) {
			const a = wheels[i]
			const line = lineBetween(a, wheels[j])
			if (!line) continue
			const { dir, len } = line
			const n = crossingsOf(grid, a, dir, len)
			if (n > 0) out.push({ a, n, dir, len })
		}
	}
	return out
}

function addCrossRuns(grid, wheels, rand, tier) {
	let left = tier.crossings
	const found = crossCandidates(grid, wheels)
	for (const r of shuffled(rand, found)) {
		if (left <= 0) break
		const { dir, len } = r
		if (!pathClear(grid, r.a.c, r.a.r, dir, len, true)) {
			continue
		}
		claimPath(grid, r.a.c, r.a.r, dir, len)
		left -= r.n
	}
}

function pipeCells(grid) {
	const out = []
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const cell = at(grid, c, r)
			if (!cell || cell.kind !== 'pipe') continue
			out.push([c, r, cell])
		}
	}
	return out
}

function addBooths(grid, rand, tier, palette) {
	const spots = shuffled(rand, pipeCells(grid))
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
// Only along an axis the cell already carries. A block that
// could point anywhere was a run that was not there: a wheel
// beside it could fire into it with no pipe between the two,
// and a marble sent at a wall would bounce straight back in
// and be sent again for ever.
//
// On a crossing that leaves all four directions open and the
// block is a diverter. On a straight run it leaves two, and
// the block is a one-way valve — which is the other half of
// what the name means.
function blockDirs(grid, c, r, cell) {
	const out = []
	for (let d = 0; d < 4; d++) {
		if (!carries(cell, d)) continue
		const res = accepts(grid, c, r, d)
		if (res.act !== 'bounce') out.push(d)
	}
	return out
}

function tryBlock(grid, wheels, rand, c, r, cell) {
	const dirs = blockDirs(grid, c, r, cell)
	if (!dirs.length) return false
	const dir = pick(rand, dirs)
	put(grid, c, r, {
		kind: 'block', dir, h: cell.h, v: cell.v,
	})
	if (allWheelsFed(grid, wheels) && noTraps(grid)) return true
	put(grid, c, r, cell)
	return false
}

function addBlocks(grid, wheels, rand, tier) {
	const spots = shuffled(rand, pipeCells(grid))
	let left = tier.blocks
	for (const [c, r, cell] of spots) {
		if (left <= 0) break
		if (tryBlock(grid, wheels, rand, c, r, cell)) left--
	}
}

// A board has to be two-dimensional. Wheels in a line across
// the top is a legal layout, a dull one, and the one the seed
// walk reaches first, because it satisfies the feed count
// without trying. Insisting on two rows and two columns costs
// a few more seeds and buys every early level a shape.
function spread(wheels) {
	if (wheels.length < 3) return true
	const rows = new Set(wheels.map((w) => w.r))
	const cols = new Set(wheels.map((w) => w.c))
	return rows.size >= 2 && cols.size >= 2
}

// What a board looks like, with where it sits taken out of
// it: every occupied cell, shifted so the bounding box starts
// at the origin, sorted. Level four turned out to be level one
// moved four columns right — same wheels, same runs, same
// feeds — and nothing in the generator noticed, because the
// checks it had were on how many wheels there were and which
// way growth leaned, and a translation changes neither.
//
// Mirror images are deliberately not folded together. The
// gutter feeds from the right-hand end and rolls left, so a
// board and its reflection do not play the same way.
function mark(cell) {
	if (cell.kind === 'wheel') return 'W'
	if (cell.kind === 'block') return 'B' + cell.dir
	const axes = cell.h && cell.v ? '+' : (cell.h ? '-' : '|')
	return cell.kind === 'booth' ? 'P' + axes : axes
}

export function signature(grid) {
	const cells = []
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const cell = at(grid, c, r)
			if (cell) cells.push([c, r, mark(cell)])
		}
	}
	if (!cells.length) return ''
	const c0 = Math.min(...cells.map((x) => x[0]))
	const r0 = Math.min(...cells.map((x) => x[1]))
	return cells
		.map(([c, r, m]) => `${c - c0},${r - r0}${m}`)
		.sort()
		.join(' ')
}

function tryBuild(seed, tier, avoid) {
	const rand = rng(seed)
	const grid = newGrid()
	const palette = shuffled(rand, COLOURS)
		.slice(0, tier.colours)
	// Off the level number, not the seed. Picked at random it
	// came out the same two levels running often enough to
	// matter; stepped, every three consecutive levels cover
	// all three biases between them.
	const shape = (tier.level - 1) % SHAPES.length
	const wheels = growWheels(grid, rand, tier, shape)
	if (wheels.length < Math.max(3, tier.wheels - 1)) {
		return null
	}
	if (!spread(wheels)) return null
	if (addFeeds(grid, wheels, rand, tier) < tier.feeds) {
		return null
	}
	addCrossRuns(grid, wheels, rand, tier)
	addExtras(grid, wheels, rand, tier)
	addBooths(grid, rand, tier, palette)
	addBlocks(grid, wheels, rand, tier)
	labelSegments(grid)
	if (avoid.has(signature(grid))) return null
	if (!noDeadEnds(grid)) return null
	if (!allWheelsFed(grid, wheels)) return null
	if (!noTraps(grid)) return null
	return { grid, wheels, palette, feeds: feedColumns(grid) }
}

// The seed walk. Dash does the same thing for the same reason:
// most seeds are fine, a few are not, and stepping to the next
// one is cheaper than a generator that can never fail.
function walkSeeds(base, stride, tier, out, avoid) {
	for (let k = 0; k < TRIES; k++) {
		const seed = (base + k * stride) >>> 0
		const built = tryBuild(seed, tier, avoid)
		if (!built) continue
		return { ...built, tier: out, level: out.level }
	}
	return null
}

// Memoised, and the memo is what makes the lookback cheap:
// asking for level fifty builds the forty-nine below it once
// and then answers from the map. Building the chain is a few
// tens of milliseconds the first time a far level is reached
// by code, and nothing afterwards.
const shapes = new Map()

function shapeOf(level) {
	if (!shapes.has(level)) buildLevel(level)
	return shapes.get(level) || ''
}

function recentShapes(level) {
	const out = new Set()
	for (let k = 1; k <= LOOKBACK; k++) {
		if (level - k < 1) break
		out.add(shapeOf(level - k))
	}
	return out
}

export function buildLevel(level) {
	const tier = tierFor(level)
	const base = seedForLevel(tier.level)
	const avoid = recentShapes(tier.level)
	const tried = [
		[7919, tier, avoid],
		// Rather a repeated shape than no level: three
		// wheels on a short-reach lattice is a small enough
		// space that a run of seeds can genuinely fail to
		// find an unused arrangement.
		[7919, tier, new Set()],
		[104729, { ...tier, wheels: 3, feeds: 2 }, new Set()],
	]
	for (const [stride, t, skip] of tried) {
		const got = walkSeeds(base, stride, t, tier, skip)
		if (!got) continue
		shapes.set(tier.level, signature(got.grid))
		return got
	}
	return null
}
