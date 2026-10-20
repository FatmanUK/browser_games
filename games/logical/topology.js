// What a built level says about itself: which straight
// segments its pipe falls into, and whether it can actually be
// played.
//
// Both answers come from walking accepts() in board.js, which
// is the same rule travel.js moves marbles with. That is the
// point of this file — a generator that blesses levels using
// its own idea of how marbles move will eventually bless one
// the runtime cannot play.

import {
	COLS, ROWS, at, back, accepts, carries, inside,
} from './board.js'

function isPipe(cell) {
	return cell
		&& (cell.kind === 'pipe' || cell.kind === 'booth')
}

function isBlock(cell) {
	return !!cell && cell.kind === 'block'
}

// A segment is a maximal straight stretch of pipe, delimited
// by wheels, blocks, the gutter and the board edge. It is what
// carries the four-marble limit.
export function labelSegments(grid) {
	let n = 0
	for (let r = 0; r < ROWS; r++) {
		let run = -1
		for (let c = 0; c < COLS; c++) {
			const cell = at(grid, c, r)
			if (!isPipe(cell) || !cell.h) {
				run = -1
				continue
			}
			if (run < 0) run = n++
			cell.segH = run
		}
	}
	for (let c = 0; c < COLS; c++) {
		let run = -1
		for (let r = 0; r < ROWS; r++) {
			const cell = at(grid, c, r)
			if (!isPipe(cell) || !cell.v) {
				run = -1
				continue
			}
			if (run < 0) run = n++
			cell.segV = run
		}
	}
	return n
}

// Columns the gutter can let a marble down into: one holding a
// wheel in row 0, or one whose row-0 cell carries vertical
// pipe. Derived rather than recorded, so it cannot disagree
// with the grid.
export function feedColumns(grid) {
	const out = []
	for (let c = 0; c < COLS; c++) {
		if (accepts(grid, c, -1, 2).act !== 'bounce') {
			out.push(c)
		}
	}
	return out
}

const KEY_SPAN = (ROWS + 1) * COLS * 4

function key(c, r, dir) {
	return ((r + 1) * COLS + c) * 4 + dir
}

function fireable(grid, c, r) {
	const out = []
	for (let d = 0; d < 4; d++) {
		if (accepts(grid, c, r, d).act !== 'bounce') {
			out.push(d)
		}
	}
	return out
}

function pushSuccessors(grid, c, r, dir, res, add) {
	if (res.act === 'go') {
		add(res.c, res.r, res.dir)
		return
	}
	if (res.act === 'bounce') {
		add(c, r, back(dir))
		return
	}
	if (res.act === 'wheel') {
		// A marble that cannot get in bounces straight back,
		// and one that gets in can be fired out any way the
		// wheel is connected.
		add(c, r, back(dir))
		for (const d of fireable(grid, res.c, res.r)) {
			add(res.c, res.r, d)
		}
	}
}

// Walks every state a marble can be in, starting from the
// gutter. Returns the reachable states, the edges between them
// and which states land on a wheel.
//
// Nothing climbs back into the lane: the gutter is an inlet,
// so a marble that reaches the top of a feed pipe bounces and
// comes back down to the wheel it came from. That is why a
// wheel is the only good end a state can have here.
export function walk(grid) {
	const seen = new Uint8Array(KEY_SPAN)
	const edges = new Map()
	const hits = new Map()
	const queue = []
	const add = (c, r, dir) => {
		if (r >= 0 && !inside(c, r)) return
		const k = key(c, r, dir)
		if (seen[k]) return
		seen[k] = 1
		queue.push([c, r, dir])
	}
	for (const c of feedColumns(grid)) add(c, -1, 2)
	for (let i = 0; i < queue.length; i++) {
		const [c, r, dir] = queue[i]
		const k = key(c, r, dir)
		const res = accepts(grid, c, r, dir)
		const out = []
		if (res.act === 'wheel') hits.set(k, res.id)
		pushSuccessors(grid, c, r, dir, res, (nc, nr, nd) => {
			out.push(key(nc, nr, nd))
			add(nc, nr, nd)
		})
		edges.set(k, out)
	}
	return { seen, edges, hits }
}

// Every wheel must be reachable from the gutter, or the level
// cannot be finished: the gutter is the only marble source.
export function allWheelsFed(grid, wheels) {
	const { hits } = walk(grid)
	const fed = new Set(hits.values())
	return wheels.every((w) => fed.has(w.id))
}

// And from wherever a marble can get to, it must be able to
// reach a wheel again. A directed cycle of pipe with no wheel
// on it is a marble swallowed for the rest of the level —
// capacity gone, and nothing on screen to explain why.
export function noTraps(grid) {
	const { seen, edges, hits } = walk(grid)
	const good = new Uint8Array(KEY_SPAN)
	for (const k of hits.keys()) good[k] = 1
	for (let pass = 0; pass < KEY_SPAN; pass++) {
		let grew = false
		for (const [k, outs] of edges) {
			if (good[k]) continue
			if (outs.some((o) => good[o])) {
				good[k] = 1
				grew = true
			}
		}
		if (!grew) break
	}
	for (let k = 0; k < KEY_SPAN; k++) {
		if (seen[k] && !good[k]) return false
	}
	return true
}

// No run may stop at nothing. A dead end is a pipe cell with a
// carried direction that bounces — a siding a marble can be
// fired into and must then be fired back out of, which reads
// as an unfinished board rather than as a feature. Spurs used
// to be built on purpose, to make crossings; they are not any
// more, and this is what keeps them from creeping back.
export function noDeadEnds(grid) {
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			const cell = at(grid, c, r)
			if (!isPipe(cell) && !isBlock(cell)) continue
			for (let d = 0; d < 4; d++) {
				if (!carries(cell, d)) continue
				const res = accepts(grid, c, r, d)
				if (res.act === 'bounce') return false
			}
		}
	}
	return true
}
