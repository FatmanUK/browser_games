// Dash's track geometry, shared by the player's car (game.js)
// and the rival AI (rivals.js).
//
// The generated track is star-shaped around CENTER: every angle
// maps to exactly one point on each boundary, so the boundaries
// are angle-indexed radius lookup tables rather than curves.
// That is what makes a racing line cheap — a point on the road
// is just (angle, how far across the band), and "a bit further
// round" is an angle plus a delta.

import * as TRACK from './track-data.js'

export const CENTER = { x: 0, y: 0 }

// Radius of a lookup table at an arbitrary (geometric) angle,
// linearly interpolated between the two nearest sampled
// entries. The generalization of the old fixed oval's
// closed-form ellipse radius to a shape with no closed form.
export function lerpArray(table, angle) {
	const n = table.length
	const twoPi = Math.PI * 2
	const norm = ((angle % twoPi) + twoPi) % twoPi
	const t = (norm / twoPi) * n
	const i0 = Math.floor(t) % n
	const i1 = (i0 + 1) % n
	const frac = t - Math.floor(t)
	return table[i0] * (1 - frac) + table[i1] * frac
}

export function angleOf(x, y) {
	return Math.atan2(y - CENTER.y, x - CENTER.x)
}

// How far (x, y) sits past a boundary, as a ratio: <=1 inside
// it, >1 outside.
export function normFor(x, y, table) {
	const dist = Math.hypot(x - CENTER.x, y - CENTER.y)
	return dist / lerpArray(table, angleOf(x, y))
}

export function onTrack(x, y) {
	return normFor(x, y, TRACK.OUTER_RADIUS) <= 1 &&
		normFor(x, y, TRACK.INNER_RADIUS) >= 1
}

export function angleDelta(a, b) {
	let d = b - a
	while (d > Math.PI) d -= Math.PI * 2
	while (d < -Math.PI) d += Math.PI * 2
	return d
}

export function inWedge(angle, wedges) {
	return wedges.some(
		(w) => Math.abs(angleDelta(w.angle, angle)) <=
			w.spread)
}

// A point on the road surface: `frac` is 0 at the inner edge, 1
// at the outer. Gives each rival its own line round the lap.
export function trackBandPoint(angle, frac) {
	const innerR = lerpArray(TRACK.INNER_RADIUS, angle)
	const outerR = lerpArray(TRACK.OUTER_RADIUS, angle)
	const r = innerR + (outerR - innerR) * frac
	return {
		x: CENTER.x + Math.cos(angle) * r,
		y: CENTER.y + Math.sin(angle) * r,
	}
}

// The inverse: where across the band (x, y) is.
export function bandFrac(x, y) {
	const angle = angleOf(x, y)
	const innerR = lerpArray(TRACK.INNER_RADIUS, angle)
	const outerR = lerpArray(TRACK.OUTER_RADIUS, angle)
	const dist = Math.hypot(x - CENTER.x, y - CENTER.y)
	return (dist - innerR) / (outerR - innerR)
}

// Which way round the track the grid faces: +1 if driving off
// the grid increases the polar angle about CENTER, -1 if it
// decreases it. Derived rather than written down, because the
// track is regenerated (tools/generate_track.py) and nothing
// guarantees the next layout winds the same way as this one.
function travelDir() {
	const a = angleOf(TRACK.START.x, TRACK.START.y)
	const along =
		-Math.sin(a) * Math.cos(TRACK.START.angle) +
		Math.cos(a) * Math.sin(TRACK.START.angle)
	return along >= 0 ? 1 : -1
}

export const TRAVEL_DIR = travelDir()

// Laps run off swept angle, not line crossings, so they can't
// be cheated by reversing over the line — and `progress` below
// is the same number before it is rounded down, which is what
// makes sorting the field trivial.
export function progressOf(totalAngle) {
	return (totalAngle * TRAVEL_DIR) / (Math.PI * 2)
}
