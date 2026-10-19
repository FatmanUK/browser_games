// Dumbfire missiles, and what being hit by one costs.
//
// The shape is Belt Breaker's pickups (common.js): a flat
// array on the state, advanced and reaped by one filter that
// also does the contact test, with the effect of collecting
// one isolated in a private function.
//
// A missile does not steer. That is the whole design: it makes
// the shot a judgement about where a car will be rather than a
// button that removes whoever is in front, and it means the
// rivals can be given one without the race becoming a lottery.

import { CAR_LENGTH } from './car.js'
import { angleDelta } from './geom.js'
import { offsetPoint, headingAt } from './path.js'

export const MAX_AMMO = 3
export const LIVES = 3

const SPEED = 420
const LIFE = 1.9
const RADIUS = 5
const RELOAD = 0.45
const PICKUP_R = 9
const PICKUP_COOL = 9
const WRECK_TIME = 2
const INVULN = 1.6
const WRECK_SPIN = 7.5

export function armCar(car) {
	car.lives = LIVES
	car.ammo = 0
	car.reload = 0
	car.wrecked = 0
	car.invuln = 0
	car.spin = 0
	car.out = false
	car.stalls = 0
	return car
}

export function createPickups(track) {
	return track.PICKUPS.map(() => 0)
}

function collect(car, fx) {
	if (car.ammo >= MAX_AMMO) return
	car.ammo++
	fx.pickup()
}

export function updatePickups(state, dt, fx) {
	const pts = state.track.PICKUPS
	const cars = [state, ...state.rivals]
	for (let i = 0; i < pts.length; i++) {
		if (state.pickups[i] > 0) {
			state.pickups[i] -= dt
			continue
		}
		for (const car of cars) {
			if (car.out || car.wrecked > 0) continue
			const d = Math.hypot(
				car.x - pts[i].x, car.y - pts[i].y)
			if (d > PICKUP_R + CAR_LENGTH / 2) continue
			collect(car, car === state ? fx : silent)
			state.pickups[i] = PICKUP_COOL
			break
		}
	}
}

const silent = new Proxy({}, { get: () => () => {} })

export function canFire(car) {
	return car.ammo > 0 && car.reload <= 0 &&
		!car.out && car.wrecked <= 0
}

export function fire(state, car, fx) {
	if (!canFire(car)) return false
	car.ammo--
	car.reload = RELOAD
	const nose = CAR_LENGTH * 0.6
	state.missiles.push({
		x: car.x + Math.cos(car.angle) * nose,
		y: car.y + Math.sin(car.angle) * nose,
		vx: Math.cos(car.angle) * SPEED,
		vy: Math.sin(car.angle) * SPEED,
		t: 0,
		owner: car,
	})
	fx.missile()
	return true
}

// Guarded the way Belt Breaker's killShip is: two missiles
// arriving in the same volley must cost one life, not two.
export function wreck(car, fx) {
	if (car.wrecked > 0 || car.invuln > 0 || car.out) return
	car.lives--
	car.wrecked = WRECK_TIME
	car.speed = 0
	car.spin = (Math.random() < 0.5 ? -1 : 1) * WRECK_SPIN
	car.ammo = 0
	if (car.lives <= 0) car.out = true
	fx.wreck()
}

function respawn(track, car) {
	const s = track.GATES[car.lastGate || 0]
	const p = offsetPoint(track, s, 0)
	car.x = p.x
	car.y = p.y
	car.s = s
	car.off = 0
	// Reseeded explicitly, not left to locate(): a respawn is
	// a teleport, and the windowed search would hold on to
	// wherever the wreck happened to stop.
	car.gateAt = s
	car.angle = headingAt(track, s)
	car.facing = car.angle
	car.speed = 0
	car.spin = 0
	car.invuln = INVULN
}

// A wrecked car spins where it stopped, then comes back at the
// gate it last went through. Its collected gates and its laps
// are kept: the ones before the crash were earned, and taking
// them away would be harsher than losing the life already is.
export function updateWrecks(state, dt) {
	for (const car of [state, ...state.rivals]) {
		if (car.invuln > 0) car.invuln -= dt
		if (car.reload > 0) car.reload -= dt
		if (car.wrecked <= 0) continue
		car.wrecked -= dt
		car.facing += car.spin * dt
		if (car.out) continue
		if (car.wrecked <= 0) respawn(state.track, car)
	}
}

function hits(m, car) {
	if (car === m.owner || car.out) return false
	if (car.wrecked > 0 || car.invuln > 0) return false
	const d = Math.hypot(m.x - car.x, m.y - car.y)
	return d <= RADIUS + CAR_LENGTH / 2
}

export function updateMissiles(state, dt, fx) {
	const cars = [state, ...state.rivals]
	state.missiles = state.missiles.filter((m) => {
		m.t += dt
		m.x += m.vx * dt
		m.y += m.vy * dt
		for (const car of cars) {
			if (!hits(m, car)) continue
			wreck(car, car === state ? fx : fx)
			return false
		}
		for (const o of state.track.HARD_OBSTACLES) {
			const d = Math.hypot(m.x - o.x, m.y - o.y)
			if (d <= o.r + RADIUS) return false
		}
		return m.t < LIFE
	})
}

// A rival fires when a car is in a narrow cone ahead and close
// enough that a straight shot has a chance. `nerve` is how
// willing it is; nothing else about the AI changes.
const CONE = 0.22
const RANGE = 170

export function rivalsFire(state, dt, fx) {
	const cars = [state, ...state.rivals]
	for (const r of state.rivals) {
		if (!canFire(r)) continue
		if (Math.random() > r.skill.nerve * dt * 3) continue
		for (const car of cars) {
			if (car === r || car.out) continue
			const dx = car.x - r.x, dy = car.y - r.y
			const d = Math.hypot(dx, dy)
			if (d > RANGE) continue
			const off = Math.abs(angleDelta(
				r.angle, Math.atan2(dy, dx)))
			if (off > CONE) continue
			fire(state, r, fx)
			break
		}
	}
}
