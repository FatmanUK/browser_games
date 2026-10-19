// The rules: what a level is while it is being played, what
// happens each frame, and what breaking a wheel is worth.
//
// level.js builds the board, travel.js moves the marbles,
// gutter.js runs the clock, pattern.js runs the light. This
// file owns the phase the game is in and the one thing none of
// them can own on their own — deciding, when a wheel is full,
// whether it breaks.

import { buildLevel } from './level.js'
import { rng } from '../_shared/art.js'
import { emptyWheel, slotsFull } from './board.js'
import { breaks, stepWheel } from './wheel.js'
import { stepTransit } from './travel.js'
import { stepGutter, FEED_MS } from './gutter.js'
import {
	resetPattern, stepPattern, clearPattern,
} from './pattern.js'
import { seedForLevel, reach, nextLevel } from './progress.js'
import { codeFor } from './code.js'

const FIRST_BREAK = 100
const REBREAK = 15
const CLEAR_BONUS = 250
const CLEAR_MS = 1800

// Set true when a marble goes missing, which is the one bug
// this shape of code invites: two homes, five ways between
// them. Left off, it costs nothing.
const AUDIT = false

export function newGame(level, score) {
	const built = buildLevel(level)
	const seed = (seedForLevel(level) ^ 0x9e3779b9) >>> 0
	const state = {
		...built,
		phase: 'play',
		rand: rng(seed),
		transit: [],
		filled: [],
		gutter: null,
		gutterMs: built.tier.gutterMs,
		gutterLeft: built.tier.gutterMs,
		feedLeft: FEED_MS,
		bag: null,
		pattern: null,
		darkLeft: 0,
		score: score || 0,
		clearLeft: 0,
		code: codeFor(level),
		marblesIn: 0,
		destroyed: 0,
	}
	resetPattern(state)
	return state
}

function breakWheel(state, wheel, fx) {
	emptyWheel(wheel)
	destroyed(state)
	if (wheel.broken) {
		state.score += REBREAK
		fx.dump()
		return
	}
	wheel.broken = true
	state.score += FIRST_BREAK
	fx.breakWheel()
}

function destroyed(state) {
	state.destroyed += 4
}

// One sweep, used both for the wheels that have just been
// filled and for every wheel the moment the light changes.
function sweep(state, list, fx) {
	let hit = false
	for (const wheel of list) {
		if (!slotsFull(wheel)) continue
		if (!breaks(wheel, state.pattern)) continue
		breakWheel(state, wheel, fx)
		if (state.pattern) {
			clearPattern(state, fx)
			hit = true
		}
	}
	return hit
}

function allBroken(state) {
	return state.wheels.every((w) => w.broken)
}

function countMarbles(state) {
	let n = state.transit.length + (state.gutter ? 1 : 0)
	for (const w of state.wheels) {
		for (const s of w.slots) if (s !== null) n++
	}
	return n
}

// Marbles arrive one at a time and leave only four at a time,
// so what the board holds must be exactly what has come in
// less what has been destroyed. Any other number means a
// marble was lost or duplicated in a handoff, which is the one
// bug two homes and five transfers between them invites.
function audit(state) {
	const want = state.marblesIn - state.destroyed
	const held = countMarbles(state)
	if (held === want) return
	console.warn(
		`wheelworks: ${held} marbles held, ${want} expected`)
	state.destroyed = state.marblesIn - held
}

function stepWheels(state, dt) {
	for (const wheel of state.wheels) {
		if (stepWheel(wheel, dt)) state.filled.push(wheel)
	}
}

function finishLevel(state, fx) {
	state.phase = 'clear'
	state.clearLeft = CLEAR_MS
	state.score += CLEAR_BONUS
	reach(nextLevel(state.level))
	fx.levelClear()
}

export function update(state, dt, fx) {
	if (state.phase === 'clear') {
		state.clearLeft -= dt * 1000
		return
	}
	if (state.phase !== 'play') return
	stepWheels(state, dt)
	stepTransit(state, dt, fx)
	if (stepPattern(state, dt, fx)) {
		sweep(state, state.wheels, fx)
	}
	sweep(state, state.filled, fx)
	state.filled.length = 0
	if (AUDIT) audit(state)
	if (allBroken(state)) {
		finishLevel(state, fx)
		return
	}
	if (stepGutter(state, dt, fx)) {
		state.phase = 'over'
		fx.gameOver()
	}
}

export function readyForNext(state) {
	return state.phase === 'clear' && state.clearLeft <= 0
}

export function wheelsLeft(state) {
	return state.wheels.filter((w) => !w.broken).length
}
