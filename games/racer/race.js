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
		// Who is home, in the order they got there, and the
		// two readouts once they have nothing left to say.
		home: [],
		podium: null,
		board: null,
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

// A gate credits anywhere inside the track's own boundary —
// the verge counts, not just the tarmac.
//
// It used to be the kerb plus twelve, which sounds reasonable
// and is not: the boundary clamp already makes it impossible
// to leave a corridor 90 units wide either side, so a car out
// in the grass has not cut anything, it is just having a bad
// corner. With twelve gates a lap and a human running wide at
// one of them now and then, two laps in three were being
// thrown away. Nine driven for three recorded.
//
// What the gates are actually for, once the clamp has ruled
// out leaving the track at all, is order: you cannot reverse
// over the line, and on a track that runs back through itself
// you cannot lap one lobe over and over. Neither of those
// cares how wide you were.
const GATE_SLACK = 0

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
	// Counted whether or not the lap was any good, because
	// this is what the running order is measured in and a lap
	// thrown away for a missed gate was still a lap driven.
	car.lapsStarted++
	car.gates = 1
	// And the line is where a wreck comes back from now. The
	// last gate is a few hundred units behind it, so a car
	// wrecked just after crossing would have been put back on
	// the far side of its own start line.
	car.lastGate = 0
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
		car.lapsStarted = 0
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
		track.boundOff + GATE_SLACK
	for (const i of gatesIn(track, prev, moved)) {
		if (i === 0) { closeLap(track, car); continue }
		if (wide) continue
		car.gates |= 1 << i
		// Where a wrecked car comes back. Tracked here
		// because this is the one place that already knows
		// which gate was just gone through.
		car.lastGate = i
	}
}

// The gates in the stretch just driven, nearest first. Order
// matters: a frame that covers both the last gate and the
// line has to credit the gate before the line closes the lap
// on it, and taking them in index order put gate zero first
// and threw the lap away.
function gatesIn(track, from, moved) {
	const hit = []
	track.GATES.forEach((g, i) => {
		const d = deltaS(track, from, g)
		if (d > 0 && d <= moved) hit.push([d, i])
	})
	return hit.sort((a, b) => a[0] - b[0]).map((h) => h[1])
}

// Laps come off arc length, not off swept angle about a
// centre. On a figure of eight the two lobes wind opposite
// ways about any one point, so the net angle swept in a lap
// is about zero and a swept-angle counter simply never
// increments — which is exactly what it did.
export function lapsOf(track, car) {
	return car.lapsDone || 0
}

// How far round a car is from the start line, in laps.
//
// Both halves of that have to be measured from the same
// place, and they were not: the fraction came off `s`, which
// wraps at the end of the centreline, while the laps came off
// the start line, which is somewhere else entirely. So every
// car dropped START.s/L of progress the moment its arc length
// wrapped and did not get it back until the line — on track 1
// that is 0.45 of a lap, and for that 45% of every lap the
// whole field read as being behind a car parked on the grid.
// Sit still and you lead until somebody laps you.
//
// Laps started rather than laps completed, for the same
// reason: a lap thrown away for a missed gate was still
// driven, and the running order is about where you are, not
// about what counted. The minus one is the grid, which is
// behind the line — before the first crossing a car is a few
// units short of having started at all.
function fromLine(track, s) {
	return (deltaS(track, track.START.s, s) + track.L) %
		track.L
}

export function progressOf(track, car) {
	return (car.lapsStarted || 0) - 1 +
		fromLine(track, car.s) / track.L
}

// The whole field: everyone who is home, in the order they
// got there, then everyone still out there by how far round
// they are.
//
// The finishers cannot be sorted by progress along with the
// rest. A car that has finished keeps coasting, so its
// progress keeps climbing, and two cars home a second apart
// would be ranked by which rolled further afterwards. The
// line decides that, and the line has already decided it.
//
// This exists for the standings board, but it also earns its
// keep for position: counting rivals ahead and sorting the
// field are the same question asked twice, and two answers
// that can disagree is one more than is wanted.
export function orderOf(track, race, player, rivals) {
	const home = race.home
	const rest = [player, ...rivals]
		.filter((c) => !home.includes(c))
		.sort((a, b) => progressOf(track, b) -
			progressOf(track, a))
	return home.concat(rest)
}

export function positionOf(track, race, player, rivals) {
	return orderOf(track, race, player, rivals)
		.indexOf(player) + 1
}

// What the HUD shows. Once the flag is out the place is the
// one that was recorded at the line, not the one on the road:
// rivals still coasting past a finished car's frozen progress
// would otherwise walk the readout down after the race, so it
// disagreed with the result banner beside it.
export function placeOf(track, race, player, rivals) {
	return isOver(race) ?
		race.place : positionOf(track, race, player, rivals)
}

// A readout stops moving once what it says can no longer
// change. Three cars home settles the podium: nobody behind
// them can get in front of a car that has already crossed the
// line, and a car out of lives is not going to either. The
// board settles when the whole field is decided.
//
// Without this the top three kept shuffling after the flag,
// because the cars on it were still rolling and a car still
// racing was still gaining on them.
//
// The snapshot is taken once and kept. Recomputing it every
// frame from a condition that is still true would be the same
// answer, right up until a car that had finished rolled over
// a line and stopped being the same answer.
function settled(player, rivals) {
	return [player, ...rivals].every((c) => c.finished || c.out)
}

function freeze(track, race, player, rivals) {
	const all = settled(player, rivals)
	if (!race.podium && (race.home.length >= 3 || all)) {
		const o = orderOf(track, race, player, rivals)
		race.podium = o.slice(0, 3)
	}
	if (!race.board && all) {
		race.board = orderOf(track, race, player, rivals)
	}
}

// What the two readouts show: the frozen order once there is
// one, and the live order until then.
export function podiumOf(track, race, player, rivals) {
	return race.podium ||
		orderOf(track, race, player, rivals).slice(0, 3)
}

export function boardOf(track, race, player, rivals) {
	return race.board ||
		orderOf(track, race, player, rivals)
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
		race.home.push(rival)
		race.finishedAhead++
	}
	freeze(track, race, player, rivals)
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
	player.finished = true
	race.home.push(player)
	freeze(track, race, player, rivals)
	return true
}

const ORDINALS = [
	'', '1st', '2nd', '3rd', '4th', '5th', '6th',
]

export function ordinal(place) {
	return ORDINALS[place] || `${place}th`
}
