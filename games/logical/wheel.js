// What a wheel does: turn, decide whether a marble arriving at
// a run mouth gets in, and decide whether what it is holding
// breaks it.
//
// A wheel's rotation is one float, `turns`, counting quarter
// turns. Slot k faces world direction (k + turns) mod 4, which
// means rotating never permutes the slots array — a marble
// seated in slot 2 stays in slot 2 and the picture moves
// around it. Permuting the array instead was the obvious way
// and is a trap: every marble would then change slot index
// four times a revolution, and anything holding on to a slot
// index would be holding the wrong one.

import { WHEEL_R, MARBLE_R, slotsFull } from './board.js'

// A quarter turn in 0.69s. The rules ask for a slow rotate and
// the first cut at 1.1 was slower still, but processing one
// gutter marble costs a turn before anything can be fired, so
// the turn sets the pace of the whole game and 0.91s made it
// drag. Still slow enough that a rotation started as a marble
// leaves the far wheel can have the body facing the mouth by
// the time it arrives.
export const ROT_RATE = 1.45

// Measured off the rim, not the slot centre. The rim is where
// a marble crosses from pipe into wheel, so the rim is where
// the clearance belongs. Off the slot centre (radius 29) the
// same sum gives a 55-degree opening — wider than the solid
// body between slots, which inverts the whole feel by making
// the slot the big target and the body the small one.
const CLEAR = 2
const TOL = Math.asin((MARBLE_R + CLEAR) / WHEEL_R)
	/ (Math.PI / 2)

// Which leaves, per quarter turn: about 34 degrees of slot and
// 56 of body, so 0.26s in which a marble gets in against 0.43s
// in which it bounces off. The body is the easier target,
// which is right — bouncing off it is the skill the rules
// single out.
export const SLOT_TOL = TOL

function wrap4(x) {
	return ((x % 4) + 4) % 4
}

// How far the nearest slot is from facing dir, in quarter
// turns, signed, in (-0.5, 0.5]. Half a quarter turn is the
// exact midpoint of the body between two slots.
export function offsetTo(wheel, dir) {
	const x = wrap4(dir - wheel.turns)
	const k = Math.round(x)
	return { slot: wrap4(k), off: x - k }
}

// The one alignment test. Firing and arrival both go through
// it, because two of them is how you end up able to fire into
// a mouth you cannot receive from.
export function alignedSlot(wheel, dir) {
	const { slot, off } = offsetTo(wheel, dir)
	if (Math.abs(off) > SLOT_TOL) return -1
	return slot
}

export function isTurning(wheel) {
	return wheel.turns !== wheel.target
}

// Up to three quarter turns may be queued. Waiting 0.91s per
// click to get a wheel three quarters round is miserable, and
// three clicks landing as one long sweep reads well.
export function nudge(wheel) {
	if (wheel.target - wheel.turns >= 2.9) return false
	wheel.target = isTurning(wheel)
		? wheel.target + 1
		: Math.floor(wheel.turns) + 1
	return true
}

export function stepWheel(wheel, dt) {
	if (!isTurning(wheel)) return false
	wheel.turns = Math.min(
		wheel.target, wheel.turns + ROT_RATE * dt)
	const done = !isTurning(wheel)
	if (wheel.turns >= 4) {
		wheel.turns -= 4
		wheel.target -= 4
	}
	return done
}

function monochrome(wheel) {
	const first = wheel.slots[0]
	return wheel.slots.every((s) => s === first)
}

// Strict orientation, as the owner asked: the pattern says
// which colour belongs at which compass point, and the wheel
// has to be turned so that it does. Only meaningful with the
// wheel settled — mid-rotation it is not facing anything.
function matchesPattern(wheel, pattern) {
	if (isTurning(wheel)) return false
	const spin = wrap4(Math.round(wheel.turns))
	for (let k = 0; k < 4; k++) {
		if (wheel.slots[k] !== pattern[wrap4(k + spin)]) {
			return false
		}
	}
	return true
}

// One predicate, and the lit pattern is a change of what it
// compares against rather than a branch somewhere else. While
// the grid is lit the ordinary colour match is off in every
// wheel on the board, which is the whole weight of it.
export function breaks(wheel, pattern) {
	if (!slotsFull(wheel)) return false
	if (pattern) return matchesPattern(wheel, pattern)
	return monochrome(wheel)
}
