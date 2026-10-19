// How a marble moves.
//
// Marbles are intangible to each other — they pass straight
// through, as they did in the original — so there is no
// collision code here at all, and two runs crossing need no
// interaction rule. Each marble is integrated on its own.
//
// Motion is event-driven rather than stepped: the distance to
// the next thing that can happen is computed exactly and the
// marble advanced to it, so nothing tunnels through a wheel
// rim at a low frame rate and no sub-step size has to be
// guessed at. There are three events — a cell edge, a cell
// centre, and a wheel rim — and the cell's own contents say
// which of them matters.

import {
	DX, DY, WHEEL_R, SEG_CAP, accepts, along, at, back,
	centreX, centreY, drop, launch, seat, segmentLoad,
	segmentOf, step, wheelAt,
} from './board.js'
import { alignedSlot } from './wheel.js'
import { joinGutter } from './gutter.js'

// Shortest pipe is 130 units of free run, which at this speed
// is 0.68s — a shade under the 0.91s a quarter turn takes, so
// turning a wheel to meet an arriving marble is tight on the
// short runs and comfortable on the long ones.
export const SPEED = 190

const EPS = 1e-6

// Which way slot k is facing, or -1 if it is not lined up with
// a mouth. Asks alignedSlot rather than working it out, so a
// marble can never be fired out of a mouth it could not have
// come in by.
export function slotDir(wheel, k) {
	const dir = Math.round(k + wheel.turns + 4) % 4
	return alignedSlot(wheel, dir) === k ? dir : -1
}

function nextEvent(state, m) {
	const cell = at(state.grid, m.c, m.r)
	const half = step(m.dir) / 2
	const a = along(m)
	if (cell && cell.kind === 'wheel' && a < -WHEEL_R - EPS) {
		return { d: -WHEEL_R - a, kind: 'rim' }
	}
	const turns = cell
		&& (cell.kind === 'block' || cell.kind === 'booth')
	if (turns && a < -EPS) return { d: -a, kind: 'centre' }
	return { d: half - a, kind: 'edge' }
}

function moveBy(m, d) {
	m.x += DX[m.dir] * d
	m.y += DY[m.dir] * d
}

function enter(m, c, r) {
	m.c = c
	m.r = r
}

// At the rim the wheel either takes the marble or turns it
// round. This is the moment the whole game turns on, so it is
// one test against one tolerance and nothing else.
function atRim(state, m, fx) {
	const wheel = wheelAt(state, m.c, m.r)
	const k = alignedSlot(wheel, back(m.dir))
	if (k >= 0 && wheel.slots[k] === null) {
		seat(state, wheel, k, m)
		fx.slot()
		state.filled.push(wheel)
		return false
	}
	m.dir = back(m.dir)
	fx.bounce()
	return true
}

function atEdge(state, m, fx) {
	const res = accepts(state.grid, m.c, m.r, m.dir)
	if (res.act === 'gutter') {
		if (state.gutter) {
			m.dir = back(m.dir)
			fx.bounce()
			return true
		}
		joinGutter(state, m.colour, m.x)
		drop(state, m)
		return false
	}
	if (res.act === 'bounce') {
		m.dir = back(m.dir)
		fx.bounce()
		return true
	}
	// A block turns a marble at its centre, not on the way in,
	// so entry keeps the heading it arrived with and the
	// centre event does the diverting.
	enter(m, res.c, res.r)
	return true
}

function atCentre(state, m, fx) {
	const cell = at(state.grid, m.c, m.r)
	if (cell.kind === 'booth') {
		if (m.colour !== cell.colour) fx.paint()
		m.colour = cell.colour
		return true
	}
	if (cell.dir !== m.dir) fx.divert()
	m.dir = cell.dir
	return true
}

function fire(state, m, kind, fx) {
	if (kind === 'rim') return atRim(state, m, fx)
	if (kind === 'centre') return atCentre(state, m, fx)
	return atEdge(state, m, fx)
}

export function stepMarble(state, m, dt, fx) {
	let left = SPEED * dt
	let guard = 64
	while (left > EPS && guard-- > 0) {
		const ev = nextEvent(state, m)
		if (ev.d > left) {
			moveBy(m, left)
			return
		}
		moveBy(m, ev.d)
		left -= ev.d
		if (!fire(state, m, ev.kind, fx)) return
	}
}

export function stepTransit(state, dt, fx) {
	for (const m of state.transit.slice()) {
		stepMarble(state, m, dt, fx)
	}
}

// Room for one more in the straight segment a marble would be
// fired into. Capacity four is a count, not a geometry:
// marbles are intangible, so nothing has to fit.
function roomInSegment(state, c, r, dir) {
	const seg = segmentOf(
		state, c + DX[dir], r + DY[dir], dir)
	if (seg < 0) return true
	return segmentLoad(state, seg) < SEG_CAP
}

export function canFire(state, wheel, k) {
	if (wheel.slots[k] === null) return false
	const dir = slotDir(wheel, k)
	if (dir < 0) return false
	const res = accepts(state.grid, wheel.c, wheel.r, dir)
	if (res.act === 'bounce') return false
	if (res.act === 'gutter' && state.gutter) return false
	return roomInSegment(state, wheel.c, wheel.r, dir)
}

export function fireSlot(state, wheel, k, fx) {
	if (!canFire(state, wheel, k)) {
		fx.refuse()
		return false
	}
	const dir = slotDir(wheel, k)
	const colour = wheel.slots[k]
	wheel.slots[k] = null
	launch(state, wheel.c, wheel.r, dir, colour)
	fx.fire()
	return true
}

// Where a seated marble is drawn: out at the slot radius, and
// carried round as the wheel turns rather than thrown out of
// it.
export function slotPoint(wheel, k, radius) {
	const a = (k + wheel.turns) * (Math.PI / 2)
	return {
		x: centreX(wheel.c) + Math.sin(a) * radius,
		y: centreY(wheel.r) - Math.cos(a) * radius,
	}
}
