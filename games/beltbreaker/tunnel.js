// The wormhole phase that follows each cleared belt: a zooming
// tunnel flown from behind the ship, with rocks and drones
// rushing out of the vanishing point.
//
// Everything here lives in tunnel space — an (ox, oy) offset in
// world units plus a depth z — and is projected to the screen
// with a single focal length. Objects keep their offset as they
// close, so they fan outward from the centre as they approach,
// which is what makes the zoom read as depth rather than as
// things merely growing.

import { W, H, KINDS, addScore } from './common.js'

export const FOCAL = 420
export const Z_FAR = 1500
export const Z_SHIP = 90
const Z_GONE = 52
export const TR = 108
const ACC = 460
const MAX_V = 200
const DRAG = 3.6
const SHOT_V = 1500

// How far the ship may stray, in tunnel units, before it would
// leave the screen. The field is much wider than it is tall, so
// this is an ellipse rather than the tunnel's own circle —
// clamping to a circle would let the ship fly off the top.
const SCALE = FOCAL / Z_SHIP
export const LIM_X = (W / 2 - 34) / SCALE
export const LIM_Y = (H / 2 - 30) / SCALE
const ASPECT = LIM_Y / LIM_X

export function project(o, cx, cy) {
	const s = FOCAL / o.z
	return { x: cx + o.ox * s, y: cy + o.oy * s, s }
}

export function startTunnel(state) {
	state.tunnel = {
		t: 0,
		dur: 17 + state.level * 2,
		speed: 400 + state.level * 45,
		objs: [], shots: [], parts: [],
		tx: 0, ty: 0, vx: 0, vy: 0,
		bank: 0, cool: 0, inv: 1.2, spawn: 0.7,
		spin: 0, shake: 0,
		streaks: newStreaks(),
	}
}

// Warp streaks are just points on the tunnel wall flowing past
// at speed; drawn as the line between their position now and a
// little further out, they read as motion blur.
function newStreaks() {
	const out = []
	for (let i = 0; i < 80; i++) {
		const at = radial(TR)
		out.push({
			ox: at.ox, oy: at.oy,
			z: 60 + Math.random() * Z_FAR,
		})
	}
	return out
}

export function radial(r) {
	const a = Math.random() * Math.PI * 2
	const d = Math.sqrt(Math.random()) * r
	return { ox: Math.cos(a) * d, oy: Math.sin(a) * d }
}

// Traffic spreads to the ellipse the ship flies in, stretched
// a little vertically so some still passes over and under
// rather than every rock arriving on the same line. The wall
// streaks keep the circle — that is the tube itself.
function spawnSpot() {
	const at = radial(LIM_X * 0.96)
	return { ox: at.ox, oy: at.oy * ASPECT * 1.55 }
}

function tburst(tn, o, count, scale) {
	for (let i = 0; i < count; i++) {
		const a = Math.random() * Math.PI * 2
		const sp = (10 + Math.random() * 40) * scale
		tn.parts.push({
			ox: o.ox, oy: o.oy, z: o.z,
			vx: Math.cos(a) * sp,
			vy: Math.sin(a) * sp,
			t: 0,
			life: 0.4 + Math.random() * 0.5,
			scale: scale * (0.4 + Math.random() * 0.7),
		})
	}
}

function kindFor(level) {
	const roll = Math.random()
	if (roll < 0.12 + level * 0.04) return 'red'
	if (roll < 0.34) return 'gold'
	return 'silver'
}

function spawnObj(state) {
	const tn = state.tunnel
	const at = spawnSpot()
	if (Math.random() < 0.26 + state.level * 0.02) {
		tn.objs.push({
			drone: true, ox: at.ox, oy: at.oy,
			z: Z_FAR, r: 13, hp: 2,
			cool: 0.9 + Math.random(), frame: 0,
		})
		return
	}
	const size = Math.random() < 0.4 ? 2 : 1
	const rk = kindFor(state.level)
	tn.objs.push({
		drone: false, ox: at.ox, oy: at.oy, z: Z_FAR,
		r: [7, 14, 22][size], rk, size,
		hp: KINDS[rk].hp[size],
		a: Math.random() * 6.28,
		spin: (Math.random() - 0.5) * 3,
	})
}

function steer(tn, keys, dt) {
	let ax = 0
	let ay = 0
	if (keys.has('left')) ax -= 1
	if (keys.has('right')) ax += 1
	if (keys.has('thrust')) ay -= 1
	if (keys.has('down')) ay += 1
	tn.vx += ax * ACC * dt
	tn.vy += ay * ACC * dt
	const drag = Math.max(0, 1 - DRAG * dt)
	tn.vx *= drag
	tn.vy *= drag
	tn.vx = Math.max(-MAX_V, Math.min(MAX_V, tn.vx))
	tn.vy = Math.max(-MAX_V, Math.min(MAX_V, tn.vy))
	tn.tx += tn.vx * dt
	tn.ty += tn.vy * dt
	const d = Math.hypot(tn.tx / LIM_X, tn.ty / LIM_Y)
	if (d > 1) {
		tn.tx /= d
		tn.ty /= d
	}
	tn.bank += (tn.vx / MAX_V * 0.5 - tn.bank) * dt * 6
}

function tfire(state, fx) {
	const tn = state.tunnel
	if (tn.cool > 0) return
	tn.cool = 0.17
	tn.shots.push({
		ox: tn.tx, oy: tn.ty, z: Z_SHIP + 10, mine: true,
	})
	fx.shoot()
}

function droneFire(state, o, fx) {
	const tn = state.tunnel
	o.cool = 1.1 + Math.random() * 1.2
	tn.shots.push({
		ox: tn.tx, oy: tn.ty, z: o.z, mine: false,
	})
	fx.foeShoot()
}

function moveObjs(state, dt, fx) {
	const tn = state.tunnel
	tn.objs = tn.objs.filter((o) => {
		o.z -= tn.speed * dt
		if (o.drone) {
			o.frame += dt * 9
			o.ox += (tn.tx - o.ox) * dt * 0.5
			o.oy += (tn.ty - o.oy) * dt * 0.5
			o.cool -= dt
			if (o.cool <= 0 && o.z > Z_SHIP + 120) {
				droneFire(state, o, fx)
			}
		} else {
			o.a += o.spin * dt
		}
		return o.z > Z_GONE
	})
}

function moveShots(tn, dt) {
	tn.shots = tn.shots.filter((s) => {
		s.z += (s.mine ? SHOT_V : -SHOT_V * 0.55) * dt
		return s.z > Z_GONE - 20 && s.z < Z_FAR
	})
}

function moveStreaks(tn, dt) {
	for (const k of tn.streaks) {
		k.z -= tn.speed * 1.25 * dt
		if (k.z > 50) continue
		k.z += Z_FAR
		const at = radial(TR)
		k.ox = at.ox
		k.oy = at.oy
	}
}

function moveParts(tn, dt) {
	tn.parts = tn.parts.filter((p) => {
		p.t += dt
		p.z -= tn.speed * dt
		p.ox += p.vx * dt
		p.oy += p.vy * dt
		return p.t < p.life && p.z > Z_GONE - 30
	})
}

function off(a, b) {
	return Math.hypot(a.ox - b.ox, a.oy - b.oy)
}

function killObj(state, o, fx) {
	const tn = state.tunnel
	tburst(tn, o, o.drone ? 12 : 10, o.drone ? 1 : 0.9)
	if (o.drone) {
		addScore(state, 150, fx)
		fx.foeDie()
	} else {
		addScore(state, KINDS[o.rk].score * 2, fx)
		fx.rockBreak(o.size, o.rk)
	}
	const i = tn.objs.indexOf(o)
	if (i >= 0) tn.objs.splice(i, 1)
}

function hitObjs(state, fx) {
	const tn = state.tunnel
	for (const s of tn.shots.slice()) {
		if (!s.mine) continue
		for (const o of tn.objs.slice()) {
			if (Math.abs(o.z - s.z) > 80) continue
			if (off(o, s) > o.r + 12) continue
			const i = tn.shots.indexOf(s)
			if (i >= 0) tn.shots.splice(i, 1)
			o.hp -= 1
			if (o.hp <= 0) killObj(state, o, fx)
			else fx.rockClang()
			break
		}
	}
}

function hurt(state, fx) {
	const tn = state.tunnel
	if (tn.inv > 0) return
	tn.inv = 2
	tn.shake = 1
	state.lives -= 1
	tburst(tn, { ox: tn.tx, oy: tn.ty, z: Z_SHIP }, 22, 1.4)
	fx.shipDie()
	if (state.lives <= 0) state.over = true
}

function hitShip(state, fx) {
	const tn = state.tunnel
	const me = { ox: tn.tx, oy: tn.ty }
	for (const o of tn.objs.slice()) {
		if (o.z > Z_SHIP) continue
		if (off(o, me) > o.r + 13) continue
		killObj(state, o, fx)
		hurt(state, fx)
		return
	}
	for (const s of tn.shots.slice()) {
		if (s.mine || s.z > Z_SHIP) continue
		if (off(s, me) > 17) continue
		const i = tn.shots.indexOf(s)
		if (i >= 0) tn.shots.splice(i, 1)
		hurt(state, fx)
		return
	}
}

// Returns true when the ship comes out the far side, which is
// world.js's cue to start the boss.
export function updateTunnel(state, dt, fx) {
	const tn = state.tunnel
	tn.t += dt
	tn.spin += dt * 0.5
	tn.cool = Math.max(0, tn.cool - dt)
	tn.inv = Math.max(0, tn.inv - dt)
	tn.shake = Math.max(0, tn.shake - dt * 2.5)
	tn.spawn -= dt
	if (tn.spawn <= 0 && tn.t < tn.dur - 2) {
		tn.spawn = Math.max(
			0.34, 0.92 - state.level * 0.05)
		spawnObj(state)
	}
	steer(tn, state.keys, dt)
	if (state.keys.has('fire')) tfire(state, fx)
	moveObjs(state, dt, fx)
	moveShots(tn, dt)
	moveParts(tn, dt)
	moveStreaks(tn, dt)
	hitObjs(state, fx)
	hitShip(state, fx)
	return tn.t >= tn.dur && tn.objs.length === 0
}
