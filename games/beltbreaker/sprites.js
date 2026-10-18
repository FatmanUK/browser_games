// Assembles the whole pre-rendered sprite atlas and the
// per-level backdrop. Built lazily on the first init() rather
// than at module load: js/registry.js imports every game's
// module when the launcher page loads, and baking a few hundred
// canvases for a game nobody has picked yet would stall it.

import { rng, centred, makeCanvas } from './art.js'
import { buildRocks } from './rocks.js'
import {
	buildShip, buildFlame, buildFoe, buildBoss,
	buildShots, buildPuffs, buildShield, buildCoins,
	buildPods,
} from './craft.js'

const RING_R = 256

// One textured annulus, blitted at many scales, is the whole
// wormhole: each ring of the tunnel is this sprite drawn at the
// scale its depth implies.
function buildRing() {
	const { canvas, ctx } = centred(RING_R * 2)
	const rand = rng(1337)
	for (let i = 0; i < 96; i++) {
		const a0 = rand() * Math.PI * 2
		const w = 0.18 + rand() * 0.55
		const hue = 190 + rand() * 90
		const light = 24 + rand() * 38
		ctx.strokeStyle =
			`hsla(${hue},70%,${light}%,0.75)`
		ctx.lineWidth = RING_R * (0.04 + rand() * 0.08)
		ctx.beginPath()
		ctx.arc(
			0, 0, RING_R * (0.72 + rand() * 0.26),
			a0, a0 + w)
		ctx.stroke()
	}
	const g = ctx.createRadialGradient(
		0, 0, RING_R * 0.6, 0, 0, RING_R)
	g.addColorStop(0, 'rgba(10,20,40,0)')
	g.addColorStop(0.75, 'rgba(70,130,220,0.3)')
	g.addColorStop(1, 'rgba(160,220,255,0)')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(0, 0, RING_R, 0, Math.PI * 2)
	ctx.fill()
	return canvas
}

let atlas = null

export function getAtlas() {
	if (atlas) return atlas
	atlas = {
		rocks: buildRocks(),
		ship: buildShip(),
		flame: buildFlame(),
		foe: buildFoe(),
		boss: buildBoss(),
		shots: buildShots(),
		puffs: buildPuffs(),
		shield: buildShield(),
		coins: buildCoins(),
		pods: buildPods(),
		ring: buildRing(),
	}
	return atlas
}

function nebula(ctx, rand, w, h) {
	for (let i = 0; i < 4; i++) {
		const x = rand() * w
		const y = rand() * h
		const r = (0.25 + rand() * 0.4) * Math.max(w, h)
		const hue = 200 + rand() * 120
		const g = ctx.createRadialGradient(
			x, y, 0, x, y, r)
		g.addColorStop(
			0, `hsla(${hue},60%,38%,0.085)`)
		g.addColorStop(
			0.6, `hsla(${hue},60%,22%,0.035)`)
		g.addColorStop(1, 'hsla(0,0%,0%,0)')
		ctx.fillStyle = g
		ctx.fillRect(0, 0, w, h)
	}
}

function starField(ctx, rand, w, h) {
	for (let i = 0; i < 420; i++) {
		const x = rand() * w
		const y = rand() * h
		const m = rand()
		const r = m > 0.985 ? 1.9 : m > 0.9 ? 1.2 : 0.7
		ctx.fillStyle =
			`rgba(255,255,255,${0.25 + m * 0.65})`
		ctx.beginPath()
		ctx.arc(x, y, r, 0, Math.PI * 2)
		ctx.fill()
		if (m <= 0.99) continue
		ctx.strokeStyle = 'rgba(190,225,255,0.4)'
		ctx.lineWidth = 0.7
		ctx.beginPath()
		ctx.moveTo(x - 5, y)
		ctx.lineTo(x + 5, y)
		ctx.moveTo(x, y - 5)
		ctx.lineTo(x, y + 5)
		ctx.stroke()
	}
}

// A fresh starfield per level, seeded so a replayed level looks
// the same. Baked to one canvas: redrawing 420 stars a frame is
// pure waste when none of them move.
export function buildBackdrop(w, h, seed) {
	const canvas = makeCanvas(w, h)
	const ctx = canvas.getContext('2d')
	const rand = rng(seed * 2654435761)
	const base = ctx.createLinearGradient(0, 0, 0, h)
	base.addColorStop(0, '#05060f')
	base.addColorStop(0.55, '#080b1a')
	base.addColorStop(1, '#04050c')
	ctx.fillStyle = base
	ctx.fillRect(0, 0, w, h)
	nebula(ctx, rand, w, h)
	starField(ctx, rand, w, h)
	return canvas
}
