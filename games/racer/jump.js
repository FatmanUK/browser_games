// The jumps.
//
// Where the track runs back through itself there is no bridge
// and no deck: the later branch simply stops at a ramp, and
// the road picks up again on the far side of the gap. What is
// underneath, in between, is the earlier branch of the same
// lap — real road, at the same level, going the other way.
//
// So the jump is not a gate and it is not compulsory. Arrive
// fast enough and you clear the gap and carry on. Arrive too
// slowly and you come down short, onto the road below, facing
// the wrong way round and a long stretch of lap behind where
// you were. Nothing is taken away from you; you simply have
// to drive it again.
//
// The later branch is always the one that jumps, which is
// what makes a failure a drop rather than a collision: the
// road you land on is one you have already driven, so landing
// on it costs time and nothing else.

import { deltaS, locate, headingAt } from './path.js'

// Fixed, so speed is what decides whether a car clears. The
// first version solved the lift from the launch speed, which
// meant every car that launched landed exactly on the far
// ramp — a jump nobody could fail is a bump in the road with
// extra steps.
// Raising this and the ramp's lift together makes the arc
// deeper without changing the speed needed to clear the gap:
// the flight time is the gap divided by the speed either way,
// and only the height over it changes. At 110 the apex was 9
// units against a car 16 long, which reads as a kerb rather
// than as a jump.
export const GRAVITY = 240

// How much of the car's speed the ramp turns upward, as the
// flight time it buys. Lift is set per ramp from the gap it
// has to clear, so a wider gap is a steeper ramp rather than
// an impossible one, and the speed needed to clear it is the
// same fraction of the car's top speed either way.
const CLEAR_AT = 0.72

export function liftFor(span, maxSpeed) {
	const time = span / (maxSpeed * CLEAR_AT)
	return (GRAVITY * time) / 2
}

// What clearing it actually takes, which the AI needs and the
// HUD would want if it ever showed it.
export function speedToClear(jump) {
	return (jump.span * GRAVITY) / (2 * jump.lift)
}

function launch(car, j) {
	car.air = {
		z: 0,
		vz: j.lift,
		ux: Math.cos(car.angle),
		uy: Math.sin(car.angle),
		speed: car.speed,
		id: j.id,
		from: j,
	}
}

function jumpAt(track, car, moved) {
	for (const j of track.JUMPS) {
		const d = deltaS(track, car.gateAt, j.s0)
		if (d > 0 && d <= moved) return j
	}
	return null
}

// Called with how far the car has come along the lap this
// frame, which race.js has already worked out for the gates.
export function checkLaunch(track, car, moved) {
	if (car.air || !track.JUMPS.length) return
	if (moved <= 0 || moved > track.L / 4) return
	const j = jumpAt(track, car, moved)
	if (!j) return
	// Off the road at the ramp and you miss it entirely, the
	// same as missing it would be on any other obstacle.
	if (Math.abs(car.off) > track.halfWidth) return
	launch(car, j)
}

// Airborne, a car is a projectile: it holds the heading and
// the speed it left with. Steering in the air would let you
// line the landing up and make the jump free, and committing
// to it is the whole of what a jump asks.
export function updateAir(track, car, dt, fx) {
	const a = car.air
	if (!a) return false
	a.z += a.vz * dt
	a.vz -= GRAVITY * dt
	car.x += a.ux * a.speed * dt
	car.y += a.uy * a.speed * dt
	if (a.z > 0) return true
	car.air = null
	land(track, car, a, fx)
	return false
}

// Where the car came down decides what happened. Past the far
// ramp and it made it; short of it and it is on the road
// underneath, which is a different stretch of the same lap and
// has to be found explicitly — the windowed search would still
// be looking along the branch the car launched from.
function land(track, car, a, fx) {
	const j = a.from
	const past = deltaS(track, j.s1, car.s) >= -4
	if (past) {
		if (fx) fx.land()
		return
	}
	dropThrough(track, car, a, j)
	if (fx) fx.wreck()
}

function dropThrough(track, car, a, j) {
	// Found from the under-branch's own arc length, not from
	// where the car launched: the windowed search would still
	// be looking along the branch it just left, and that
	// branch is not the one it has landed on.
	const got = locate(track, car.x, car.y, j.under)
	car.s = got.s
	car.off = got.off
	car.gateAt = got.s
	// Pointed along the road it has landed on, not along the
	// jump it failed. Keeping the flight heading looked more
	// honest and was a trap: a car that comes down across the
	// road is left facing up to 150 degrees the wrong way,
	// and on one track in forty a rival spent the rest of the
	// race driving backwards because of it. A car landing on
	// a road ends up going the way the road goes.
	car.angle = headingAt(track, got.s)
	car.facing = car.angle
	car.speed *= 0.25
	// Counted so a driver can learn from it. Nothing here
	// reads it; rivals.js does.
	car.dropped = (car.dropped || 0) + 1
}

export function isAirborne(car) {
	return !!car.air
}

export function airLift(car) {
	return car.air ? car.air.z : 0
}

