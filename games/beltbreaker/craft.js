// Pre-rendered craft and effect sprites: the player's ship (one
// frame per heading, so the hull's highlight stays pinned to
// the light instead of spinning with the ship), its thruster
// plume, the wormhole drones, the level guardian, shots,
// explosion puffs and the respawn shield.

import {
	centred, rng, makeLumps, lumpPath, bodyGradient,
	limbStroke, specular, glow,
} from './art.js'

export const SHIP_R = 17
export const SHIP_FRAMES = 48
export const FOE_R = 12
export const BOSS_R = 76

const HULL = [
	[1.25, 0], [-0.75, 0.8], [-0.45, 0], [-0.75, -0.8],
]

const SHIP_PAL = {
	hi: '#f4f8ff', mid: '#8d99b2', lo: '#3a4259',
	rim: '#141824',
}

const FOE_PAL = {
	hi: '#d8e6c8', mid: '#6f8a5e', lo: '#2f3d2a',
	rim: '#121810',
}

const BOSS_PAL = {
	hi: '#e8dcc0', mid: '#8e7a52', lo: '#3d3422',
	rim: '#140f08',
}

// Rotates a unit-space polygon into screen space by hand: the
// geometry turns, the gradients that shade it do not.
function polyPath(ctx, pts, ang, r) {
	const cos = Math.cos(ang)
	const sin = Math.sin(ang)
	ctx.beginPath()
	pts.forEach(([px, py], i) => {
		const x = (px * cos - py * sin) * r
		const y = (px * sin + py * cos) * r
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	})
	ctx.closePath()
}

function spun(px, py, ang, r) {
	return [
		(px * Math.cos(ang) - py * Math.sin(ang)) * r,
		(px * Math.sin(ang) + py * Math.cos(ang)) * r,
	]
}

function drawCockpit(ctx, ang, r) {
	const [cx, cy] = spun(0.3, 0, ang, r)
	ctx.save()
	ctx.translate(cx, cy)
	ctx.rotate(ang)
	ctx.scale(1, 0.62)
	const g = ctx.createRadialGradient(
		-r * 0.1, -r * 0.1, 0, 0, 0, r * 0.34)
	g.addColorStop(0, '#cdf6ff')
	g.addColorStop(0.5, '#2f8fb5')
	g.addColorStop(1, '#0d2a3c')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2)
	ctx.fill()
	ctx.restore()
}

function drawNacelles(ctx, ang, r) {
	for (const side of [-1, 1]) {
		const [x, y] = spun(-0.55, side * 0.46, ang, r)
		const g = ctx.createRadialGradient(
			x - r * 0.08, y - r * 0.08, 0,
			x, y, r * 0.22)
		g.addColorStop(0, SHIP_PAL.hi)
		g.addColorStop(1, SHIP_PAL.rim)
		ctx.fillStyle = g
		ctx.beginPath()
		ctx.arc(x, y, r * 0.2, 0, Math.PI * 2)
		ctx.fill()
	}
}

function drawShipFrame(ctx, ang, r) {
	polyPath(ctx, HULL, ang, r)
	ctx.save()
	ctx.clip()
	ctx.fillStyle = bodyGradient(ctx, r, SHIP_PAL)
	ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4)
	specular(ctx, r, 0.5, 0.45)
	ctx.restore()
	polyPath(ctx, HULL, ang, r)
	limbStroke(ctx, r, SHIP_PAL, 1.6)
	drawNacelles(ctx, ang, r)
	drawCockpit(ctx, ang, r)
}

export function buildShip() {
	const span = Math.ceil(SHIP_R * 2.8)
	const frames = []
	for (let i = 0; i < SHIP_FRAMES; i++) {
		const { canvas, ctx } = centred(span)
		const ang = (i / SHIP_FRAMES) * Math.PI * 2
		drawShipFrame(ctx, ang, SHIP_R)
		frames.push(canvas)
	}
	return frames
}

const FLAME_FRAMES = 5

function plume(ctx, len, half, stops) {
	const g = ctx.createLinearGradient(0, 0, -len, 0)
	stops.forEach(([at, color]) => g.addColorStop(at, color))
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.moveTo(0, -half)
	ctx.quadraticCurveTo(-len * 0.55, -half * 0.8, -len, 0)
	ctx.quadraticCurveTo(-len * 0.55, half * 0.8, 0, half)
	ctx.closePath()
	ctx.fill()
}

// The plume is emissive, so unlike the hull it can be rotated
// at draw time — no per-heading frames needed, just a wobble.
export function buildFlame() {
	const maxLen = SHIP_R * 1.7
	const span = Math.ceil(maxLen * 2) + 4
	const frames = []
	for (let i = 0; i < FLAME_FRAMES; i++) {
		const { canvas, ctx } = centred(span)
		const w = 0.74 + 0.26 * ((i % 3) / 2)
		plume(ctx, maxLen * w, SHIP_R * 0.46, [
			[0, 'rgba(255,196,96,0.95)'],
			[0.6, 'rgba(226,96,36,0.5)'],
			[1, 'rgba(160,40,20,0)'],
		])
		plume(ctx, maxLen * w * 0.55, SHIP_R * 0.26, [
			[0, 'rgba(255,255,236,0.98)'],
			[0.7, 'rgba(255,214,120,0.5)'],
			[1, 'rgba(255,170,60,0)'],
		])
		frames.push(canvas)
	}
	return frames
}

function drawFoeFrame(ctx, r, lumps, phase) {
	lumpPath(ctx, r, lumps, 0)
	ctx.save()
	ctx.clip()
	ctx.fillStyle = bodyGradient(ctx, r, FOE_PAL)
	ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4)
	specular(ctx, r, 0.45, 0.4)
	ctx.restore()
	lumpPath(ctx, r, lumps, 0)
	limbStroke(ctx, r, FOE_PAL, 1.4)
	for (let i = 0; i < 5; i++) {
		const a = phase + (i / 5) * Math.PI * 2
		ctx.save()
		ctx.translate(
			Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7)
		glow(ctx, r * 0.22, '#ffe9a0', '#c04020')
		ctx.restore()
	}
	ctx.save()
	glow(ctx, r * 0.5, '#fff1f1', '#d12a2a')
	ctx.restore()
}

export function buildFoe() {
	const rand = rng(4242)
	const lumps = makeLumps(rand, 3)
	const span = Math.ceil(FOE_R * 3)
	const frames = []
	for (let i = 0; i < 6; i++) {
		const { canvas, ctx } = centred(span)
		drawFoeFrame(
			ctx, FOE_R, lumps, (i / 6) * Math.PI * 2)
		frames.push(canvas)
	}
	return frames
}

function bossPods(ctx, r, white) {
	for (const side of [-1, 1]) {
		const x = side * r * 1.12
		const y = r * 0.3
		const pr = r * 0.36
		ctx.beginPath()
		ctx.arc(x, y, pr, 0, Math.PI * 2)
		if (white) {
			ctx.fillStyle = '#fff'
			ctx.fill()
			continue
		}
		const g = ctx.createRadialGradient(
			x - pr * 0.4, y - pr * 0.45, pr * 0.05,
			x, y, pr * 1.3)
		g.addColorStop(0, BOSS_PAL.hi)
		g.addColorStop(0.35, BOSS_PAL.mid)
		g.addColorStop(1, BOSS_PAL.rim)
		ctx.fillStyle = g
		ctx.fill()
		ctx.lineWidth = 2
		ctx.strokeStyle = 'rgba(255,230,160,0.4)'
		ctx.stroke()
	}
}

function bossPlates(ctx, r) {
	ctx.lineWidth = r * 0.055
	for (let i = 0; i < 3; i++) {
		const rr = r * (0.48 + i * 0.2)
		ctx.strokeStyle = i % 2
			? 'rgba(255,224,150,0.35)'
			: 'rgba(14,10,6,0.55)'
		for (let q = 0; q < 2; q++) {
			const t = q * Math.PI
			ctx.beginPath()
			ctx.arc(0, 0, rr, t - 2.5, t - 0.65)
			ctx.stroke()
		}
	}
}

function drawBoss(ctx, r, lumps) {
	bossPods(ctx, r, false)
	lumpPath(ctx, r, lumps, 0)
	ctx.save()
	ctx.clip()
	ctx.fillStyle = bodyGradient(ctx, r, BOSS_PAL)
	ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4)
	bossPlates(ctx, r)
	specular(ctx, r, 0.55, 0.4)
	ctx.restore()
	lumpPath(ctx, r, lumps, 0)
	limbStroke(ctx, r, BOSS_PAL, r * 0.06)
	ctx.fillStyle = '#0b0906'
	ctx.beginPath()
	ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2)
	ctx.fill()
}

// A white cut-out of the same silhouette, blitted over the hull
// to flash it when a shot lands — cheaper and cleaner than
// re-tinting the shaded sprite every hit.
function drawBossFlash(ctx, r, lumps) {
	bossPods(ctx, r, true)
	lumpPath(ctx, r, lumps, 0)
	ctx.fillStyle = '#fff'
	ctx.fill()
}

export function buildBoss() {
	const rand = rng(90210)
	const lumps = makeLumps(rand, 3)
	const span = Math.ceil(BOSS_R * 3.2)
	const hull = centred(span)
	drawBoss(hull.ctx, BOSS_R, lumps)
	const flash = centred(span)
	drawBossFlash(flash.ctx, BOSS_R, lumps)
	const core = []
	for (let i = 0; i < 8; i++) {
		const { canvas, ctx } = centred(span)
		const k = 0.62 + 0.38 * Math.sin(
			(i / 8) * Math.PI * 2)
		glow(
			ctx, BOSS_R * (0.3 + 0.1 * k),
			`rgba(255,250,230,${0.5 + 0.5 * k})`,
			`rgba(255,120,40,${0.45 * k})`)
		core.push(canvas)
	}
	return { hull: hull.canvas, flash: flash.canvas, core }
}

function buildBolt(inner, outer, r) {
	const { canvas, ctx } = centred(r * 2 + 2)
	glow(ctx, r, outer, outer)
	ctx.fillStyle = inner
	ctx.beginPath()
	ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2)
	ctx.fill()
	return canvas
}

export function buildShots() {
	return {
		mine: buildBolt(
			'#f2ffff', 'rgba(80,220,255,0.85)', 9),
		theirs: buildBolt(
			'#fff0dc', 'rgba(255,110,60,0.85)', 9),
	}
}

// Explosion puffs run hot-to-cold across the set, so a burst
// can age by stepping through them instead of lerping colours.
export function buildPuffs() {
	const shades = [
		['rgba(255,255,236,0.95)', 'rgba(255,208,92,0.6)'],
		['rgba(255,226,150,0.9)', 'rgba(255,140,48,0.55)'],
		['rgba(255,166,80,0.85)', 'rgba(206,70,30,0.5)'],
		['rgba(220,110,60,0.7)', 'rgba(120,44,30,0.4)'],
		['rgba(150,140,140,0.5)', 'rgba(70,66,66,0.3)'],
		['rgba(110,104,104,0.35)', 'rgba(40,38,38,0.2)'],
	]
	return shades.map(([inner, outer]) => {
		const { canvas, ctx } = centred(44)
		glow(ctx, 21, inner, outer)
		return canvas
	})
}

export function buildShield() {
	const r = SHIP_R * 1.9
	const { canvas, ctx } = centred(r * 2 + 4)
	const g = ctx.createRadialGradient(
		0, 0, r * 0.72, 0, 0, r)
	g.addColorStop(0, 'rgba(90,210,255,0)')
	g.addColorStop(0.7, 'rgba(120,230,255,0.45)')
	g.addColorStop(1, 'rgba(60,150,255,0)')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(0, 0, r, 0, Math.PI * 2)
	ctx.fill()
	return canvas
}
