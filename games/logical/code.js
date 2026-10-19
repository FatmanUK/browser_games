// Access codes: four characters that name one of the hundred
// levels, and the way back from the code to the level.
//
// Sixteen symbols, chosen to survive being read off a screen
// and written on paper — no I/1, O/0, S/5, Z/2 or B/8 to get
// wrong. 16^4 is 65536 codes for 100 levels, so about one
// guess in 650 decodes to anything at all and the code space
// does the gatekeeping with no stored table.
//
// The mapping is a four-round Feistel cipher on the 16-bit
// block, which is exactly invertible: decoding runs the rounds
// backwards, so there is no table and no search. An affine
// map would also invert, but consecutive levels would then sit
// a fixed distance apart in code space, which two known codes
// give away.

export const ALPHABET = 'ACDEFGHJKLMNPRTW'
export const LEVELS = 100

const ROUNDS = 4

// Any scrambling non-linear byte function would do. What
// matters is that it is fixed, so a level keeps its code for
// ever — a code written on paper in a year must still work.
function f(x, i) {
	return ((x * 181 + 97 + i * 61) ^ (x >>> 3)) & 0xff
}

function encrypt(block) {
	let l = (block >>> 8) & 0xff
	let r = block & 0xff
	for (let i = 0; i < ROUNDS; i++) {
		const next = l ^ f(r, i)
		l = r
		r = next
	}
	return ((l << 8) | r) & 0xffff
}

function decrypt(block) {
	let l = (block >>> 8) & 0xff
	let r = block & 0xff
	for (let i = ROUNDS - 1; i >= 0; i--) {
		const prev = r ^ f(l, i)
		r = l
		l = prev
	}
	return ((l << 8) | r) & 0xffff
}

export function codeFor(level) {
	const block = encrypt((level - 1) & 0xffff)
	let out = ''
	for (let i = 3; i >= 0; i--) {
		out += ALPHABET[(block >>> (i * 4)) & 0xf]
	}
	return out
}

// Returns a level in 1..LEVELS, or 0 for anything that is not
// a code. Case is ignored: nobody types a password in caps on
// purpose twice.
export function levelFor(code) {
	const text = String(code || '').toUpperCase()
	if (text.length !== 4) return 0
	let block = 0
	for (const ch of text) {
		const d = ALPHABET.indexOf(ch)
		if (d < 0) return 0
		block = (block << 4) | d
	}
	const level = decrypt(block) + 1
	if (level < 1 || level > LEVELS) return 0
	return level
}
