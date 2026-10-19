// The canvas side of the mesh pipeline: turning the faces that
// mesh.js produces into sprites, once, at init.
//
// mesh.js is pure maths and touches no DOM. This is where the
// drawing lives, and it was Belt Breaker's rocks.js until Dash
// wanted the same loop for its cars and scenery.
//
// The whole point of baking is that nothing here runs during
// play: a frame of the game should only ever be blitting.

import { makeCanvas, centred } from './art.js'
import { makeRotate, shadeFace } from './mesh.js'

// A model is a list of convex parts, each with its own palette
// and its own offset from the model's origin — a union, not an
// intersection. Intersecting a car body with its wheels would
// carve nonsense out of both; a union of convex pieces is what
// is wanted, and for a camera that never rotates it is cheap.
//
// `reach` is the furthest any vertex lands from the origin,
// which is what a model is normalised against when it is baked
// to a target pixel radius.
export function model(parts) {
	let reach = 0
	for (const part of parts) {
		const off = part.offset || [0, 0, 0]
		for (const f of part.faces) {
			for (const p of f.poly) {
				reach = Math.max(reach, Math.hypot(
					p[0] + off[0], p[1] + off[1],
					p[2] + off[2]))
			}
		}
	}
	return { parts, reach }
}

function paintFace(ctx, f, n, pal, rotate, off, r) {
	// Fill and stroke in the same colour: without the stroke
	// a hairline of background shows between neighbouring
	// faces wherever the two paths don't quite meet.
	const colour = shadeFace(n, pal, f.mul, f.glint)
	ctx.fillStyle = colour
	ctx.strokeStyle = colour
	ctx.beginPath()
	f.poly.forEach((p, i) => {
		const q = rotate([
			p[0] + off[0], p[1] + off[1], p[2] + off[2],
		])
		if (i === 0) ctx.moveTo(q[0] * r, q[1] * r)
		else ctx.lineTo(q[0] * r, q[1] * r)
	})
	ctx.closePath()
	ctx.fill()
	ctx.stroke()
}

function paintPart(ctx, part, rotate, r) {
	const off = part.offset || [0, 0, 0]
	for (const f of part.faces) {
		const n = rotate(f.n)
		// Each part is convex, so facing away from the
		// viewer is the whole of its hidden-surface problem.
		if (n[2] <= 0) continue
		paintFace(ctx, f, n, part.pal, rotate, off, r)
	}
}

// Parts are painted far to near. Within a part the backface
// cull is exact; between parts it is not, so they need an
// order, and sorting by the rotated offset's depth is the
// cheapest one that is right from every angle.
export function paintModel(ctx, mdl, rotate, r) {
	const order = mdl.parts.map((part) => ({
		part,
		z: rotate(part.offset || [0, 0, 0])[2],
	}))
	order.sort((a, b) => a.z - b.z)
	for (const { part } of order) {
		paintPart(ctx, part, rotate, r)
	}
}

// One canvas, for anything that does not turn. Most scenery
// never does: a tree looks the same from every heading because
// the camera's heading never changes.
export function bakeOne(mdl, radius, tilt) {
	const span = Math.ceil(radius * 2) + 6
	const { canvas, ctx } = centred(span)
	ctx.lineJoin = 'round'
	ctx.lineWidth = 1
	paintModel(
		ctx, mdl,
		makeRotate(tilt.x, tilt.z, tilt.spin || 0),
		radius / mdl.reach)
	return canvas
}

// A ring of headings, for anything that does. Shading is
// computed against a fixed light from the ROTATED normal, so a
// turned sprite is not a turned picture — it has to be baked
// per heading rather than ctx.rotate()d at draw time.
export function ringOf(mdl, frames, radius, tilt) {
	const out = []
	for (let i = 0; i < frames; i++) {
		const spin = (i / frames) * Math.PI * 2
		out.push(bakeOne(mdl, radius, {
			x: tilt.x, z: tilt.z, spin,
		}))
	}
	return out
}

export function frameFor(frames, angle) {
	const turn = Math.PI * 2
	const norm = ((angle % turn) + turn) % turn
	const i = Math.floor((norm / turn) * frames.length)
	return frames[i % frames.length]
}

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
export function grainTile(rand, strength) {
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

// source-atop keeps the grain inside whatever the faces
// already covered, so no separate silhouette path is needed.
export function dustGrain(ctx, grain, span, spin) {
	ctx.save()
	ctx.globalCompositeOperation = 'source-atop'
	ctx.rotate(spin)
	for (let x = -span; x < span; x += grain.width) {
		for (let y = -span; y < span; y += grain.height) {
			ctx.drawImage(grain, x, y)
		}
	}
	ctx.restore()
}
