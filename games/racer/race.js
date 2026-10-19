// The race itself: a countdown on the grid, three laps, and a
// finishing place. Before this, Dash had no shape — you lapped
// a track against the clock until you stopped, which is a
// driving toy rather than the game its siblings are.

import { deltaS } from './path.js'
import { checkLaunch } from './jump.js'

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

// How far past the kerb a car may be and still be credited
// with a gate: a wheel over it and no more.
const GATE_SLACK = 12

export function allGates(track) {
	return (1 << track.GATES.length) - 1
}

// Crossing the line. The lap only lands if every gate was
// collected on the way round; otherwise the crossing resets
// the mask and counts for nothing. Gate zero is the line
// itself, so starting a new lap sets its bit.
//
// Jumps are deliberately not part of this. Coming up short
// drops the car onto the road below and costs it the stretch
// of lap in between, which is punishment enough — making the
// lap not count as well would mean one missed ramp threw away
// everything you had driven.
function closeLap(track, car) {
	if (car.gates === allGates(track)) car.lapsDone++
	car.gates = 1
}

// Gates are credited as the car drives past them, and only if
// it is on the road at the time. That is the whole rule:
// cutting the infield covers the same ground the long way
// round does as far as any counter can tell — being there is
// what has to be checked.
export function trackGates(track, car) {
	if (car.gates === undefined) {
		car.gates = 0
		car.lapsDone = 0
		car.gateAt = car.s
		return
	}
	const prev = car.gateAt
	car.gateAt = car.s
	const moved = deltaS(track, prev, car.s)
	// The ramp is a gate of a different kind, and it is
	// checked from here because this already knows how far
	// along the lap the car has just come.
	checkLaunch(track, car, moved)
	// Backwards credits nothing, and neither does a jump too
	// big to be one frame of driving.
	if (moved <= 0 || moved > track.L / 4) return
	const wide = Math.abs(car.off) >
		track.halfWidth + GATE_SLACK
	track.GATES.forEach((g, i) => {
		// In the stretch just driven, which deltaS answers
		// across the lap's seam as well as inside it.
		const d = deltaS(track, prev, g)
		if (d <= 0 || d > moved) return
		if (i === 0) { closeLap(track, car); return }
		if (wide) return
		car.gates |= 1 << i
		// Where a wrecked car comes back. Tracked here
		// because this is the one place that already knows
		// which gate was just gone through.
		car.lastGate = i
	})
}

// Laps come off arc length, not off swept angle about a
// centre. On a figure of eight the two lobes wind opposite
// ways about any one point, so the net angle swept in a lap
// is about zero and a swept-angle counter simply never
// increments — which is exactly what it did.
export function lapsOf(track, car) {
	return car.lapsDone || 0
}

// Where a car is round the lap, as a single increasing
// number: completed laps plus how far into this one.
export function progressOf(track, car) {
	return (car.lapsDone || 0) + car.s / track.L
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
		(a, b) => progressOf(track, b) -
			progressOf(track, a))
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
