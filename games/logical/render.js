// One frame of the board.
//
// Everything on the board is drawn in board coordinates inside
// fitBoard's transform, so the numbers here are the same ones
// board.js and travel.js use. The meters are not: hud.js draws
// those with the transform reset, as the rest of the suite
// does.
//
// Draw order matters in one place. Marbles in flight go down
// *before* the wheels, so a marble emerging from a throat
// comes out from behind the wheel rather than sliding over the
// top of it; marbles seated in slots go down after, because
// they are sitting in the near face of it.

import {
	BOARD_W, BOARD_H, CELL_H, CELL_W, COLS, GUTTER_H, DX, DY,
	MARBLE_R, PIPE_R, ROWS, SLOT_R, WHEEL_R, accepts, at,
	carries, centreX, centreY, isVertical,
} from './board.js'
import { wheelFrame } from './sprites.js'
import { slotPoint } from './travel.js'
import { WIDTH, HEIGHT, fitBoard } from '../_shared/hud.js'

const BG = '#02030a'
const FRAME = 'rgba(120,214,255,0.22)'
const PIPE_FILL = '#0b1a2b'
const PIPE_EDGE = 'rgba(96,180,220,0.4)'
const TROUGH = '#0a1724'

export const TOP_INSET = 46
export const BOTTOM_INSET = 40

function marble(ctx, atlas, colour, x, y) {
	const img = atlas.marbles[colour]
	const half = img.width / 2
	ctx.drawImage(img, x - half, y - half)
}

function channel(ctx, c, r, vert) {
	const x = centreX(c)
	const y = centreY(r)
	const hw = vert ? PIPE_R : CELL_W / 2 + 1
	const hh = vert ? CELL_H / 2 + 1 : PIPE_R
	ctx.fillStyle = PIPE_FILL
	ctx.fillRect(x - hw, y - hh, hw * 2, hh * 2)
	ctx.strokeStyle = PIPE_EDGE
	ctx.lineWidth = 1.5
	ctx.beginPath()
	if (vert) {
		ctx.moveTo(x - PIPE_R, y - hh)
		ctx.lineTo(x - PIPE_R, y + hh)
		ctx.moveTo(x + PIPE_R, y - hh)
		ctx.lineTo(x + PIPE_R, y + hh)
	} else {
		ctx.moveTo(x - hw, y - PIPE_R)
		ctx.lineTo(x + hw, y - PIPE_R)
		ctx.moveTo(x - hw, y + PIPE_R)
		ctx.lineTo(x + hw, y + PIPE_R)
	}
	ctx.stroke()
}

// A buffer across the end of a spur, so a run that stops at
// nothing looks stopped rather than cut off by the edge of the
// drawing.
function stopEnd(ctx, c, r, dir) {
	const x = centreX(c) + DX[dir] * (CELL_W / 2 - 3)
	const y = centreY(r) + DY[dir] * (CELL_H / 2 - 3)
	const vert = isVertical(dir)
	ctx.fillStyle = PIPE_EDGE
	if (vert) ctx.fillRect(x - PIPE_R, y - 3, PIPE_R * 2, 5)
	else ctx.fillRect(x - 3, y - PIPE_R, 5, PIPE_R * 2)
}

function deadEnds(ctx, state, c, r, cell) {
	for (let dir = 0; dir < 4; dir++) {
		if (!carries(cell, dir)) continue
		const res = accepts(state.grid, c, r, dir)
		if (res.act !== 'bounce') continue
		stopEnd(ctx, c, r, dir)
	}
}

// Painted in the colour it paints: a booth has to say what it
// will do to a marble before one is sent through it, or it is
// a trap rather than a tool.
function booth(ctx, atlas, c, r, cell) {
	const x = centreX(c)
	const y = centreY(r)
	const w = PIPE_R + 11
	ctx.fillStyle = 'rgba(255,255,255,0.05)'
	ctx.fillRect(x - w, y - w, w * 2, w * 2)
	ctx.lineWidth = 3
	ctx.strokeStyle = atlas.inks[cell.colour]
	ctx.strokeRect(x - w, y - w, w * 2, w * 2)
	ctx.lineWidth = 1
	ctx.strokeStyle = 'rgba(255,255,255,0.26)'
	ctx.strokeRect(x - w + 4, y - w + 4, w * 2 - 8, w * 2 - 8)
}

function arrow(ctx, x, y, dir, len) {
	const ax = DX[dir]
	const ay = DY[dir]
	ctx.beginPath()
	ctx.moveTo(x - ax * len, y - ay * len)
	ctx.lineTo(x + ax * len, y + ay * len)
	ctx.moveTo(x + ax * len, y + ay * len)
	ctx.lineTo(
		x + ax * len * 0.3 - ay * len * 0.45,
		y + ay * len * 0.3 + ax * len * 0.45)
	ctx.moveTo(x + ax * len, y + ay * len)
	ctx.lineTo(
		x + ax * len * 0.3 + ay * len * 0.45,
		y + ay * len * 0.3 - ax * len * 0.45)
	ctx.stroke()
}

function block(ctx, c, r, cell) {
	const x = centreX(c)
	const y = centreY(r)
	const w = PIPE_R + 9
	ctx.fillStyle = '#1b2d1a'
	ctx.strokeStyle = '#7de08a'
	ctx.lineWidth = 2
	ctx.beginPath()
	ctx.moveTo(x - w, y)
	ctx.lineTo(x, y - w)
	ctx.lineTo(x + w, y)
	ctx.lineTo(x, y + w)
	ctx.closePath()
	ctx.fill()
	ctx.stroke()
	ctx.lineWidth = 3
	ctx.lineCap = 'round'
	arrow(ctx, x, y, cell.dir, w * 0.52)
	ctx.lineCap = 'butt'
}

function drawCell(ctx, atlas, state, c, r) {
	const cell = at(state.grid, c, r)
	if (!cell || cell.kind === 'wheel') return
	if (cell.kind === 'block') {
		block(ctx, c, r, cell)
		return
	}
	if (cell.h) channel(ctx, c, r, false)
	if (cell.v) channel(ctx, c, r, true)
	deadEnds(ctx, state, c, r, cell)
	if (cell.kind === 'booth') booth(ctx, atlas, c, r, cell)
}

function drawPipes(ctx, atlas, state) {
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			drawCell(ctx, atlas, state, c, r)
		}
	}
}

// A broken wheel is a different sprite already; the ring over
// the top is what makes it unmistakable at a glance across a
// board of twelve.
function brokenRing(ctx, x, y) {
	ctx.strokeStyle = 'rgba(236,142,74,0.85)'
	ctx.lineWidth = 3
	ctx.setLineDash([7, 8])
	ctx.beginPath()
	ctx.arc(x, y, WHEEL_R - 2, 0, Math.PI * 2)
	ctx.stroke()
	ctx.setLineDash([])
}

// The four slots, cut into the face after the body is laid
// down. A pocket is a circle, and a circle is identical at
// every heading, so this is the one part of a turning thing
// that may be drawn rather than baked — only where it is comes
// from the rotation, never what it looks like.
function pocket(ctx, wheel, k) {
	const p = slotPoint(wheel, k, SLOT_R)
	ctx.fillStyle = 'rgba(3,7,13,0.88)'
	ctx.beginPath()
	ctx.arc(p.x, p.y, MARBLE_R + 4, 0, Math.PI * 2)
	ctx.fill()
	ctx.strokeStyle = 'rgba(0,0,0,0.55)'
	ctx.lineWidth = 2.5
	ctx.stroke()
}

function drawWheel(ctx, atlas, wheel) {
	const x = centreX(wheel.c)
	const y = centreY(wheel.r)
	const img = wheelFrame(atlas, wheel)
	const half = img.width / 2
	ctx.drawImage(img, x - half, y - half)
	for (let k = 0; k < 4; k++) pocket(ctx, wheel, k)
	if (wheel.broken) brokenRing(ctx, x, y)
}

function drawSlots(ctx, atlas, wheel) {
	for (let k = 0; k < 4; k++) {
		const colour = wheel.slots[k]
		if (!colour) continue
		const p = slotPoint(wheel, k, SLOT_R)
		marble(ctx, atlas, colour, p.x, p.y)
	}
}

function drawWheels(ctx, atlas, state) {
	for (const wheel of state.wheels) {
		drawWheel(ctx, atlas, wheel)
	}
	for (const wheel of state.wheels) {
		drawSlots(ctx, atlas, wheel)
	}
}

function drawTransit(ctx, atlas, state) {
	for (const m of state.transit) {
		marble(ctx, atlas, m.colour, m.x, m.y)
	}
}

// A funnel under every column the lane can actually let a
// marble down, so where a marble can go is on the board rather
// than in the player's head.
function mouth(ctx, state, c) {
	const res = accepts(state.grid, c, -1, 2)
	if (res.act === 'bounce') return
	const x = centreX(c)
	const y = GUTTER_H
	ctx.fillStyle = 'rgba(120,214,255,0.14)'
	ctx.beginPath()
	ctx.moveTo(x - PIPE_R - 9, y - 13)
	ctx.lineTo(x + PIPE_R + 9, y - 13)
	ctx.lineTo(x + PIPE_R, y + 2)
	ctx.lineTo(x - PIPE_R, y + 2)
	ctx.closePath()
	ctx.fill()
}

function drawGutter(ctx, atlas, state) {
	ctx.fillStyle = TROUGH
	ctx.fillRect(0, 0, BOARD_W, GUTTER_H)
	ctx.strokeStyle = FRAME
	ctx.lineWidth = 1.5
	ctx.beginPath()
	ctx.moveTo(0, GUTTER_H)
	ctx.lineTo(BOARD_W, GUTTER_H)
	ctx.stroke()
	for (let c = 0; c < COLS; c++) mouth(ctx, state, c)
	if (!state.gutter) return
	marble(
		ctx, atlas, state.gutter.colour,
		state.gutter.x, GUTTER_H / 2)
}

function drawFrame(ctx) {
	ctx.strokeStyle = FRAME
	ctx.lineWidth = 2
	ctx.strokeRect(-1, -1, BOARD_W + 2, BOARD_H + 2)
}

export function drawBoard(ctx, atlas, state) {
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.fillStyle = BG
	ctx.fillRect(0, 0, WIDTH, HEIGHT)
	const fit = fitBoard(
		ctx, BOARD_W, BOARD_H, TOP_INSET, BOTTOM_INSET)
	drawFrame(ctx)
	drawGutter(ctx, atlas, state)
	drawPipes(ctx, atlas, state)
	drawTransit(ctx, atlas, state)
	drawWheels(ctx, atlas, state)
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	return fit
}
