// Synthesized audio for Blockfall via the Web Audio API — no
// sound files to fetch or license. Nothing plays until the
// player opts in through the Sound toggle, so there's no
// autoplay-policy fight: enabling IS the user gesture.

function playTone(ctx, freq, duration, type, volume) {
	const osc = ctx.createOscillator()
	const gain = ctx.createGain()
	osc.type = type
	osc.frequency.value = freq
	gain.gain.setValueAtTime(0, ctx.currentTime)
	gain.gain.linearRampToValueAtTime(
		volume, ctx.currentTime + 0.01)
	gain.gain.exponentialRampToValueAtTime(
		0.0001, ctx.currentTime + duration)
	osc.connect(gain)
	gain.connect(ctx.destination)
	osc.start()
	osc.stop(ctx.currentTime + duration)
}

// Background music needs more work before it's worth keeping on
// (it was intrusive) — parked behind this flag for now. The loop
// below is otherwise ready to go once that's revisited.
const MUSIC_ENABLED = false

const MELODY = [
	523, 659, 784, 659, 523, 392, 440, 523,
	494, 587, 740, 587, 494, 392, 440, 494,
]
const NOTE_MS = 220

function createMusicLoop(ctx) {
	let timer = null
	let index = 0

	function step() {
		playTone(ctx, MELODY[index], 0.18, 'triangle', 0.04)
		index = (index + 1) % MELODY.length
		timer = setTimeout(step, NOTE_MS)
	}

	return {
		start() {
			if (timer !== null) return
			index = 0
			step()
		},
		stop() {
			clearTimeout(timer)
			timer = null
		},
	}
}

function ensureContext(state) {
	if (!state.ctx) {
		const Ctx = window.AudioContext ||
			window.webkitAudioContext
		state.ctx = new Ctx()
		state.music = createMusicLoop(state.ctx)
	}
	if (state.ctx.state === 'suspended') state.ctx.resume()
}

function setEnabled(state, value) {
	state.enabled = value
	if (value) {
		ensureContext(state)
		if (MUSIC_ENABLED) state.music.start()
	} else if (state.music) {
		state.music.stop()
	}
}

function play(state, freq, duration, type, volume) {
	if (!state.enabled || !state.ctx) return
	playTone(state.ctx, freq, duration, type, volume)
}

function playLineClear(state, lines) {
	if (!state.enabled || !state.ctx) return
	const ctx = state.ctx
	for (let i = 0; i < lines; i++) {
		setTimeout(
			() => playTone(
				ctx, 440 + i * 110, 0.12,
				'square', 0.08),
			i * 60)
	}
}

function playGameOver(state) {
	if (!state.enabled || !state.ctx) return
	const ctx = state.ctx
	playTone(ctx, 220, 0.3, 'triangle', 0.1)
	setTimeout(
		() => playTone(ctx, 165, 0.3, 'triangle', 0.1), 150)
	setTimeout(
		() => playTone(ctx, 110, 0.4, 'triangle', 0.1), 300)
}

function stopAudio(state) {
	if (state.music) state.music.stop()
	if (state.ctx) state.ctx.close()
}

export function createAudio() {
	const state = { ctx: null, music: null, enabled: false }
	return {
		isEnabled: () => state.enabled,
		setEnabled: (value) => setEnabled(state, value),
		move: () => play(state, 220, 0.05, 'square', 0.05),
		rotate: () => play(state, 330, 0.06, 'square', 0.05),
		lock: () => play(state, 110, 0.12, 'triangle', 0.08),
		hardDrop: () =>
			play(state, 80, 0.15, 'sawtooth', 0.07),
		lineClear: (n) => playLineClear(state, n),
		gameOver: () => playGameOver(state),
		stop: () => stopAudio(state),
	}
}
