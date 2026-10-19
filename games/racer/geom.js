// What is left of the polar model.
//
// The track used to be stored as a radius per angle about the
// origin, and everything that drove on it asked questions in
// those terms. That is gone: a car's position is arc length
// along the centreline now (path.js), because a radius per
// angle cannot describe a track that crosses over itself.
//
// These are the pieces with nothing to do with that choice —
// an angle-table lookup the generator still places scenery
// with, and the swept-angle lap count, which measures how far
// round the world a car has been rather than where it is.

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

export function angleDelta(a, b) {
	let d = b - a
	while (d > Math.PI) d -= Math.PI * 2
	while (d < -Math.PI) d += Math.PI * 2
	return d
}

// Which way round the track the grid faces: +1 if driving off
// the grid increases the polar angle about CENTER, -1 if it
// decreases it. Derived rather than written down, because a
// track is built from a seed at load and nothing guarantees
// the next one winds the same way. Computed once per track and
// kept on it rather than as a module constant — there is more
// than one track now.
export function travelDir(start) {
	const a = angleOf(start.x, start.y)
	const along =
		-Math.sin(a) * Math.cos(start.angle) +
		Math.cos(a) * Math.sin(start.angle)
	return along >= 0 ? 1 : -1
}

// Laps run off swept angle, not line crossings, so they can't
// be cheated by reversing over the line — and `progress` below
// is the same number before it is rounded down, which is what
// makes sorting the field trivial.
export function progressOf(track, totalAngle) {
	return (totalAngle * track.TRAVEL_DIR) / (Math.PI * 2)
}
