// Rubber and scorch: what the cars leave on the tarmac.
//
// Both kinds are the same thing — a mark in world coordinates
// with a life on it, drawn under the cars — so they share one
// list and one reaper, the way Belt Breaker's pickups do.
//
// Nothing here reads the controls. A tyre mark is laid from
// how much the car's speed actually changed this frame, which
// is the one measurement the player and the rivals both have:
// the player's throttle is a set of held keys and a rival's is
// a target speed, and asking the question twice in two
// different ways would mean two answers that can disagree.

import { CAR_LENGTH, CAR_WIDTH } from './car.js'
import { isAirborne } from './jump.js'
import { onRoad } from './path.js'

// The speed change, per second, that scrubs a tyre. Braking
// is 260 and so always counts; accelerating is 220 less the
// drag, which only clears this below about 50 — so pulling
// away hard marks the road and holding the throttle down on a
// straight does not.
const SCRUB = 190

// Below this a car is not going fast enough to scrub anything,
// however hard it is trying.
const MIN_SPEED = 12

// The rate is smoothed over about a tenth of a second rather
// than read off a single frame, and that is not a polish
// detail — one frame cannot tell the two cases apart.
//
// A rival holds its target speed with a bang-bang controller:
// one frame of brake, one frame of throttle, forever. Read per
// frame, it is over the braking threshold half the time
// everywhere on the track, so either the rivals leave nothing
// (a trail dropped and restarted every frame never travels the
// few units it takes to lay a segment) or, once allowed to
// persist between frames, they leave rubber 97% of the time
// and the track is black. Averaged, the alternation cancels to
// about the drag and only a real stretch of braking shows.
//
// It is also what a tyre does: rubber already down does not
// vanish the instant the wheel grips again.
const TAU = 0.1

// A new pair of segments every few units rather than every
// frame. At top speed a frame is under four units, so per-frame
// segments would overlap into a solid smear and cost sixty list
// entries a second per car.
const STEP = 4

// Further than a frame's travel means the car did not drive
// there: it was respawned, dropped off a ramp, or the level was
// restarted. A segment from where it was to where it is now
// would stripe the mark clean across the map.
const TELEPORT = 10

// Drawn from here rather than from render.js: how big a
// crater is belongs with the crater.
export const BLAST_R = 13

const RUBBER_LIFE = 7
const BLAST_LIFE = 22
const MAX_RUBBER = 640
const MAX_BLASTS = 24

export function createMarks() {
	return { rubber: [], blasts: [] }
}

// A car arrives here from the grid with none of the scrub
// bookkeeping on it, and the rate has to be a number before
// anything averages into it.
export function armScrub(car) {
	car.scrubRate = 0
	car.scrubLaid = null
	return car
}

function reap(list, dt) {
	return list.filter((m) => {
		m.t -= dt
		return m.t > 0
	})
}

export function updateMarks(marks, dt) {
	marks.rubber = reap(marks.rubber, dt)
	marks.blasts = reap(marks.blasts, dt)
}

export function addBlast(marks, x, y) {
	marks.blasts.push({
		x, y, t: BLAST_LIFE, life: BLAST_LIFE,
		// Fixed per blast so the cracks do not crawl, and
		// random per blast so two craters do not match.
		turn: Math.random() * Math.PI * 2,
	})
	if (marks.blasts.length > MAX_BLASTS) marks.blasts.shift()
}

// The two rear wheels, in world coordinates. Rubber comes off
// the driven axle, so the marks are a car's width apart and
// trail from behind it rather than from under its middle.
function rearWheels(car) {
	const co = Math.cos(car.facing)
	const si = Math.sin(car.facing)
	const back = -CAR_LENGTH * 0.28
	const half = CAR_WIDTH * 0.4
	return [-1, 1].map((side) => ({
		x: car.x + co * back - si * half * side,
		y: car.y + si * back + co * half * side,
	}))
}

// An exponential average of the acceleration, which is the
// measurement everything else here is decided from.
function scrubRate(car, was, dt) {
	if (was === undefined) return
	const a = 1 - Math.exp(-dt / TAU)
	car.scrubRate += ((car.speed - was) / dt -
		car.scrubRate) * a
}

function scrubbing(track, car, was, dt) {
	if (was === undefined) return false
	if (car.out || car.wrecked > 0) return false
	// No wheels on the ground, nothing to mark the road with.
	if (isAirborne(car)) return false
	if (Math.abs(car.speed) < MIN_SPEED) return false
	// Rubber is a tarmac mark. Off the road the drag alone is
	// over the threshold, so without this every car would lay
	// a trail the whole time it was in the grass.
	if (!onRoad(track, car.off)) return false
	return Math.abs(car.scrubRate) >= SCRUB
}

function layOne(marks, track, car, dt) {
	const was = car.scrubWas
	car.scrubWas = car.speed
	scrubRate(car, was, dt)
	if (!scrubbing(track, car, was, dt)) {
		// Dropped, not kept: the next scrub has to start from
		// where the car is then, not from where it last
		// stopped scrubbing half a lap ago.
		car.scrubLaid = null
		return
	}
	const wheels = rearWheels(car)
	const from = car.scrubLaid
	if (!from) {
		car.scrubLaid = wheels
		return
	}
	const moved = Math.hypot(
		wheels[0].x - from[0].x, wheels[0].y - from[0].y)
	if (moved < STEP) return
	car.scrubLaid = wheels
	if (moved > TELEPORT) return
	for (const i of [0, 1]) {
		marks.rubber.push({
			x0: from[i].x, y0: from[i].y,
			x1: wheels[i].x, y1: wheels[i].y,
			t: RUBBER_LIFE, life: RUBBER_LIFE,
		})
	}
}

export function layRubber(marks, track, cars, dt) {
	for (const car of cars) layOne(marks, track, car, dt)
	const over = marks.rubber.length - MAX_RUBBER
	if (over > 0) marks.rubber.splice(0, over)
}
