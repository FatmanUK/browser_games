// The track ladder.
//
// A level is a seed (track.js), so progression is one number:
// the highest level unlocked. No track data, no list of
// layouts, nothing to migrate when the generator changes —
// which it will.
//
// Storage stays loadNumber/saveNumber. The temptation was a
// JSON blob with the level and a per-level best lap in it, but
// the best laps are already keyed by seed and already work, and
// one number needs no new storage API at all.

import { loadNumber, saveNumber } from '../_shared/storage.js'

const KEY = 'bg-dash-progress'

// Knuth's multiplicative constant. Any odd scatter would do;
// what matters is that it is fixed, so a level keeps its track
// and therefore keeps its best-lap record.
export function seedForLevel(level) {
	return (level * 2654435761) >>> 0
}

export function loadUnlocked() {
	return Math.max(1, Math.floor(loadNumber(KEY, 1)))
}

// Only ever upward: replaying an early track for a better lap
// time must not cost you the ladder you have climbed.
export function unlock(level) {
	const was = loadUnlocked()
	if (level <= was) return was
	saveNumber(KEY, level)
	return level
}

export function stepLevel(level, by, unlocked) {
	return Math.min(unlocked, Math.max(1, level + by))
}
