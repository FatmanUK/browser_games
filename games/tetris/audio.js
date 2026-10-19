// Blockfall's own sound palette, built on the shared engine in
// games/_shared/audio.js. This is the only place Blockfall-
// specific audio choices live.
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

export const TRACKS = ['blockfall.mod']

const MUSIC = {
	baseUrl: new URL('music/', import.meta.url),
	tracks: TRACKS,
	fallback: MOD_BASE64,
}

function lineClearNotes(lines) {
	const notes = []
	for (let i = 0; i < lines; i++) {
		notes.push([440 + i * 110, 0.12])
	}
	return notes
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
		stop() {
			music.stop()
			audio.stop()
		},
	}
}
