// Shared tracker-music player: a game points this at a folder
// of ProTracker modules, and it renders one to a buffer and
// loops it.
//
// Tracks are real .mod files, so they can be replaced without
// touching any code — drop a module in the game's music/
// folder and name it in that game's track list. Each game also
// carries a base64 copy of its own module as a fallback, so
// there is always music even if no file loads (a missing file,
// or a page opened from somewhere a fetch cannot reach).
//
// Rendering offline and looping the result, rather than
// streaming the tracker live, means no ScriptProcessor or
// AudioWorklet is needed and the music cannot glitch when the
// game loop is busy. The cost is a one-off render — about 50ms
// for a half-minute module — deferred until Music is first
// switched on, since Music defaults to off.

import {
	decodeBase64, renderMod, isSupported,
} from './modplayer.js'

const VOLUME = 0.42

async function fetchTrack(baseUrl, name) {
	const res = await fetch(new URL(name, baseUrl))
	if (!res.ok) return null
	const bytes = new Uint8Array(await res.arrayBuffer())
	if (isSupported(bytes)) return bytes
	console.warn(
		`${name} is not a 4-channel 31-sample module; ` +
		'skipping it')
	return null
}

async function moduleBytes(opts) {
	for (const name of opts.tracks) {
		try {
			const bytes = await fetchTrack(
				opts.baseUrl, name)
			if (bytes) return bytes
		} catch {
			/* not reachable; try the next one */
		}
	}
	return decodeBase64(opts.fallback)
}

async function toBuffer(ctx, opts) {
	const pcm = renderMod(
		await moduleBytes(opts), ctx.sampleRate)
	const buffer = ctx.createBuffer(
		2, pcm.left.length, ctx.sampleRate)
	buffer.copyToChannel(pcm.left, 0)
	buffer.copyToChannel(pcm.right, 1)
	return buffer
}

function play(st, ctx) {
	// Never leave a source behind: one that is dropped
	// without being stopped keeps playing with nothing
	// holding a reference to stop it with.
	silence(st)
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
	if (st.source) {
		try {
			st.source.stop()
		} catch {
			/* already stopped, or its context is gone */
		}
	}
	st.source = null
}

// Loading a track is async, but the toggle that starts it is a
// click handler — so the context is already unlocked and the
// music can simply start when the render lands, unless the
// player has switched it off again in the meantime.
async function begin(st, ctx, opts, stillOn) {
	if (st.loading) return
	if (!st.buffer) {
		st.loading = true
		try {
			st.buffer = await toBuffer(ctx, opts)
		} finally {
			st.loading = false
		}
	}
	// `dead` as well as stillOn(): a render that lands after
	// the game was torn down must not start a track playing
	// into a context nobody is holding any more.
	if (st.dead || !stillOn()) return
	play(st, ctx)
}

// `opts` is { baseUrl, tracks, fallback }: where the modules
// live (usually new URL('music/', import.meta.url) from the
// game), which filenames to try in order, and the base64 of
// the module to fall back on. Returns an object shaped to
// stand in for the engine's own music state in
// createAudioToggles — see games/README.md.
function retire(st, onPageHide) {
	st.dead = true
	silence(st)
	st.buffer = null
	window.removeEventListener('pagehide', onPageHide)
}

export function createMusic(getContext, opts) {
	const st = {
		buffer: null, source: null,
		loading: false, dead: false,
	}
	let on = false

	// The same safety net createAudio keeps: a tab closed
	// without going through the game's destroy() must not
	// leave a track looping.
	const onPageHide = () => {
		on = false
		retire(st, onPageHide)
	}
	window.addEventListener('pagehide', onPageHide)

	return {
		isOn: () => on,
		setOn(value) {
			on = value
			if (!value || st.dead) {
				silence(st)
				return
			}
			begin(st, getContext(), opts, () => on)
		},
		// createAudio's stop() closes the context; release
		// the node first so nothing is left playing into a
		// dying context.
		stop() {
			on = false
			retire(st, onPageHide)
		},
	}
}
