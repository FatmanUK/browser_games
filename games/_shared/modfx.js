// ProTracker effect handling, split out of modplayer.js.
//
// The generated module that ships with the game uses almost no
// effects, but hand-written PT2 modules lean on them heavily —
// a tune played without portamento and vibrato is recognisably
// the right notes and the wrong music. This covers the set
// ProTracker itself documents as the common ones:
//
//   0xy arpeggio        1xx/2xx portamento up/down
//   3xx tone portamento 4xy vibrato
//   5xy 3xx + volslide  6xy 4xy + volslide
//   7xy tremolo         9xx sample offset
//   Axy volume slide    Bxx position jump
//   Cxx set volume      Dxx pattern break
//   E1x/E2x fine porta  EAx/EBx fine volume slide
//   Fxx speed (<32) or tempo (>=32)
//
// Anything else is ignored rather than mis-played.

const AMIGA = 7093789.2
const MIN_PERIOD = 108
const MAX_PERIOD = 907

// ProTracker's own vibrato/tremolo sine, quarter-wave.
const SINE = [
	0, 24, 49, 74, 97, 120, 141, 161,
	180, 197, 212, 224, 235, 244, 250, 253,
]

function waveValue(pos, depth) {
	const i = pos & 31
	const v = SINE[i & 15] * depth / 128
	return i < 16 ? v : -v
}

export function setPeriod(ch, period, rate) {
	ch.period = Math.max(
		MIN_PERIOD, Math.min(MAX_PERIOD, period))
	ch.step = AMIGA / (ch.period * 2) / rate
}

export function playPeriod(ch, period, rate) {
	// The period actually sounded this tick, which vibrato
	// and arpeggio bend away from the channel's own period
	// without disturbing it.
	ch.step = AMIGA / (
		Math.max(MIN_PERIOD, period) * 2) / rate
}

function slideVolume(ch, param) {
	const up = param >> 4
	const down = param & 0x0f
	ch.vol = Math.max(0, Math.min(
		64, ch.vol + (up > 0 ? up : -down)))
}

function extended(st, ch, param, rate) {
	const sub = param >> 4
	const val = param & 0x0f
	if (sub === 0x1) setPeriod(ch, ch.period - val, rate)
	else if (sub === 0x2) setPeriod(ch, ch.period + val, rate)
	else if (sub === 0xa) {
		ch.vol = Math.min(64, ch.vol + val)
	} else if (sub === 0xb) {
		ch.vol = Math.max(0, ch.vol - val)
	} else if (sub === 0xe) {
		st.rowDelay = val
	}
}

// Tick 0: latch the row's parameters and apply the effects
// that happen once, at the moment the row starts.
export function rowEffect(st, ch, cell, rate) {
	const p = cell.param
	ch.effect = cell.effect
	ch.param = p
	if (cell.effect === 0x03 || cell.effect === 0x05) {
		if (p && cell.effect === 0x03) ch.portaSpeed = p
	} else if (cell.effect === 0x04 ||
		cell.effect === 0x06) {
		if (cell.effect === 0x04 && p) {
			if (p >> 4) ch.vibSpeed = p >> 4
			if (p & 0x0f) ch.vibDepth = p & 0x0f
		}
	} else if (cell.effect === 0x07 && p) {
		if (p >> 4) ch.tremSpeed = p >> 4
		if (p & 0x0f) ch.tremDepth = p & 0x0f
	} else if (cell.effect === 0x0c) {
		ch.vol = Math.min(64, p)
	} else if (cell.effect === 0x0e) {
		extended(st, ch, p, rate)
	} else if (cell.effect === 0x0f) {
		if (p < 32) st.speed = p || 1
		else st.bpm = p
	}
	rowJumps(st, cell)
}

function rowJumps(st, cell) {
	if (cell.effect === 0x0b) st.jump = cell.param
	else if (cell.effect === 0x0d) {
		st.breakTo = (cell.param >> 4) * 10 +
			(cell.param & 0x0f)
	}
}

function tonePorta(ch, rate) {
	if (!ch.target) return
	const step = ch.portaSpeed
	if (ch.period < ch.target) {
		setPeriod(
			ch, Math.min(ch.target, ch.period + step),
			rate)
	} else {
		setPeriod(
			ch, Math.max(ch.target, ch.period - step),
			rate)
	}
}

function arpeggio(ch, tick, rate) {
	const which = tick % 3
	if (which === 0) {
		playPeriod(ch, ch.period, rate)
		return
	}
	const semis = which === 1
		? ch.param >> 4
		: ch.param & 0x0f
	playPeriod(ch, ch.period / Math.pow(2, semis / 12), rate)
}

function vibrato(ch, rate) {
	ch.vibPos += ch.vibSpeed
	playPeriod(
		ch, ch.period + waveValue(ch.vibPos, ch.vibDepth),
		rate)
}

function tremolo(ch) {
	ch.tremPos += ch.tremSpeed
	ch.tremVol = waveValue(ch.tremPos, ch.tremDepth)
}

// Ticks 1..speed-1: the effects that keep working through the
// row rather than firing once at the top of it.
export function tickEffect(ch, tick, rate) {
	ch.tremVol = 0
	const e = ch.effect
	const p = ch.param
	if (e === 0x00) {
		if (p) arpeggio(ch, tick, rate)
		return
	}
	if (e === 0x01) {
		setPeriod(ch, ch.period - p, rate)
	} else if (e === 0x02) {
		setPeriod(ch, ch.period + p, rate)
	} else if (e === 0x03) {
		tonePorta(ch, rate)
	} else if (e === 0x04) {
		vibrato(ch, rate)
	} else if (e === 0x05) {
		tonePorta(ch, rate)
		slideVolume(ch, p)
	} else if (e === 0x06) {
		vibrato(ch, rate)
		slideVolume(ch, p)
	} else if (e === 0x07) {
		tremolo(ch)
	} else if (e === 0x0a) {
		slideVolume(ch, p)
	}
}

export function resetChannel(ch) {
	ch.effect = 0
	ch.param = 0
	ch.target = 0
	ch.portaSpeed = 0
	ch.vibSpeed = 0
	ch.vibDepth = 0
	ch.vibPos = 0
	ch.tremSpeed = 0
	ch.tremDepth = 0
	ch.tremPos = 0
	ch.tremVol = 0
}
