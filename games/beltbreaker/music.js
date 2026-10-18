// Background music: the ProTracker module in music-data.js,
// rendered once to a stereo buffer and looped.
//
// The render is deferred until Music is first switched on. It
// costs about 50ms, which is nothing against a page load but
// is wasted on every player who leaves music off — and Music
// defaults to off, as games/README.md asks.

import { MOD_BASE64 } from './music-data.js'
import { decodeBase64, renderMod } from './modplayer.js'

const VOLUME = 0.42

function toBuffer(ctx) {
	const pcm = renderMod(
		decodeBase64(MOD_BASE64), ctx.sampleRate)
	const buffer = ctx.createBuffer(
		2, pcm.left.length, ctx.sampleRate)
	buffer.copyToChannel(pcm.left, 0)
	buffer.copyToChannel(pcm.right, 1)
	return buffer
}

function play(st, getContext) {
	const ctx = getContext()
	if (!st.buffer) st.buffer = toBuffer(ctx)
	const gain = ctx.createGain()
	gain.gain.value = VOLUME
	gain.connect(ctx.destination)
	st.source = ctx.createBufferSource()
	st.source.buffer = st.buffer
	st.source.loop = true
	st.source.connect(gain)
	st.source.start()
}

function silence(st) {
	if (st.source) st.source.stop()
	st.source = null
}

export function createMusic(getContext) {
	const st = { buffer: null, source: null }
	let on = false

	return {
		isOn: () => on,
		setOn(value) {
			on = value
			if (value) play(st, getContext)
			else silence(st)
		},
		// The shared engine closes the context on stop();
		// release the node first so nothing is left playing
		// into a dying context.
		stop() {
			on = false
			silence(st)
			st.buffer = null
		},
	}
}
