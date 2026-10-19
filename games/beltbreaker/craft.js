// Pre-rendered craft and effect sprites: the player's ship (one
// frame per heading, so the hull's highlight stays pinned to
// the light instead of spinning with the ship), its thruster
// plume, the wormhole drones, the level guardian, shots,
// explosion puffs and the respawn shield.

import {
	centred, rng, makeLumps, lumpPath, bodyGradient,
	limbStroke, specular, glow,
} from '../_shared/art.js'

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

const COIN_FRAMES = 10
export const COIN_R = 9
export const POD_R = 11

function coinFace(ctx, r, squash) {
	const g = ctx.createLinearGradient(0, -r, 0, r)
	g.addColorStop(0, '#fff3c4')
	g.addColorStop(0.35, '#f0c23c')
	g.addColorStop(0.62, '#a9761a')
	g.addColorStop(1, '#f7dc87')
	ctx.save()
	ctx.scale(Math.max(0.06, squash), 1)
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(0, 0, r, 0, Math.PI * 2)
	ctx.fill()
	ctx.lineWidth = r * 0.16
	ctx.strokeStyle = 'rgba(94,62,10,0.75)'
	ctx.stroke()
	ctx.restore()
}

// Spun by squashing the face rather than by drawing ten
// separate coins: the edge-on frames are the cheap ones and
// they are what sells the rotation.
export function buildCoins() {
	const span = COIN_R * 2 + 8
	const frames = []
	for (let i = 0; i < COIN_FRAMES; i++) {
		const { canvas, ctx } = centred(span)
		const a = (i / COIN_FRAMES) * Math.PI * 2
		coinFace(ctx, COIN_R, Math.abs(Math.cos(a)))
		glow(ctx, COIN_R * 1.7, 'rgba(255,220,120,0.22)',
			'rgba(255,170,40,0.1)')
		frames.push(canvas)
	}
	return frames
}

const POD_PAL = {
	hi: '#ffe4e0', mid: '#c4443a', lo: '#53181a',
	rim: '#1d0708',
}

function podShell(ctx, r) {
	ctx.beginPath()
	ctx.moveTo(-r * 0.85, -r * 0.5)
	ctx.quadraticCurveTo(0, -r * 1.05, r * 0.85, -r * 0.5)
	ctx.quadraticCurveTo(r * 1.1, 0, r * 0.85, r * 0.5)
	ctx.quadraticCurveTo(0, r * 1.05, -r * 0.85, r * 0.5)
	ctx.quadraticCurveTo(-r * 1.1, 0, -r * 0.85, -r * 0.5)
	ctx.closePath()
}

function podChevrons(ctx, r) {
	ctx.strokeStyle = 'rgba(255,240,220,0.85)'
	ctx.lineWidth = r * 0.16
	ctx.lineCap = 'round'
	for (let i = 0; i < 2; i++) {
		const y = r * (0.1 + i * 0.34)
		ctx.beginPath()
		ctx.moveTo(-r * 0.38, y)
		ctx.lineTo(0, y - r * 0.34)
		ctx.lineTo(r * 0.38, y)
		ctx.stroke()
	}
}

// A pulsing drop pod, so an upgrade reads as a thing to chase
// rather than as one more piece of debris.
export function buildPods() {
	const span = POD_R * 3
	const frames = []
	for (let i = 0; i < 8; i++) {
		const { canvas, ctx } = centred(span)
		const k = 0.5 + 0.5 * Math.sin(
			(i / 8) * Math.PI * 2)
		glow(
			ctx, POD_R * (1.5 + 0.5 * k),
			`rgba(255,160,130,${0.2 + 0.25 * k})`,
			'rgba(220,60,40,0.12)')
		podShell(ctx, POD_R)
		ctx.save()
		ctx.clip()
		ctx.fillStyle = bodyGradient(ctx, POD_R, POD_PAL)
		ctx.fillRect(-span, -span, span * 2, span * 2)
		ctx.restore()
		podShell(ctx, POD_R)
		limbStroke(ctx, POD_R, POD_PAL, 1.5)
		podChevrons(ctx, POD_R)
		frames.push(canvas)
	}
	return frames
}

const REAR_PAL = {
	hi: '#eaf1ff', mid: '#7f8ca6', lo: '#333a4e',
	rim: '#10131d',
}

// Seen from behind, a delta is mostly one horizontal wing, and
// drawn flat that is a stick with a lump in the middle. The
// dihedral is what rescues it: sweeping the wings up towards
// the tips gives the silhouette a direction to read in, and
// the winglets give it ends.
function rearHull(ctx, r) {
	ctx.beginPath()
	ctx.moveTo(-0.44 * r, -0.52 * r)
	ctx.lineTo(0.44 * r, -0.52 * r)
	ctx.lineTo(0.5 * r, 0.1 * r)
	ctx.lineTo(1.45 * r, -0.26 * r)
	ctx.lineTo(1.62 * r, -0.2 * r)
	ctx.lineTo(1.62 * r, 0.12 * r)
	ctx.lineTo(0.62 * r, 0.52 * r)
	ctx.lineTo(0.56 * r, 0.66 * r)
	ctx.lineTo(-0.56 * r, 0.66 * r)
	ctx.lineTo(-0.62 * r, 0.52 * r)
	ctx.lineTo(-1.62 * r, 0.12 * r)
	ctx.lineTo(-1.62 * r, -0.2 * r)
	ctx.lineTo(-1.45 * r, -0.26 * r)
	ctx.lineTo(-0.5 * r, 0.1 * r)
	ctx.closePath()
}

function rearFin(ctx, r) {
	ctx.beginPath()
	ctx.moveTo(-0.15 * r, -0.5 * r)
	ctx.lineTo(0, -1.05 * r)
	ctx.lineTo(0.15 * r, -0.5 * r)
	ctx.closePath()
}

function rearCanopy(ctx, r) {
	const g = ctx.createRadialGradient(
		-r * 0.12, -r * 0.38, 0, 0, -r * 0.24, r * 0.38)
	g.addColorStop(0, '#cdf6ff')
	g.addColorStop(0.55, '#2f8fb5')
	g.addColorStop(1, '#0d2a3c')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.ellipse(
		0, -r * 0.24, r * 0.26, r * 0.17, 0, 0,
		Math.PI * 2)
	ctx.fill()
}

// Engine bells pointed at the viewer. These are the whole
// point of the rear view: a plume trailing off the tail reads
// as a ship moving across the screen, where exhaust coming
// straight at you reads as one going away from you. Kept tight
// — a wide glow just smears the two into one orange blob.
function rearEngines(ctx, r, heat) {
	for (const side of [-1, 1]) {
		ctx.save()
		ctx.translate(side * r * 0.26, r * 0.42)
		ctx.fillStyle = '#0c0f18'
		ctx.beginPath()
		ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2)
		ctx.fill()
		ctx.globalCompositeOperation = 'lighter'
		glow(
			ctx, r * (0.3 + 0.08 * heat),
			`rgba(255,248,226,${0.8 + 0.2 * heat})`,
			`rgba(255,140,50,${0.4 + 0.2 * heat})`)
		ctx.restore()
	}
}

function drawRearFrame(ctx, r, heat) {
	rearHull(ctx, r)
	ctx.save()
	ctx.clip()
	ctx.fillStyle = bodyGradient(ctx, r, REAR_PAL)
	ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4)
	specular(ctx, r, 0.5, 0.4)
	ctx.restore()
	rearHull(ctx, r)
	limbStroke(ctx, r, REAR_PAL, 1.5)
	rearFin(ctx, r)
	ctx.fillStyle = REAR_PAL.lo
	ctx.fill()
	rearFin(ctx, r)
	limbStroke(ctx, r, REAR_PAL, 1.2)
	rearCanopy(ctx, r)
	rearEngines(ctx, r, heat)
}

// Used only in the wormhole, where the camera sits behind the
// ship. Rotating this one with the bank is correct rather than
// a cheat: a roll really does turn the craft about the axis
// you are looking down, lighting and all.
export function buildShipRear() {
	const span = Math.ceil(SHIP_R * 4)
	const frames = []
	for (let i = 0; i < 6; i++) {
		const { canvas, ctx } = centred(span)
		const heat = 0.5 + 0.5 * Math.sin(
			(i / 6) * Math.PI * 2)
		drawRearFrame(ctx, SHIP_R, heat)
		frames.push(canvas)
	}
	return frames
}
