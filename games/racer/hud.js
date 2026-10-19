// Dash's meters, drawn on the canvas with the shared HUD
// primitives in games/_shared/hud.js. They used to be
// createStat() lines in the bar over the top of the canvas;
// drawn on it instead, they read as a dashboard rather than
// as a row of labels, and they stop the bar growing a second
// line that eats into the road.

import {
	WIDTH as W, HEIGHT as H, DIM, LIVE, brackets, readout,
	label,
} from '../_shared/hud.js'
import {
	LAP_TARGET, ordinal, orderOf, allGates,
} from './race.js'
import { PLAYER_NAME, PLAYER_COLOURS } from './car.js'

function countBits(n) {
	let c = 0
	while (n) { c += n & 1; n >>= 1 }
	return c
}

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

// Big centred text, the same shape Belt Breaker's banners use,
// so the two games announce things the same way.
function banner(ctx, text, size, y, colour) {
	ctx.save()
	ctx.textAlign = 'center'
	ctx.font = `bold ${size}px system-ui, sans-serif`
	ctx.shadowColor = '#4ad6ff'
	ctx.shadowBlur = 24
	ctx.fillStyle = colour
	ctx.fillText(text, W / 2, y)
	ctx.restore()
}

// The field, furthest round the lap first. A race against five
// cars you can only tell apart by colour is a race against
// scenery; a name and a place turns the blue one into the one
// who beat you last time.
//
// Drawn down the right-hand side under BEST LAP, where there is
// nothing else and the road is rarely interesting — the player
// is at the centre of the window, and the standings must not
// compete with it. The player's own row is LIVE, the rest DIM,
// which is the suite's existing live/inactive distinction
// rather than a new colour.
const ROW_H = 15
const BOARD_X = W - 150
const BOARD_Y = 108

function boardRow(ctx, car, place, mine, y) {
	const colour = mine ? LIVE : DIM
	label(ctx, BOARD_X, y, ordinal(place), 'left', colour)
	label(
		ctx, BOARD_X + 34, y,
		mine ? PLAYER_NAME : car.name, 'left', colour)
	// A swatch rather than more words: it is the only thing
	// that ties a row to the car you can see on the road.
	// The player's livery is not on the player's state — it
	// is passed to drawCar as a separate argument — so the
	// row has to reach for it rather than read it off the car.
	ctx.fillStyle =
		(mine ? PLAYER_COLOURS : car.colours).body
	ctx.fillRect(BOARD_X + 112, y - 7, 16, 7)
}

function drawBoard(ctx, state) {
	const field = orderOf(state.track, state, state.rivals)
	brackets(ctx, BOARD_X - 10, BOARD_Y - 14, 148, 100)
	label(ctx, BOARD_X, BOARD_Y - 3, 'STANDINGS')
	field.forEach((car, i) => {
		boardRow(
			ctx, car, i + 1, car === state,
			BOARD_Y + 14 + i * ROW_H)
	})
}

// Above the middle, not on it: unlike Belt Breaker's ship, the
// car sits dead centre of the window, and a 92px glyph there
// hides the one thing the player is about to need to see.
const LIGHTS_Y = 152

// The lights. `ready` runs down through 3, 2, 1 and then past
// zero, where the cars are already released and only the 'GO!'
// is left — hence the two branches rather than one countdown.
function drawLights(ctx, race) {
	if (race.phase !== 'countdown') return
	const left = Math.ceil(race.ready)
	if (left > 0) {
		const k = left - race.ready
		ctx.save()
		ctx.globalAlpha = 0.4 + 0.6 * k
		banner(ctx, String(left), 92, LIGHTS_Y, '#f2faff')
		ctx.restore()
		return
	}
	banner(ctx, 'GO!', 84, LIGHTS_Y, '#9dffb0')
}

function resultLine(state, race) {
	if (race.place !== 1) {
		return 'WIN IT TO OPEN THE NEXT TRACK'
	}
	if (state.unlocked > state.level) {
		return `TRACK ${state.level + 1} OPEN — ] TO GO THERE`
	}
	return 'PRESS NEW GAME TO RACE AGAIN'
}

function drawResult(ctx, state, race) {
	if (race.phase !== 'finished') return
	ctx.fillStyle = 'rgba(4,10,22,0.55)'
	ctx.fillRect(0, 0, W, H)
	banner(
		ctx, `FINISHED ${ordinal(race.place)}`, 52,
		H / 2 - 4, race.place === 1 ? '#ffe28a' : '#eaf6ff')
	label(
		ctx, W / 2, H / 2 + 28,
		resultLine(state, race), 'center')
}

// The top-left cluster plus the speed block. Split out of
// drawHud only to keep it inside forty lines.
function drawMeters(ctx, state, best, maxSpeed, place) {
	readout(
		ctx, 20, 54, 'LAP',
		`${Math.min(state.lapsShown + 1, LAP_TARGET)}/` +
			LAP_TARGET, 26)
	brackets(ctx, 14, 42, 350, 50)

	// Beside LAP rather than mid-window: the middle column is
	// where the lights and the chequered flag go.
	readout(ctx, 150, 54, 'POS', ordinal(place), 26)

	// How many gates are still outstanding this lap. The lap
	// will not count without them, so the count has to be
	// somewhere a driver can see it.
	const n = state.track.GATES.length
	const left = countBits(
		allGates(state.track) & ~(state.gates || 0))
	readout(ctx, 268, 54, 'GATES', `${n - left}/${n}`, 26)

	readout(
		ctx, W - 20, 54, 'BEST LAP',
		formatLap(best.value), 22, 'right')

	// Which track, and how many are open. The brackets are
	// the keys that step it, spelled out rather than left to
	// be discovered.
	label(
		ctx, W - 20, 86,
		`[ TRACK ${state.level} / ${state.unlocked} ]`,
		'right')

	readout(
		ctx, 20, H - 46, 'SPEED',
		Math.round(state.speed), 26)
	speedBar(ctx, state.speed, maxSpeed, 20, H - 16, 150)
}

export function drawHud(ctx, state, best, maxSpeed, place) {
	ctx.save()
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.textBaseline = 'alphabetic'

	drawMeters(ctx, state, best, maxSpeed, place)
	drawBoard(ctx, state)
	ctx.fillStyle = DIM
	label(
		ctx, W - 20, H - 18,
		'ARROWS / WASD TO DRIVE', 'right')

	drawLights(ctx, state.race)
	drawResult(ctx, state, state.race)
	ctx.restore()
}
