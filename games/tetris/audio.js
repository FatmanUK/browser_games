// Blockfall's own sound palette, built on the shared engine in
// games/_shared/audio.js. This is the only place Blockfall-
// specific audio choices live — swap MELODY and the tone() calls
// below for real tracks/samples later without touching the
// engine or games/tetris/game.js.

import {
	createAudio, createAudioToggles,
} from '../_shared/audio.js'

const MELODY = [
	523, 659, 784, 659, 523, 392, 440, 523,
	494, 587, 740, 587, 494, 392, 440, 494,
]

function lineClearNotes(lines) {
	const notes = []
	for (let i = 0; i < lines; i++) {
		notes.push([440 + i * 110, 0.12])
	}
	return notes
}

export function setupSound(side) {
	const audio = createAudio(MELODY, 220)
	createAudioToggles(side, audio)

	return {
		move: () => audio.tone(220, 0.05, 'square', 0.05),
		rotate: () => audio.tone(330, 0.06, 'square', 0.05),
		lock: () => audio.tone(110, 0.12, 'triangle', 0.08),
		hardDrop: () =>
			audio.tone(80, 0.15, 'sawtooth', 0.07),
		lineClear: (lines) =>
			audio.toneSequence(
				lineClearNotes(lines), 'square',
				0.08, 60),
		gameOver: () =>
			audio.toneSequence(
				[[220, 0.3], [165, 0.3], [110, 0.4]],
				'triangle', 0.1, 150),
		unlock: audio.unlock,
		stop: audio.stop,
	}
}
