// Going over the flyover.
//
// A track that crosses over itself has one branch on the
// ground and one in the air, and the one in the air has to be
// jumped: there is no road under the car between the ramp and
// the landing, only the other branch of the lap passing
// underneath. Every car has to make every jump for its lap to
// count, which is what stops anyone driving under the bridge
// and calling it a lap.

import { deltaS, wrapS, offsetPoint } from './path.js'

// Tuned backwards from how it should look rather than from
// anything physical. Flight time is the span divided by the
// launch speed, and the lift is whatever lands the car exactly
// at the far ramp — so a car that launches always clears, and
// a slow one simply goes higher and takes longer about it. At
// a typical 180 the apex is about 14 units, which against a
// 16-unit car reads as a jump rather than as a hop or a
// moon-shot.
const GRAVITY = 100

// Below this the car does not launch at all: it stops at the
// ramp face and has to back off and come again. The jump is
// the one place on the track where arriving slowly is worse
// than arriving fast.
export const MIN_SPEED = 130

// Three failures in a row and the car is walked across with
// the gate credited anyway. A rival that cannot get up to
// speed would otherwise bounce off the ramp for ever, never
// finish, and hang the race on a lap nobody can complete.
const MAX_STALLS = 3

export function allJumps(track) {
	return (1 << track.JUMPS.length) - 1
}

function jumpAt(track, car, moved) {
	for (const j of track.JUMPS) {
		const d = deltaS(track, car.gateAt, j.s0)
		if (d > 0 && d <= moved) return j
	}
	return null
}

function launch(car, j) {
	const t = j.span / car.speed
	car.air = {
		z: 0,
		vz: (GRAVITY * t) / 2,
		ux: Math.cos(car.angle),
		uy: Math.sin(car.angle),
		speed: car.speed,
		id: j.id,
	}
}

// Stopped at the face, not bounced off it: a bounce sends the
// car back down the road it just came up and the next attempt
// starts from further away than the last.
function refuse(track, car, j) {
	car.jumpStalls = (car.jumpStalls || 0) + 1
	if (car.jumpStalls >= MAX_STALLS) {
		car.jumps |= 1 << j.id
		car.crawl = j.id
		return
	}
	const p = offsetPoint(track, j.s0 - 6, car.off)
	car.x = p.x
	car.y = p.y
	car.s = wrapS(track, j.s0 - 6)
	car.speed = 0
}

// Called with how far the car has moved along the lap this
// frame, which race.js has already worked out for the gates.
export function checkLaunch(track, car, moved) {
	if (car.air || !track.JUMPS.length) return
	if (moved <= 0 || moved > track.L / 4) return
	const j = jumpAt(track, car, moved)
	if (!j) return
	// Crawling across after three refusals: no launch, and
	// the bit is already set.
	if (car.crawl === j.id) return
	if (Math.abs(car.off) > track.halfWidth) return
	if (car.speed < MIN_SPEED) {
		refuse(track, car, j)
		return
	}
	car.jumpStalls = 0
	launch(car, j)
}

// While airborne the car is a projectile: it holds the heading
// and speed it left at. Steering in the air would let you line
// the landing up and make the jump free, and committing to it
// is the whole of what a jump asks.
export function updateAir(track, car, dt, fx) {
	const a = car.air
	if (!a) return false
	a.z += a.vz * dt
	a.vz -= GRAVITY * dt
	car.x += a.ux * a.speed * dt
	car.y += a.uy * a.speed * dt
	if (a.z > 0) return true
	car.air = null
	car.jumps |= 1 << a.id
	car.crawl = null
	if (fx) fx.land()
	return false
}

export function isAirborne(car) {
	return !!car.air
}

// How high to draw it, and how much bigger. A shadow left on
// the ground at the car's own position is what makes the
// height read at all from directly above.
export function airLift(car) {
	return car.air ? car.air.z : 0
}
