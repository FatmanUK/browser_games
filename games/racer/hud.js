// Dash's meters, drawn on the canvas with the shared HUD
// primitives in games/_shared/hud.js. They used to be
// createStat() lines in the bar over the top of the canvas;
// drawn on it instead, they read as a dashboard rather than
// as a row of labels, and they stop the bar growing a second
// line that eats into the road.

import {
	WIDTH as W, HEIGHT as H, DIM, brackets, readout, label,
} from '../_shared/hud.js'

export function formatLap(value) {
	return value === 0 ? '--.-' : value.toFixed(1)
}

// A speed bar under the number: the figure says how fast, the
// bar says how much is left, which is the part worth seeing
// out of the corner of an eye mid-corner.
function speedBar(ctx, speed, max, x, y, w) {
	const k = Math.max(0, Math.min(1, speed / max))
	ctx.fillStyle = 'rgba(8,20,34,0.75)'
	ctx.fillRect(x, y, w, 5)
	const g = ctx.createLinearGradient(x, 0, x + w, 0)
	g.addColorStop(0, '#6fe9ff')
	g.addColorStop(0.7, '#8dff9f')
	g.addColorStop(1, '#ffd05a')
	ctx.fillStyle = g
	ctx.fillRect(x, y, w * k, 5)
	ctx.strokeStyle = 'rgba(120,214,255,0.35)'
	ctx.lineWidth = 1
	ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 4)
}

export function drawHud(ctx, state, best, maxSpeed) {
	ctx.save()
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.textBaseline = 'alphabetic'

	readout(ctx, 20, 54, 'LAP', state.lapsShown, 26)
	brackets(ctx, 14, 42, 120, 50)

	readout(
		ctx, W - 20, 54, 'BEST LAP',
		formatLap(best.value), 22, 'right')

	readout(
		ctx, 20, H - 46, 'SPEED',
		Math.round(state.speed), 26)
	speedBar(ctx, state.speed, maxSpeed, 20, H - 16, 150)

	ctx.fillStyle = DIM
	label(
		ctx, W - 20, H - 18,
		'ARROWS / WASD TO DRIVE', 'right')
	ctx.restore()
}
