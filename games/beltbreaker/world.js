// Level flow and the per-frame update dispatch. A level is
// three phases in sequence — clear the belt, fly the wormhole,
// kill the guardian — and only then does the level counter go
// up. Each phase's update returns true when it is finished.

import {
	W, H, newShip, banner, updateBanner,
} from './common.js'
import { spawnBelt, updateBelt } from './belt.js'
import { startTunnel, updateTunnel } from './tunnel.js'
import { startBoss, updateBoss } from './boss.js'
import { buildBackdrop } from './sprites.js'

// Every level opens on a frozen field with 3-2-1 over it, so
// the player gets to see where the rocks are before they are
// allowed to be hit by one.
const COUNT_FROM = 3

function startLevel(state, fx) {
	state.phase = 'ready'
	state.ready = COUNT_FROM
	// One above the count so the first tick registers as a
	// change and beeps on "3" rather than starting at "2".
	state.shown = COUNT_FROM + 1
	state.ship = newShip()
	state.shots = []
	state.parts = []
	state.pickups = []
	state.tunnel = null
	state.boss = null
	state.backdrop = buildBackdrop(W, H, state.level * 7 + 3)
	spawnBelt(state)
	banner(state, `Level ${state.level}`, 1.4)
	if (fx) fx.countdown()
}

function tickReady(state, dt, fx) {
	state.ready -= dt
	const left = Math.ceil(state.ready)
	if (left !== state.shown) {
		state.shown = left
		if (left > 0) fx.countdown()
	}
	if (state.ready > 0) return
	state.phase = 'belt'
	fx.go()
}

export function newGame() {
	const state = {
		level: 1, phase: 'belt', score: 0, lives: 3,
		nextLife: 12000, over: false, mourned: false,
		ship: newShip(), shots: [], rocks: [], parts: [],
		pickups: [], cash: 0, gun: 1, nextShip: 500,
		keys: new Set(), banner: null, tunnel: null,
		boss: null, backdrop: null, t: 0,
		ready: 0, shown: 0,
	}
	startLevel(state, null)
	return state
}

function toTunnel(state, fx) {
	state.phase = 'tunnel'
	startTunnel(state)
	banner(state, 'Wormhole', 2.2)
	fx.warpIn()
}

function toBoss(state, fx) {
	state.phase = 'boss'
	state.ship = newShip()
	startBoss(state)
	banner(state, 'Guardian', 2.4)
	fx.alarm()
}

function nextLevel(state, fx) {
	state.level += 1
	startLevel(state, fx)
	fx.levelUp()
}

export function updateWorld(state, dt, fx) {
	if (state.over) {
		if (!state.mourned) {
			state.mourned = true
			banner(state, 'Game over', 6)
			fx.gameOver()
		}
		updateBanner(state, dt)
		return
	}
	state.t += dt
	updateBanner(state, dt)
	if (state.phase === 'ready') {
		tickReady(state, dt, fx)
	} else if (state.phase === 'belt') {
		if (updateBelt(state, dt, fx)) toTunnel(state, fx)
	} else if (state.phase === 'tunnel') {
		if (updateTunnel(state, dt, fx)) toBoss(state, fx)
	} else if (updateBoss(state, dt, fx)) {
		nextLevel(state, fx)
	}
}
