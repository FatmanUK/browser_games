// Belt Breaker's meters, drawn on the canvas with the shared
// HUD primitives in games/_shared/hud.js. What is here is only
// what is particular to this game: ships as ship icons, the
// gun level, the drop timer and the phase readout.

import {
	WIDTH as W, HEIGHT as H, FONT, DIM, brackets, readout,
	label,
} from '../_shared/hud.js'
import { MAX_GUN, PICKUP_LIFE } from './common.js'
import { frameFor } from './rocks.js'

// Remaining ships as the ship itself, not as a number: the
// player already knows what their craft looks like.
function drawLives(ctx, atlas, state, x, y) {
	const img = frameFor(atlas.ship, -Math.PI / 2)
	const step = 20
	const shown = Math.min(6, Math.max(0, state.lives))
	for (let i = 0; i < shown; i++) {
		ctx.globalAlpha = 0.9
		ctx.drawImage(
			img, 0, 0, img.width, img.height,
			x + i * step, y, 17, 17)
	}
	ctx.globalAlpha = 1
	if (state.lives <= 6) return
	ctx.fillStyle = DIM
	ctx.font = `10px ${FONT}`
	ctx.fillText(`+${state.lives - 6}`, x + 6 * step, y + 13)
}

// Gun level as pips rather than a number, so an upgrade is a
// light coming on.
function drawGuns(ctx, state, x, y) {
	for (let i = 0; i < MAX_GUN; i++) {
		const on = i < state.gun
		ctx.fillStyle = on
			? 'rgba(150,240,255,0.95)'
			: 'rgba(90,140,165,0.25)'
		ctx.beginPath()
		ctx.moveTo(x + i * 11, y + 9)
		ctx.lineTo(x + i * 11 + 4, y)
		ctx.lineTo(x + i * 11 + 8, y + 9)
		ctx.closePath()
		ctx.fill()
	}
}

function phaseText(state) {
	if (state.over) return 'SIGNAL LOST'
	if (state.phase === 'ready') return 'STAND BY'
	if (state.phase === 'belt') {
		return `BELT · ${state.rocks.length} ROCKS`
	}
	if (state.phase === 'tunnel') {
		const tn = state.tunnel
		const k = Math.min(100, (tn.t / tn.dur) * 100)
		return `WORMHOLE · ${Math.floor(k)}%`
	}
	return 'GUARDIAN'
}

// A pickup about to expire gets a shrinking tick under the
// cash readout, so the player knows a coin is going without
// having to watch it blink.
function drawDropTimer(ctx, state, x, y) {
	let worst = 0
	for (const p of state.pickups) {
		worst = Math.max(worst, p.t)
	}
	if (worst === 0) return
	const k = 1 - worst / PICKUP_LIFE
	ctx.fillStyle = 'rgba(255,196,90,0.8)'
	ctx.fillRect(x - 46, y, 46 * Math.max(0, k), 2)
}

export function drawHud(ctx, atlas, state, best) {
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	readout(ctx, 20, 54, 'SCORE', state.score, 26)
	label(ctx, 20, 96, `BEST ${best.value}`)
	brackets(ctx, 14, 42, 150, 62)

	readout(ctx, W - 20, 54, 'CASH', state.cash, 22, 'right')
	drawDropTimer(ctx, state, W - 20, 84)
	readout(
		ctx, W - 20, 104, 'LEVEL', state.level, 18, 'right')

	drawLives(ctx, atlas, state, 20, H - 38)
	drawGuns(ctx, state, 20, H - 17)
	label(ctx, W - 20, H - 17, phaseText(state), 'right')
	ctx.restore()
}
