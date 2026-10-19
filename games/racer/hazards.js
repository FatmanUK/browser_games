// Where the scenery goes: obstacles, water, sand and the
// treeline, all placed as (arc length, lateral offset).
//
// This used to work in polar terms — an angle about the centre
// and a fraction of the way in toward it — which meant the
// "infield" was whatever lay inside the inner kerb. A track
// that crosses over itself has no infield: the inside of the
// loop at one point is the outside at another, and the ray
// from the centre meets the road more than once. Off the road
// to the left and off the road to the right is the same idea
// without the assumption.
//
// Everything is scattered one per stretch of the lap rather
// than at random, so a straight-line cut risks hitting
// something whichever way it is taken.

import { offsetPoint, deltaS } from './path.js'

export const SAND_COUNT = 3
export const SAND_SPREAD = 90

// How far from a grid slot nothing may be placed, in world
// units along the lap. The grid is 172 units of road, and a
// car needs room to get away from it.
const GRID_CLEAR = 260

// Tyres bounce; everything else stops the car dead. The small
// ones sit just off the kerb where running wide finds them;
// the big ones stand well back, filling out the space the
// track loops around.
const SMALL = [
	['tyre', 3, 'bounce'], ['tyre', 3.5, 'bounce'],
	['tyre', 3, 'bounce'], ['tyre', 3.5, 'bounce'],
	['tyre', 3, 'bounce'], ['tyre', 3.2, 'bounce'],
	['barrel', 3.5, 'stop'], ['barrel', 4, 'stop'],
	['barrel', 3.5, 'stop'], ['barrel', 3.8, 'stop'],
	['barrel', 4, 'stop'], ['barrel', 3.5, 'stop'],
]

const BIG = [
	['tree', 14, 'stop'], ['tree', 15, 'stop'],
	['building', 18, 'stop'], ['building', 22, 'stop'],
	['building', 20, 'stop'], ['building', 16, 'stop'],
]

const WATER_RADII = [18, 16]

// Lateral bands, as multiples of the half-width. Small things
// near the road, big things well back.
const SMALL_BAND = [1.15, 1.9]
const BIG_BAND = [2.4, 4.2]
const WATER_BAND = [2.2, 3.6]

const TREE_LAYERS = [
	{ step: 44, out: 10, r: 9 },
	{ step: 36, out: 28, r: 11 },
	{ step: 42, out: 46, r: 10 },
	{ step: 52, out: 66, r: 12 },
	{ step: 60, out: 88, r: 13 },
]

function nearGrid(track, s) {
	return track.GRID_SLOTS.some(
		(g) => Math.abs(deltaS(track, g.s, s)) < GRID_CLEAR)
}

// Symmetric, unlike the gap the old generator used: that took
// the gap from the new item's radius alone, so a small tyre
// could be dropped almost touching a building while the
// reverse was rejected, and placement order decided which.
function clearOf(x, y, r, placed, margin) {
	return placed.every((p) =>
		Math.hypot(x - p.x, y - p.y) >= r + p.r + margin)
}

function spotIn(track, rand, s0, span, band) {
	for (let k = 0; k < 40; k++) {
		const s = s0 + rand() * span
		if (nearGrid(track, s)) continue
		const side = rand() < 0.5 ? -1 : 1
		const f = band[0] + rand() * (band[1] - band[0])
		return { s, off: side * track.halfWidth * f }
	}
	return null
}

function place(track, rand, s0, span, band, r, placed) {
	for (let k = 0; k < 30; k++) {
		const at = spotIn(track, rand, s0, span, band)
		if (!at) return null
		const p = offsetPoint(track, at.s, at.off)
		if (!clearOf(p.x, p.y, r, placed, 8)) continue
		return { x: p.x, y: p.y }
	}
	return null
}

function scatter(track, rand, specs, band, placed) {
	const out = []
	const span = track.L / specs.length
	specs.forEach(([type, r, behavior], i) => {
		const p = place(
			track, rand, i * span, span, band, r, placed)
		if (!p) return
		placed.push({ x: p.x, y: p.y, r })
		out.push({ x: p.x, y: p.y, r, type, behavior })
	})
	return out
}

// A band of tyres just off the kerb through every corner, on
// the inside. Cutting a corner is the cheapest way to go
// faster on a track whose only hard boundary is a long way
// out, and this is what makes it cost something.
function lineCorners(track, corners, placed) {
	const out = []
	for (const c of corners) {
		const n = Math.max(2, Math.round(c.len / 14))
		for (let i = 0; i <= n; i++) {
			const s = c.s - c.len / 2 + (c.len * i) / n
			if (nearGrid(track, s)) continue
			// `dir` is the way the corner bends, so the
			// inside of it is that side of the road.
			const off = c.dir * (track.halfWidth + 9)
			const p = offsetPoint(track, s, off)
			if (!clearOf(p.x, p.y, 3, placed, 3)) continue
			placed.push({ x: p.x, y: p.y, r: 3 })
			out.push({
				x: p.x, y: p.y, r: 3,
				type: 'tyre', behavior: 'bounce',
			})
		}
	}
	return out
}

export function buildHazards(track, rand, corners) {
	const placed = []
	const small = scatter(
		track, rand, SMALL, SMALL_BAND, placed)
	const big = scatter(track, rand, BIG, BIG_BAND, placed)
	const wet = scatter(
		track, rand,
		WATER_RADII.map((r) => ['water', r, 'drag']),
		WATER_BAND, placed)
	return {
		obstacles: small
			.concat(big)
			.concat(lineCorners(track, corners, placed)),
		water: wet.map((w) => ({ x: w.x, y: w.y, r: w.r })),
	}
}

export function buildSand(track, rand) {
	const out = []
	for (let k = 0; k < 200 && out.length < SAND_COUNT; k++) {
		const s = rand() * track.L
		if (nearGrid(track, s)) continue
		const clash = out.some(
			(w) => Math.abs(deltaS(track, w.s, s)) <
				SAND_SPREAD * 3)
		if (clash) continue
		out.push({
			s,
			half: SAND_SPREAD,
			side: rand() < 0.5 ? -1 : 1,
		})
	}
	return out
}

// Down both sides of the ribbon rather than round a ring. A
// ring only made sense while the track was a loop about a
// centre with an inside and an outside; a treeline is what
// lies beyond the verge, and the verge has two edges.
export function buildTreeLine(track) {
	const trees = []
	for (const layer of TREE_LAYERS) {
		treeLayer(track, layer, trees)
	}
	return trees
}

function treeLayer(track, layer, out) {
	const count = Math.max(
		12, Math.round(track.L / layer.step))
	const off = track.boundOff + layer.out
	for (let i = 0; i < count; i++) {
		const s = (i / count) * track.L
		const r = layer.r + ((i % 3) - 1) * 1.5
		for (const side of [-1, 1]) {
			const p = offsetPoint(track, s, side * off)
			out.push({ x: p.x, y: p.y, r })
		}
	}
}
