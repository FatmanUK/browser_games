// Wheelworks' meters and screens, drawn on the canvas in the
// light palette that theme.js defines. What is here is only
// what is particular to this game: the pattern ring, the
// gutter clock, and the access-code pad.
//
// The pad's geometry lives in padLayout() rather than in the
// drawing code, because input.js has to hit-test exactly what
// was drawn. Two copies of a layout is how a button comes to
// be half a key to the left of where it looks.

import {
	WIDTH as W, HEIGHT as H, FONT,
} from '../_shared/hud.js'
import {
	FAINT, FRAME, HOT, INK, KEY_EDGE, KEY_FILL, KEY_HOT,
	SCRIM, WARN, banner, brackets, label, readout,
} from './theme.js'
import { ALPHABET } from './code.js'
import { peekNext, PREVIEW } from './gutter.js'
import { wheelsLeft } from './world.js'

const KEY_W = 50
const KEY_H = 42
const KEY_GAP = 7
const PAD_COLS = 4
const PAD_Y = 258
const SLOT_W = 54
const SLOT_H = 58
const SLOT_Y = 168

function padWidth() {
	return PAD_COLS * KEY_W + (PAD_COLS - 1) * KEY_GAP
}

// One description of the pad, used to draw it and to click it.
export function padLayout() {
	const x0 = (W - padWidth()) / 2
	const keys = ALPHABET.split('').map((ch, i) => ({
		ch,
		x: x0 + (i % PAD_COLS) * (KEY_W + KEY_GAP),
		y: PAD_Y + Math.floor(i / PAD_COLS)
			* (KEY_H + KEY_GAP),
		w: KEY_W,
		h: KEY_H,
	}))
	const wide = padWidth() / 2 - KEY_GAP / 2
	const foot = PAD_Y + 4 * (KEY_H + KEY_GAP)
	return {
		keys,
		del: { x: x0, y: foot, w: wide, h: KEY_H },
		enter: {
			x: x0 + wide + KEY_GAP, y: foot,
			w: wide, h: KEY_H,
		},
	}
}

function cell(ctx, box, text, hot, size) {
	ctx.fillStyle = hot ? KEY_HOT : KEY_FILL
	ctx.fillRect(box.x, box.y, box.w, box.h)
	ctx.strokeStyle = hot ? KEY_HOT : KEY_EDGE
	ctx.lineWidth = 1
	ctx.strokeRect(box.x, box.y, box.w, box.h)
	ctx.fillStyle = hot ? '#ffffff' : INK
	ctx.font = `bold ${size}px ${FONT}`
	ctx.textAlign = 'center'
	ctx.fillText(
		text, box.x + box.w / 2,
		box.y + box.h / 2 + size * 0.36)
	ctx.textAlign = 'left'
}

function drawSlots(ctx, typed) {
	const total = 4 * SLOT_W + 3 * KEY_GAP
	const x0 = (W - total) / 2
	for (let i = 0; i < 4; i++) {
		const box = {
			x: x0 + i * (SLOT_W + KEY_GAP), y: SLOT_Y,
			w: SLOT_W, h: SLOT_H,
		}
		cell(ctx, box, typed[i] || '', !!typed[i], 30)
	}
}

function drawPad(ctx, typed) {
	const pad = padLayout()
	for (const k of pad.keys) cell(ctx, k, k.ch, false, 19)
	cell(ctx, pad.del, 'DEL', false, 15)
	cell(ctx, pad.enter, 'ENTER', typed.length === 4, 15)
}

export function drawIntro(ctx, ui, reached) {
	ctx.fillStyle = SCRIM
	ctx.fillRect(0, 0, W, H)
	banner(ctx, 'WHEELWORKS', W / 2, 92, 46)
	const line = ui.bad
		? 'NO SUCH CODE'
		: `ENTER A CODE, OR PLAY LEVEL ${reached}`
	label(
		ctx, W / 2, 126, line, 'center', ui.bad ? HOT : FAINT)
	drawSlots(ctx, ui.typed)
	drawPad(ctx, ui.typed)
	label(
		ctx, W / 2, H - 22,
		'TYPE OR CLICK A CODE · ENTER TO PLAY', 'center')
}

// What is coming out of the gutter next, soonest first and
// biggest. The gutter feeds from the right-hand end of the
// lane, so this sits on the right-hand side of the window:
// marbles arrive from the direction the panel is on.
//
// It is the one thing that makes a wheel worth turning before
// a marble lands rather than after it, which is the difference
// between playing the gutter and chasing it.
function drawNext(ctx, atlas, state) {
	const x = W - 118
	label(ctx, x, 68, 'NEXT', 'center')
	const next = peekNext(state, PREVIEW)
	const spots = [
		{ dx: -32, scale: 1.5 },
		{ dx: 10, scale: 1 },
		{ dx: 38, scale: 1 },
	]
	next.forEach((colour, i) => {
		const spot = spots[i]
		if (!spot || !colour) return
		const img = atlas.marbles[colour]
		const w = img.width * spot.scale
		ctx.drawImage(
			img, x + spot.dx - w / 2, 92 - w / 2, w, w)
	})
}

// A ring, not a two-by-two square: a square invites reading it
// left to right and top to bottom, and a wheel's slots are a
// ring with a north on it. The N tick is the whole point when
// the match is strict.
function patternRing(ctx, atlas, x, y, pattern) {
	const r = 34
	ctx.strokeStyle = FRAME
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.arc(x, y, r, 0, Math.PI * 2)
	ctx.stroke()
	label(ctx, x, y - r - 8, 'N', 'center', INK)
	for (let d = 0; d < 4; d++) {
		const a = d * (Math.PI / 2)
		const px = x + Math.sin(a) * r
		const py = y - Math.cos(a) * r
		if (!pattern) {
			ctx.strokeStyle = FRAME
			ctx.beginPath()
			ctx.arc(px, py, 10, 0, Math.PI * 2)
			ctx.stroke()
			continue
		}
		const img = atlas.marbles[pattern[d]]
		const half = img.width / 2
		ctx.drawImage(img, px - half, py - half)
	}
}

function drawPattern(ctx, atlas, state) {
	if (!state.tier.hasPattern) return
	const x = W - 118
	label(ctx, x, 158, 'PATTERN GRID', 'center')
	patternRing(ctx, atlas, x, 212, state.pattern)
	if (state.pattern) {
		label(ctx, x, 266, 'LIT', 'center', WARN)
		label(
			ctx, x, 284,
			'COLOUR MATCH OFF', 'center', WARN)
		label(ctx, x, 302, 'MATCH IT TO CLEAR', 'center')
		return
	}
	label(ctx, x, 266, 'DARK', 'center')
	label(ctx, x, 284, 'COLOUR MATCH ON', 'center')
}

// A bar across the foot of the window rather than a number in
// a corner. It is the only way to lose, so it should be the
// thing hardest to miss.
function gutterBar(ctx, state) {
	const w = W - 200
	const x = 100
	const y = H - 30
	const k = Math.max(
		0, Math.min(1, state.gutterLeft / state.gutterMs))
	ctx.fillStyle = 'rgba(42,52,66,0.12)'
	ctx.fillRect(x, y, w, 12)
	const hot = k < 0.3
	ctx.fillStyle = hot ? HOT : '#2f6fb0'
	if (state.gutter) ctx.fillRect(x, y, w * k, 12)
	ctx.strokeStyle = FRAME
	ctx.lineWidth = 1
	ctx.strokeRect(x, y, w, 12)
	label(
		ctx, x, y - 6,
		state.gutter ? 'GUTTER' : 'GUTTER CLEAR', 'left',
		hot && state.gutter ? HOT : FAINT)
}

export function drawHud(ctx, atlas, state, best) {
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	readout(ctx, 30, 86, 'SCORE', state.score, 26)
	label(ctx, 30, 128, `BEST ${best.value}`)
	brackets(ctx, 24, 74, 168, 62)
	readout(ctx, 30, 186, 'LEVEL', state.level, 22)
	// The code is the one thing a player writes down, so it is
	// sized like the score rather than tucked under the level
	// as a caption.
	readout(ctx, 30, 250, 'ACCESS CODE', state.code, 26)
	readout(
		ctx, 30, 322, 'WHEELS LEFT', wheelsLeft(state), 22)
	drawNext(ctx, atlas, state)
	drawPattern(ctx, atlas, state)
	gutterBar(ctx, state)
	label(
		ctx, W - 30, H - 50,
		'LEFT-CLICK A MARBLE TO FIRE · RIGHT-CLICK A WHEEL '
			+ 'TO TURN', 'right')
	ctx.restore()
}

export function drawBanner(ctx, state) {
	if (state.phase === 'clear') {
		banner(ctx, 'LEVEL CLEAR', W / 2, H / 2, 64)
		return
	}
	if (state.phase !== 'over') return
	ctx.fillStyle = 'rgba(236,238,242,0.82)'
	ctx.fillRect(0, 0, W, H)
	banner(ctx, 'GUTTER JAMMED', W / 2, H / 2 - 30, 64, HOT)
	label(
		ctx, W / 2, H / 2 + 14,
		`SCORE ${state.score}`, 'center', INK)
	label(
		ctx, W / 2, H / 2 + 44,
		'NEW GAME, OR ENTER FOR A CODE', 'center')
}
