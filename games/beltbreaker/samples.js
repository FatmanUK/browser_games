// Belt Breaker's sound effects, synthesized into AudioBuffers
// once and then fired as one-shots.
//
// These are rendered rather than sourced for the same reason as
// the music: the repo carries no binary assets, and a waveform
// written here is ours to licence. Rendering also buys what
// oscillator tones can't give — noise, filtered explosions, a
// sweep steep enough to read as a laser rather than a beep.

const TWO_PI = Math.PI * 2

// One-pole lowpass coefficient for a cutoff in Hz.
function coeff(hz, rate) {
	return 1 - Math.exp(-TWO_PI * Math.min(hz, rate / 3) / rate)
}

function noise() {
	return Math.random() * 2 - 1
}

// A pitch sweep steep enough to read as a shot. The square and
// sine are mixed rather than chosen: pure square is harsh at
// this length, pure sine is too soft to cut through.
function laser(rate, secs, f0, f1, decay) {
	const n = Math.ceil(rate * secs)
	const out = new Float32Array(n)
	let phase = 0
	for (let i = 0; i < n; i++) {
		const k = i / n
		phase += (f0 * Math.pow(f1 / f0, k)) / rate
		const s = Math.sin(TWO_PI * phase)
		out[i] = (s * 0.6 + Math.sign(s) * 0.4) *
			Math.exp(-decay * k)
	}
	return out
}

// Noise driven through a closing lowpass, with a sine sweep
// under it: the filter closing is what turns a hiss into a
// blast with a body to it.
function boom(rate, secs, top, lo, decay) {
	const n = Math.ceil(rate * secs)
	const out = new Float32Array(n)
	let lp = 0
	let phase = 0
	for (let i = 0; i < n; i++) {
		const k = i / n
		const a = coeff(top * Math.pow(60 / top, k), rate)
		lp += (noise() - lp) * a
		phase += (lo * Math.pow(0.35, k)) / rate
		const env = Math.exp(-decay * k)
		out[i] = (lp * 2.6 + Math.sin(TWO_PI * phase) *
			0.55) * env
	}
	return out
}

// Highpassed noise: the metallic tick of a shot failing to get
// through armour.
function clink(rate, secs, decay) {
	const n = Math.ceil(rate * secs)
	const out = new Float32Array(n)
	const a = coeff(2600, rate)
	let lp = 0
	for (let i = 0; i < n; i++) {
		const x = noise()
		lp += (x - lp) * a
		out[i] = (x - lp) * Math.exp(-decay * (i / n))
	}
	return out
}

// Noise under a bandpass that sweeps up then down: the Doppler
// shape of something rushing past.
function swoosh(rate, secs) {
	const n = Math.ceil(rate * secs)
	const out = new Float32Array(n)
	let lo = 0
	let hi = 0
	for (let i = 0; i < n; i++) {
		const k = i / n
		const hz = 300 + 3400 * Math.sin(Math.PI * k)
		const a = coeff(hz, rate)
		lo += (noise() - lo) * a
		hi += (lo - hi) * coeff(hz * 0.4, rate)
		out[i] = (lo - hi) * 2.4 *
			Math.sin(Math.PI * k)
	}
	return out
}

function toBuffer(ctx, data) {
	const buffer = ctx.createBuffer(
		1, data.length, ctx.sampleRate)
	buffer.copyToChannel(data, 0)
	return buffer
}

// Rock-break pitch tracks size: a small fragment cracks, a big
// one thuds, and that is the only cue the player gets about
// what just split.
function breakSizes(rate) {
	return [
		boom(rate, 0.3, 4200, 300, 7),
		boom(rate, 0.42, 3000, 190, 5.5),
		boom(rate, 0.6, 2100, 120, 4),
	]
}

export function buildSfx(ctx) {
	const r = ctx.sampleRate
	const sizes = breakSizes(r)
	return {
		shoot: toBuffer(ctx, laser(r, 0.16, 1500, 220, 7)),
		foeShoot: toBuffer(
			ctx, laser(r, 0.2, 620, 140, 5)),
		clang: toBuffer(ctx, clink(r, 0.09, 24)),
		break0: toBuffer(ctx, sizes[0]),
		break1: toBuffer(ctx, sizes[1]),
		break2: toBuffer(ctx, sizes[2]),
		foeDie: toBuffer(ctx, boom(r, 0.45, 3400, 260, 6)),
		shipDie: toBuffer(ctx, boom(r, 1.1, 2600, 150, 3)),
		bossFire: toBuffer(
			ctx, laser(r, 0.3, 420, 90, 3.5)),
		bossSpit: toBuffer(ctx, boom(r, 0.5, 1200, 90, 4)),
		bossCore: toBuffer(
			ctx, laser(r, 0.12, 2600, 1400, 9)),
		bossHit: toBuffer(ctx, boom(r, 0.6, 1500, 90, 3.5)),
		bossDie: toBuffer(ctx, boom(r, 2, 3000, 110, 1.6)),
		warp: toBuffer(ctx, swoosh(r, 0.5)),
	}
}
