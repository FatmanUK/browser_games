// A ProTracker module renderer: decodes a 31-sample "M.K."
// module and mixes the whole song down to one stereo buffer.
//
// Rendering offline and looping the result, rather than
// streaming the tracker live, means no ScriptProcessor or
// AudioWorklet is needed and the music cannot glitch when the
// game loop is busy — the cost is a one-off render (about a
// tenth of a second for this module) and the memory to hold it.
//
// Effects are the ones Belt Breaker's own module uses or might
// reasonably grow into: Cxx set volume, Fxx speed/tempo, Axy
// volume slide, Dxx pattern break, Bxx position jump. Anything
// else is ignored rather than mis-played.

const AMIGA = 7093789.2
const ROWS = 64
const CHANNELS = 4
const HEADER = 1084

export function decodeBase64(b64) {
	const raw = atob(b64)
	const out = new Uint8Array(raw.length)
	for (let i = 0; i < raw.length; i++) {
		out[i] = raw.charCodeAt(i)
	}
	return out
}

function be16(b, at) {
	return (b[at] << 8) | b[at + 1]
}

function readSamples(b) {
	const out = []
	for (let i = 0; i < 31; i++) {
		const at = 20 + i * 30
		out.push({
			length: be16(b, at + 22) * 2,
			volume: b[at + 25],
			repeat: be16(b, at + 26) * 2,
			repLen: be16(b, at + 28) * 2,
			data: null,
		})
	}
	return out
}

function readPatterns(b, count) {
	const pats = []
	let at = HEADER
	for (let p = 0; p < count; p++) {
		const rows = []
		for (let r = 0; r < ROWS; r++) {
			const row = []
			for (let c = 0; c < CHANNELS; c++) {
				const hi = b[at] & 0x0f
				row.push({
					sample: (b[at] & 0xf0) |
						(b[at + 2] >> 4),
					period: (hi << 8) | b[at + 1],
					effect: b[at + 2] & 0x0f,
					param: b[at + 3],
				})
				at += 4
			}
			rows.push(row)
		}
		pats.push(rows)
	}
	return pats
}

export function parseMod(b) {
	const samples = readSamples(b)
	const songLen = b[950]
	const order = Array.from(b.subarray(952, 1080))
	const count = Math.max(...order) + 1
	const patterns = readPatterns(b, count)
	let at = HEADER + count * ROWS * CHANNELS * 4
	for (const s of samples) {
		s.data = new Int8Array(
			b.buffer, b.byteOffset + at, s.length)
		at += s.length
	}
	return { samples, order, songLen, patterns }
}

function newState(mod) {
	const chans = []
	for (let i = 0; i < CHANNELS; i++) {
		chans.push({
			data: null, pos: 0, step: 0, vol: 0,
			loopAt: 0, loopLen: 0, on: false, slide: 0,
		})
	}
	return {
		chans, pos: 0, row: 0, speed: 6, bpm: 125,
		jump: -1, breakTo: -1, done: false,
	}
}

function trigger(ch, s, period, rate) {
	if (period > 0) {
		ch.step = AMIGA / (period * 2) / rate
		ch.pos = 0
		ch.on = s.length > 0
	}
	ch.data = s.data
	ch.vol = s.volume
	ch.loopAt = s.repeat
	ch.loopLen = s.repLen > 2 ? s.repLen : 0
	ch.end = s.length
}

function applyEffect(st, ch, cell) {
	ch.slide = 0
	if (cell.effect === 0x0c) ch.vol = Math.min(64, cell.param)
	else if (cell.effect === 0x0a) {
		const up = cell.param >> 4
		ch.slide = up > 0 ? up : -(cell.param & 0x0f)
	} else if (cell.effect === 0x0f) {
		if (cell.param < 32) st.speed = cell.param || 1
		else st.bpm = cell.param
	} else if (cell.effect === 0x0d) {
		st.breakTo = (cell.param >> 4) * 10 +
			(cell.param & 0x0f)
	} else if (cell.effect === 0x0b) {
		st.jump = cell.param
	}
}

function startRow(mod, st, rate) {
	const pat = mod.patterns[mod.order[st.pos]]
	const row = pat[st.row]
	for (let c = 0; c < CHANNELS; c++) {
		const cell = row[c]
		const ch = st.chans[c]
		if (cell.sample > 0) {
			trigger(
				ch, mod.samples[cell.sample - 1],
				cell.period, rate)
		} else if (cell.period > 0 && ch.data) {
			ch.step = AMIGA / (cell.period * 2) / rate
			ch.pos = 0
			ch.on = true
		}
		applyEffect(st, ch, cell)
	}
}

function advance(st, mod) {
	st.row++
	if (st.breakTo >= 0 || st.jump >= 0 || st.row >= ROWS) {
		st.row = st.breakTo >= 0 ? st.breakTo : 0
		st.pos = st.jump >= 0 ? st.jump : st.pos + 1
		st.breakTo = -1
		st.jump = -1
		if (st.pos >= mod.songLen) st.done = true
	}
}

function mixFrame(st, left, right, at) {
	let l = 0
	let r = 0
	for (let c = 0; c < CHANNELS; c++) {
		const ch = st.chans[c]
		if (!ch.on || !ch.data) continue
		const v = (ch.data[ch.pos | 0] / 128) *
			(ch.vol / 64) * 0.26
		// ProTracker hard-pans 1 and 4 left, 2 and 3
		// right; softened here so headphones are bearable.
		const wide = c === 0 || c === 3
		l += v * (wide ? 0.74 : 0.26)
		r += v * (wide ? 0.26 : 0.74)
		ch.pos += ch.step
		if (ch.pos < ch.end) continue
		if (ch.loopLen > 0) {
			ch.pos = ch.loopAt +
				(ch.pos - ch.end) % ch.loopLen
			ch.end = ch.loopAt + ch.loopLen
		} else {
			ch.on = false
		}
	}
	left[at] = l
	right[at] = r
}

function slideTick(st) {
	for (const ch of st.chans) {
		if (!ch.slide) continue
		ch.vol = Math.max(
			0, Math.min(64, ch.vol + ch.slide))
	}
}

function mixRow(st, left, right, at, rate) {
	const tick = Math.round((2.5 / st.bpm) * rate)
	for (let t = 0; t < st.speed; t++) {
		if (t > 0) slideTick(st)
		for (let i = 0; i < tick; i++) {
			mixFrame(st, left, right, at)
			at++
		}
	}
	return at
}

// Renders the whole song once. The caller loops the buffer, so
// the tail must land exactly on the end of the last row.
export function renderMod(bytes, rate) {
	const mod = parseMod(bytes)
	const st = newState(mod)
	const cap = Math.ceil(rate * 150)
	const left = new Float32Array(cap)
	const right = new Float32Array(cap)
	let at = 0
	while (!st.done && at < cap - rate) {
		startRow(mod, st, rate)
		at = mixRow(st, left, right, at, rate)
		advance(st, mod)
	}
	return {
		left: left.subarray(0, at),
		right: right.subarray(0, at),
	}
}
