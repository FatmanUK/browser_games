// Low-level pre-render helpers for Belt Breaker's sprite atlas
// (see sprites.js). Everything here draws into an offscreen
// canvas once, at init, so the game loop only ever blits.
//
// The fake-3D look comes from one rule: geometry rotates, light
// does not. A hull's outline spins with the frame angle, but
// the shading gradient and the specular hotspot stay pinned to
// the top-left of the sprite, as if a fixed sun were off-screen
// up and to the left. Rotating a pre-lit sprite with
// ctx.rotate() instead would spin the highlight with the body
// and read as flat.
//
// This is the cheap version, and it suits the built things —
// the ship, the drones, the guardian. The rocks get the real
// thing: see mesh.js.

const LIGHT = { x: -0.4, y: -0.45 }

// mulberry32: small seeded PRNG so each rock variety/size keeps
// the same lumps and craters every run (pre-rendered art should
// not flicker between page loads).
export function rng(seed) {
	let a = seed >>> 0
	return function next() {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export function makeCanvas(w, h) {
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.ceil(w))
	canvas.height = Math.max(1, Math.ceil(h))
	return canvas
}

// Returns { canvas, ctx } with the origin moved to the middle,
// so sprite geometry can be written in centred coordinates.
export function centred(size) {
	const canvas = makeCanvas(size, size)
	const ctx = canvas.getContext('2d')
	ctx.translate(size / 2, size / 2)
	return { canvas, ctx }
}

// A lumpy outline is a unit circle plus a few sine harmonics.
// Keeping the harmonics as data (rather than baking a point
// list) lets every frame re-path the same rock at a new spin.
export function makeLumps(rand, count) {
	const out = []
	for (let i = 0; i < count; i++) {
		out.push({
			k: i + 2,
			amp: (0.16 / (i + 1)) * (0.4 + rand()),
			ph: rand() * Math.PI * 2,
		})
	}
	return out
}

function lumpRadius(lumps, th) {
	let r = 1
	for (const l of lumps) {
		r += l.amp * Math.sin(l.k * th + l.ph)
	}
	return r
}

export function lumpPath(ctx, r, lumps, spin) {
	const steps = 56
	ctx.beginPath()
	for (let i = 0; i <= steps; i++) {
		const th = (i / steps) * Math.PI * 2
		const rr = r * lumpRadius(lumps, th - spin)
		const x = Math.cos(th) * rr
		const y = Math.sin(th) * rr
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	}
	ctx.closePath()
}

// Screen-fixed body shading: bright where the light hits,
// falling away to the unlit limb on the far side.
export function bodyGradient(ctx, r, pal) {
	const g = ctx.createRadialGradient(
		LIGHT.x * r, LIGHT.y * r, r * 0.04,
		0, 0, r * 1.5)
	g.addColorStop(0, pal.hi)
	g.addColorStop(0.3, pal.mid)
	g.addColorStop(0.82, pal.lo)
	g.addColorStop(1, pal.rim)
	return g
}

// Stroking one path with a gradient running along the light
// axis gives a bright lit limb and a dark far limb in a single
// pass, which is what sells the curvature at small sizes.
export function limbStroke(ctx, r, pal, width) {
	const g = ctx.createLinearGradient(
		LIGHT.x * r, LIGHT.y * r,
		-LIGHT.x * r, -LIGHT.y * r)
	g.addColorStop(0, 'rgba(255,255,255,0.55)')
	g.addColorStop(0.45, pal.lo)
	g.addColorStop(1, pal.rim)
	ctx.lineWidth = width
	ctx.strokeStyle = g
	ctx.stroke()
}

export function specular(ctx, r, spread, strength) {
	const x = LIGHT.x * r * 0.85
	const y = LIGHT.y * r * 0.85
	const g = ctx.createRadialGradient(
		x, y, 0, x, y, r * spread)
	g.addColorStop(0, `rgba(255,255,255,${strength})`)
	g.addColorStop(0.5, `rgba(255,255,255,${strength / 4})`)
	g.addColorStop(1, 'rgba(255,255,255,0)')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.rect(-r * 2, -r * 2, r * 4, r * 4)
	ctx.fill()
}

// Soft round glow, used for shots, cores and explosion puffs.
export function glow(ctx, r, inner, outer) {
	const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
	g.addColorStop(0, inner)
	g.addColorStop(0.45, outer)
	g.addColorStop(1, 'rgba(0,0,0,0)')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(0, 0, r, 0, Math.PI * 2)
	ctx.fill()
}
