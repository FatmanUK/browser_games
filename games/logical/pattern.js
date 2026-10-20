// The pattern grid.
//
// Not a timed window. It lights at a random moment and stays
// lit until some wheel matches it, and while it is lit the
// ordinary colour match works in no wheel on the board. That
// makes it a blocking emergency rather than a nuisance:
// marbles keep arriving from the gutter, the only sink there
// is shut off, and the board fills up while the pattern is
// worked out. The pressure comes from the gutter clock and the
// filling board, never from a countdown on the light — which
// is exactly why matching it strictly, orientation and all, is
// fair. There is time to turn a wheel.
//
// A fresh pattern each lighting, with at least two colours in
// it so it is never the ordinary four-of-a-kind rule restated
// in a side panel.

const SPREAD = 0.5

// How long the lighting-up announcement stays on the board.
// The light suspends colour matching everywhere, so a player
// who misses the moment spends the next twenty seconds
// wondering why four of a colour is doing nothing.
const ALERT_MS = 2200

function draw(state) {
	const p = state.palette
	const out = []
	for (let i = 0; i < 4; i++) {
		out.push(p[(state.rand() * p.length) | 0])
	}
	return out
}

function newPattern(state) {
	for (let tries = 0; tries < 24; tries++) {
		const p = draw(state)
		if (p.some((c) => c !== p[0])) return p
	}
	// Only reachable with a one-colour palette, which no tier
	// produces; a two-colour answer beats returning nothing.
	return [state.palette[0], state.palette[1] || 'red',
		state.palette[0], state.palette[1] || 'red']
}

function nextDark(state) {
	const base = state.tier.darkMs
	return base * (1 - SPREAD / 2 + state.rand() * SPREAD)
}

export function resetPattern(state) {
	state.pattern = null
	state.darkLeft = nextDark(state)
}

// Returns true on the frame it lights, so the caller can sweep
// every wheel: one may already be holding the new pattern, and
// three wheels going at once as the light comes on is a good
// moment rather than a bug.
export function stepPattern(state, dt, fx) {
	if (!state.tier.hasPattern) return false
	if (state.pattern) return false
	state.darkLeft -= dt * 1000
	if (state.darkLeft > 0) return false
	state.pattern = newPattern(state)
	state.alertLeft = ALERT_MS
	fx.patternOn()
	return true
}

// Matched. The light goes out and the dark spell starts again.
export function clearPattern(state, fx) {
	state.pattern = null
	state.darkLeft = nextDark(state)
	fx.patternOff()
}
