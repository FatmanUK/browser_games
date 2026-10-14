// Dash's own sound palette, built on the shared engine in
// games/_shared/audio.js. Swap MELODY and the tone() calls
// below for real tracks/samples later without touching the
// engine or games/racer/game.js.

import {
	createAudio, createAudioToggles,
} from '../_shared/audio.js'

const MELODY = [
	330, 392, 440, 392, 330, 294, 330, 392,
	349, 415, 466, 415, 349, 311, 349, 415,
]

export function setupSound(side) {
	const audio = createAudio(MELODY, 200)
	createAudioToggles(side, audio)

	return {
		bump: () => audio.tone(90, 0.12, 'square', 0.1),
		skid: () =>
			audio.toneSequence(
				[[500, 0.08], [350, 0.1]],
				'sawtooth', 0.06, 60),
		splash: () =>
			audio.toneSequence(
				[[300, 0.1], [180, 0.15]],
				'sine', 0.08, 70),
		slow: () => audio.tone(140, 0.2, 'triangle', 0.08),
		lap: () => audio.tone(660, 0.12, 'square', 0.08),
		bestLap: () =>
			audio.toneSequence(
				[
					[523, 0.1], [659, 0.1],
					[784, 0.1], [1047, 0.25],
				],
				'square', 0.09, 90),
		unlock: audio.unlock,
		stop: audio.stop,
	}
}
