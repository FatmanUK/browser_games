// Pre-rendered rock sprites: three varieties (silver, gold,
// red) in three sizes, each as a ring of tumble frames.
//
// Each rock is a real lump of geometry — a subdivided
// icosahedron with its vertices pushed around by coherent
// noise — flat-shaded face by face against a fixed light (see
// mesh.js), then dusted with grain. Flat shading is what gives
// the crystalline cut; the per-face albedo jitter and the
// occasional high-gloss facet are what keep it mineral rather
// than machined; the grain is what makes it stone.
//
// All of it bakes to canvases once, at init: re-shading a few
// hundred triangles per rock per frame is not something a
// 60fps loop with thirty rocks on screen can afford.

import { rng, centred, makeCanvas } from './art.js'
import {
	icosphere, lumpy, makeRotate, faceNormal, shadeFace,
} from './mesh.js'

export const ROCK_R = [13, 23, 38]
const FRAMES = 16

const KIND = {
	// Polished nickel-iron: bright, neutral, hard glints.
	silver: {
		base: [0.46, 0.5, 0.58], tint: [1, 1, 1],
		sky: [0.3, 0.42, 0.62], amb: 0.05, fill: 0.14,
		kd: 0.55, shine: 62, ks: 1.55, rim: 0.42,
		lump: 0.19, grain: 0.34, glint: 0.09,
	},
	// Gold tints its own reflection, so the specular is warm
	// rather than white — the giveaway for a metal.
	gold: {
		base: [0.68, 0.48, 0.13], tint: [1, 0.82, 0.4],
		sky: [0.4, 0.4, 0.5], amb: 0.06, fill: 0.13,
		kd: 0.6, shine: 64, ks: 1.65, rim: 0.46,
		lump: 0.16, grain: 0.28, glint: 0.12,
	},
	// Metamorphic: rougher, darker, barely reflective, with
	// enough glinting facets to show the crystal in it.
	red: {
		base: [0.38, 0.16, 0.13], tint: [1, 0.72, 0.6],
		sky: [0.32, 0.36, 0.5], amb: 0.09, fill: 0.24,
		kd: 1, shine: 9, ks: 0.35, rim: 0.14,
		lump: 0.26, grain: 0.55, glint: 0.14,
	},
}

export const ROCK_KINDS = Object.keys(KIND)

function blotch(ctx, rand, strength, big) {
	const r = big ? 1.5 + rand() * 3.5 : 0.5 + rand() * 1
	const a = strength * (big ? 0.12 + rand() * 0.35
		: 0.1 + rand() * 0.26)
	ctx.fillStyle = rand() < 0.56
		? `rgba(14,10,8,${a})`
		: `rgba(255,246,230,${a * 0.6})`
	ctx.beginPath()
	ctx.arc(rand() * 128, rand() * 128, r, 0, Math.PI * 2)
	ctx.fill()
}

// Mottled patches with a dusting of speckle over them, rather
// than per-pixel static: at this size film grain reads as a
// dirty lens and blotches read as stone.
function grainTile(rand, strength) {
	const canvas = makeCanvas(128, 128)
	const ctx = canvas.getContext('2d')
	for (let i = 0; i < 260; i++) {
		blotch(ctx, rand, strength, true)
	}
	for (let i = 0; i < 1500; i++) {
		blotch(ctx, rand, strength, false)
	}
	return canvas
}

function buildBody(kind, size, rand) {
	const spec = KIND[kind]
	const mesh = icosphere([1, 2, 2][size])
	const verts = lumpy(mesh.verts, rand, spec.lump)
	const faces = mesh.faces.map((f) => ({
		f,
		mul: 0.72 + rand() * 0.56,
		glint: rand() < spec.glint,
	}))
	let reach = 0
	for (const v of verts) {
		reach = Math.max(reach, Math.hypot(v[0], v[1], v[2]))
	}
	return {
		verts, faces, reach, spec,
		tiltX: (rand() - 0.5) * 1.5,
		tiltZ: (rand() - 0.5) * 1.5,
		grain: grainTile(rand, spec.grain),
	}
}

function visibleFaces(body, rotate) {
	const spun = body.verts.map(rotate)
	const out = []
	for (const face of body.faces) {
		const [i, j, k] = face.f
		const a = spun[i]
		const b = spun[j]
		const c = spun[k]
		const n = faceNormal(a, b, c)
		if (n[2] <= 0) continue
		out.push({
			a, b, c, n, face,
			z: (a[2] + b[2] + c[2]) / 3,
		})
	}
	out.sort((p, q) => p.z - q.z)
	return out
}

function paintFaces(ctx, tris, r, spec) {
	// Filling and stroking with the same colour closes the
	// hairline seams antialiasing leaves between neighbours.
	ctx.lineJoin = 'round'
	ctx.lineWidth = 1
	for (const t of tris) {
		const colour = shadeFace(
			t.n, spec, t.face.mul, t.face.glint)
		ctx.fillStyle = colour
		ctx.strokeStyle = colour
		ctx.beginPath()
		ctx.moveTo(t.a[0] * r, t.a[1] * r)
		ctx.lineTo(t.b[0] * r, t.b[1] * r)
		ctx.lineTo(t.c[0] * r, t.c[1] * r)
		ctx.closePath()
		ctx.fill()
		ctx.stroke()
	}
}

// source-atop keeps the grain inside whatever the mesh already
// covered, so no separate silhouette path is needed.
function dustGrain(ctx, body, span, spin) {
	ctx.save()
	ctx.globalCompositeOperation = 'source-atop'
	ctx.rotate(spin)
	const g = body.grain
	for (let x = -span; x < span; x += g.width) {
		for (let y = -span; y < span; y += g.height) {
			ctx.drawImage(g, x, y)
		}
	}
	ctx.restore()
}

function buildKindSize(kind, size) {
	const seed = kind.charCodeAt(0) * 7919 + size * 104729
	const rand = rng(seed)
	const body = buildBody(kind, size, rand)
	const r = ROCK_R[size] / body.reach
	const span = Math.ceil(ROCK_R[size] * 2) + 6
	const frames = []
	for (let i = 0; i < FRAMES; i++) {
		const spin = (i / FRAMES) * Math.PI * 2
		const { canvas, ctx } = centred(span)
		const rotate = makeRotate(
			body.tiltX, body.tiltZ, spin)
		paintFaces(
			ctx, visibleFaces(body, rotate), r, body.spec)
		dustGrain(ctx, body, span, spin)
		frames.push(canvas)
	}
	return frames
}

// rocks[kind][size] is an array of FRAMES canvases; pick one
// with frameFor() from the rock's own tumble angle.
export function buildRocks() {
	const out = {}
	for (const kind of ROCK_KINDS) {
		out[kind] = ROCK_R.map(
			(_, size) => buildKindSize(kind, size))
	}
	return out
}

export function frameFor(frames, angle) {
	const turn = Math.PI * 2
	const norm = ((angle % turn) + turn) % turn
	const i = Math.floor((norm / turn) * frames.length)
	return frames[i % frames.length]
}
