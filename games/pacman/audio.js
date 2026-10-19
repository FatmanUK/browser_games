// Maze Muncher's own sound palette, built on the shared engine
// in games/_shared/audio.js. This is the only place Maze
// Muncher-specific audio choices live.
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

export const TRACKS = ['maze-muncher.mod']

const MUSIC = {
	baseUrl: new URL('music/', import.meta.url),
	tracks: TRACKS,
	fallback: MOD_BASE64,
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
		unlock: audio.unlock,
		stop() {
			music.stop()
			audio.stop()
		},
	}
}
