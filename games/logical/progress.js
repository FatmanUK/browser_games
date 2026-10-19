// The level ladder.
//
// A level is a seed (level.js), so progression is one number:
// the highest level reached. Same shape as Dash's ladder in
// games/racer/progress.js, and for the same reason — no level
// data, nothing to migrate when the generator changes.
//
// A code jumps anywhere (code.js) but does not raise the
// ladder: a code-jump is a visit, and only finishing a level
// climbs. Otherwise the ladder would say nothing about what
// the player had actually done.

import { loadNumber, saveNumber } from '../_shared/storage.js'
import { LEVELS } from './code.js'

const KEY = 'bg-wheelworks-progress'

// Knuth's multiplicative constant, as Dash uses. Any fixed odd
// scatter would do; what matters is that it never changes, so
// a level keeps its layout and therefore keeps its code
// meaningful.
export function seedForLevel(level) {
	return (level * 2654435761) >>> 0
}

export function loadReached() {
	const n = Math.floor(loadNumber(KEY, 1))
	return Math.min(LEVELS, Math.max(1, n))
}

// Only ever upward: replaying an early level by code must not
// cost the player the ladder they have climbed.
export function reach(level) {
	const was = loadReached()
	if (level <= was) return was
	const n = Math.min(LEVELS, level)
	saveNumber(KEY, n)
	return n
}

export function nextLevel(level) {
	return Math.min(LEVELS, level + 1)
}
