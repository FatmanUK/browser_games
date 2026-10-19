// Mouse and keyboard, and the arithmetic that turns a click
// into a wheel.
//
// Wheelworks is the suite's first mouse game, so there was no
// client-to-board mapping to borrow. There are three
// transforms stacked up. The canvas backing store is a fixed
// 1440x600 while CSS renders it at whatever size fits, so a
// client coordinate scales by WIDTH / rect.width. On top of
// that, fitBoard centres and scales the board inside the
// window. On top of that, board units become cells.
//
// The important discipline: invert the fit the last frame
// actually drew with, which render.js hands back and game.js
// stashes. Recomputing it here would be a second opinion about
// where the board is, and the two would disagree the moment
// either changed.

import {
	CELL_H, CELL_W, COLS, GUTTER_H, ROWS, WHEEL_R, centreX,
	centreY, wheelAt,
} from './board.js'
import { offsetTo } from './wheel.js'
import { WIDTH, HEIGHT } from '../_shared/hud.js'
import { padLayout } from './hud.js'
import { ALPHABET } from './code.js'

export function canvasPoint(canvas, e) {
	const rect = canvas.getBoundingClientRect()
	return {
		x: (e.clientX - rect.left) * (WIDTH / rect.width),
		y: (e.clientY - rect.top) * (HEIGHT / rect.height),
	}
}

export function boardPoint(fit, p) {
	if (!fit) return { x: -1, y: -1 }
	return {
		x: (p.x - fit.x) / fit.scale,
		y: (p.y - fit.y) / fit.scale,
	}
}

function cellAt(b) {
	const c = Math.floor(b.x / CELL_W)
	const r = Math.floor((b.y - GUTTER_H) / CELL_H)
	if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null
	return { c, r }
}

// A little past the rim, because a wheel is the thing being
// aimed at and the gap between two of them is not.
const GRAB = WHEEL_R * 1.12

export function pickWheel(state, b) {
	const cell = cellAt(b)
	if (!cell) return null
	const wheel = wheelAt(state, cell.c, cell.r)
	if (!wheel) return null
	const dx = b.x - centreX(wheel.c)
	const dy = b.y - centreY(wheel.r)
	if (Math.hypot(dx, dy) > GRAB) return null
	return wheel
}

// Which slot a click means. Not the nearest marble — the
// nearest *compass point*, which is a quarter of the wheel
// rather than an eighteen-pixel dot, and says what firing
// does: you click the side you want it to go out of.
export function pickSlot(wheel, b) {
	const dx = b.x - centreX(wheel.c)
	const dy = b.y - centreY(wheel.r)
	const quarter = Math.PI / 2
	const a = Math.atan2(dx, -dy)
	const dir = Math.round(a / quarter)
	return offsetTo(wheel, (dir + 4) % 4).slot
}

function hits(box, p) {
	return p.x >= box.x && p.x <= box.x + box.w
		&& p.y >= box.y && p.y <= box.y + box.h
}

// Returns a symbol to type, 'del', 'enter', or null.
export function pickPad(p) {
	const pad = padLayout()
	for (const k of pad.keys) {
		if (hits(k, p)) return k.ch
	}
	if (hits(pad.del, p)) return 'del'
	if (hits(pad.enter, p)) return 'enter'
	return null
}

// Typing the code. Case is ignored, and anything outside the
// alphabet is left for the browser rather than swallowed.
export function typeKey(ui, key) {
	if (key === 'Backspace') {
		ui.typed = ui.typed.slice(0, -1)
		ui.bad = false
		return 'edit'
	}
	if (key === 'Escape') {
		ui.typed = ''
		ui.bad = false
		return 'edit'
	}
	if (key === 'Enter') return 'enter'
	const ch = String(key).toUpperCase()
	if (ch.length !== 1 || !ALPHABET.includes(ch)) return null
	if (ui.typed.length >= 4) return 'edit'
	ui.typed += ch
	ui.bad = false
	return 'edit'
}

export function padKey(ui, hit) {
	if (hit === 'enter') return 'enter'
	if (hit === 'del') return typeKey(ui, 'Backspace')
	return typeKey(ui, hit)
}
