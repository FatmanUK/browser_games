// The race itself: a countdown on the grid, three laps, and a
// finishing place. Before this, Dash had no shape — you lapped
// a track against the clock until you stopped, which is a
// driving toy rather than the game its siblings are.

import { progressOf, bandFrac } from './geom.js'

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

// Where a car is round the lap, 0..1, from swept angle.
function lapFrac(track, car) {
	const p = progressOf(track, car.totalAngle)
	return p - Math.floor(p)
}

// How far off the centreline a car may be and still be
// credited with a gate. The road is 0..1 across, so this
// allows a wheel over the kerb and nothing more.
const GATE_WIDTH = 0.62

// Gates are credited as the car sweeps past them, and only if
// it is on the road at the time. That is the whole rule:
// cutting across the infield sweeps exactly the same angle the
// long way round does, so swept angle alone can never tell the
// two apart — being there is what has to be checked.
export function trackGates(track, car) {
	if (car.gates === undefined) {
		car.gates = 0
		car.gateAt = lapFrac(track, car)
		return
	}
	const now = lapFrac(track, car)
	const prev = car.gateAt
	car.gateAt = now
	// Only forward progress counts, and a wrap is forward.
	const moved = now >= prev ? now - prev : now + 1 - prev
	if (moved > 0.5) return
	const off = Math.abs(bandFrac(track, car.x, car.y) - 0.5)
	if (off > GATE_WIDTH) return
	const n = track.GATES.length
	for (let i = 0; i < n; i++) {
		const g = i / n
		const passed = now >= prev
			? g > prev && g <= now
			: g > prev || g <= now
		if (!passed) continue
		car.gates |= 1 << i
		// Where a wrecked car comes back. Tracked here
		// because this is the one place that already knows
		// which gate was just gone through.
		car.lastGate = i
	}
}

export function allGates(track) {
	return (1 << track.GATES.length) - 1
}

// The lap count is still swept angle, but a lap only lands
// when every gate was collected on the way round. Crossing the
// line with a gap in the mask does nothing at all.
export function lapsOf(track, car) {
	const raw = Math.max(
		0, Math.floor(progressOf(track, car.totalAngle)))
	if (car.lapsDone === undefined) {
		car.lapsDone = 0
		car.lapRaw = raw
	}
	if (raw > car.lapRaw) {
		car.lapRaw = raw
		if (car.gates === allGates(track)) car.lapsDone++
		car.gates = 0
	}
	return car.lapsDone
}

// The whole field, furthest round the lap first. Progress is a
// single monotonic number per car (geom.js), so the order is
// just a sort and there is nothing to keep in step.
//
// This exists for the standings board, but it also earns its
// keep for position: counting rivals ahead and sorting the
// field are the same question asked twice, and two answers
// that can disagree is one more than is wanted.
export function orderOf(track, player, rivals) {
	return [player, ...rivals].sort(
		(a, b) => progressOf(track, b.totalAngle) -
			progressOf(track, a.totalAngle))
}

export function positionOf(track, player, rivals) {
	return orderOf(track, player, rivals).indexOf(player) + 1
}

// What the HUD shows. Once the flag is out the place is the
// one that was recorded at the line, not the one on the road:
// rivals still coasting past a finished car's frozen progress
// would otherwise walk the readout down after the race, so it
// disagreed with the result banner beside it.
export function placeOf(track, race, player, rivals) {
	return isOver(race) ?
		race.place : positionOf(track, player, rivals)
}

// A rival crossing the line for the last time is retired from
// the AI (it coasts to a stop) and counted. The count is what
// the player's place is read from: if a rival is still ahead on
// the road when the player finishes, it must already have
// finished, so the tally is exact without sorting anything.
export function checkFinishes(track, race, player, rivals) {
	for (const rival of rivals) {
		// A rival out of lives never finishes, so it must
		// not be counted as ahead of anyone either.
		if (rival.finished || rival.out) continue
		if (lapsOf(track, rival) < LAP_TARGET) continue
		rival.finished = true
		race.finishedAhead++
	}
	if (race.phase !== 'racing') return false
	// Out of lives ends your race where you are: last, behind
	// everyone still running as well as everyone home.
	if (player.out) {
		race.phase = 'finished'
		race.place = 1 + rivals.filter((r) => !r.out).length
		return true
	}
	if (lapsOf(track, player) < LAP_TARGET) return false
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
