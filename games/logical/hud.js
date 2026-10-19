// Wheelworks' meters and screens, drawn on the canvas with the
// shared primitives in games/_shared/hud.js. What is here is
// only what is particular to this game: the pattern ring, the
// gutter clock, and the access-code pad.
//
// The pad's geometry lives in padLayout() rather than in the
// drawing code, because input.js has to hit-test exactly what
// was drawn. Two copies of a layout is how a button comes to
// be half a key to the left of where it looks.

import {
	WIDTH as W, HEIGHT as H, FONT, DIM, LIVE, brackets, label,
	readout,
} from '../_shared/hud.js'
import { ALPHABET } from './code.js'
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
	ctx.fillStyle = hot
		? 'rgba(24,74,112,0.9)'
		: 'rgba(10,32,54,0.75)'
	ctx.fillRect(box.x, box.y, box.w, box.h)
	ctx.strokeStyle = hot ? LIVE : 'rgba(120,214,255,0.3)'
	ctx.lineWidth = 1
	ctx.strokeRect(box.x, box.y, box.w, box.h)
	ctx.fillStyle = hot ? '#ffffff' : '#bdf0ff'
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

function title(ctx, text, y, size, colour) {
	ctx.textAlign = 'center'
	ctx.font = `bold ${size}px system-ui, sans-serif`
	ctx.fillStyle = colour
	ctx.shadowColor = 'rgba(80,200,255,0.6)'
	ctx.shadowBlur = 18
	ctx.fillText(text, W / 2, y)
	ctx.shadowBlur = 0
	ctx.textAlign = 'left'
}

export function drawIntro(ctx, ui, reached) {
	ctx.fillStyle = 'rgba(2,4,12,0.93)'
	ctx.fillRect(0, 0, W, H)
	title(ctx, 'WHEELWORKS', 92, 46, '#d8f6ff')
	const line = ui.bad
		? 'NO SUCH CODE'
		: `ENTER A CODE, OR PLAY LEVEL ${reached}`
	label(
		ctx, W / 2, 126, line, 'center',
		ui.bad ? '#ff9d9d' : DIM)
	drawSlots(ctx, ui.typed)
	drawPad(ctx, ui.typed)
	label(
		ctx, W / 2, H - 22,
		'TYPE OR CLICK A CODE · ENTER TO PLAY', 'center')
}

// A ring, not a two-by-two square: a square invites reading it
// left to right and top to bottom, and a wheel's slots are a
// ring with a north on it. The N tick is the whole point when
// the match is strict.
function patternRing(ctx, atlas, x, y, pattern) {
	const r = 34
	ctx.strokeStyle = 'rgba(120,214,255,0.3)'
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.arc(x, y, r, 0, Math.PI * 2)
	ctx.stroke()
	label(ctx, x, y - r - 8, 'N', 'center', LIVE)
	for (let d = 0; d < 4; d++) {
		const a = d * (Math.PI / 2)
		const px = x + Math.sin(a) * r
		const py = y - Math.cos(a) * r
		if (!pattern) {
			ctx.strokeStyle = 'rgba(120,214,255,0.25)'
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
	label(ctx, x, 96, 'PATTERN GRID', 'center')
	patternRing(ctx, atlas, x, 150, state.pattern)
	if (state.pattern) {
		label(
			ctx, x, 204, 'LIT', 'center', '#ffd36a')
		label(
			ctx, x, 222, 'COLOUR MATCH OFF', 'center',
			'#ffd36a')
		label(ctx, x, 240, 'MATCH IT TO CLEAR', 'center')
		return
	}
	label(ctx, x, 204, 'DARK', 'center')
	label(ctx, x, 222, 'COLOUR MATCH ON', 'center')
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
	ctx.fillStyle = 'rgba(8,20,32,0.9)'
	ctx.fillRect(x, y, w, 12)
	const hot = k < 0.3
	ctx.fillStyle = hot ? '#ff7a6a' : '#58d7ff'
	if (state.gutter) ctx.fillRect(x, y, w * k, 12)
	ctx.strokeStyle = 'rgba(120,214,255,0.4)'
	ctx.lineWidth = 1
	ctx.strokeRect(x, y, w, 12)
	label(
		ctx, x, y - 6,
		state.gutter ? 'GUTTER' : 'GUTTER CLEAR', 'left',
		hot && state.gutter ? '#ff9d9d' : DIM)
}

export function drawHud(ctx, atlas, state, best) {
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	readout(ctx, 30, 86, 'SCORE', state.score, 26)
	label(ctx, 30, 128, `BEST ${best.value}`)
	brackets(ctx, 24, 74, 168, 62)
	readout(ctx, 30, 196, 'LEVEL', state.level, 22)
	label(ctx, 30, 236, `CODE ${state.code}`, 'left', LIVE)
	readout(
		ctx, 30, 300, 'WHEELS LEFT', wheelsLeft(state), 22)
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
		title(ctx, 'LEVEL CLEAR', H / 2, 64, '#d8f6ff')
		return
	}
	if (state.phase !== 'over') return
	ctx.fillStyle = 'rgba(2,4,12,0.72)'
	ctx.fillRect(0, 0, W, H)
	title(ctx, 'GUTTER JAMMED', H / 2 - 30, 64, '#ffd0d0')
	label(
		ctx, W / 2, H / 2 + 14,
		`SCORE ${state.score}`, 'center', LIVE)
	label(
		ctx, W / 2, H / 2 + 44,
		'NEW GAME, OR ENTER FOR A CODE', 'center')
}
