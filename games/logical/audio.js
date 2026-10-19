// Wheelworks' own sound palette, built on the shared engine in
// games/_shared/audio.js. This is the only place Wheelworks'
// audio choices live.
//
// The effects are synthesized tones. The music is not: it is a
// ProTracker module in music/, so it can be replaced without
// touching any code — drop a .mod in there and name it in
// TRACKS below.
//
// Nearly everything in this game is a marble hitting metal, so
// the effects are pitched rather than noisy and kept short:
// four marbles in flight over a board of twelve wheels fire a
// lot of them, and anything with a tail turns into mud. They
// are tables rather than closures for the same reason Belt
// Breaker's are — the whole mix can be read and retuned in one
// screen.

import {
	createAudio, createAudioToggles,
} from '../_shared/audio.js'
import { createMusic } from '../_shared/music.js'
import { MOD_BASE64 } from './music-data.js'

// The shared engine wants a melody to loop; the music comes
// from the tracker module instead, so this single rest is
// never heard.
const SILENT = [null]

export const TRACKS = ['wheelworks.mod']

const MUSIC = {
	baseUrl: new URL('music/', import.meta.url),
	tracks: TRACKS,
	fallback: MOD_BASE64,
}

// name: [frequency, duration, waveform, volume]
//
// `slot` is the sound that happens most — every marble that
// lands anywhere — so it is the quietest thing in the mix.
const TONES = {
	slot: [540, 0.04, 'triangle', 0.045],
	bounce: [300, 0.035, 'square', 0.03],
	fire: [760, 0.05, 'square', 0.05],
	turn: [200, 0.05, 'triangle', 0.035],
	refuse: [140, 0.07, 'sawtooth', 0.04],
	feed: [880, 0.05, 'triangle', 0.04],
	accept: [620, 0.05, 'triangle', 0.05],
	divert: [480, 0.04, 'sawtooth', 0.035],
}

// name: [notes, waveform, volume, gap in ms]
//
// Breaking a wheel is the payoff, so it is the one effect
// allowed to be a chord rather than a tick. Dumping junk into
// a wheel already broken falls instead of rising: it is worth
// hearing, but it must not sound like progress.
const SEQS = {
	paint: [
		[[420, 0.05], [640, 0.07]], 'triangle', 0.05, 40],
	breakWheel: [
		[[523, 0.08], [659, 0.08], [880, 0.16]],
		'square', 0.075, 70],
	dump: [
		[[330, 0.06], [247, 0.1]], 'triangle', 0.05, 60],
	patternOn: [
		[[990, 0.1], [740, 0.1], [990, 0.18]],
		'sawtooth', 0.07, 110],
	patternOff: [
		[[740, 0.08], [990, 0.14]], 'triangle', 0.06, 80],
	levelClear: [
		[[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.26]],
		'square', 0.08, 110],
	gameOver: [
		[[262, 0.22], [196, 0.26], [131, 0.4]],
		'sawtooth', 0.09, 150],
}

function bindTones(audio) {
	const out = {}
	for (const [name, a] of Object.entries(TONES)) {
		out[name] = () => audio.tone(a[0], a[1], a[2], a[3])
	}
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
		...bindTones(audio),
		...bindSeqs(audio),
		// Forwarded explicitly: see games/README.md on the
		// AudioContext unlock gotcha. In this game the real
		// gesture is a mousedown, not a keydown.
		unlock: audio.unlock,
		stop() {
			music.stop()
			audio.stop()
		},
	}
}
