// Background music: a ProTracker module rendered once to a
// stereo buffer and looped.
//
// Tracks are real .mod files in music/ — drop your own in
// there and list them below. The first that loads wins. The
// module base64'd into music-data.js is the fallback for when
// none of them do (a missing file, or the page opened from
// somewhere a fetch can't reach), so the game always has
// music even with this list empty.
//
// Rendering offline and looping the result, rather than
// streaming the tracker live, means no ScriptProcessor or
// AudioWorklet is needed and the music cannot glitch when the
// game loop is busy. The cost is a one-off render — about 50ms
// for a half-minute module — which is deferred until Music is
// first switched on, since it defaults to off.

import { MOD_BASE64 } from './music-data.js'
import {
	decodeBase64, renderMod, isSupported,
} from './modplayer.js'

export const TRACKS = ['piston_cathedral.mod']

const VOLUME = 0.42

async function fetchTrack(name) {
	const url = new URL(`music/${name}`, import.meta.url)
	const res = await fetch(url)
	if (!res.ok) return null
	const bytes = new Uint8Array(await res.arrayBuffer())
	if (isSupported(bytes)) return bytes
	console.warn(
		`beltbreaker: ${name} is not a 4-channel ` +
		'31-sample module; skipping it')
	return null
}

async function moduleBytes() {
	for (const name of TRACKS) {
		try {
			const bytes = await fetchTrack(name)
			if (bytes) return bytes
		} catch {
			/* not reachable; try the next one */
		}
	}
	return decodeBase64(MOD_BASE64)
}

async function toBuffer(ctx) {
	const pcm = renderMod(await moduleBytes(), ctx.sampleRate)
	const buffer = ctx.createBuffer(
		2, pcm.left.length, ctx.sampleRate)
	buffer.copyToChannel(pcm.left, 0)
	buffer.copyToChannel(pcm.right, 1)
	return buffer
}

function play(st, ctx) {
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

// Loading a track is async, but the toggle that starts it is a
// click handler — so the context is already unlocked and the
// music can simply start when the render lands, unless the
// player has switched it off again in the meantime.
async function begin(st, ctx, stillOn) {
	if (st.loading) return
	if (!st.buffer) {
		st.loading = true
		try {
			st.buffer = await toBuffer(ctx)
		} finally {
			st.loading = false
		}
	}
	if (stillOn() && !st.source) play(st, ctx)
}

export function createMusic(getContext) {
	const st = { buffer: null, source: null, loading: false }
	let on = false

	return {
		isOn: () => on,
		setOn(value) {
			on = value
			if (!value) {
				silence(st)
				return
			}
			begin(st, getContext(), () => on)
		},
		// The shared engine closes the context on stop();
		// release the node first so nothing is left
		// playing into a dying context.
		stop() {
			on = false
			silence(st)
			st.buffer = null
		},
	}
}
