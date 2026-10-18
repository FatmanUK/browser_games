// Level flow and the per-frame update dispatch. A level is
// three phases in sequence — clear the belt, fly the wormhole,
// kill the guardian — and only then does the level counter go
// up. Each phase's update returns true when it is finished.

import { W, H, newShip, banner, updateBanner } from './common.js'
import { spawnBelt, updateBelt } from './belt.js'
import { startTunnel, updateTunnel } from './tunnel.js'
import { startBoss, updateBoss } from './boss.js'
import { buildBackdrop } from './sprites.js'

function startLevel(state) {
	state.phase = 'belt'
	state.ship = newShip()
	state.shots = []
	state.parts = []
	state.tunnel = null
	state.boss = null
	state.backdrop = buildBackdrop(W, H, state.level * 7 + 3)
	spawnBelt(state)
	banner(state, `Level ${state.level}`, 2)
}

export function newGame() {
	const state = {
		level: 1, phase: 'belt', score: 0, lives: 3,
		nextLife: 12000, over: false, mourned: false,
		ship: newShip(), shots: [], rocks: [], parts: [],
		keys: new Set(), banner: null, tunnel: null,
		boss: null, backdrop: null, t: 0,
	}
	startLevel(state)
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
	startLevel(state)
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
	if (state.phase === 'belt') {
		if (updateBelt(state, dt, fx)) toTunnel(state, fx)
	} else if (state.phase === 'tunnel') {
		if (updateTunnel(state, dt, fx)) toBoss(state, fx)
	} else if (updateBoss(state, dt, fx)) {
		nextLevel(state, fx)
	}
}
