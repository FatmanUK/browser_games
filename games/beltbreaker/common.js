// Pieces every phase of Belt Breaker shares: the playfield
// size, ship flight model, shots, particles and the banner.
// Kept separate from world.js so belt.js/tunnel.js/boss.js can
// use them without importing each other in a cycle.

import { ROCK_R } from './rocks.js'

export const W = 960
export const H = 620

export const SHIP = {
	turn: 3.5, thrust: 310, drag: 0.5, max: 400,
	invuln: 3, respawn: 1.5, r: 12,
}

export const SHOT = {
	speed: 560, life: 0.85, cool: 0.15, max: 4, r: 3,
}

// Varieties differ in more than colour: gold is armoured and
// slow but scores heavily, red is brittle and fast and bursts
// into three instead of two. hp is indexed by size (0 small).
export const KINDS = {
	silver: { hp: [1, 1, 2], split: 2, speed: 1, score: 20 },
	gold: { hp: [1, 2, 3], split: 2, speed: 0.78, score: 45 },
	red: { hp: [1, 1, 1], split: 3, speed: 1.65, score: 30 },
}

// What the smallest rock of each variety leaves behind when it
// finally breaks: [what, how often]. Silver is the common one
// and drops nothing; gold pays; red arms you.
//
// The odds matter more than they look. A large red splits into
// three, and each of those into three again, so a single rock
// ends as nine fragments — at a certainty every one of them
// would drop a pod and the gun would be maxed before the first
// belt was clear.
export const DROPS = {
	silver: null,
	gold: ['cash', 0.5],
	red: ['upgrade', 0.26],
}

export const CASH_PER_COIN = 30
export const SHIP_COST = 500
export const MAX_GUN = 4
export const PICKUP_LIFE = 13
export const PICKUP_R = 13

// Barrels per gun level: [angle offset, offset across the
// hull]. Level 1 is the single forward gun you start with.
const GUNS = [
	[[0, 0]],
	[[0, -6], [0, 6]],
	[[-0.14, -7], [0, 0], [0.14, 7]],
	[[-0.21, -9], [-0.07, -3], [0.07, 3], [0.21, 9]],
]

export function rockRadius(size) {
	return ROCK_R[size] * 0.88
}

export function wrap(e) {
	e.x = ((e.x % W) + W) % W
	e.y = ((e.y % H) + H) % H
}

// Toroidal distance: without it, a rock one pixel inside the
// left edge and a shot one pixel inside the right edge would
// read as a screen apart even though they are touching.
export function near(a, b, r) {
	let dx = Math.abs(a.x - b.x)
	let dy = Math.abs(a.y - b.y)
	if (dx > W / 2) dx = W - dx
	if (dy > H / 2) dy = H - dy
	return dx * dx + dy * dy < r * r
}

export function newShip() {
	return {
		x: W / 2, y: H / 2, vx: 0, vy: 0,
		a: -Math.PI / 2, thrust: false, dead: false,
		invuln: SHIP.invuln, respawn: 0, cool: 0,
		warp: 0, flame: 0,
	}
}

function clampSpeed(e, max) {
	const sp = Math.hypot(e.vx, e.vy)
	if (sp <= max) return
	e.vx = (e.vx / sp) * max
	e.vy = (e.vy / sp) * max
}

export function driveShip(ship, keys, dt) {
	if (keys.has('left')) ship.a -= SHIP.turn * dt
	if (keys.has('right')) ship.a += SHIP.turn * dt
	ship.thrust = keys.has('thrust') && !ship.dead
	if (ship.thrust) {
		ship.vx += Math.cos(ship.a) * SHIP.thrust * dt
		ship.vy += Math.sin(ship.a) * SHIP.thrust * dt
		ship.flame += dt
	}
	const drag = Math.max(0, 1 - SHIP.drag * dt)
	ship.vx *= drag
	ship.vy *= drag
	clampSpeed(ship, SHIP.max)
	ship.x += ship.vx * dt
	ship.y += ship.vy * dt
	wrap(ship)
	ship.cool = Math.max(0, ship.cool - dt)
	ship.invuln = Math.max(0, ship.invuln - dt)
	ship.warp = Math.max(0, ship.warp - dt)
}

function emitShot(state, da, side) {
	const s = state.ship
	const a = s.a + da
	const across = s.a + Math.PI / 2
	state.shots.push({
		x: s.x + Math.cos(a) * 17 +
			Math.cos(across) * side,
		y: s.y + Math.sin(a) * 17 +
			Math.sin(across) * side,
		vx: s.vx + Math.cos(a) * SHOT.speed,
		vy: s.vy + Math.sin(a) * SHOT.speed,
		t: 0, life: SHOT.life, foe: false,
	})
}

export function fire(state, fx) {
	const s = state.ship
	if (s.dead || s.cool > 0) return
	const barrels = GUNS[state.gun - 1]
	let mine = 0
	for (const x of state.shots) if (!x.foe) mine++
	// The cap scales with the gun, or a wider spread would
	// just mean each barrel firing a third as often.
	if (mine + barrels.length > SHOT.max * state.gun) {
		return
	}
	s.cool = SHOT.cool
	for (const [da, side] of barrels) {
		emitShot(state, da, side)
	}
	fx.shoot()
}

export function foeShot(state, x, y, a, speed) {
	state.shots.push({
		x, y,
		vx: Math.cos(a) * speed,
		vy: Math.sin(a) * speed,
		t: 0, life: 2.4, foe: true,
	})
}

export function updateShots(state, dt) {
	state.shots = state.shots.filter((s) => {
		s.t += dt
		s.x += s.vx * dt
		s.y += s.vy * dt
		wrap(s)
		return s.t < s.life
	})
}

export function burst(state, x, y, count, scale) {
	for (let i = 0; i < count; i++) {
		const a = Math.random() * Math.PI * 2
		const sp = (30 + Math.random() * 150) * scale
		state.parts.push({
			x, y,
			vx: Math.cos(a) * sp,
			vy: Math.sin(a) * sp,
			t: 0,
			life: 0.45 + Math.random() * 0.6,
			scale: scale * (0.3 + Math.random() * 0.7),
		})
	}
}

export function updateParts(state, dt) {
	state.parts = state.parts.filter((p) => {
		p.t += dt
		p.x += p.vx * dt
		p.y += p.vy * dt
		p.vx *= 0.97
		p.vy *= 0.97
		return p.t < p.life
	})
}

export function banner(state, text, time) {
	state.banner = { text, t: 0, life: time }
}

export function updateBanner(state, dt) {
	if (!state.banner) return
	state.banner.t += dt
	if (state.banner.t >= state.banner.life) {
		state.banner = null
	}
}

export function addScore(state, n, fx) {
	state.score += n
	if (state.score < state.nextLife) return
	state.lives += 1
	state.nextLife += 12000
	fx.extraLife()
}

export function spawnDrop(state, rock) {
	const drop = DROPS[rock.kind]
	if (!drop || Math.random() > drop[1]) return
	state.pickups.push({
		x: rock.x, y: rock.y,
		vx: rock.vx * 0.35 + (Math.random() - 0.5) * 34,
		vy: rock.vy * 0.35 + (Math.random() - 0.5) * 34,
		kind: drop[0], t: 0, frame: Math.random() * 8,
	})
}

export function addCash(state, n, fx) {
	state.cash += n
	if (state.cash < state.nextShip) return
	state.nextShip += SHIP_COST
	state.lives += 1
	fx.extraLife()
}

function collect(state, p, fx) {
	if (p.kind === 'cash') {
		addCash(state, CASH_PER_COIN, fx)
		fx.coin()
		return
	}
	if (state.gun < MAX_GUN) {
		state.gun += 1
		fx.upgrade()
	} else {
		// Nothing left to fit: pay out instead, so a pod
		// is never a wasted pickup.
		addCash(state, CASH_PER_COIN * 4, fx)
		fx.coin()
	}
}

export function updatePickups(state, dt, fx) {
	state.pickups = state.pickups.filter((p) => {
		p.t += dt
		p.x += p.vx * dt
		p.y += p.vy * dt
		p.vx *= 0.995
		p.vy *= 0.995
		p.frame += dt * 9
		wrap(p)
		if (state.ship.dead) return p.t < PICKUP_LIFE
		if (near(p, state.ship, PICKUP_R + SHIP.r)) {
			collect(state, p, fx)
			return false
		}
		return p.t < PICKUP_LIFE
	})
}

export function killShip(state, fx) {
	const s = state.ship
	if (s.dead || s.invuln > 0) return false
	s.dead = true
	s.thrust = false
	s.respawn = SHIP.respawn
	// Losing a ship costs one level of gun, not the lot:
	// wiping the upgrades out entirely turns one mistake
	// into a spiral.
	state.gun = Math.max(1, state.gun - 1)
	state.lives -= 1
	burst(state, s.x, s.y, 30, 1.4)
	fx.shipDie()
	return true
}

// Respawning into a rock costs a life the player never had a
// chance at, so hold at the pad until the middle is clear —
// but only for so long, or a field that never clears would
// stall the game outright.
function padClear(state) {
	const mid = { x: W / 2, y: H / 2 }
	for (const r of state.rocks) {
		if (near(r, mid, rockRadius(r.size) + 80)) {
			return false
		}
	}
	return true
}

export function updateRespawn(state, dt) {
	const s = state.ship
	if (!s.dead) return
	s.respawn -= dt
	if (s.respawn > 0) return
	if (state.lives <= 0) {
		state.over = true
		return
	}
	if (s.respawn > -3 && !padClear(state)) return
	state.ship = newShip()
}

// Classic panic button: jump somewhere else on the field, with
// a short cooldown and just enough grace to not rematerialise
// inside the rock you were about to hit.
export function hyperspace(state, fx) {
	const s = state.ship
	if (s.dead || s.warp > 0) return
	burst(state, s.x, s.y, 16, 0.7)
	s.x = 50 + Math.random() * (W - 100)
	s.y = 50 + Math.random() * (H - 100)
	s.vx = 0
	s.vy = 0
	s.warp = 1.5
	s.invuln = Math.max(s.invuln, 0.6)
	burst(state, s.x, s.y, 16, 0.7)
	fx.warp()
}

export const KEY_DIRS = {
	ArrowLeft: 'left', a: 'left', A: 'left',
	ArrowRight: 'right', d: 'right', D: 'right',
	ArrowUp: 'thrust', w: 'thrust', W: 'thrust',
	' ': 'fire',
}

// The wormhole needs four-way steering, so ArrowDown/S get a
// meaning there that the belt phase simply ignores.
KEY_DIRS.ArrowDown = 'down'
KEY_DIRS.s = 'down'
KEY_DIRS.S = 'down'
