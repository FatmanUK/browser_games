// Pre-rendered rock sprites: three varieties (silver, gold,
// red) in three sizes, each as a ring of tumble frames.
//
// Each rock is a convex solid cut from a sphere by a dozen-odd
// planes (see mesh.js), flat-shaded face by face against a
// fixed light, then dusted with grain. The planes are what
// give it hard, sharp edges; spreading their normals evenly
// keeps it equidimensional rather than spiky; the per-face
// albedo jitter and the occasional high-gloss facet keep it
// mineral rather than machined; the grain makes it stone.
//
// All of it bakes to canvases once, at init: a 60fps loop with
// thirty rocks on screen should only ever be blitting.

import { rng, centred, makeCanvas } from './art.js'
import { crystal, makeRotate, shadeFace } from './mesh.js'

export const ROCK_R = [13, 23, 38]

// A cut crystal is a dozen-odd polygons, not hundreds of
// triangles, so the frame count can be high enough that a
// tumbling rock reads as turning rather than as stepping. At
// 72 frames each step is five degrees; at the 16 it used to
// have it was twenty-two and you could see every one.
const FRAMES = 72

const KIND = {
	// Polished nickel-iron: bright, neutral, hard glints.
	silver: {
		base: [0.46, 0.5, 0.58], tint: [1, 1, 1],
		sky: [0.3, 0.42, 0.62], amb: 0.05, fill: 0.14,
		kd: 0.55, shine: 62, ks: 1.55, rim: 0.42,
		planes: 16, rough: 0.44, grain: 0.26,
	},
	// Gold tints its own reflection, so the specular is warm
	// rather than white — the giveaway for a metal.
	gold: {
		base: [0.68, 0.48, 0.13], tint: [1, 0.82, 0.4],
		sky: [0.4, 0.4, 0.5], amb: 0.06, fill: 0.13,
		kd: 0.6, shine: 64, ks: 1.65, rim: 0.46,
		planes: 14, rough: 0.36, grain: 0.2,
	},
	// Metamorphic: rougher, darker, barely reflective, with
	// enough glinting facets to show the crystal in it.
	red: {
		base: [0.5, 0.15, 0.11], tint: [1, 0.72, 0.6],
		sky: [0.32, 0.36, 0.5], amb: 0.09, fill: 0.24,
		kd: 1, shine: 9, ks: 0.35, rim: 0.14,
		planes: 20, rough: 0.52, grain: 0.42,
	},
}

export const ROCK_KINDS = Object.keys(KIND)

function blotch(ctx, rand, strength, big) {
	const r = big ? 1 + rand() * 1.8 : 0.4 + rand() * 0.8
	const a = strength * (big ? 0.1 + rand() * 0.22
		: 0.1 + rand() * 0.3)
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
	for (let i = 0; i < 420; i++) {
		blotch(ctx, rand, strength, true)
	}
	for (let i = 0; i < 2200; i++) {
		blotch(ctx, rand, strength, false)
	}
	return canvas
}

function buildBody(kind, size, rand) {
	const spec = KIND[kind]
	// More planes on the big ones: a facet has to be worth
	// more than a pixel or two to read as a facet at all.
	const planes = spec.planes + (size === 2 ? 4 : 0)
	const faces = crystal(rand, planes, spec.rough)
	let reach = 0
	for (const f of faces) {
		for (const p of f.poly) {
			reach = Math.max(
				reach, Math.hypot(p[0], p[1], p[2]))
		}
	}
	return {
		faces, reach, spec,
		tiltX: (rand() - 0.5) * 1.5,
		tiltZ: (rand() - 0.5) * 1.5,
		grain: grainTile(rand, spec.grain),
	}
}

// The solid is convex, so facing away from the viewer is the
// whole of the hidden-surface problem — no sorting needed.
function paintFaces(ctx, body, rotate, r) {
	for (const f of body.faces) {
		const n = rotate(f.n)
		if (n[2] <= 0) continue
		const colour = shadeFace(
			n, body.spec, f.mul, f.glint)
		ctx.fillStyle = colour
		ctx.strokeStyle = colour
		ctx.beginPath()
		f.poly.forEach((p, i) => {
			const q = rotate(p)
			if (i === 0) ctx.moveTo(q[0] * r, q[1] * r)
			else ctx.lineTo(q[0] * r, q[1] * r)
		})
		ctx.closePath()
		ctx.fill()
		ctx.stroke()
	}
}

// source-atop keeps the grain inside whatever the faces
// already covered, so no separate silhouette path is needed.
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
		ctx.lineJoin = 'round'
		ctx.lineWidth = 1
		paintFaces(ctx, body, rotate, r)
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
