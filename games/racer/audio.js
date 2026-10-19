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

export const TRACKS = ['dash.mod']

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
		stop() {
			music.stop()
			audio.stop()
		},
	}
}
