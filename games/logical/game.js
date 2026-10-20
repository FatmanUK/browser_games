// Wheelworks — a Logical-style marble puzzle. Fill a wheel's
// four slots with four of a colour and it breaks, destroying
// them; break every wheel to clear the level. Marbles come
// only from the gutter along the top, and letting the gutter
// jam is the only way to lose.
//
// The module itself is deliberately thin: level.js builds the
// boards, world.js owns the rules, travel.js moves the
// marbles, render.js and hud.js own the drawing, sprites.js
// owns the art and audio.js owns the sound.
//
// This is the suite's first mouse game, which shows up here in
// three places: audio is unlocked from mousedown rather than
// keydown, the contextmenu default has to be suppressed on the
// canvas so right-click can turn a wheel, and the fit that
// render.js drew with is stashed so input.js can invert
// exactly that one.

import { loadNumber, saveNumber } from '../_shared/storage.js'
import { buildWindow } from '../_shared/hud.js'
import { setupSound } from './audio.js'
import { getAtlas } from './sprites.js'
import { newGame, update, readyForNext } from './world.js'
import { drawBoard } from './render.js'
import {
	drawHud, drawBanner, drawIntro, drawAlert,
} from './hud.js'
import { fireSlot } from './travel.js'
import { nudge } from './wheel.js'
import { loadReached, nextLevel } from './progress.js'
import { levelFor } from './code.js'
import {
	boardPoint, canvasPoint, padKey, pickPad, pickSlot,
	pickWheel, typeKey,
} from './input.js'

const BEST_KEY = 'bg-wheelworks-best'

function enterIntro(ref) {
	ref.intro = true
	ref.ui = { typed: '', bad: false }
	ref.reached = loadReached()
	ref.state = newGame(ref.reached, 0)
}

// Enter with nothing typed plays the level the ladder is at;
// with a code typed it jumps to that level instead. A code is
// a visit, not an unlock, so it never moves the ladder.
function submit(ref, fx) {
	const typed = ref.ui.typed
	if (!typed.length) {
		ref.intro = false
		fx.accept()
		return
	}
	const level = levelFor(typed)
	if (!level) {
		ref.ui.bad = true
		fx.refuse()
		return
	}
	ref.state = newGame(level, 0)
	ref.intro = false
	fx.accept()
}

function clickBoard(ref, fx, e, p) {
	const b = boardPoint(ref.fit, p)
	const wheel = pickWheel(ref.state, b)
	if (!wheel) return
	if (e.button === 2) {
		if (!nudge(wheel)) fx.refuse()
		else fx.turn()
		return
	}
	fireSlot(ref.state, wheel, pickSlot(wheel, b), fx)
}

function keyDown(ref, fx, e) {
	if (ref.intro) {
		if (typeKey(ref.ui, e.key) === 'enter') {
			submit(ref, fx)
		}
		e.preventDefault()
		return
	}
	if (e.key === 'Enter' && ref.state.phase === 'over') {
		enterIntro(ref)
		e.preventDefault()
	}
}

function createInput(ref, fx, canvas) {
	function onMouseDown(e) {
		// Unlock here, in the real gesture's call stack.
		// Every tone() fires from a click or the frame
		// loop, and a resume() outside a trusted gesture
		// is ignored in silence.
		fx.unlock()
		canvas.focus()
		const p = canvasPoint(canvas, e)
		if (ref.intro) {
			const hit = pickPad(p)
			if (hit && padKey(ref.ui, hit) === 'enter') {
				submit(ref, fx)
			}
		} else if (ref.state.phase === 'play') {
			clickBoard(ref, fx, e, p)
		}
		e.preventDefault()
	}

	// On the canvas only. On the document it would take the
	// menu away from the rest of the page as well.
	function onContextMenu(e) {
		e.preventDefault()
	}

	function onKeyDown(e) {
		fx.unlock()
		keyDown(ref, fx, e)
	}

	return { onMouseDown, onContextMenu, onKeyDown }
}

// Clearing a level rolls straight into the next one, carrying
// the score: the ladder is the game, and an intro screen
// between every level would be a door to open twelve times.
function advance(ref, best, fx, dt) {
	if (ref.intro) return
	update(ref.state, dt, fx)
	if (ref.state.score > best.value) {
		best.value = ref.state.score
		saveNumber(BEST_KEY, best.value)
	}
	if (!readyForNext(ref.state)) return
	const s = ref.state
	ref.state = newGame(nextLevel(s.level), s.score)
}

// The fit the board was drawn with is kept on ref, and
// input.js inverts that one rather than working it out again.
function paint(ctx, atlas, ref, best) {
	ref.fit = drawBoard(ctx, atlas, ref.state)
	drawHud(ctx, atlas, ref.state, best)
	drawAlert(ctx, ref.state)
	drawBanner(ctx, ref.state)
	if (ref.intro) drawIntro(ctx, ref.ui, ref.reached)
}

function createRuntime(ctx, best, fx, canvas) {
	const ref = { state: null, ui: null, fit: null }
	enterIntro(ref)
	const atlas = getAtlas()
	let handle = null
	let last = null

	function frame(time) {
		if (last === null) last = time
		const dt = Math.min((time - last) / 1000, 0.05)
		last = time
		advance(ref, best, fx, dt)
		paint(ctx, atlas, ref, best)
		handle = requestAnimationFrame(frame)
	}

	function start() {
		enterIntro(ref)
		last = null
	}

	const input = createInput(ref, fx, canvas)
	handle = requestAnimationFrame(frame)

	return {
		start,
		onMouseDown: input.onMouseDown,
		onContextMenu: input.onContextMenu,
		onKeyDown: input.onKeyDown,
		stop: () => {
			cancelAnimationFrame(handle)
			fx.stop()
		},
	}
}

export default {
	id: 'wheelworks',
	title: 'Wheelworks',
	description:
		'Fill a wheel with four marbles of a colour and it ' +
		'breaks. Break them all before the gutter jams. ' +
		'Left-click to fire, right-click to turn.',

	init(container, controls) {
		let runtime = null
		const { canvas, controlsRow } = buildWindow(
			container, {
				title: this.title,
				onBack: controls.back,
				onNewGame: () => runtime.start(),
			})

		const fx = setupSound(controlsRow)
		const best = { value: loadNumber(BEST_KEY, 0) }

		runtime = createRuntime(
			canvas.getContext('2d'), best, fx, canvas)

		canvas.addEventListener(
			'mousedown', runtime.onMouseDown)
		canvas.addEventListener(
			'contextmenu', runtime.onContextMenu)
		canvas.addEventListener('keydown', runtime.onKeyDown)
		canvas.focus()

		this._cleanup = () => {
			runtime.stop()
			canvas.removeEventListener(
				'mousedown', runtime.onMouseDown)
			canvas.removeEventListener(
				'contextmenu', runtime.onContextMenu)
			canvas.removeEventListener(
				'keydown', runtime.onKeyDown)
		}
	},

	destroy() {
		this._cleanup?.()
	},
}
