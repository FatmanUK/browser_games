// The gutter: the only place marbles come from, and the clock
// that makes keeping it clear the job.
//
// The lane holds nought or one marble, so it needs no
// interaction code whatever — one marble rolling between two
// walls past a handful of mouths. The countdown belongs to the
// lane rather than to the marble: it runs while the lane is
// occupied and resets the moment it empties, so a marble that
// bounces back up a feed pipe into the lane restarts it rather
// than inheriting whatever was left.
//
// Supply is a shuffled bag of four of each colour, not an
// independent draw per marble. Independent draws have an
// unbounded worst case — six reds in a row is perfectly
// possible — and a drought under a countdown is exactly the
// loss a player is right to call unfair.

import {
	BOARD_W, COLS, MARBLE_R, SEG_CAP, accepts, centreX,
	launch, seatColour, segmentLoad, segmentOf, wheelAt,
} from './board.js'
import { alignedSlot } from './wheel.js'

// A traverse of the 1200-unit lane takes a little over four
// seconds, so the tightest timer still allows two passes and
// the most generous five.
const ROLL_SPEED = 280

// A beat before the next marble appears. The clock starts when
// it enters, so this is time the player is given rather than
// time they are charged for.
const FEED_MS = 500

function refill(state) {
	const bag = []
	for (const colour of state.palette) {
		for (let i = 0; i < 4; i++) bag.push(colour)
	}
	for (let i = bag.length - 1; i > 0; i--) {
		const j = (state.rand() * (i + 1)) | 0
		const t = bag[i]
		bag[i] = bag[j]
		bag[j] = t
	}
	state.bag = bag
}

export function drawColour(state) {
	if (!state.bag || !state.bag.length) refill(state)
	return state.bag.pop()
}

// Can this column take a marble out of the lane right now? A
// wheel below the gutter needs an empty slot actually facing
// up; a pipe needs room in its straight segment.
function mouthTakes(state, c) {
	const res = accepts(state.grid, c, -1, 2)
	if (res.act === 'wheel') {
		const wheel = wheelAt(state, c, 0)
		const k = alignedSlot(wheel, 0)
		return k >= 0 && wheel.slots[k] === null ? k : -1
	}
	if (res.act !== 'go') return -1
	const seg = segmentOf(state, c, 0, 2)
	if (seg >= 0 && segmentLoad(state, seg) >= SEG_CAP) {
		return -1
	}
	return -2
}

function deliver(state, c, how, fx) {
	const colour = state.gutter.colour
	state.gutter = null
	state.gutterLeft = state.gutterMs
	if (how === -2) {
		launch(state, c, 0, 2, colour, true)
		fx.accept()
		return
	}
	const wheel = wheelAt(state, c, 0)
	seatColour(wheel, how, colour)
	state.filled.push(wheel)
	fx.slot()
}

// Dropped into the first mouth it rolls over that will have
// it. The rules make acceptance automatic, so the player's
// control over where a marble lands is the wheels they have
// turned and the pipes they have kept clear.
function tryMouths(state, fromX, fx) {
	const g = state.gutter
	for (let c = 0; c < COLS; c++) {
		const x = centreX(c)
		const lo = Math.min(fromX, g.x)
		const hi = Math.max(fromX, g.x)
		if (x < lo || x > hi) continue
		const how = mouthTakes(state, c)
		if (how === -1) continue
		deliver(state, c, how, fx)
		return true
	}
	return false
}

function roll(state, dt, fx) {
	const g = state.gutter
	const fromX = g.x
	g.x += g.dir * ROLL_SPEED * dt
	if (g.x < MARBLE_R) {
		g.x = MARBLE_R
		g.dir = 1
	}
	if (g.x > BOARD_W - MARBLE_R) {
		g.x = BOARD_W - MARBLE_R
		g.dir = -1
	}
	return tryMouths(state, fromX, fx)
}

// A marble rolling back up a feed pipe rejoins the lane where
// it came out, heading left — the same way the fresh ones go,
// so there is only ever one kind of gutter marble.
export function joinGutter(state, colour, x) {
	state.gutter = { colour, x, dir: -1 }
	state.gutterLeft = state.gutterMs
}

// Returns true when the clock has run out, which is the only
// way to lose: the gutter is the sole source of marbles, so a
// gutter that cannot be cleared is a board with no room left.
export function stepGutter(state, dt, fx) {
	if (!state.gutter) {
		state.feedLeft -= dt * 1000
		if (state.feedLeft > 0) return false
		joinGutter(
			state, drawColour(state), BOARD_W - MARBLE_R)
		state.marblesIn += 1
		fx.feed()
		return false
	}
	if (roll(state, dt, fx)) {
		state.feedLeft = FEED_MS
		return false
	}
	state.gutterLeft -= dt * 1000
	return state.gutterLeft <= 0
}

export { FEED_MS }
