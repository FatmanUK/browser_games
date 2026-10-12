// Tiny localStorage helpers for per-game high scores / best
// times. Wrapped in try/catch: localStorage can throw (private
// browsing, disabled storage) and that should never crash a game.

export function loadNumber(key, fallback) {
	try {
		const raw = localStorage.getItem(key)
		const n = raw === null ? NaN : Number(raw)
		return Number.isFinite(n) ? n : fallback
	} catch {
		return fallback
	}
}

export function saveNumber(key, value) {
	try {
		localStorage.setItem(key, String(value))
	} catch {
		/* storage unavailable; ignore */
	}
}
