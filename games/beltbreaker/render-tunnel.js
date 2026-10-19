// Drawing for the wormhole phase. The tunnel wall is one
// pre-rendered annulus (atlas.ring) blitted at the scale each
// depth implies, which is both cheaper and steadier than
// stroking fresh arcs every frame.

import { W, H } from './common.js'
import { FOCAL, Z_FAR, Z_SHIP, TR, project } from './tunnel.js'
import { ROCK_R, frameFor } from './rocks.js'
import { FOE_R } from './craft.js'

const RINGS = 15
const SHIP_SCALE = 1.8
const SPACING = 115

function backdrop(ctx) {
	const g = ctx.createRadialGradient(
		W / 2, H / 2, 10, W / 2, H / 2, W * 0.62)
	g.addColorStop(0, '#132b52')
	g.addColorStop(0.45, '#0a1226')
	g.addColorStop(1, '#02030a')
	ctx.fillStyle = g
	ctx.fillRect(0, 0, W, H)
}

function drawRings(ctx, atlas, tn, cx, cy) {
	const img = atlas.ring
	const half = img.width / 2
	const phase = (tn.t * tn.speed) % SPACING
	ctx.globalCompositeOperation = 'lighter'
	for (let i = RINGS - 1; i >= 0; i--) {
		const z = 70 + i * SPACING + (SPACING - phase)
		const scale = (TR * (FOCAL / z)) / half
		ctx.save()
		ctx.globalAlpha = Math.min(
			1, z / 260, 1.25 - z / (Z_FAR * 1.1)) * 0.8
		ctx.translate(cx, cy)
		ctx.rotate(tn.spin + z * 0.0035)
		ctx.scale(scale, scale)
		ctx.drawImage(img, -half, -half)
		ctx.restore()
	}
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'
}

function drawStreaks(ctx, tn, cx, cy) {
	ctx.globalCompositeOperation = 'lighter'
	ctx.lineWidth = 1.4
	for (const k of tn.streaks) {
		const a = project(k, cx, cy)
		const b = project(
			{ ox: k.ox, oy: k.oy, z: k.z * 1.22 },
			cx, cy)
		ctx.strokeStyle =
			`rgba(190,225,255,${Math.min(
				0.42, 150 / k.z)})`
		ctx.beginPath()
		ctx.moveTo(a.x, a.y)
		ctx.lineTo(b.x, b.y)
		ctx.stroke()
	}
	ctx.globalCompositeOperation = 'source-over'
}

function drawObj(ctx, atlas, o, cx, cy) {
	const p = project(o, cx, cy)
	if (o.drone) {
		const frames = atlas.foe
		const img = frames[
			Math.floor(o.frame) % frames.length]
		const s = (o.r * p.s) / FOE_R
		const w = img.width * s
		ctx.drawImage(
			img, p.x - w / 2, p.y - w / 2, w, w)
		return
	}
	const frames = atlas.rocks[o.rk][o.size]
	const img = frameFor(frames, o.a)
	const s = (o.r * p.s) / (ROCK_R[o.size] * 0.88)
	const w = img.width * s
	ctx.drawImage(img, p.x - w / 2, p.y - w / 2, w, w)
}

function drawTShots(ctx, atlas, tn, cx, cy) {
	ctx.globalCompositeOperation = 'lighter'
	for (const s of tn.shots) {
		const p = project(s, cx, cy)
		const img = s.mine
			? atlas.shots.mine
			: atlas.shots.theirs
		const k = Math.max(
			0.25, Math.min(1.9, p.s * 0.4))
		const w = img.width * k
		ctx.drawImage(
			img, p.x - w / 2, p.y - w / 2, w, w)
	}
	ctx.globalCompositeOperation = 'source-over'
}

function drawTParts(ctx, atlas, tn, cx, cy) {
	ctx.globalCompositeOperation = 'lighter'
	for (const q of tn.parts) {
		const p = project(q, cx, cy)
		const k = q.t / q.life
		const i = Math.min(
			atlas.puffs.length - 1,
			Math.floor(k * atlas.puffs.length))
		const img = atlas.puffs[i]
		const w = img.width * q.scale * p.s * 0.4
		ctx.globalAlpha = Math.max(0, 1 - k) * 0.9
		ctx.drawImage(
			img, p.x - w / 2, p.y - w / 2, w, w)
	}
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'
}

// The camera in the wormhole sits behind the ship, so this
// draws the rear-view sprite rolled by the bank — not the
// top-down hull with a plume trailing off its tail, which read
// as a rocket dropping down the screen rather than as a ship
// flying away from you. The exhaust comes straight at the
// viewer instead, which is what sells the direction.
function drawTShip(ctx, atlas, tn, cx, cy) {
	const p = project(
		{ ox: tn.tx, oy: tn.ty, z: Z_SHIP }, cx, cy)
	const blink = tn.inv > 0
		? 0.45 + 0.55 * Math.abs(Math.sin(tn.inv * 11))
		: 1
	const frames = atlas.shipRear
	const img = frames[
		Math.floor(tn.t * 15) % frames.length]
	const sw = img.width * SHIP_SCALE
	ctx.save()
	ctx.globalAlpha = blink
	ctx.translate(p.x, p.y)
	ctx.rotate(tn.bank * 0.55)
	ctx.drawImage(img, -sw / 2, -sw / 2, sw, sw)
	ctx.restore()
	if (tn.inv <= 0) return
	ctx.globalCompositeOperation = 'lighter'
	ctx.globalAlpha = Math.min(1, tn.inv) * 0.75
	const dw = atlas.shield.width * SHIP_SCALE
	ctx.drawImage(
		atlas.shield, p.x - dw / 2, p.y - dw / 2, dw, dw)
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'
}

function vignette(ctx) {
	const g = ctx.createRadialGradient(
		W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.72)
	g.addColorStop(0, 'rgba(0,0,0,0)')
	g.addColorStop(1, 'rgba(0,0,0,0.75)')
	ctx.fillStyle = g
	ctx.fillRect(0, 0, W, H)
}

export function drawTunnel(ctx, atlas, state) {
	const tn = state.tunnel
	backdrop(ctx)
	const sh = tn.shake
	const cx = W / 2 + (Math.random() - 0.5) * sh * 22
	const cy = H / 2 + (Math.random() - 0.5) * sh * 22
	drawRings(ctx, atlas, tn, cx, cy)
	drawStreaks(ctx, tn, cx, cy)
	const sorted = tn.objs.slice().sort((a, b) => b.z - a.z)
	for (const o of sorted) drawObj(ctx, atlas, o, cx, cy)
	drawTShots(ctx, atlas, tn, cx, cy)
	drawTParts(ctx, atlas, tn, cx, cy)
	drawTShip(ctx, atlas, tn, cx, cy)
	vignette(ctx)
}
