// A tiny flat-shading triangle renderer, used to bake the rock
// sprites (see rocks.js).
//
// The first version of the rocks was a lumpy silhouette filled
// with a radial gradient. That reads as a cartoon: a gradient
// is a smooth ball no matter what outline you clip it to, and
// real rock is faceted, grainy and anything but smooth. So the
// rocks are now actual geometry — a subdivided icosahedron with
// its vertices pushed around — lit per face with a fixed light,
// which is what makes them look crystalline and cut rather than
// drawn. It is all still baked once into sprites; nothing here
// runs during play.

function unit(v) {
	const d = Math.hypot(v[0], v[1], v[2]) || 1
	return [v[0] / d, v[1] / d, v[2] / d]
}

function cross(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	]
}

// Two axes across a plane, for laying out its face.
function basis(n) {
	const t = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]
	const u = unit(cross(t, n))
	return [u, cross(n, u)]
}

function planeSquare(n, d, size) {
	const [u, v] = basis(n)
	const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
	return corners.map(([a, b]) => [
		n[0] * d + (u[0] * a + v[0] * b) * size,
		n[1] * d + (u[1] * a + v[1] * b) * size,
		n[2] * d + (u[2] * a + v[2] * b) * size,
	])
}

// Sutherland-Hodgman against one half-space.
function clipPoly(poly, n, d) {
	const out = []
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]
		const b = poly[(i + 1) % poly.length]
		const da = a[0] * n[0] + a[1] * n[1] +
			a[2] * n[2] - d
		const db = b[0] * n[0] + b[1] * n[1] +
			b[2] * n[2] - d
		if (da <= 0) out.push(a)
		if ((da > 0) === (db > 0)) continue
		const t = da / (da - db)
		out.push([
			a[0] + (b[0] - a[0]) * t,
			a[1] + (b[1] - a[1]) * t,
			a[2] + (b[2] - a[2]) * t,
		])
	}
	return out
}

// Spin about the body's own axis, then a fixed tilt, so a rock
// tumbles about something other than the screen's vertical.
export function makeRotate(tiltX, tiltZ, spin) {
	const cs = Math.cos(spin)
	const ss = Math.sin(spin)
	const cx = Math.cos(tiltX)
	const sx = Math.sin(tiltX)
	const cz = Math.cos(tiltZ)
	const sz = Math.sin(tiltZ)
	return (v) => {
		let x = v[0] * cs + v[2] * ss
		let z = -v[0] * ss + v[2] * cs
		let y = v[1]
		const ty = y * cx - z * sx
		z = y * sx + z * cx
		y = ty
		const tx = x * cz - y * sz
		y = x * sz + y * cz
		x = tx
		return [x, y, z]
	}
}

// Plane normals spread evenly over the sphere by the golden
// angle, then jittered: even spacing is what keeps the solid
// "fairly regular" — equidimensional, no spikes — while the
// jitter and the varied cutting depths keep it from looking
// like a manufactured gem.
function planeSet(rand, count, rough) {
	const out = []
	for (let i = 0; i < count; i++) {
		const y = 1 - (2 * i + 1) / count
		const r = Math.sqrt(Math.max(0, 1 - y * y))
		const th = i * 2.399963 + rand() * 0.6
		const wob = () => (rand() - 0.5) * 0.3
		out.push({
			n: unit([
				Math.cos(th) * r + wob(),
				y + wob(),
				Math.sin(th) * r + wob(),
			]),
			d: 1 - rough * rand(),
		})
	}
	return out
}

// A rock as a convex solid cut by planes, rather than as a
// displaced sphere. Two reasons. Sharpness: a plane's face is
// exactly flat and meets its neighbour on a hard edge, where
// displaced triangles only ever approximate one. Cost: this
// comes out as a dozen-odd polygons instead of hundreds of
// triangles, which is what makes it affordable to bake enough
// tumble frames for the rotation to look smooth.
// Squashing the finished solid along its own axes is what
// stops a set of rocks all reading as the same die rolled to a
// different face. Normals have to be divided by the scale, not
// multiplied: scaling a surface tilts its normal the other way.
function squash(faces, rand) {
	const s = [
		0.82 + rand() * 0.36,
		0.82 + rand() * 0.36,
		0.82 + rand() * 0.36,
	]
	for (const f of faces) {
		f.poly = f.poly.map((p) => [
			p[0] * s[0], p[1] * s[1], p[2] * s[2],
		])
		f.n = unit([
			f.n[0] / s[0], f.n[1] / s[1], f.n[2] / s[2],
		])
	}
	return faces
}

export function crystal(rand, count, rough) {
	const planes = planeSet(rand, count, rough)
	const faces = []
	for (const p of planes) {
		let poly = planeSquare(p.n, p.d, 3)
		for (const q of planes) {
			if (q === p) continue
			poly = clipPoly(poly, q.n, q.d)
			if (poly.length < 3) break
		}
		if (poly.length < 3) continue
		faces.push({
			n: p.n, poly,
			mul: 0.86 + rand() * 0.3,
			glint: rand() < 0.16,
		})
	}
	return squash(faces, rand)
}

// Key light up and to the left (the same direction art.js
// shades the ship and the guardian from), plus a dim, cool
// fill from below right so the dark side is sky-lit rather
// than dead black — the single thing that most separates a
// rendered rock from a flat cutout.
const KEY = unit([-0.6, -0.55, 0.45])
const FILL = unit([0.55, 0.5, 0.35])
const HALF = unit([KEY[0], KEY[1], KEY[2] + 1])

function dot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

// Shading is computed in linear light, so it has to be gamma
// encoded on the way out or everything lands in the same
// muddy mid-band. The shoulder before the gamma keeps a bright
// specular from clipping to a flat white blob.
const EXPOSURE = 0.6

function tone(c) {
	const e = Math.max(0, c) * EXPOSURE
	const v = e / (1 + e * 0.55)
	return Math.round(
		255 * Math.pow(Math.min(1, v), 1 / 2.2))
}

// A metal's trick is a low diffuse albedo under a bright,
// tight specular — turn pal.kd down and pal.ks up and the same
// shader that makes stone makes nickel-iron.
//
// `mul` varies one face's albedo against its neighbours and
// `glint` marks the odd face as a crystal facet: without them
// every facet of a given angle is identical and the rock reads
// as a machined solid rather than as mineral.
export function shadeFace(n, pal, mul, glint) {
	const diff = Math.max(0, dot(n, KEY))
	const fill = Math.max(0, dot(n, FILL)) * pal.fill
	const spec = Math.pow(
		Math.max(0, dot(n, HALF)),
		pal.shine * (glint ? 2.4 : 1)) *
		pal.ks * (glint ? 2.6 : 1)
	// Grazing faces catch more reflection; this is what
	// makes the metals look polished rather than painted.
	const rim = Math.pow(
		1 - Math.max(0, n[2]), 5) * pal.rim
	const lit = pal.amb + pal.kd * diff
	const out = []
	for (let i = 0; i < 3; i++) {
		out.push(tone(
			pal.base[i] * mul * lit +
			pal.sky[i] * fill +
			pal.tint[i] * (spec + rim)))
	}
	return `rgb(${out[0]},${out[1]},${out[2]})`
}
