// Blockfall's meters, drawn on the canvas with the shared HUD
// primitives in games/_shared/hud.js. The board is narrow and
// the window is wide, so the space either side of it is where
// the readouts and the next-piece preview live — which is how
// the cabinet versions of this game laid it out anyway.

import {
	WIDTH as W, HEIGHT as H, brackets, readout, label,
} from '../_shared/hud.js'

// Ranged against the left edge of the well rather than the
// left edge of the window: a readout stranded in the far
// corner reads as unrelated to the game it belongs to.
const COL = W / 2 - 130

export function drawHud(ctx, state, best) {
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	readout(ctx, COL, 90, 'SCORE', state.score, 26, 'right')
	label(ctx, COL, 132, `BEST ${best.value}`, 'right')
	brackets(ctx, COL - 118, 78, 124, 62)
	readout(ctx, COL, 182, 'LINES', state.lines, 20, 'right')

	label(
		ctx, W - 40, H - 26,
		'← → MOVE · ↑ ROTATE · ↓ SOFT · SPACE DROP',
		'right')
	ctx.restore()
}

// The preview sits in its own bracketed panel to the right of
// the board, rather than in a second canvas off to one side.
export function previewBox(ctx, cell) {
	const size = cell * 4
	const x = W / 2 + 118
	const y = 86
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	label(ctx, x, y - 12, 'NEXT')
	ctx.fillStyle = 'rgba(8,16,30,0.75)'
	ctx.fillRect(x, y, size, size)
	brackets(ctx, x - 6, y - 6, size + 12, size + 12)
	ctx.restore()
	return { x, y }
}
