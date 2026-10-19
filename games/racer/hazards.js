// Where the scenery goes: obstacles, water, sand and the
// treeline.
//
// Everything off the track surface is scattered one per
// angular sector rather than at random, so a straight-line cut
// across the infield risks hitting something whichever way it
// is taken. That is the whole reason the infield is not empty.

import { lerpArray } from './geom.js'
import { wrapDelta } from './spline.js'

const TWO_PI = Math.PI * 2
const DEG = Math.PI / 180

// 26 rather than the script's 20: the zone has to cover the
// whole six-row grid plus room to get off the line, and the
// grid alone is about 18 degrees of arc at this radius.
const CLEAR_ANGLE = 26 * DEG
const MIN_FRAC = 0.22
const MAX_FRAC = 0.78

export const SAND_COUNT = 3
export const SAND_SPREAD = 14 * DEG

// Tyres bounce; everything else stops the car dead. Tyres and
// barrels are car-sized or smaller and can land in the infield
// or out in the verge; trees and buildings are big and stay
// infield, filling out the middle of a track large enough to
// feel empty without them.
//
// Far more of the small ones than the generator used to place,
// and `edge` marks the ones that line the inside of a corner —
// that band is what makes cutting cost something.
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

const TREE_LAYERS = [
	{ spacing: 40, offset: 0, r: 9 },
	{ spacing: 32, offset: 15, r: 11 },
	{ spacing: 38, offset: 30, r: 10 },
	{ spacing: 48, offset: 45, r: 12 },
	{ spacing: 55, offset: 62, r: 13 },
]

function infieldPoint(t, angle, frac) {
	const r = lerpArray(t.inner, angle) * frac
	return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
}

function vergePoint(t, angle, frac) {
	const o = lerpArray(t.outer, angle)
	const b = lerpArray(t.bound, angle)
	const r = o + (b - o) * frac
	return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
}

function nearGrid(angle, gridAngle) {
	return Math.abs(wrapDelta(gridAngle, angle)) < CLEAR_ANGLE
}

// Both of the generator's spacing weaknesses are fixed here.
// It compared centre to centre against a gap derived from the
// NEW item's radius only, so a small tyre could be dropped
// almost touching a building while the reverse was rejected —
// placement order decided the result, and the spec table
// happened to list the unfavourable order. Radii of both, plus
// a fixed margin, is symmetric and means what it says.
function clearOf(x, y, r, placed, margin) {
	return placed.every((p) =>
		Math.hypot(x - p.x, y - p.y) >= r + p.r + margin)
}

function sectorAngle(rand, i, count, gridAngle) {
	const width = TWO_PI / count
	for (let k = 0; k < 50; k++) {
		const a = i * width + rand() * width
		if (!nearGrid(a, gridAngle)) return a
	}
	for (let k = 0; k < 200; k++) {
		const a = rand() * TWO_PI
		if (!nearGrid(a, gridAngle)) return a
	}
	return null
}

function place(t, zone, rand, i, count, gridAngle, placed, r) {
	for (let k = 0; k < 100; k++) {
		const a = sectorAngle(rand, i, count, gridAngle)
		if (a === null) return null
		// The old test used the centre and ignored the item's
		// own radius, so a verge obstacle at the near edge
		// could poke back onto the rumble strips. Insetting
		// the band by the radius keeps the whole thing clear.
		const span = MAX_FRAC - MIN_FRAC
		const frac = MIN_FRAC + rand() * span
		const p = zone === 'infield'
			? infieldPoint(t, a, frac)
			: vergePoint(t, a, frac)
		if (clearOf(p.x, p.y, r, placed, 6)) return p
	}
	return null
}

function shuffled(rand, n) {
	const a = [...Array(n).keys()]
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1))
		const t = a[i]; a[i] = a[j]; a[j] = t
	}
	return a
}

function scatter(t, rand, gridAngle, placed) {
	const specs = [...SMALL, ...BIG]
	const slots = specs.length + WATER_RADII.length
	const order = shuffled(rand, slots)
	const out = []
	specs.forEach(([type, r, behavior], i) => {
		const zone = BIG.includes(specs[i]) ? 'infield'
			: (rand() < 0.5 ? 'infield' : 'verge')
		const p = place(
			t, zone, rand, order[i], slots, gridAngle,
			placed, r)
		if (!p) return
		placed.push({ x: p.x, y: p.y, r })
		out.push({ x: p.x, y: p.y, r, type, behavior })
	})
	return { obstacles: out, order, slots, specs }
}

// A dense band of tyres just off the kerb on the inside of
// every corner. Cutting a corner is the cheapest way to go
// faster on a track whose only boundary is a treeline a long
// way out, and this is what makes it cost something.
function lineCorners(t, corners, placed, gridAngle) {
	const out = []
	for (const c of corners) {
		const steps = Math.max(3, Math.round(c.spread * 26))
		for (let i = 0; i <= steps; i++) {
			const a = c.angle - c.spread +
				(2 * c.spread * i) / steps
			// The band obeys the grid clearance too. A
			// corner can fall inside the cleared
			// angle even though the grid sits on a
			// straight, and a wall of tyres across
			// the first corner is not the idea.
			if (nearGrid(a, gridAngle)) continue
			const r = lerpArray(t.inner, a) - 7
			const p = {
				x: Math.cos(a) * r,
				y: Math.sin(a) * r,
			}
			if (!clearOf(p.x, p.y, 3, placed, 2)) continue
			placed.push({ x: p.x, y: p.y, r: 3 })
			out.push({
				x: p.x, y: p.y, r: 3,
				type: 'tyre', behavior: 'bounce',
			})
		}
	}
	return out
}

function water(t, rand, gridAngle, placed, order, slots, n) {
	const out = []
	WATER_RADII.forEach((r, i) => {
		const p = place(
			t, 'infield', rand, order[n + i], slots,
			gridAngle, placed, r)
		if (!p) return
		placed.push({ x: p.x, y: p.y, r })
		out.push({ x: p.x, y: p.y, r })
	})
	return out
}

export function buildHazards(t, rand, gridAngle, corners) {
	const placed = []
	const s = scatter(t, rand, gridAngle, placed)
	return {
		obstacles: s.obstacles.concat(
			lineCorners(t, corners, placed, gridAngle)),
		water: water(
			t, rand, gridAngle, placed, s.order, s.slots,
			s.specs.length),
	}
}

export function buildSand(rand, gridAngle) {
	const out = []
	for (let k = 0; k < 200 && out.length < SAND_COUNT; k++) {
		const angle = rand() * TWO_PI
		if (nearGrid(angle, gridAngle)) continue
		const clash = out.some((w) =>
			Math.abs(wrapDelta(w.angle, angle)) <
				SAND_SPREAD * 2.2)
		if (clash) continue
		out.push({ angle, spread: SAND_SPREAD })
	}
	return out
}

// Count per layer comes from the track's own perimeter rather
// than a fixed number: a fixed count went visibly thin once
// tracks got large.
export function buildTreeLine(bound) {
	const avg = bound.reduce((a, b) => a + b, 0) / bound.length
	const trees = []
	for (const layer of TREE_LAYERS) {
		const perim = TWO_PI * (avg + layer.offset)
		const count = Math.max(
			12, Math.round(perim / layer.spacing))
		for (let i = 0; i < count; i++) {
			const a = (i / count) * TWO_PI
			const r = lerpArray(bound, a) + layer.offset
			trees.push({
				x: Math.cos(a) * r,
				y: Math.sin(a) * r,
				r: layer.r + ((i % 3) - 1) * 1.5,
			})
		}
	}
	return trees
}
