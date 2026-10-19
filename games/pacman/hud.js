// Maze Muncher's meters, drawn on the canvas with the shared
// HUD primitives in games/_shared/hud.js. The maze is wider
// than Blockfall's well but still leaves room either side, so
// the readouts flank it rather than sitting above it.

import {
	WIDTH as W, HEIGHT as H, brackets, readout, label,
} from '../_shared/hud.js'

const PILL = '#ffd54f'

// Lives as the muncher itself rather than as a number.
function drawLives(ctx, lives, x, y) {
	const shown = Math.min(6, Math.max(0, lives))
	for (let i = 0; i < shown; i++) {
		ctx.fillStyle = PILL
		ctx.beginPath()
		ctx.arc(
			x + i * 22, y, 8, 0.24 * Math.PI,
			1.76 * Math.PI)
		ctx.lineTo(x + i * 22, y)
		ctx.closePath()
		ctx.fill()
	}
}

export function drawHud(ctx, state, best) {
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	readout(ctx, 34, 82, 'SCORE', state.score, 26)
	label(ctx, 34, 124, `BEST ${best.value}`)
	brackets(ctx, 28, 70, 164, 62)

	readout(
		ctx, W - 34, 82, 'LEVEL', state.level, 22, 'right')
	label(
		ctx, W - 34, 124,
		`${state.pellets.size} DOTS LEFT`, 'right')

	label(ctx, 34, H - 44, 'LIVES')
	drawLives(ctx, state.lives, 42, H - 24)
	label(
		ctx, W - 34, H - 24, '↑ ↓ ← → TO MOVE', 'right')
	ctx.restore()
}
