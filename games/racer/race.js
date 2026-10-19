// The race itself: a countdown on the grid, three laps, and a
// finishing place. Before this, Dash had no shape — you lapped
// a track against the clock until you stopped, which is a
// driving toy rather than the game its siblings are.

import { progressOf } from './geom.js'

export const LAP_TARGET = 3

const COUNT_FROM = 3
// How long 'GO!' stays up after the lights. The cars are
// already released; this is only the banner.
const GO_HOLD = 0.9

export function createRace() {
	return {
		phase: 'countdown',
		ready: COUNT_FROM,
		beeped: COUNT_FROM + 1,
		place: 0,
		finishedAhead: 0,
		time: 0,
	}
}

// Cars drive from the moment the lights go out, which is when
// `ready` crosses zero — not when the banner clears.
export function isRunning(race) {
	return race.phase === 'racing' || race.ready <= 0
}

export function isOver(race) {
	return race.phase === 'finished'
}

export function tickCountdown(race, dt, audio) {
	race.ready -= dt
	const left = Math.ceil(race.ready)
	if (left < race.beeped) {
		race.beeped = left
		audio[left > 0 ? 'countdown' : 'go']()
	}
	if (race.ready <= -GO_HOLD) race.phase = 'racing'
}

export function lapsOf(car) {
	return Math.max(0, Math.floor(progressOf(car.totalAngle)))
}

// The whole field, furthest round the lap first. Progress is a
// single monotonic number per car (geom.js), so the order is
// just a sort and there is nothing to keep in step.
//
// This exists for the standings board, but it also earns its
// keep for position: counting rivals ahead and sorting the
// field are the same question asked twice, and two answers
// that can disagree is one more than is wanted.
export function orderOf(player, rivals) {
	return [player, ...rivals].sort(
		(a, b) => progressOf(b.totalAngle) -
			progressOf(a.totalAngle))
}

export function positionOf(player, rivals) {
	return orderOf(player, rivals).indexOf(player) + 1
}

// What the HUD shows. Once the flag is out the place is the
// one that was recorded at the line, not the one on the road:
// rivals still coasting past a finished car's frozen progress
// would otherwise walk the readout down after the race, so it
// disagreed with the result banner beside it.
export function placeOf(race, player, rivals) {
	return isOver(race) ?
		race.place : positionOf(player, rivals)
}

// A rival crossing the line for the last time is retired from
// the AI (it coasts to a stop) and counted. The count is what
// the player's place is read from: if a rival is still ahead on
// the road when the player finishes, it must already have
// finished, so the tally is exact without sorting anything.
export function checkFinishes(race, player, rivals) {
	for (const rival of rivals) {
		if (rival.finished) continue
		if (lapsOf(rival) < LAP_TARGET) continue
		rival.finished = true
		race.finishedAhead++
	}
	if (race.phase !== 'racing') return false
	if (lapsOf(player) < LAP_TARGET) return false
	race.phase = 'finished'
	race.place = race.finishedAhead + 1
	return true
}

const ORDINALS = [
	'', '1st', '2nd', '3rd', '4th', '5th', '6th',
]

export function ordinal(place) {
	return ORDINALS[place] || `${place}th`
}
