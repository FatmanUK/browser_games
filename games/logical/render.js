// One frame of the board.
//
// Everything on the board is drawn in board coordinates inside
// fitBoard's transform, so the numbers here are the same ones
// board.js and travel.js use. The meters are not: hud.js draws
// those with the transform reset, as the rest of the suite
// does. Colours come from theme.js, which both files share.
//
// Draw order matters in one place. Marbles in flight go down
// *before* the wheels, so a marble emerging from a throat
// comes out from behind the wheel rather than sliding over the
// top of it; marbles seated in slots go down after, because
// they are sitting in the near face of it.

import {
	BOARD_W, BOARD_H, CELL_H, CELL_W, COLS, GUTTER_H, DX, DY,
	MARBLE_R, PIPE_R, ROWS, SLOT_R, WHEEL_R, accepts, at,
	carries, centreX, centreY, step,
} from './board.js'
import { wheelFrame } from './sprites.js'
import { slotPoint } from './travel.js'
import { WIDTH, HEIGHT, fitBoard } from '../_shared/hud.js'
import { FRAME, POCKET, BLOCK_FILL, BLOCK_EDGE } from './theme.js'
import { BOARD_WASH, bandFor, bandPattern } from './bands.js'

export const TOP_INSET = 46
export const BOTTOM_INSET = 40

function marble(ctx, atlas, colour, x, y) {
	const img = atlas.marbles[colour]
	const half = img.width / 2
	ctx.drawImage(img, x - half, y - half)
}

// How far a pipe has to run from its own cell's middle to meet
// whatever is next door. Into another pipe cell that is half a
// cell and a shade over, so the two overlap and leave no seam;
// into a wheel it is all the way to the rim, which is the
// neighbour's middle less the wheel's radius. Stopping at the
// cell boundary — the obvious thing — left every run floating
// thirty units short of the wheel it joined.
function armLength(grid, c, r, dir) {
	const half = step(dir) / 2
	const cell = at(grid, c + DX[dir], r + DY[dir])
	if (cell && cell.kind === 'wheel') {
		return half * 2 - WHEEL_R + 2
	}
	return half + 1
}

// Pipe from the cell's middle outward. The fill always starts
// at the middle so a junction is solid; the two side walls
// start `gap` out, which on a crossing leaves the junction
// square open — what a crossing looks like — and on a straight
// run gap is nought and the walls are continuous.
function arm(ctx, grid, c, r, dir, gap, band) {
	const len = armLength(grid, c, r, dir)
	const x = centreX(c)
	const y = centreY(r)
	const ax = DX[dir]
	const ay = DY[dir]
	ctx.fillStyle = band.pipe
	ctx.fillRect(
		Math.min(x, x + ax * len) - (ay ? PIPE_R : 0),
		Math.min(y, y + ay * len) - (ax ? PIPE_R : 0),
		ax ? len : PIPE_R * 2,
		ay ? len : PIPE_R * 2)
	if (gap >= len) return
	ctx.strokeStyle = band.edge
	ctx.lineWidth = 1.5
	ctx.beginPath()
	for (const side of [-1, 1]) {
		const px = ay ? side * PIPE_R : 0
		const py = ax ? side * PIPE_R : 0
		ctx.moveTo(x + ax * gap + px, y + ay * gap + py)
		ctx.lineTo(x + ax * len + px, y + ay * len + py)
	}
	ctx.stroke()
}

// Painted in the colour it paints: a booth has to say what it
// will do to a marble before one is sent through it, or it is
// a trap rather than a tool.
function booth(ctx, atlas, c, r, cell) {
	const x = centreX(c)
	const y = centreY(r)
	const w = PIPE_R + 11
	ctx.fillStyle = 'rgba(255,255,255,0.55)'
	ctx.fillRect(x - w, y - w, w * 2, w * 2)
	ctx.lineWidth = 3
	ctx.strokeStyle = atlas.inks[cell.colour]
	ctx.strokeRect(x - w, y - w, w * 2, w * 2)
	ctx.lineWidth = 1
	ctx.strokeStyle = FRAME
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
	ctx.fillStyle = BLOCK_FILL
	ctx.strokeStyle = BLOCK_EDGE
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

function drawCell(ctx, atlas, state, c, r, band) {
	const cell = at(state.grid, c, r)
	if (!cell || cell.kind === 'wheel') return
	const gap = cell.h && cell.v ? PIPE_R : 0
	for (let dir = 0; dir < 4; dir++) {
		if (!carries(cell, dir)) continue
		arm(ctx, state.grid, c, r, dir, gap, band)
	}
	if (cell.kind === 'booth') booth(ctx, atlas, c, r, cell)
	if (cell.kind === 'block') block(ctx, c, r, cell)
}

function drawPipes(ctx, atlas, state, band) {
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			drawCell(ctx, atlas, state, c, r, band)
		}
	}
}

// A broken wheel is a different sprite already; the ring over
// the top is what makes it unmistakable at a glance across a
// board of twelve.
function brokenRing(ctx, x, y) {
	ctx.strokeStyle = 'rgba(176,86,30,0.9)'
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
	ctx.fillStyle = POCKET
	ctx.beginPath()
	ctx.arc(p.x, p.y, MARBLE_R + 4, 0, Math.PI * 2)
	ctx.fill()
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

// A funnel under every column the lane can let a marble down,
// so where a marble can go is on the board rather than in the
// player's head.
function mouth(ctx, state, c) {
	const res = accepts(state.grid, c, -1, 2)
	if (res.act === 'bounce') return
	const x = centreX(c)
	const y = GUTTER_H
	ctx.fillStyle = 'rgba(42,52,66,0.17)'
	ctx.beginPath()
	ctx.moveTo(x - PIPE_R - 9, y - 11)
	ctx.lineTo(x + PIPE_R + 9, y - 11)
	ctx.lineTo(x + PIPE_R, y + 2)
	ctx.lineTo(x - PIPE_R, y + 2)
	ctx.closePath()
	ctx.fill()
}

function drawGutter(ctx, atlas, state, band) {
	ctx.fillStyle = band.trough
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

// The board is an eight by five grid, and until it was scored
// it did not look like one: wheels and pipe sat on a blank
// sheet with no way to tell where one cell ended and the next
// began. A groove is two lines rather than one — a dark seam
// with a pale highlight just below and to the right of it,
// because the light in this game comes from the upper left, so
// that order of the two reads as cut into the surface. The
// other way round and the same two lines read as a ridge
// standing proud of it.
const GROOVE = 'rgba(42,52,66,0.13)'
const GROOVE_LIT = 'rgba(255,255,255,0.5)'
const GROOVE_OFF = 1.6

function seams(ctx, colour, width, off) {
	ctx.strokeStyle = colour
	ctx.lineWidth = width
	ctx.beginPath()
	for (let c = 1; c < COLS; c++) {
		const x = c * CELL_W + off
		ctx.moveTo(x, GUTTER_H)
		ctx.lineTo(x, BOARD_H)
	}
	for (let r = 1; r < ROWS; r++) {
		const y = GUTTER_H + r * CELL_H + off
		ctx.moveTo(0, y)
		ctx.lineTo(BOARD_W, y)
	}
	ctx.stroke()
}

// A bolt at every corner of every cell, including the outer
// ones, where they read as the plates being fastened to the
// frame. Corners are the one place nothing else goes: a pipe
// runs down the middle of a cell edge and a wheel sits in the
// middle of a cell, so the nearest either comes to a corner is
// forty-eight units.
// Three discs, not two: a shadow cast down and right, a body
// solid enough to be a thing rather than a stain, and a small
// highlight up and to the left. Drawn as a translucent disc
// with a highlight on it, a rivet reads as a pale ring — a
// washer with a hole in it — because the highlight ends up
// lighter than the body it is supposed to be sitting on.
const RIVET_SHADE = 'rgba(42,52,66,0.26)'
const RIVET_BODY = 'rgba(178,183,192,0.92)'
const RIVET_LIT = 'rgba(255,255,255,0.82)'
const RIVET_R = 4

function disc(ctx, x, y, r, colour) {
	ctx.fillStyle = colour
	ctx.beginPath()
	ctx.arc(x, y, r, 0, Math.PI * 2)
	ctx.fill()
}

function rivet(ctx, x, y) {
	disc(ctx, x + 0.9, y + 0.9, RIVET_R, RIVET_SHADE)
	disc(ctx, x, y, RIVET_R, RIVET_BODY)
	disc(ctx, x - 1.2, y - 1.2, RIVET_R * 0.34, RIVET_LIT)
}

function rivets(ctx) {
	for (let c = 0; c <= COLS; c++) {
		for (let r = 0; r <= ROWS; r++) {
			rivet(ctx, c * CELL_W, GUTTER_H + r * CELL_H)
		}
	}
}

// Wash, then the grid scored into it, then the bolts, then the
// frame. Pipe goes down after all of it, because the runs lie
// on the plates rather than being part of them.
function drawFrame(ctx) {
	ctx.fillStyle = BOARD_WASH
	ctx.fillRect(0, 0, BOARD_W, BOARD_H)
	seams(ctx, GROOVE, 2, 0)
	seams(ctx, GROOVE_LIT, 1.2, GROOVE_OFF)
	rivets(ctx)
	ctx.strokeStyle = FRAME
	ctx.lineWidth = 2
	ctx.strokeRect(-1, -1, BOARD_W + 2, BOARD_H + 2)
}

// The ground is painted with the transform reset, so the
// texture is screen-aligned and the same size whatever the
// board's scale works out to. Tiled through it, a tile is a
// tile; drawn inside the fit it would be resampled.
function drawGround(ctx, band) {
	ctx.fillStyle = band.paper
	ctx.fillRect(0, 0, WIDTH, HEIGHT)
	ctx.fillStyle = bandPattern(ctx, band)
	ctx.fillRect(0, 0, WIDTH, HEIGHT)
}

export function drawBoard(ctx, atlas, state) {
	const band = bandFor(state.level)
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	drawGround(ctx, band)
	const fit = fitBoard(
		ctx, BOARD_W, BOARD_H, TOP_INSET, BOTTOM_INSET)
	drawFrame(ctx)
	drawGutter(ctx, atlas, state, band)
	drawPipes(ctx, atlas, state, band)
	drawTransit(ctx, atlas, state)
	drawWheels(ctx, atlas, state)
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	return fit
}
