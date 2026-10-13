// Maze Muncher's own sound palette, built on the shared engine
// in games/_shared/audio.js. Swap MELODY and the tone() calls
// below for real tracks/samples later without touching the
// engine or games/pacman/game.js.

import {
	createAudio, createAudioToggles,
} from '../_shared/audio.js'

const MELODY = [
	392, 440, 494, 440, 392, 330, 349, 392,
	440, 494, 523, 494, 440, 349, 392, 440,
]

export function setupSound(side) {
	const audio = createAudio(MELODY, 200)
	createAudioToggles(side, audio)

	return {
		eat: () => audio.tone(660, 0.04, 'square', 0.04),
		hit: () =>
			audio.toneSequence(
				[[300, 0.1], [200, 0.15]],
				'sawtooth', 0.09, 90),
		countdownBeep: () =>
			audio.tone(440, 0.08, 'triangle', 0.06),
		go: () => audio.tone(660, 0.15, 'triangle', 0.08),
		levelComplete: () =>
			audio.toneSequence(
				[[523, 0.1], [659, 0.1], [784, 0.2]],
				'square', 0.08, 110),
		gameOver: () =>
			audio.toneSequence(
				[[220, 0.3], [165, 0.3], [110, 0.4]],
				'triangle', 0.1, 150),
		stop: audio.stop,
	}
}
