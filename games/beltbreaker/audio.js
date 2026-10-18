// Belt Breaker's own sound palette, built on the shared engine
// in games/_shared/audio.js. Every game-specific audio choice
// lives here; the game code only ever calls the named effects.
//
// The effects are tables rather than a wall of closures so the
// whole palette can be read (and retuned) at a glance.

import {
	createAudio, createAudioToggles,
} from '../_shared/audio.js'

// The shared engine wants a melody to loop; Belt Breaker's
// music comes from a tracker module instead, so this single
// rest is never heard.
const SILENT = [null]

// name: [freq, seconds, waveform, volume]
const HITS = {
	shoot: [760, 0.06, 'square', 0.04],
	foeShoot: [300, 0.1, 'sawtooth', 0.04],
	rockClang: [1250, 0.05, 'square', 0.03],
	bossFire: [210, 0.14, 'sawtooth', 0.05],
	bossSpit: [130, 0.2, 'triangle', 0.06],
	bossCore: [1600, 0.07, 'square', 0.05],
	bossHit: [90, 0.22, 'sawtooth', 0.07],
}

// name: [notes, waveform, volume, gap in ms]
const SEQS = {
	shipDie: [
		[[300, 0.2], [190, 0.26], [95, 0.4]],
		'sawtooth', 0.09, 110,
	],
	extraLife: [
		[[523, 0.1], [659, 0.1], [880, 0.2]],
		'square', 0.06, 90,
	],
	warp: [
		[[180, 0.08], [420, 0.08], [980, 0.12]],
		'triangle', 0.06, 50,
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
	foeDie: [
		[[420, 0.1], [260, 0.16]], 'sawtooth', 0.06, 70,
	],
	bossDie: [
		[[160, 0.3], [120, 0.35], [80, 0.5], [60, 0.7]],
		'sawtooth', 0.1, 190,
	],
	gameOver: [
		[[330, 0.3], [262, 0.3], [196, 0.4], [131, 0.7]],
		'triangle', 0.09, 230,
	],
}

// Bigger rocks break lower: the pitch of the sequence is the
// only cue the player gets about what just split.
function breakNotes(size) {
	const base = [150, 220, 320][size]
	return [
		[base, 0.14], [base * 0.7, 0.18],
		[base * 0.5, 0.22],
	]
}

function bindHits(audio) {
	const out = {}
	for (const [name, a] of Object.entries(HITS)) {
		out[name] = () =>
			audio.tone(a[0], a[1], a[2], a[3])
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
	createAudioToggles(side, audio)
	return {
		...bindHits(audio),
		...bindSeqs(audio),
		rockBreak: (size) =>
			audio.toneSequence(
				breakNotes(size), 'sawtooth',
				0.07, 45),
		// Forwarded explicitly: see games/README.md on the
		// AudioContext unlock gotcha.
		unlock: audio.unlock,
		stop: audio.stop,
	}
}
