// The level guardian, fought after the wormhole on the same
// wrapping field as the belt. It cycles three attacks — a
// downward spread, an aimed burst, and spitting live rocks from
// its side pods — and only the exposed core takes double
// damage, so the fight rewards flying up under it.

import {
	W, SHIP, SHOT, near, driveShip, fire, updateShots,
	burst, updateParts, updateRespawn, killShip, addScore,
	foeShot,
} from './common.js'
import { BOSS_R } from './craft.js'
import {
	makeRock, moveRocks, collideShots, collideShip,
} from './belt.js'

const HULL_R = BOSS_R * 0.92
const CORE_R = BOSS_R * 0.32
const MODES = 3

export function startBoss(state) {
	// Capped: past level 8 the fight would be long rather
	// than hard, and the attacks are already escalating.
	const hp = 34 + Math.min(state.level, 8) * 16
	state.rocks = []
	state.shots = []
	state.boss = {
		x: W / 2, y: -BOSS_R, vx: 78 + state.level * 6,
		hp, max: hp, t: 0, flash: 0, core: 0,
		mode: 0, timer: 2.2, shots: 0, dying: 0,
	}
}

function moveBoss(b, dt, level) {
	b.t += dt
	b.core += dt * 5
	b.flash = Math.max(0, b.flash - dt * 5)
	const restY = 150
	if (b.y < restY) {
		b.y = Math.min(restY, b.y + 90 * dt)
		return
	}
	b.x += b.vx * dt
	const pad = BOSS_R * 1.5
	if (b.x < pad) {
		b.x = pad
		b.vx = Math.abs(b.vx)
	} else if (b.x > W - pad) {
		b.x = W - pad
		b.vx = -Math.abs(b.vx)
	}
	b.y = restY + Math.sin(b.t * 1.3) * 26
	// Winds up over the fight, but to a ceiling: an
	// unbounded ramp eventually tunnels through the walls.
	if (Math.abs(b.vx) < 230) {
		b.vx += Math.sign(b.vx) * level * 0.4 * dt
	}
}

function spread(state, fx) {
	const b = state.boss
	const n = 7
	for (let i = 0; i < n; i++) {
		const a = Math.PI * (0.22 + (0.56 * i) / (n - 1))
		foeShot(state, b.x, b.y + 30, a, 210)
	}
	fx.bossFire()
}

function aimed(state, fx) {
	const b = state.boss
	const s = state.ship
	const a = Math.atan2(s.y - b.y, s.x - b.x)
	for (let i = -1; i <= 1; i++) {
		foeShot(state, b.x, b.y + 20, a + i * 0.18, 290)
	}
	fx.bossFire()
}

function spit(state, fx) {
	const b = state.boss
	for (const side of [-1, 1]) {
		const rock = makeRock(
			state.level, side < 0 ? 'red' : 'gold', 1,
			b.x + side * BOSS_R * 1.05, b.y + 20)
		rock.vy = Math.abs(rock.vy) + 40
		state.rocks.push(rock)
	}
	fx.bossSpit()
}

function attack(state, dt, fx) {
	const b = state.boss
	if (b.y < 140) return
	b.timer -= dt
	if (b.timer > 0) return
	const rage = b.hp / b.max < 0.4 ? 0.65 : 1
	b.timer = Math.max(0.9, 2.4 - state.level * 0.08) * rage
	b.mode = (b.mode + 1) % MODES
	if (b.mode === 0) spread(state, fx)
	else if (b.mode === 1) aimed(state, fx)
	else spit(state, fx)
}

function damageBoss(state, shot, fx) {
	const b = state.boss
	const core = near(shot, b, CORE_R)
	b.hp -= core ? 2 : 1
	b.flash = 1
	burst(state, shot.x, shot.y, core ? 7 : 4, 0.5)
	if (core) fx.bossCore()
	else fx.rockClang()
}

function shotsOnBoss(state, fx) {
	const b = state.boss
	for (const shot of state.shots.slice()) {
		if (shot.foe) continue
		if (!near(shot, b, HULL_R + SHOT.r)) continue
		const i = state.shots.indexOf(shot)
		if (i >= 0) state.shots.splice(i, 1)
		damageBoss(state, shot, fx)
		if (b.hp <= 0) return
	}
}

function shotsOnShip(state, fx) {
	if (state.ship.dead) return
	for (const shot of state.shots.slice()) {
		if (!shot.foe) continue
		if (!near(shot, state.ship, SHIP.r + SHOT.r)) {
			continue
		}
		const i = state.shots.indexOf(shot)
		if (i >= 0) state.shots.splice(i, 1)
		killShip(state, fx)
		return
	}
}

function ramBoss(state, fx) {
	if (state.ship.dead) return
	if (!near(state.ship, state.boss, HULL_R + SHIP.r)) {
		return
	}
	killShip(state, fx)
	state.boss.hp -= 1
	state.boss.flash = 1
}

// Death throes: a couple of seconds of secondary explosions
// walking across the hull before the level is credited, so a
// kill lands with some weight instead of the boss just
// vanishing.
function dieBoss(state, dt, fx) {
	const b = state.boss
	b.dying += dt
	b.flash = Math.max(0, b.flash - dt * 4)
	if (Math.random() < dt * 14) {
		const a = Math.random() * Math.PI * 2
		const d = Math.random() * BOSS_R
		burst(
			state, b.x + Math.cos(a) * d,
			b.y + Math.sin(a) * d, 10, 1.1)
		fx.bossHit()
	}
	if (b.dying < 1.9) return false
	burst(state, b.x, b.y, 60, 2.2)
	addScore(state, 800 + state.level * 250, fx)
	fx.bossDie()
	return true
}

// Returns true once the guardian is finished, which is
// world.js's cue to move the player on a level.
export function updateBoss(state, dt, fx) {
	const b = state.boss
	driveShip(state.ship, state.keys, dt)
	if (state.keys.has('fire')) fire(state, fx)
	moveRocks(state, dt)
	updateShots(state, dt)
	updateParts(state, dt)
	updateRespawn(state, dt)
	if (b.hp <= 0) {
		state.shots = state.shots.filter((s) => !s.foe)
		return dieBoss(state, dt, fx)
	}
	moveBoss(b, dt, state.level)
	attack(state, dt, fx)
	collideShots(state, fx)
	collideShip(state, fx)
	shotsOnBoss(state, fx)
	shotsOnShip(state, fx)
	ramBoss(state, fx)
	return false
}
