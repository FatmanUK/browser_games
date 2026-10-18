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

const T = (1 + Math.sqrt(5)) / 2

const ICO_VERTS = [
	[-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
	[0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
	[T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
]

const ICO_FACES = [
	[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10],
	[0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
	[10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2],
	[3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5],
	[2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

function unit(v) {
	const d = Math.hypot(v[0], v[1], v[2]) || 1
	return [v[0] / d, v[1] / d, v[2] / d]
}

function midpoint(verts, cache, a, b) {
	const key = a < b ? `${a},${b}` : `${b},${a}`
	if (cache.has(key)) return cache.get(key)
	const p = unit([
		(verts[a][0] + verts[b][0]) / 2,
		(verts[a][1] + verts[b][1]) / 2,
		(verts[a][2] + verts[b][2]) / 2,
	])
	verts.push(p)
	cache.set(key, verts.length - 1)
	return verts.length - 1
}

export function icosphere(subdiv) {
	const verts = ICO_VERTS.map(unit)
	let faces = ICO_FACES.map((f) => f.slice())
	for (let s = 0; s < subdiv; s++) {
		const cache = new Map()
		const next = []
		for (const [a, b, c] of faces) {
			const ab = midpoint(verts, cache, a, b)
			const bc = midpoint(verts, cache, b, c)
			const ca = midpoint(verts, cache, c, a)
			next.push(
				[a, ab, ca], [b, bc, ab],
				[c, ca, bc], [ab, bc, ca])
		}
		faces = next
	}
	return { verts, faces }
}

// Coherent lumpiness: a sum of 3D sinusoids, so neighbouring
// vertices move together and the result is a boulder rather
// than the sea urchin that per-vertex noise would give.
export function lumpy(verts, rand, strength) {
	const waves = []
	for (let i = 0; i < 5; i++) {
		const axis = () => (rand() - 0.5) * 7
		waves.push({
			k: [axis(), axis(), axis()],
			amp: strength / (1 + i * 0.75),
			ph: rand() * Math.PI * 2,
		})
	}
	return verts.map((v) => {
		let r = 1
		for (const w of waves) {
			const k = w.k
			const d = v[0] * k[0] + v[1] * k[1] +
				v[2] * k[2]
			r += w.amp * Math.sin(d + w.ph)
		}
		return [v[0] * r, v[1] * r, v[2] * r]
	})
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

export function faceNormal(a, b, c) {
	const ux = b[0] - a[0]
	const uy = b[1] - a[1]
	const uz = b[2] - a[2]
	const vx = c[0] - a[0]
	const vy = c[1] - a[1]
	const vz = c[2] - a[2]
	const n = unit([
		uy * vz - uz * vy,
		uz * vx - ux * vz,
		ux * vy - uy * vx,
	])
	// The mesh is grown outward from a sphere, so the
	// outward normal is the one pointing away from the
	// origin; flip any face whose winding disagrees.
	const dot = n[0] * a[0] + n[1] * a[1] + n[2] * a[2]
	return dot < 0 ? [-n[0], -n[1], -n[2]] : n
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
