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

// Resample a dense closed curve to even spacing in arc length.
//
// This is the one decision the whole arc-length model rests
// on. With the samples evenly spaced, s -> index is s/DS plus
// a lerp: O(1), no search, structurally the same cheap lookup
// the angle-indexed radius tables were. Resample unevenly and
// every position query becomes a binary search over cumulative
// distance, for no gain at all.
export function resample(dense, step) {
	const n = dense.length
	const seg = []
	let total = 0
	for (let i = 0; i < n; i++) {
		const a = dense[i]
		const b = dense[(i + 1) % n]
		const d = Math.hypot(b.x - a.x, b.y - a.y)
		seg.push(d)
		total += d
	}
	// Round the count so the loop closes exactly: a leftover
	// fraction of a step at the seam puts a kink in the road
	// at one arbitrary point of every track.
	const count = Math.max(16, Math.round(total / step))
	const ds = total / count
	const out = []
	let i = 0
	let walked = 0
	for (let k = 0; k < count; k++) {
		const target = k * ds
		while (walked + seg[i] < target && i < n - 1) {
			walked += seg[i]
			i++
		}
		const f = seg[i] > 0 ? (target - walked) / seg[i] : 0
		const a = dense[i]
		const b = dense[(i + 1) % n]
		out.push({
			x: a.x + (b.x - a.x) * f,
			y: a.y + (b.y - a.y) * f,
		})
	}
	return { pts: out, ds, length: total }
}

// Unit tangents and signed curvature at each sample, by
// central difference. Curvature is per unit length, so a
// corner's radius is 1/|k| and the speed it can be taken at
// is sqrt(grip / |k|) — which is what lets a rival brake for
// a corner it has not reached yet.
export function differentiate(pts, ds) {
	const n = pts.length
	const ux = [], uy = [], k = []
	for (let i = 0; i < n; i++) {
		const a = pts[(i - 1 + n) % n]
		const b = pts[(i + 1) % n]
		let dx = (b.x - a.x) / (2 * ds)
		let dy = (b.y - a.y) / (2 * ds)
		const m = Math.hypot(dx, dy) || 1
		dx /= m
		dy /= m
		ux.push(dx)
		uy.push(dy)
	}
	for (let i = 0; i < n; i++) {
		const p = (i - 1 + n) % n
		const q = (i + 1) % n
		const dtx = (ux[q] - ux[p]) / (2 * ds)
		const dty = (uy[q] - uy[p]) / (2 * ds)
		// Signed: the cross product of the tangent with its
		// own derivative. Positive is one way round a bend,
		// negative the other, and an arrow needs to know.
		k.push(ux[i] * dty - uy[i] * dtx)
	}
	return { ux, uy, k }
}

// One pass of a closed-loop smoothing filter. Pulls each point
// toward the average of its neighbours, which is what takes
// the curvature out of a corner.
export function smoothOnce(pts, alpha) {
	const n = pts.length
	const out = []
	for (let i = 0; i < n; i++) {
		const a = pts[(i - 1 + n) % n]
		const b = pts[(i + 1) % n]
		out.push({
			x: pts[i].x * (1 - alpha) +
				((a.x + b.x) / 2) * alpha,
			y: pts[i].y * (1 - alpha) +
				((a.y + b.y) / 2) * alpha,
		})
	}
	return out
}

export function minRadius(k) {
	let kMax = 0
	for (let i = 0; i < k.length; i++) {
		kMax = Math.max(kMax, Math.abs(k[i]))
	}
	return kMax > 0 ? 1 / kMax : Infinity
}

function segHit(p1, p2, p3, p4) {
	const d = (p2.x - p1.x) * (p4.y - p3.y) -
		(p2.y - p1.y) * (p4.x - p3.x)
	if (Math.abs(d) < 1e-12) return null
	const t = ((p3.x - p1.x) * (p4.y - p3.y) -
		(p3.y - p1.y) * (p4.x - p3.x)) / d
	const u = ((p3.x - p1.x) * (p2.y - p1.y) -
		(p3.y - p1.y) * (p2.x - p1.x)) / d
	// A hair of tolerance: a curve that crosses exactly at a
	// sample point lands t or u on zero, and floating point
	// puts it a whisker either side.
	const e = 1e-9
	if (t < -e || t > 1 + e || u < -e || u > 1 + e) {
		return null
	}
	return {
		x: p1.x + (p2.x - p1.x) * t,
		y: p1.y + (p2.y - p1.y) * t,
	}
}

// Every place the closed curve runs through itself.
//
// Neighbouring segments share an endpoint and would report a
// hit at every step, so pairs closer than `gap` samples apart
// are skipped — which also rules out the hairpins that touch
// themselves without really crossing.
//
// O(n^2) with a bounding-box reject in front of it. At a
// thousand samples that is half a million cheap tests and a
// couple of milliseconds, once, at track build. A grid would
// be more code than it saves.
export function selfCrossings(pts, gap) {
	const n = pts.length
	const out = []
	for (let i = 0; i < n; i++) {
		const a = pts[i]
		const b = pts[(i + 1) % n]
		const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x)
		const lo2 = Math.min(a.y, b.y)
		const hi2 = Math.max(a.y, b.y)
		for (let j = i + gap; j < n; j++) {
			if (i === 0 && j === n - 1) continue
			const c = pts[j]
			const d = pts[(j + 1) % n]
			if (Math.max(c.x, d.x) < lo) continue
			if (Math.min(c.x, d.x) > hi) continue
			if (Math.max(c.y, d.y) < lo2) continue
			if (Math.min(c.y, d.y) > hi2) continue
			const hit = segHit(a, b, c, d)
			if (!hit) continue
			// One crossing can land on two segment pairs
			// when it falls on a shared endpoint, so near
			// duplicates are folded together.
			const dup = out.some(
				(o2) => Math.hypot(o2.x - hit.x,
					o2.y - hit.y) < 2)
			if (dup) continue
			out.push({ i, j, x: hit.x, y: hit.y })
		}
	}
	return out
}
