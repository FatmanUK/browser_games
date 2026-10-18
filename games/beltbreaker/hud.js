// The HUD. Two halves: a slim bar of real <button> elements
// over the top of the canvas (they have to be buttons — they
// are clickable controls, and the Sound/Music pair comes from
// games/_shared/audio.js), and the meters, which are drawn on
// the canvas as part of the game's own art.
//
// The meters used to be createStat() lines in the sidebar, the
// same as the other three games use. That reads as a browser
// form sitting on top of a game; a gauge drawn in the game's
// own palette reads as instrumentation. The shared helper is
// still the right default for a game that wants a plain stat
// line — this one just wants something louder.

import { W, H, MAX_GUN, PICKUP_LIFE } from './common.js'
import { frameFor } from './rocks.js'

const FONT = 'ui-monospace, "SF Mono", Menlo, monospace'
const LIVE = '#8fe9ff'
const DIM = 'rgba(126,186,210,0.72)'

function createButton(label, onClick) {
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'game-side-button'
	btn.textContent = label
	// See chrome.js: suppressing mousedown's default keeps
	// focus on the canvas, so the keys keep working.
	btn.addEventListener(
		'mousedown', (e) => e.preventDefault())
	btn.addEventListener('click', onClick)
	return btn
}

function createCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = W
	canvas.height = H
	canvas.tabIndex = 0
	return canvas
}

export function buildWindow(container, title, controls, onNew) {
	const frame = document.createElement('div')
	frame.className = 'belt-window'

	const header = document.createElement('div')
	header.className = 'belt-header'
	const controlsRow = document.createElement('div')
	controlsRow.className = 'belt-row'

	const heading = document.createElement('h2')
	heading.textContent = title
	controlsRow.append(
		heading,
		createButton('New game', onNew),
		createButton('← Back to games', controls.back))

	const canvas = createCanvas()
	header.append(controlsRow)
	frame.append(canvas, header)
	container.appendChild(frame)
	return { canvas, controlsRow }
}

// Angular brackets around a readout, the way an instrument
// panel frames a value. Cheap, and it does more to make the
// HUD look built-in than the type choice does.
function brackets(ctx, x, y, w, h) {
	const tick = 7
	ctx.strokeStyle = 'rgba(120,214,255,0.4)'
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(x, y + tick)
	ctx.lineTo(x, y)
	ctx.lineTo(x + tick, y)
	ctx.moveTo(x + w - tick, y + h)
	ctx.lineTo(x + w, y + h)
	ctx.lineTo(x + w, y + h - tick)
	ctx.stroke()
}

function readout(ctx, x, y, label, value, size) {
	ctx.textAlign = 'left'
	ctx.fillStyle = DIM
	ctx.font = `10px ${FONT}`
	ctx.fillText(label, x, y)
	ctx.fillStyle = LIVE
	ctx.font = `bold ${size}px ${FONT}`
	ctx.shadowColor = 'rgba(80,200,255,0.75)'
	ctx.shadowBlur = 10
	ctx.fillText(value, x, y + size + 2)
	ctx.shadowBlur = 0
	return ctx.measureText(value).width
}

function rightReadout(ctx, x, y, label, value, size) {
	ctx.textAlign = 'right'
	ctx.fillStyle = DIM
	ctx.font = `10px ${FONT}`
	ctx.fillText(label, x, y)
	ctx.fillStyle = LIVE
	ctx.font = `bold ${size}px ${FONT}`
	ctx.shadowColor = 'rgba(80,200,255,0.75)'
	ctx.shadowBlur = 10
	ctx.fillText(value, x, y + size + 2)
	ctx.shadowBlur = 0
	ctx.textAlign = 'left'
}

// Remaining ships as the ship itself, not as a number: the
// player already knows what their craft looks like.
function drawLives(ctx, atlas, state, x, y) {
	const img = frameFor(atlas.ship, -Math.PI / 2)
	const step = 20
	const shown = Math.min(6, Math.max(0, state.lives))
	for (let i = 0; i < shown; i++) {
		ctx.globalAlpha = 0.9
		ctx.drawImage(
			img, 0, 0, img.width, img.height,
			x + i * step, y, 17, 17)
	}
	ctx.globalAlpha = 1
	if (state.lives <= 6) return
	ctx.fillStyle = DIM
	ctx.font = `10px ${FONT}`
	ctx.fillText(`+${state.lives - 6}`, x + 6 * step, y + 13)
}

// Gun level as pips rather than a number, so an upgrade is a
// light coming on.
function drawGuns(ctx, state, x, y) {
	for (let i = 0; i < MAX_GUN; i++) {
		const on = i < state.gun
		ctx.fillStyle = on
			? 'rgba(150,240,255,0.95)'
			: 'rgba(90,140,165,0.25)'
		ctx.beginPath()
		ctx.moveTo(x + i * 11, y + 9)
		ctx.lineTo(x + i * 11 + 4, y)
		ctx.lineTo(x + i * 11 + 8, y + 9)
		ctx.closePath()
		ctx.fill()
	}
}

function phaseText(state) {
	if (state.over) return 'SIGNAL LOST'
	if (state.phase === 'ready') return 'STAND BY'
	if (state.phase === 'belt') {
		return `BELT · ${state.rocks.length} ROCKS`
	}
	if (state.phase === 'tunnel') {
		const tn = state.tunnel
		const k = Math.min(100, (tn.t / tn.dur) * 100)
		return `WORMHOLE · ${Math.floor(k)}%`
	}
	return 'GUARDIAN'
}

// A pickup about to expire gets a shrinking tick under the
// cash readout, so the player knows a coin is going without
// having to watch it blink.
function drawDropTimer(ctx, state, x, y) {
	let worst = 0
	for (const p of state.pickups) {
		worst = Math.max(worst, p.t)
	}
	if (worst === 0) return
	const k = 1 - worst / PICKUP_LIFE
	ctx.fillStyle = 'rgba(255,196,90,0.8)'
	ctx.fillRect(x - 46, y, 46 * Math.max(0, k), 2)
}

export function drawHud(ctx, atlas, state, best) {
	ctx.save()
	ctx.textBaseline = 'alphabetic'
	readout(ctx, 20, 54, 'SCORE', String(state.score), 26)
	ctx.fillStyle = DIM
	ctx.font = `10px ${FONT}`
	ctx.fillText(`BEST ${best.value}`, 20, 96)
	brackets(ctx, 14, 42, 150, 62)

	rightReadout(
		ctx, W - 20, 54, 'CASH',
		String(state.cash), 22)
	drawDropTimer(ctx, state, W - 20, 84)
	rightReadout(
		ctx, W - 20, 104, 'LEVEL',
		String(state.level), 18)

	drawLives(ctx, atlas, state, 20, H - 38)
	drawGuns(ctx, state, 20, H - 17)
	ctx.textAlign = 'right'
	ctx.fillStyle = DIM
	ctx.font = `11px ${FONT}`
	ctx.fillText(phaseText(state), W - 20, H - 17)
	ctx.restore()
}
