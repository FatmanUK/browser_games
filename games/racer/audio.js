// Dash's own sound palette, built on the shared engine in
// games/_shared/audio.js. This is the only place Dash-specific
// audio choices live.
//
// The effects are still synthesized tones. The music is not:
// it is a ProTracker module in music/, so it can be replaced
// without touching any code — drop a .mod in there and name it
// in TRACKS below.

import {
	createAudio, createAudioToggles,
} from '../_shared/audio.js'
import { createMusic } from '../_shared/music.js'
import { MOD_BASE64 } from './music-data.js'

// The shared engine wants a melody to loop; the music comes
// from the tracker module instead, so this single rest is
// never heard.
const SILENT = [null]

export const TRACKS = ['signal_lost.mod']

const MUSIC = {
	baseUrl: new URL('music/', import.meta.url),
	tracks: TRACKS,
	fallback: MOD_BASE64,
}


// Coming back down off the flyover.
function jumpFx(audio) {
	return {
		land: () =>
			audio.toneSequence(
				[[150, 0.08], [95, 0.14]],
				'triangle', 0.1, 20),
	}
}

// The weapons: picking one up, firing it, and being hit by it.
function weaponFx(audio) {
	return {
		pickup: () =>
			audio.toneSequence(
				[[880, 0.06], [1320, 0.1]],
				'square', 0.07, 40),
		missile: () =>
			audio.toneSequence(
				[[520, 0.06], [300, 0.14]],
				'sawtooth', 0.09, 30),
		wreck: () =>
			audio.toneSequence(
				[
					[180, 0.12], [120, 0.18],
					[80, 0.26],
				],
				'sawtooth', 0.11, 40),
	}
}

// The effects, kept apart from the wiring: the palette is what
// grows when the game grows (a countdown, a chequered flag) and
// setupSound itself should not grow with it.
function effects(audio) {
	return {
		...weaponFx(audio),
		...jumpFx(audio),
		bump: () => audio.tone(90, 0.12, 'square', 0.1),
		splash: () =>
			audio.toneSequence(
				[[300, 0.1], [180, 0.15]],
				'sine', 0.08, 70),
		slow: () => audio.tone(140, 0.2, 'triangle', 0.08),
		lap: () => audio.tone(660, 0.12, 'square', 0.08),
		countdown: () =>
			audio.tone(440, 0.18, 'square', 0.09),
		go: () => audio.tone(880, 0.22, 'square', 0.11),
		bestLap: () =>
			audio.toneSequence(
				[
					[523, 0.1], [659, 0.1],
					[784, 0.1], [1047, 0.25],
				],
				'square', 0.09, 90),
		finish: () =>
			audio.toneSequence(
				[
					[784, 0.1], [784, 0.1],
					[988, 0.1], [1319, 0.35],
				],
				'square', 0.1, 70),
	}
}

export function setupSound(side) {
	const audio = createAudio(SILENT, 500)
	const music = createMusic(audio.context, MUSIC)
	// A façade, not the engine itself: Sound stays the
	// engine's, Music belongs to the tracker player.
	createAudioToggles(side, {
		isSoundOn: audio.isSoundOn,
		setSoundOn: audio.setSoundOn,
		isMusicOn: music.isOn,
		setMusicOn: music.setOn,
	})

	return {
		...effects(audio),
		unlock: audio.unlock,
		stop() {
			music.stop()
			audio.stop()
		},
	}
}
