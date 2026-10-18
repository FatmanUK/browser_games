// The HUD: title, buttons and meters in a translucent bar laid
// over the canvas, so the playfield can be the whole window.
// Buttons come from games/_shared/chrome.js's conventions (and
// deliberately do not steal keyboard focus from the canvas);
// the meters come from createStat.

import { createStat } from '../_shared/chrome.js'
import { W, H } from './common.js'

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
	const statsRow = document.createElement('div')
	statsRow.className = 'belt-row'

	const heading = document.createElement('h2')
	heading.textContent = title
	controlsRow.append(
		heading,
		createButton('New game', onNew),
		createButton('← Back to games', controls.back))

	const canvas = createCanvas()
	header.append(controlsRow, statsRow)
	frame.append(canvas, header)
	container.appendChild(frame)
	return { canvas, controlsRow, statsRow }
}

export function createHud(statsRow) {
	return {
		score: createStat(statsRow, 'Score'),
		best: createStat(statsRow, 'Best'),
		level: createStat(statsRow, 'Level'),
		lives: createStat(statsRow, 'Ships'),
		cash: createStat(statsRow, 'Cash'),
		gun: createStat(statsRow, 'Guns'),
		phase: createStat(statsRow, 'Phase'),
	}
}

function phaseLabel(state) {
	if (state.over) return 'Game over'
	if (state.phase === 'ready') return 'Get ready'
	if (state.phase === 'belt') {
		return `Belt (${state.rocks.length} left)`
	}
	if (state.phase === 'tunnel') {
		const tn = state.tunnel
		const k = Math.min(100, (tn.t / tn.dur) * 100)
		return `Wormhole ${Math.floor(k)}%`
	}
	const b = state.boss
	const k = Math.max(0, Math.ceil((b.hp / b.max) * 100))
	return `Guardian ${k}%`
}

export function updateHud(hud, state, best) {
	hud.score(state.score)
	hud.best(best.value)
	hud.level(state.level)
	hud.lives(Math.max(0, state.lives))
	hud.cash(state.cash)
	hud.gun(state.gun)
	hud.phase(phaseLabel(state))
}
