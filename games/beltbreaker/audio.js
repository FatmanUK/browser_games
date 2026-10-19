// Belt Breaker's own sound palette. Every game-specific audio
// choice lives here; the game code only ever calls the named
// effects.
//
// Two sources feed it. The percussive effects — shots, breaks,
// explosions — are rendered waveforms from samples.js, fired as
// one-shots, because oscillator tones can't make noise or a
// filtered blast. The jingles stay tone sequences on the shared
// engine, which is what that engine is good at. Music is a
// ProTracker module (music.js), so the Music toggle is wired to
// that rather than to the engine's melody loop.

import {
	createAudio, createAudioToggles,
} from '../_shared/audio.js'
import { createMusic } from '../_shared/music.js'
import { buildSfx } from './samples.js'
import { MOD_BASE64 } from './music-data.js'

// The shared engine wants a melody to loop; this game's music
// comes from a tracker module instead, so this single rest is
// never heard.
const SILENT = [null]

// Modules in music/, tried in order; the first that loads is
// the music. Drop your own in there and name it here.
// music-data.js is the fallback for when none of them load.
export const TRACKS = [
	'piston_cathedral.mod',
	'belt-breaker.mod',
]

const MUSIC = {
	baseUrl: new URL('music/', import.meta.url),
	tracks: TRACKS,
	fallback: MOD_BASE64,
}

// name: [notes, waveform, volume, gap in ms]
const SEQS = {
	extraLife: [
		[[523, 0.1], [659, 0.1], [880, 0.2]],
		'square', 0.06, 90,
	],
	warpIn: [
		[[120, 0.3], [240, 0.3], [480, 0.45]],
		'triangle', 0.07, 180,
	],
	alarm: [
		[[440, 0.2], [330, 0.2], [440, 0.2], [330, 0.3]],
		'square', 0.07, 230,
	],
	levelUp: [
		[[392, 0.12], [523, 0.12], [659, 0.3]],
		'triangle', 0.07, 110,
	],
	countdown: [[[660, 0.12]], 'square', 0.07, 0],
	go: [
		[[880, 0.1], [1320, 0.22]], 'square', 0.07, 90,
	],
	upgrade: [
		[[523, 0.08], [698, 0.08], [880, 0.08],
			[1175, 0.2]],
		'square', 0.07, 60,
	],
	gameOver: [
		[[330, 0.3], [262, 0.3], [196, 0.4], [131, 0.7]],
		'triangle', 0.09, 230,
	],
}

// name: [sample in the bank, gain]
const ONESHOTS = {
	shoot: ['shoot', 0.3],
	foeShoot: ['foeShoot', 0.3],
	rockClang: ['clang', 0.4],
	foeDie: ['foeDie', 0.5],
	shipDie: ['shipDie', 0.65],
	bossFire: ['bossFire', 0.4],
	bossSpit: ['bossSpit', 0.45],
	bossCore: ['bossCore', 0.4],
	bossHit: ['bossHit', 0.5],
	bossDie: ['bossDie', 0.8],
	warp: ['warp', 0.45],
	coin: ['coin', 0.5],
}

// The bank is built on first use, not at setup: building it
// needs a live AudioContext, and the context may not legally
// start until the player's first keypress.
function createBank(audio) {
	let sfx = null

	function fire(name, gain) {
		if (!audio.isSoundOn()) return
		const ctx = audio.context()
		if (!sfx) sfx = buildSfx(ctx)
		const level = ctx.createGain()
		level.gain.value = gain
		level.connect(ctx.destination)
		const src = ctx.createBufferSource()
		src.buffer = sfx[name]
		src.connect(level)
		src.start()
	}

	const out = {}
	for (const [name, a] of Object.entries(ONESHOTS)) {
		out[name] = () => fire(a[0], a[1])
	}
	out.rockBreak = (size) => fire(`break${size}`, 0.55)
	return out
}

function bindSeqs(audio) {
	const out = {}
	for (const [name, a] of Object.entries(SEQS)) {
		out[name] = () =>
			audio.toneSequence(a[0], a[1], a[2], a[3])
	}
	return out
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
		...createBank(audio),
		...bindSeqs(audio),
		// Forwarded explicitly: see games/README.md on the
		// AudioContext unlock gotcha.
		unlock: audio.unlock,
		stop() {
			music.stop()
			audio.stop()
		},
	}
}
