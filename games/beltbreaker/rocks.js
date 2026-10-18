// Pre-rendered rock sprites: three varieties (silver, gold,
// red) in three sizes, each as a ring of tumble frames. The
// frames are baked once at init because re-pathing a lumpy
// silhouette and re-running four gradients per rock per frame
// is far too much work for a 60fps loop with 30+ rocks on
// screen.
//
// Varieties are not just a recolour — see KINDS in world.js for
// the hit points, speed and split counts that go with each.

import {
	rng, centred, makeLumps, lumpPath, bodyGradient,
	makeCraters, drawCrater, limbStroke, specular,
} from './art.js'

export const ROCK_R = [13, 23, 38]
const FRAMES = 16

const PALETTE = {
	silver: {
		hi: '#eef3fb', mid: '#98a3b4',
		lo: '#464f60', rim: '#1b1f29',
		spec: 0.5, craters: 5,
	},
	gold: {
		hi: '#fff2c0', mid: '#d2a234',
		lo: '#73511a', rim: '#2b1d05',
		spec: 0.7, craters: 3,
	},
	red: {
		hi: '#ffc3ad', mid: '#b84a3c',
		lo: '#5f2220', rim: '#260b0b',
		spec: 0.35, craters: 6,
	},
}

export const ROCK_KINDS = Object.keys(PALETTE)

function spinCrater(c, spin) {
	const cos = Math.cos(spin)
	const sin = Math.sin(spin)
	return {
		x: c.x * cos - c.y * sin,
		y: c.x * sin + c.y * cos,
		r: c.r,
	}
}

function drawRockFrame(ctx, r, rock, pal, spin) {
	lumpPath(ctx, r, rock.lumps, spin)
	ctx.save()
	ctx.clip()
	ctx.fillStyle = bodyGradient(ctx, r, pal)
	ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4)
	for (const c of rock.craters) {
		drawCrater(ctx, spinCrater(c, spin), r, pal)
	}
	specular(ctx, r, 0.6, pal.spec)
	ctx.restore()
	lumpPath(ctx, r, rock.lumps, spin)
	limbStroke(ctx, r, pal, Math.max(1, r * 0.08))
}

function buildKindSize(kind, size) {
	const pal = PALETTE[kind]
	const seed = kind.charCodeAt(0) * 7919 + size * 104729
	const rand = rng(seed)
	const rock = {
		lumps: makeLumps(rand, 4),
		craters: makeCraters(rand, pal.craters),
	}
	const r = ROCK_R[size]
	const span = Math.ceil(r * 1.35 * 2) + 4
	const frames = []
	for (let i = 0; i < FRAMES; i++) {
		const { canvas, ctx } = centred(span)
		const spin = (i / FRAMES) * Math.PI * 2
		drawRockFrame(ctx, r, rock, pal, spin)
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
