// All that is left of the polar model: the difference between
// two headings.
//
// The track used to be a radius per angle about the origin,
// and everything that drove on it asked its questions in
// those terms. A radius per angle cannot describe a track that
// crosses over itself, so a car's position is arc length along
// the centreline now (path.js), and the rest of this file went
// with the change.

export function angleDelta(a, b) {
	let d = b - a
	while (d > Math.PI) d -= Math.PI * 2
	while (d < -Math.PI) d += Math.PI * 2
	return d
}
