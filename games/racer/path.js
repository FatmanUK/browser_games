// Where a car is on the track, in arc length along the
// centreline rather than in angle about a centre.
//
// The polar model this replaces stored one radius per angle,
// which is cheap and simple and cannot describe a track that
// crosses over itself: at a crossing the ray from the centre
// meets the road twice, and r = f(angle) has no room for the
// second answer. Everything here exists so that it can.
//
// Samples are evenly spaced in arc length (spline.js), so
// s -> index is s/ds plus a lerp. No search, same cost as the
// radius-table lookup it replaces.

export function wrapS(track, s) {
	const L = track.L
	return ((s % L) + L) % L
}

// Signed difference, shortest way round. Positive means b is
// ahead of a in the direction of travel.
export function deltaS(track, a, b) {
	const L = track.L
	let d = wrapS(track, b) - wrapS(track, a)
	if (d > L / 2) d -= L
	if (d < -L / 2) d += L
	return d
}

export function sampleAt(track, s) {
	const n = track.n
	const t = wrapS(track, s) / track.ds
	const i0 = Math.floor(t) % n
	const i1 = (i0 + 1) % n
	const f = t - Math.floor(t)
	const g = 1 - f
	const ux = track.ux[i0] * g + track.ux[i1] * f
	const uy = track.uy[i0] * g + track.uy[i1] * f
	const m = Math.hypot(ux, uy) || 1
	return {
		x: track.px[i0] * g + track.px[i1] * f,
		y: track.py[i0] * g + track.py[i1] * f,
		ux: ux / m,
		uy: uy / m,
		k: track.k[i0] * g + track.k[i1] * f,
	}
}

export function headingAt(track, s) {
	const p = sampleAt(track, s)
	return Math.atan2(p.uy, p.ux)
}

// `off` is signed lateral distance: positive to the left of
// the direction of travel, so the road is -halfWidth..+half.
export function offsetPoint(track, s, off) {
	const p = sampleAt(track, s)
	return {
		x: p.x - p.uy * off,
		y: p.y + p.ux * off,
	}
}

export function onRoad(track, off) {
	return Math.abs(off) <= track.halfWidth
}

export function inVerge(track, off) {
	const a = Math.abs(off)
	return a > track.halfWidth && a <= track.boundOff
}

function nearestOnSeg(ax, ay, bx, by, px, py) {
	const dx = bx - ax, dy = by - ay
	const len2 = dx * dx + dy * dy
	const t = len2 > 0
		? Math.max(0, Math.min(1,
			((px - ax) * dx + (py - ay) * dy) / len2))
		: 0
	const x = ax + dx * t, y = ay + dy * t
	return { t, d2: (px - x) ** 2 + (py - y) ** 2 }
}

// How far one frame can carry a car, in samples, plus slack
// for a collision shove. At the top speed of 225 and the 0.05
// dt cap that is about 11 world units, so eight samples either
// side of the hint is generous.
export const WINDOW = 8

// A nearest-point search over the whole centreline is
// ambiguous the moment the track crosses itself: the two
// branches pass within a road width of each other and the
// global nearest point can be on the wrong one. So the search
// is local to where the car already was, and continuity picks
// the branch. Every car has to carry its own `s` for this to
// work, and it has to be reseeded wherever the car teleports.
export function locate(track, x, y, sHint) {
	const n = track.n
	const i0 = Math.floor(wrapS(track, sHint) / track.ds)
	let best = null
	for (let d = -WINDOW; d <= WINDOW; d++) {
		const i = ((i0 + d) % n + n) % n
		const j = (i + 1) % n
		const hit = nearestOnSeg(
			track.px[i], track.py[i],
			track.px[j], track.py[j], x, y)
		if (best && hit.d2 >= best.d2) continue
		best = { d2: hit.d2, i, t: hit.t }
	}
	const s = wrapS(track, (best.i + best.t) * track.ds)
	const p = sampleAt(track, s)
	// Signed by which side of the tangent the point falls.
	const off = -(x - p.x) * p.uy + (y - p.y) * p.ux
	return { s, off }
}

// The sharpest curvature within `dist` ahead, which is what a
// driver needs to know to brake for a corner it cannot see the
// end of yet.
export function curvAhead(track, s, dist) {
	const step = track.ds * 2
	let kMax = 0
	let dir = 1
	for (let d = 0; d <= dist; d += step) {
		const k = sampleAt(track, s + d).k
		if (Math.abs(k) <= Math.abs(kMax)) continue
		kMax = k
	}
	dir = Math.sign(kMax) || 1
	return { kMax: Math.abs(kMax), dir }
}
