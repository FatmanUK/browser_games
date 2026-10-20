// The board: the cell grid, its geometry, and the one place a
// marble ever changes home.
//
// A level is COLS x ROWS cells with a gutter lane above them.
// A cell is empty or holds one of four things — a wheel, pipe,
// a one-way block, or a paint booth. Pipe carries an axis flag
// each way, so one cell can hold both a horizontal and a
// vertical run: marbles are intangible to each other, so a
// crossing needs no interaction rule at all, which is exactly
// why the original could allow them.
//
// Everything here is geometry and bookkeeping. wheel.js owns
// what a wheel decides, travel.js owns how a marble moves,
// level.js builds the thing in the first place.

export const COLS = 8
export const ROWS = 5

// Cells are wider than tall on purpose. Five rows plus a
// gutter is a portrait board, and square cells would leave it
// marooned in the middle of a landscape window; the extra
// width goes into the horizontal pipes, where it is wanted.
export const CELL_W = 150
export const CELL_H = 110
export const GUTTER_H = 40

export const BOARD_W = COLS * CELL_W
export const BOARD_H = GUTTER_H + ROWS * CELL_H

export const WHEEL_R = 45
export const SLOT_R = 29
export const MARBLE_R = 11
export const PIPE_R = 17

// 0 up, 1 right, 2 down, 3 left. The same numbering indexes a
// wheel's slots, so slot k faces direction (k + turns) mod 4
// and no translation table is needed anywhere.
export const DX = [0, 1, 0, -1]
export const DY = [-1, 0, 1, 0]

// dir ^ 2 is the reverse of dir: 0<->2 and 1<->3 both fall out
// of the single bit, which saves a REVERSE table.
export function back(dir) {
	return dir ^ 2
}

export function isVertical(dir) {
	return dir === 0 || dir === 2
}

// How far apart two cell centres are along dir.
export function step(dir) {
	return isVertical(dir) ? CELL_H : CELL_W
}

export const COLOURS = ['blue', 'green', 'yellow', 'red']

export function inside(c, r) {
	return c >= 0 && c < COLS && r >= 0 && r < ROWS
}

export function newGrid() {
	return new Array(COLS * ROWS).fill(null)
}

export function at(grid, c, r) {
	if (!inside(c, r)) return null
	return grid[r * COLS + c]
}

export function put(grid, c, r, cell) {
	grid[r * COLS + c] = cell
}

// Centre of a cell in board coordinates. Row -1 is the gutter
// lane, which lets the travel code treat "up out of row 0" as
// an ordinary move to a neighbouring cell.
export function centreX(c) {
	return c * CELL_W + CELL_W / 2
}

export function centreY(r) {
	if (r < 0) return GUTTER_H / 2
	return GUTTER_H + r * CELL_H + CELL_H / 2
}

// Does this cell carry a run along dir? A booth is pipe that
// happens to repaint and a block is pipe that happens to
// divert, so both answer on the axes they were laid on.
//
// A block that answered yes to every direction was the way in
// for a marble fired out of a wheel into a block beside it
// with no pipe between the two — a run that was not there.
export function carries(cell, dir) {
	if (!cell) return false
	if (cell.kind === 'wheel') return true
	return isVertical(dir) ? !!cell.v : !!cell.h
}

// The slot a marble occupies is identified by wheel and index,
// so a seated marble is just a colour in wheel.slots[k].
export function newWheel(id, c, r) {
	return {
		id, c, r,
		slots: [null, null, null, null],
		turns: 0,
		target: 0,
		broken: false,
	}
}

export function wheelAt(state, c, r) {
	const cell = at(state.grid, c, r)
	if (!cell || cell.kind !== 'wheel') return null
	return state.wheels[cell.id]
}

export function slotsFull(wheel) {
	return wheel.slots.every((s) => s !== null)
}

// Where a marble leaving cell (c, r) along dir ends up. The
// one transition rule in the game, and deliberately the only
// one: level.js walks it to prove every wheel is reachable and
// no marble can be trapped, travel.js walks it to move
// marbles. Two readings of the same rule is how a generator
// comes to bless a level the runtime cannot play.
export function accepts(grid, c, r, dir) {
	const nc = c + DX[dir]
	const nr = r + DY[dir]
	// The gutter is an inlet, not a junction: marbles come
	// down out of it and nothing goes back up. A marble that
	// could climb back into the lane would be swallowed by
	// the same mouth on the next frame, and every round trip
	// reset the feed timer — which is how the gutter came to
	// stop producing marbles altogether. It also let a wheel
	// in row 0 fire a marble upward into no run at all.
	if (nr < 0) return { act: 'bounce' }
	if (!inside(nc, nr)) return { act: 'bounce' }
	const cell = grid[nr * COLS + nc]
	if (!cell) return { act: 'bounce' }
	if (cell.kind === 'wheel') {
		return { act: 'wheel', c: nc, r: nr, id: cell.id }
	}
	if (!carries(cell, dir)) return { act: 'bounce' }
	// Everything entering a one-way block leaves along the
	// arrow. One rule with no cases: a perpendicular arrival
	// turns, a head-on one reverses.
	if (cell.kind === 'block') {
		return { act: 'go', c: nc, r: nr, dir: cell.dir }
	}
	return { act: 'go', c: nc, r: nr, dir }
}

// Which straight segment a cell belongs to on dir's axis.
// Segments are delimited by wheels, blocks and the gutter, and
// carry the four-marble limit.
export function segmentOf(state, c, r, dir) {
	const cell = at(state.grid, c, r)
	if (!cell) return -1
	if (cell.kind !== 'pipe' && cell.kind !== 'booth') return -1
	return isVertical(dir) ? cell.segV : cell.segH
}

// Which segment a marble counts against. Inside a wheel or a
// block cell it is in no segment of its own, so it is charged
// to the one it is nearest: behind it on the way in, ahead of
// it on the way out. Charging it to whatever lay ahead
// regardless put every marble approaching a wheel on the
// books of the segment beyond that wheel, which left the
// segment it was actually in looking emptier than it was and
// let a fifth marble be fired into a full run.
function marbleSegment(state, m) {
	const here = segmentOf(state, m.c, m.r, m.dir)
	if (here >= 0) return here
	const d = along(m) < 0 ? back(m.dir) : m.dir
	return segmentOf(
		state, m.c + DX[d], m.r + DY[d], m.dir)
}

export function segmentLoad(state, seg) {
	if (seg < 0) return 0
	let n = 0
	for (const m of state.transit) {
		if (marbleSegment(state, m) === seg) n++
	}
	return n
}

export const SEG_CAP = 4


// The four transfers, and the only code anywhere that writes
// wheel.slots or state.transit. A marble has exactly two homes
// — in flight, or seated in a slot — and five ways to move
// between them; routing every one through this block is what
// makes a lost or duplicated marble findable rather than a
// mystery twenty seconds later.

// A marble in flight carries both the cell it is in and its
// board position. The position is what moves and what gets
// drawn; the cell is what the transition rule is asked about.
// `edge` starts the marble at the near edge of the cell rather
// than its middle, which is what a marble dropping out of the
// gutter into the top of a pipe is doing. The gutter lane is
// not a cell and is not as tall as one, so letting it launch
// from a notional row -1 would have the marble travel half a
// cell to reach a boundary only 40 units away.
export function launch(state, c, r, dir, colour, edge) {
	const half = edge ? step(dir) / 2 : 0
	state.transit.push({
		c, r, dir, colour,
		x: centreX(c) - DX[dir] * half,
		y: centreY(r) - DY[dir] * half,
	})
}

// Signed distance from the centre of the marble's own cell,
// measured along the way it is going. Everything the travel
// code needs to know about where a marble is sits in this one
// number: negative is short of the centre, positive past it,
// and the cell edge is at half a step either side.
export function along(m) {
	const dx = m.x - centreX(m.c)
	const dy = m.y - centreY(m.r)
	return dx * DX[m.dir] + dy * DY[m.dir]
}

export function seat(state, wheel, k, m) {
	wheel.slots[k] = m.colour
	drop(state, m)
}

// Straight from the gutter into a wheel below it, with no
// flight in between: the gutter lets onto an adjacent wheel
// directly, which is both what the rules say and what the
// original looked like.
export function seatColour(wheel, k, colour) {
	wheel.slots[k] = colour
}

export function drop(state, m) {
	const i = state.transit.indexOf(m)
	if (i >= 0) state.transit.splice(i, 1)
}

// Breaking destroys the four marbles in the wheel. That is the
// board's only sink, which is why a wheel may be broken any
// number of times and why the look, not the behaviour, is what
// `broken` changes.
export function emptyWheel(wheel) {
	wheel.slots[0] = null
	wheel.slots[1] = null
	wheel.slots[2] = null
	wheel.slots[3] = null
}
