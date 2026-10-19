// Closed-curve maths for the track generator.
//
// This was a Python script run by hand, writing a track into
// the repo. A level is a seed now, so it runs at load.
//
// Nothing here knows what a track is — it takes control points
// and gives back a dense closed curve and some facts about it.

const TWO_PI = Math.PI * 2

export function wrapDelta(a, b) {
	let d = b - a
	while (d > Math.PI) d -= TWO_PI
	while (d < -Math.PI) d += TWO_PI
	return d
}

function catmullPoint(p0, p1, p2, p3, t) {
	const t2 = t * t
	const t3 = t2 * t
	const axis = (a0, a1, a2, a3) => 0.5 * (
		2 * a1 + (-a0 + a2) * t +
		(2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 +
		(-a0 + 3 * a1 - 3 * a2 + a3) * t3)
	return {
		x: axis(p0.x, p1.x, p2.x, p3.x),
		y: axis(p0.y, p1.y, p2.y, p3.y),
	}
}

export function catmullClosed(pts, perSegment) {
	const n = pts.length
	const out = []
	for (let i = 0; i < n; i++) {
		const p0 = pts[(i - 1 + n) % n]
		const p1 = pts[i]
		const p2 = pts[(i + 1) % n]
		const p3 = pts[(i + 2) % n]
		for (let s = 0; s < perSegment; s++) {
			const t = s / perSegment
			out.push(catmullPoint(p0, p1, p2, p3, t))
		}
	}
	return out
}

// The ray from the origin at any angle must cross the curve
// exactly once. That is what lets the track be stored as a
// radius per angle, and the generator rejects anything else.
export function isStarShaped(dense) {
	let prev = Math.atan2(dense[0].y, dense[0].x)
	for (let i = 1; i < dense.length; i++) {
		const a = Math.atan2(dense[i].y, dense[i].x)
		if (wrapDelta(prev, a) < -1e-3) return false
		prev = a
	}
	return true
}

export function headings(dense) {
	const n = dense.length
	const out = []
	for (let i = 0; i < n; i++) {
		const a = dense[i]
		const b = dense[(i + 1) % n]
		out.push(Math.atan2(b.y - a.y, b.x - a.x))
	}
	return out
}

// Per-step absolute heading change. Unsigned here because the
// only consumers so far want "is this a corner" and "is this
// straight"; see buildCorners for where the sign is kept.
export function turnRates(heads) {
	const n = heads.length
	const out = []
	for (let i = 0; i < n; i++) {
		out.push(Math.abs(
			wrapDelta(heads[i], heads[(i + 1) % n])))
	}
	return out
}

// The longest run of points whose heading barely changes. The
// starting grid goes here, so it has to be the longest one on
// the track rather than merely a long one.
export function longestStraight(turn, threshold) {
	const n = turn.length
	let best = { start: 0, len: 0 }
	let i = 0
	while (i < n * 2) {
		if (turn[i % n] >= threshold) { i++; continue }
		const start = i
		while (i < n * 2 && turn[i % n] < threshold) i++
		if (i - start > best.len) {
			best = { start: start % n, len: i - start }
		}
		if (i - start >= n) break
	}
	return best
}

// Angles unwrapped so they increase monotonically, which is
// what makes a binary search over them meaningful. Only valid
// on a star-shaped curve — see isStarShaped.
export function unwrapped(dense) {
	const out = [Math.atan2(dense[0].y, dense[0].x)]
	for (let i = 1; i < dense.length; i++) {
		const a = Math.atan2(dense[i].y, dense[i].x)
		out.push(out[i - 1] + wrapDelta(out[i - 1], a))
	}
	return out
}
