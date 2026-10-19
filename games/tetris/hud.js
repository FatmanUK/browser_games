// Blockfall's meters, drawn on the canvas with the shared HUD
// primitives in games/_shared/hud.js. The board is narrow and
// the window is wide, so the space either side of it is where
// the readouts and the next-piece preview live — which is how
// the cabinet versions of this game laid it out anyway.

import {
	WIDTH as W, HEIGHT as H, brackets, readout, label,
} from '../_shared/hud.js'

// Ranged against the edges of the well itself, not against
// the window: the well's width depends on how much room the
// window has (see fitBoard), so a column guessed from the
// centre lands on top of it the moment the window changes
// size.
export function drawHud(ctx, state, best, fit) {
	const col = fit.x - 30
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	readout(ctx, col, 90, 'SCORE', state.score, 26, 'right')
	label(ctx, col, 132, `BEST ${best.value}`, 'right')
	brackets(ctx, col - 118, 78, 124, 62)
	readout(ctx, col, 182, 'LINES', state.lines, 20, 'right')

	label(
		ctx, W - 40, H - 26,
		'← → MOVE · ↑ ROTATE · ↓ SOFT · SPACE DROP',
		'right')
	ctx.restore()
}

// The preview sits in its own bracketed panel to the right of
// the board, rather than in a second canvas off to one side.
export function previewBox(ctx, cell, fit) {
	const size = cell * 4 * fit.scale
	const x = fit.x + fit.w + 30
	const y = 86
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	label(ctx, x, y - 12, 'NEXT')
	ctx.fillStyle = 'rgba(8,16,30,0.75)'
	ctx.fillRect(x, y, size, size)
	brackets(ctx, x - 6, y - 6, size + 12, size + 12)
	ctx.restore()
	return { x, y, size }
}
