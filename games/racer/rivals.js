// The rest of the field. Dash's track data has always carried a
// six-slot starting grid and the game only ever used the pole,
// so there was a grid but no race. These are the other five.
//
// A rival does not follow a baked racing line. The track is
// angle-indexed (see geom.js), so it steers at a point a
// speed-scaled angular lookahead further round the lap, on its
// own lane across the road band, and brakes for however sharp
// that turn comes out. That keeps the AI on a regenerated
// track with no extra data, and it makes mistakes in the right
// places: carrying too much speed into a corner costs a rival
// the same understeer it costs the player.

import {
	CAR_LENGTH, CAR_WIDTH, ACCEL, BRAKE, MAX_SPEED, TURN_RATE,
	FRICTION, RIVALS,
} from './car.js'
import {
	angleOf, angleDelta, trackBandPoint, bandFrac,
} from './geom.js'

export const RIVAL_COUNT = RIVALS.length

// Lookahead in radians: a fixed minimum so a stopped car still
// has something to aim at, plus a speed term so a fast car
// looks further into the corner it is about to arrive in.
const LOOK_BASE = 0.035
const LOOK_PER_SPEED = 0.00042

// How far off the aiming point a rival will tolerate before it
// is braking rather than steering. At FULL_SHARP it wants to be
// at CORNER_SPEED; below that it scales between the two.
const FULL_SHARP = 0.55
const CORNER_SPEED = 0.42

export function createRivals(track) {
	return RIVALS.map((driver, i) => {
		const slot = track.GRID_SLOTS[i + 1]
		return {
			x: slot.x,
			y: slot.y,
			angle: slot.angle,
			facing: slot.angle,
			speed: 0,
			name: driver.name,
			lane: driver.lane,
			skill: {
				pace: driver.skill,
				nerve: driver.nerve,
			},
			colours: driver.colours,
			totalAngle: 0,
			finished: false,
		}
	})
}

// Where this rival wants to be pointing: at its lane, a
// lookahead further round the lap in the direction of travel.
function aimAngle(track, rival) {
	const here = angleOf(rival.x, rival.y)
	const look = LOOK_BASE +
		Math.abs(rival.speed) * LOOK_PER_SPEED
	const target = trackBandPoint(
		track, here + track.TRAVEL_DIR * look, rival.lane)
	return Math.atan2(target.y - rival.y, target.x - rival.x)
}

// Pace for how hard the car is having to turn. A rival that has
// been pushed off its line wants the corner speed too, which is
// what makes a nudge from behind actually cost it something.
function wantedSpeed(rival, sharp, drag) {
	const k = Math.min(1, sharp / FULL_SHARP)
	const pace = 1 - (1 - CORNER_SPEED) * k
	const wet = drag > 1 ? 0.5 : 1
	return MAX_SPEED * rival.skill.pace * pace * wet
}

function steer(rival, dt, sharp, aim) {
	const turn = TURN_RATE * dt * Math.sign(rival.speed || 1)
	const step = Math.min(sharp, turn)
	rival.angle += Math.sign(
		angleDelta(rival.angle, aim)) * step
	rival.facing = rival.angle
}

function drive(track, rival, dt, drag) {
	const aim = aimAngle(track, rival)
	const sharp = Math.abs(angleDelta(rival.angle, aim))
	const want = wantedSpeed(rival, sharp, drag)
	if (rival.speed < want) rival.speed += ACCEL * dt
	else rival.speed -= BRAKE * dt
	rival.speed -= rival.speed * drag * dt
	rival.speed = Math.max(0, Math.min(MAX_SPEED, rival.speed))
	steer(rival, dt, sharp, aim)
}

// Rivals take the same hazard drag the player does.
function dragFor(track, terrain, x, y) {
	if (terrain === 'sand') return 3.2
	if (terrain === 'water') return 2.5
	const frac = bandFrac(track, x, y)
	return frac < 0 || frac > 1 ? FRICTION * 2.2 : FRICTION
}

// A rival that has wandered off the road is steered back by its
// own lookahead, but an obstacle would hold it there forever,
// so it gets the player's collision response minus the bounce.
function clearObstacles(track, rival) {
	for (const o of track.HARD_OBSTACLES) {
		const dx = rival.x - o.x
		const dy = rival.y - o.y
		const dist = Math.hypot(dx, dy)
		const min = o.r + CAR_LENGTH / 2
		if (dist >= min || dist === 0) continue
		const n = Math.atan2(dy, dx)
		rival.x = o.x + Math.cos(n) * min
		rival.y = o.y + Math.sin(n) * min
		rival.speed *= 0.3
	}
}

function integrate(track, rival, dt) {
	const prev = angleOf(rival.x, rival.y)
	rival.x += Math.cos(rival.angle) * rival.speed * dt
	rival.y += Math.sin(rival.angle) * rival.speed * dt
	clearObstacles(track, rival)
	rival.totalAngle += angleDelta(
		prev, angleOf(rival.x, rival.y))
}

export function updateRivals(track, rivals, dt, terrainOf) {
	for (const rival of rivals) {
		if (rival.finished) {
			rival.speed -= rival.speed * 2 * dt
			integrate(track, rival, dt)
			continue
		}
		const drag = dragFor(
			track, terrainOf(rival.x, rival.y),
			rival.x, rival.y)
		drive(track, rival, dt, drag)
		integrate(track, rival, dt)
	}
}

// Car-to-car contact, resolved as two equal discs: both get
// pushed clear and both lose speed, so leaning on a rival
// through a corner is a trade rather than a free pass.
const CONTACT_LOSS = 0.82

function bumpApart(a, b) {
	const dx = b.x - a.x
	const dy = b.y - a.y
	const dist = Math.hypot(dx, dy)
	if (dist >= CAR_LENGTH || dist === 0) return false
	const push = (CAR_LENGTH - dist) / 2
	const nx = dx / dist
	const ny = dy / dist
	a.x -= nx * push
	a.y -= ny * push
	b.x += nx * push
	b.y += ny * push
	a.speed *= CONTACT_LOSS
	b.speed *= CONTACT_LOSS
	return true
}

// Returns true if the player was in any of the contacts, so the
// caller can make the bump noise it already makes for walls.
export function resolveContacts(player, rivals) {
	let hitPlayer = false
	for (let i = 0; i < rivals.length; i++) {
		if (bumpApart(player, rivals[i])) hitPlayer = true
		for (let j = i + 1; j < rivals.length; j++) {
			bumpApart(rivals[i], rivals[j])
		}
	}
	return hitPlayer
}

// The draw function is passed in rather than imported: the
// sprite blit lives in game.js with the rest of the drawing,
// and rivals.js importing it back would be a cycle.
export function drawRivals(ctx, rivals, drawOne) {
	for (const rival of rivals) {
		drawOne(ctx, rival, rival.colours)
	}
}

// Lamps, drawn after the dusk pass rather than with the car, so
// a rival outside the player's headlights is still something
// you can see coming. Lights are emissive; dimming them with
// the scenery would be the one wrong answer.
//
// They are deliberately small — a lamp wide enough to cover the
// car it belongs to stops reading as a light and starts reading
// as a glowing smear with no car in it. The point is a dim shape
// with two bright points on it, not a blob.
function lamp(ctx, x, y, r, colour) {
	const g = ctx.createRadialGradient(x, y, 0, x, y, r)
	g.addColorStop(0, colour)
	g.addColorStop(0.35, colour)
	g.addColorStop(1, 'rgba(0, 0, 0, 0)')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(x, y, r, 0, Math.PI * 2)
	ctx.fill()
}

const TAIL = 'rgba(255, 46, 30, 0.5)'
const HEAD = 'rgba(255, 240, 200, 0.4)'
const TAIL_R = 3.4
const HEAD_R = 4.2

// Across the car, not along it: two lamps a car-width apart
// read as a car at a glance, where one lamp reads as a dot.
export function drawRivalLights(ctx, rivals) {
	const half = CAR_LENGTH / 2
	const side = CAR_WIDTH / 2 - 1
	for (const rival of rivals) {
		const cos = Math.cos(rival.facing)
		const sin = Math.sin(rival.facing)
		for (const s of [-side, side]) {
			lamp(
				ctx, rival.x - cos * half - sin * s,
				rival.y - sin * half + cos * s,
				TAIL_R, TAIL)
			lamp(
				ctx, rival.x + cos * half - sin * s,
				rival.y + sin * half + cos * s,
				HEAD_R, HEAD)
		}
	}
}
