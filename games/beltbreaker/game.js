// Belt Breaker — an Asteroids-style rock shoot with a
// pre-rendered, fake-3D look. Each level is three phases: clear
// the belt, fly the wormhole, then fight the guardian.
//
// The module itself is deliberately thin: world.js owns the
// rules, render.js and render-tunnel.js own the drawing,
// sprites.js owns the art and audio.js owns the sound.

import { loadNumber, saveNumber } from '../_shared/storage.js'
import { buildWindow } from './hud.js'
import { setupSound } from './audio.js'
import { getAtlas } from './sprites.js'
import { newGame, updateWorld } from './world.js'
import { draw } from './render.js'
import { KEY_DIRS, hyperspace } from './common.js'

const BEST_KEY = 'bg-beltbreaker-best'

function createInput(ref, fx) {
	function onKeyDown(e) {
		// Unlock here, in the real gesture's call stack —
		// every tone() below fires from the frame loop,
		// where a resume() would be ignored in silence.
		fx.unlock()
		if (e.key === 'Shift') {
			if (ref.state.phase !== 'tunnel') {
				hyperspace(ref.state, fx)
			}
			e.preventDefault()
			return
		}
		const action = KEY_DIRS[e.key]
		if (!action) return
		ref.state.keys.add(action)
		e.preventDefault()
	}

	function onKeyUp(e) {
		const action = KEY_DIRS[e.key]
		if (action) ref.state.keys.delete(action)
	}

	// A held key whose keyup lands on another window would
	// otherwise stay held forever.
	function onBlur() {
		ref.state.keys.clear()
	}

	return { onKeyDown, onKeyUp, onBlur }
}

function createRuntime(ctx, best, fx) {
	const ref = { state: newGame() }
	const atlas = getAtlas()
	let handle = null
	let last = null

	function frame(time) {
		if (last === null) last = time
		const dt = Math.min((time - last) / 1000, 0.05)
		last = time
		updateWorld(ref.state, dt, fx)
		if (ref.state.score > best.value) {
			best.value = ref.state.score
			saveNumber(BEST_KEY, best.value)
		}
		draw(ctx, atlas, ref.state, best)
		handle = requestAnimationFrame(frame)
	}

	function start() {
		ref.state = newGame()
		last = null
	}

	const input = createInput(ref, fx)
	handle = requestAnimationFrame(frame)

	return {
		start,
		onKeyDown: input.onKeyDown,
		onKeyUp: input.onKeyUp,
		onBlur: input.onBlur,
		stop: () => {
			cancelAnimationFrame(handle)
			fx.stop()
		},
	}
}

export default {
	id: 'beltbreaker',
	title: 'Belt Breaker',
	description:
		'Shoot your way out of an asteroid belt, then ' +
		'through a wormhole and past its guardian. ' +
		'Arrows/WASD to fly, space to fire.',

	init(container, controls) {
		let runtime = null
		const { canvas, controlsRow } = buildWindow(
			container, this.title, controls,
			() => runtime.start())

		const fx = setupSound(controlsRow)
		const best = { value: loadNumber(BEST_KEY, 0) }

		runtime = createRuntime(
			canvas.getContext('2d'), best, fx)

		canvas.addEventListener('keydown', runtime.onKeyDown)
		canvas.addEventListener('keyup', runtime.onKeyUp)
		window.addEventListener('blur', runtime.onBlur)
		canvas.focus()

		this._cleanup = () => {
			runtime.stop()
			canvas.removeEventListener(
				'keydown', runtime.onKeyDown)
			canvas.removeEventListener(
				'keyup', runtime.onKeyUp)
			window.removeEventListener(
				'blur', runtime.onBlur)
		}
	},

	destroy() {
		this._cleanup?.()
	},
}
