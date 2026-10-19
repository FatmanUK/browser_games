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
import { MAX_AMMO, LIVES } from './missiles.js'
import { portrait, ROW_PX } from './sprites.js'

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
// Twenty-six, not fifteen: a row holds a face now, and a
// face worth having is taller than a line of text.
const ROW_H = 26
const BOARD_X = W - 158
const BOARD_Y = 104

function boardRow(ctx, car, place, mine, y) {
	const colour = mine ? LIVE : DIM
	const name = mine ? PLAYER_NAME : car.name
	const livery = mine ? PLAYER_COLOURS : car.colours
	label(ctx, BOARD_X, y, ordinal(place), 'left', colour)
	// The face, so the board answers "who" with the same
	// thing the podium does. It wears the livery, which is
	// what used to tie a row to a car on the road — the
	// swatch beside it is kept anyway, because a cap at
	// sixteen pixels is a smaller patch of colour than the
	// swatch was and the road is where you have to match it.
	const img = portrait(name, livery, ROW_PX)
	ctx.drawImage(img, BOARD_X + 28, y - img.height + 6)
	label(ctx, BOARD_X + 56, y, name, 'left', colour)
	ctx.fillStyle = livery.body
	ctx.fillRect(BOARD_X + 126, y - 7, 14, 7)
}

function drawBoard(ctx, state) {
	const field = orderOf(state.track, state, state.rivals)
	brackets(ctx, BOARD_X - 10, BOARD_Y - 14, 158, 168)
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
	if (state.out) return 'OUT OF LIVES — PRESS NEW GAME'
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
		ctx, 185, H - 46, 'SPEED',
		Math.round(state.speed), 26)
	speedBar(ctx, state.speed, maxSpeed, 185, H - 16, 150)
}

// Who is winning, right now, with a face on it. The six-row
// board down the side answers "where am I"; this answers "who
// is in front", which is a different question and the one you
// glance at mid-corner.
const PODIUM_X = 352
const PODIUM_Y = 50
const PODIUM_W = 122

function podiumEntry(ctx, car, place, mine, x) {
	const img = portrait(
		mine ? PLAYER_NAME : car.name,
		mine ? PLAYER_COLOURS : car.colours)
	ctx.drawImage(img, x, PODIUM_Y - 4)
	const tx = x + img.width + 5
	label(
		ctx, tx, PODIUM_Y + 24, ordinal(place), 'left',
		place === 1 ? '#ffe28a' : DIM)
	label(
		ctx, tx, PODIUM_Y + 40,
		mine ? PLAYER_NAME : car.name, 'left',
		mine ? LIVE : '#d8ecf4')
}

function drawPodium(ctx, state) {
	const top = orderOf(state.track, state, state.rivals)
		.slice(0, 3)
	top.forEach((car, i) => {
		podiumEntry(
			ctx, car, i + 1, car === state,
			PODIUM_X + i * PODIUM_W)
	})
}

// Lives and ammo as pips rather than numbers: both are small
// counts that change suddenly, and a row you can take in
// without reading beats a digit you have to.
function pips(ctx, x, y, n, of, on, off) {
	for (let i = 0; i < of; i++) {
		ctx.fillStyle = i < n ? on : off
		ctx.fillRect(x + i * 12, y, 8, 8)
	}
}

function drawStores(ctx, state) {
	label(ctx, 20, H - 62, 'LIVES')
	pips(
		ctx, 20, H - 58, state.lives, LIVES,
		'#ff8a7a', 'rgba(120,70,70,0.45)')
	label(ctx, 90, H - 62, 'MISSILES')
	pips(
		ctx, 90, H - 58, state.ammo, MAX_AMMO,
		'#ffce54', 'rgba(110,95,60,0.45)')
}

export function drawHud(ctx, state, best, maxSpeed, place) {
	ctx.save()
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.textBaseline = 'alphabetic'

	drawMeters(ctx, state, best, maxSpeed, place)
	drawPodium(ctx, state)
	drawStores(ctx, state)
	drawBoard(ctx, state)
	ctx.fillStyle = DIM
	label(
		ctx, W - 20, H - 18,
		'ARROWS / WASD TO DRIVE · SPACE TO FIRE', 'right')

	drawLights(ctx, state.race)
	drawResult(ctx, state, state.race)
	ctx.restore()
}
