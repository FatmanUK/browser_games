// Shared Web Audio engine for any game that wants sound. Each
// game supplies its own melody and sound-effect frequencies —
// this only handles AudioContext lifecycle, the autoplay-gesture
// requirement, and independent Sound/Music on/off state. Nothing
// plays and no AudioContext is created until a tone is actually
// triggered or Music is turned on, so context creation always
// happens inside a real user gesture (a keypress, a toggle
// click), never on page load.
//
// Swap in real tracks/samples later by replacing what tone()/
// toneSequence() are called with per game — this engine itself
// doesn't care whether a "note" is synthesized or sampled.

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

function createMusicLoop(ctx, melody, noteMs) {
	let timer = null
	let index = 0

	function step() {
		const note = melody[index]
		if (note) {
			playTone(
				ctx, note, (noteMs / 1000) * 0.8,
				'triangle', 0.04)
		}
		index = (index + 1) % melody.length
		timer = setTimeout(step, noteMs)
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
		state.music = createMusicLoop(
			state.ctx, state.melody, state.noteMs)
	}
	if (state.ctx.state === 'suspended') state.ctx.resume()
	return state.ctx
}

function applyMusicState(state) {
	if (!state.musicOn) {
		if (state.music) state.music.stop()
		return
	}
	ensureContext(state)
	state.music.start()
}

function stopAudio(state) {
	if (state.music) {
		state.music.stop()
		state.music = null
	}
	if (state.ctx) {
		state.ctx.close()
		state.ctx = null
	}
}

function playSfx(state, freq, duration, type, volume) {
	if (!state.soundOn) return
	playTone(ensureContext(state), freq, duration, type, volume)
}

function playSequence(state, notes, type, volume, gapMs) {
	if (!state.soundOn) return
	const ctx = ensureContext(state)
	notes.forEach(([freq, duration], i) => {
		setTimeout(
			() => playTone(
				ctx, freq, duration, type, volume),
			i * gapMs)
	})
}

export function createAudio(melody, noteMs = 220) {
	const state = {
		ctx: null, music: null, melody, noteMs,
		soundOn: true, musicOn: false,
	}
	const onPageHide = () => stopAudio(state)
	window.addEventListener('pagehide', onPageHide)

	return {
		isSoundOn: () => state.soundOn,
		setSoundOn: (value) => { state.soundOn = value },
		isMusicOn: () => state.musicOn,
		setMusicOn(value) {
			state.musicOn = value
			applyMusicState(state)
		},
		tone: (freq, duration, type, volume) =>
			playSfx(state, freq, duration, type, volume),
		toneSequence: (notes, type, volume, gapMs) =>
			playSequence(
				state, notes, type, volume, gapMs),
		stop() {
			stopAudio(state)
			window.removeEventListener(
				'pagehide', onPageHide)
		},
	}
}

function createToggleButton(side, label, getValue, setValue) {
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'game-side-button'
	const text = () => `${label}: ${getValue() ? 'On' : 'Off'}`
	btn.textContent = text()
	btn.addEventListener('click', () => {
		setValue(!getValue())
		btn.textContent = text()
	})
	side.appendChild(btn)
	return btn
}

// Adds a "Sound: On/Off" and a "Music: On/Off" button to a
// game's sidebar (the `side` element from createChrome), wired
// to the given audio instance.
export function createAudioToggles(side, audio) {
	createToggleButton(
		side, 'Sound', audio.isSoundOn, audio.setSoundOn)
	createToggleButton(
		side, 'Music', audio.isMusicOn, audio.setMusicOn)
}
