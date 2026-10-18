// The belt phase: classic free-flight rock clearing on a
// wrapping field. Clearing every rock ends the phase and hands
// over to the wormhole (see world.js for the level flow).

import {
	W, H, KINDS, SHIP, SHOT, rockRadius, wrap, near,
	driveShip, fire, updateShots, burst, updateParts,
	updateRespawn, killShip, addScore,
} from './common.js'

// Gold and red thin out the silver as levels climb, so a late
// belt is slower to chew through and faster to get hit by.
function pickKind(level) {
	const roll = Math.random()
	const gold = 0.13 + Math.min(0.2, level * 0.03)
	const red = 0.08 + Math.min(0.26, level * 0.05)
	if (roll < red) return 'red'
	if (roll < red + gold) return 'gold'
	return 'silver'
}

export function makeRock(level, kind, size, x, y) {
	const k = KINDS[kind]
	const base = 24 + Math.random() * 30 + level * 4
	const sp = base * k.speed * (1 + (2 - size) * 0.28)
	const a = Math.random() * Math.PI * 2
	return {
		x, y,
		vx: Math.cos(a) * sp,
		vy: Math.sin(a) * sp,
		kind, size, hp: k.hp[size],
		a: Math.random() * Math.PI * 2,
		spin: (Math.random() - 0.5) * 2.6 * k.speed,
	}
}

// Never drop a fresh rock on top of the ship: the player has no
// way to react to one that spawns already overlapping.
function safeSpot(ship) {
	for (let i = 0; i < 40; i++) {
		const x = Math.random() * W
		const y = Math.random() * H
		if (!near({ x, y }, ship, 190)) return { x, y }
	}
	return { x: 20, y: 20 }
}

export function spawnBelt(state) {
	const n = 3 + Math.min(9, state.level)
	state.rocks = []
	for (let i = 0; i < n; i++) {
		const { x, y } = safeSpot(state.ship)
		state.rocks.push(
			makeRock(
				state.level, pickKind(state.level),
				2, x, y))
	}
}

function splitRock(state, rock) {
	const k = KINDS[rock.kind]
	if (rock.size === 0) return
	for (let i = 0; i < k.split; i++) {
		state.rocks.push(
			makeRock(
				state.level, rock.kind,
				rock.size - 1, rock.x, rock.y))
	}
}

export function destroyRock(state, rock, fx) {
	const k = KINDS[rock.kind]
	addScore(state, k.score * (3 - rock.size), fx)
	burst(
		state, rock.x, rock.y, 8 + rock.size * 7,
		0.6 + rock.size * 0.4)
	splitRock(state, rock)
	fx.rockBreak(rock.size, rock.kind)
	const i = state.rocks.indexOf(rock)
	if (i >= 0) state.rocks.splice(i, 1)
}

export function hitRock(state, rock, fx, damage) {
	rock.hp -= damage
	if (rock.hp > 0) {
		fx.rockClang()
		burst(state, rock.x, rock.y, 4, 0.4)
		return false
	}
	destroyRock(state, rock, fx)
	return true
}

export function moveRocks(state, dt) {
	for (const r of state.rocks) {
		r.x += r.vx * dt
		r.y += r.vy * dt
		r.a += r.spin * dt
		wrap(r)
	}
}

export function collideShots(state, fx) {
	for (const shot of state.shots.slice()) {
		if (shot.foe) continue
		for (const rock of state.rocks.slice()) {
			const r = rockRadius(rock.size) + SHOT.r
			if (!near(shot, rock, r)) continue
			const i = state.shots.indexOf(shot)
			if (i >= 0) state.shots.splice(i, 1)
			hitRock(state, rock, fx, 1)
			break
		}
	}
}

export function collideShip(state, fx) {
	const ship = state.ship
	if (ship.dead) return
	for (const rock of state.rocks.slice()) {
		const r = rockRadius(rock.size) + SHIP.r
		if (!near(ship, rock, r)) continue
		if (!killShip(state, fx)) return
		hitRock(state, rock, fx, rock.hp)
		return
	}
}

// Returns true once the belt is empty, which is world.js's cue
// to open the wormhole.
export function updateBelt(state, dt, fx) {
	driveShip(state.ship, state.keys, dt)
	if (state.keys.has('fire')) fire(state, fx)
	moveRocks(state, dt)
	updateShots(state, dt)
	collideShots(state, fx)
	collideShip(state, fx)
	updateParts(state, dt)
	updateRespawn(state, dt)
	return state.rocks.length === 0
}
