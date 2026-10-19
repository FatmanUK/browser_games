// Dash's drawing, all of it.
//
// It lived in game.js until the whole of that file was physics
// and painting at once, and the track model underneath both is
// about to be replaced. Split, a change to how the track is
// described touches the geometry, the driving and the drawing
// as three separate edits rather than as one 800-line one.
//
// The ground — road, kerbs, grass, markings, sand — is painted
// here as flat 2D geometry. Everything that stands up off it
// is a sprite baked once at init (sprites.js). Both go onto an
// offscreen canvas first, in daylight. What happens to it
// after that is the time of day: in the morning nothing, and
// otherwise drawNightfall dims it and the headlights reveal
// the parts they reach — see revealLamp for why that has to
// be a per-beam paste rather than a cutout.

import { WIDTH, HEIGHT } from '../_shared/hud.js'
import {
	VIEWPORT_WIDTH, VIEWPORT_HEIGHT, VIEW_SCALE, PX,
	CULL_X, CULL_Y,
} from './view.js'
import { getAtlas, carRing, frameFor, variant } from './sprites.js'
import { CAR_LENGTH, CAR_WIDTH, PLAYER_COLOURS } from './car.js'
import { sampleAt, offsetPoint, deltaS } from './path.js'
import { airLift } from './jump.js'
import { drawRivals, drawCarLights } from './rivals.js'
import { BLAST_R } from './marks.js'
function deg(d) {
	return (d * Math.PI) / 180
}

// The road as a ribbon along the centreline, not as a band of
// radii about a centre: a radial band and a perpendicular band
// are different shapes wherever the centreline is not square
// to the radius, so a polar road would be painted somewhere
// other than the road the car drives on.
//
// Which stretches get traced is decided by what is actually in
// the window, not by arc length either side of the car. A
// fixed window leaves the road ending in mid-air wherever the
// lap folds back into view, which it does at about one camera
// position in six — the edge of the world sliding along with
// you. Scanning all thousand samples every frame to find the
// runs is nothing, and it is the only way that is right for a
// track that doubles back or crosses itself.
function visibleRuns(track, cam) {
	const n = track.n
	const padX = CULL_X + track.boundOff
	const padY = CULL_Y + track.boundOff
	const seen = []
	for (let i = 0; i < n; i++) {
		seen.push(
			Math.abs(track.px[i] - cam.x) < padX &&
			Math.abs(track.py[i] - cam.y) < padY)
	}
	const runs = []
	for (let i = 0; i < n; i++) {
		if (!seen[i] || seen[(i - 1 + n) % n]) continue
		let len = 1
		while (len < n && seen[(i + len) % n]) len++
		runs.push([i - 2, len + 4])
	}
	// Every sample in view means no run ever starts, which is
	// the whole lap rather than none of it.
	if (!runs.length && seen[0]) runs.push([0, n])
	return runs
}

function runBand(ctx, track, run, a, b) {
	const [i0, len] = run
	ctx.beginPath()
	for (let d = 0; d <= len; d++) {
		const p = offsetPoint(track, (i0 + d) * track.ds, a)
		if (d === 0) ctx.moveTo(p.x, p.y)
		else ctx.lineTo(p.x, p.y)
	}
	for (let d = len; d >= 0; d--) {
		const p = offsetPoint(track, (i0 + d) * track.ds, b)
		ctx.lineTo(p.x, p.y)
	}
	ctx.closePath()
}

// A jump is a hole in the road: between the two ramps there is
// no surface at all, only whatever the lap is doing underneath
// at that point. So a run that reaches a gap is cut into the
// pieces either side of it.
function cutGaps(track, run) {
	let parts = [run]
	for (const j of track.JUMPS) {
		const out = []
		for (const [i0, len] of parts) {
			const g0 = Math.round(j.s0 / track.ds)
			const g1 = Math.round(j.s1 / track.ds)
			out.push(...splitRun(track, i0, len, g0, g1))
		}
		parts = out
	}
	return parts
}

function splitRun(track, i0, len, g0, g1) {
	const n = track.n
	const rel = (i) => ((i - i0) % n + n) % n
	const a = rel(g0)
	const b = rel(g1)
	if (a >= len && b >= len) return [[i0, len]]
	const out = []
	if (a > 0 && a < len) out.push([i0, a])
	if (b < len) out.push([i0 + b, len - b])
	return out.length ? out : []
}

const ROAD = '#555'

function drawRoad(ctx, track, cam) {
	for (const run of visibleRuns(track, cam)) {
		for (const part of cutGaps(track, run)) {
			if (part[1] < 1) continue
			runBand(
				ctx, track, part,
				-track.halfWidth, track.halfWidth)
			ctx.fillStyle = ROAD
			ctx.fill()
			kerbs(ctx, track, part)
		}
	}
}

// The kerb, as blocks at fixed arc length rather than as a
// dashed stroke.
//
// This is what was making the track edge crawl. A dash pattern
// starts at the beginning of the path it is stroked along, and
// the path starts wherever the visible stretch of road
// happens to begin — which moves every frame as the camera
// does. So the red and white blocks slid along the kerb
// continuously, at a speed unrelated to the car's. Drawing a
// block per fixed stretch of lap pins them to the track
// instead, and the pitch divides the lap exactly so there is
// no double-width block at the seam either.
const KERB_IN = 9
const KERB_STEP = 5

function kerbQuad(ctx, track, s0, s1, side) {
	const a = side * (track.halfWidth - KERB_IN)
	const b = side * track.halfWidth
	const steps = Math.max(1, Math.ceil((s1 - s0) / KERB_STEP))
	ctx.beginPath()
	for (let i = 0; i <= steps; i++) {
		const p = offsetPoint(
			track, s0 + ((s1 - s0) * i) / steps, a)
		if (i === 0) ctx.moveTo(p.x, p.y)
		else ctx.lineTo(p.x, p.y)
	}
	for (let i = steps; i >= 0; i--) {
		const p = offsetPoint(
			track, s0 + ((s1 - s0) * i) / steps, b)
		ctx.lineTo(p.x, p.y)
	}
	ctx.closePath()
	ctx.fill()
}

function kerbs(ctx, track, run) {
	const pitch = track.kerb
	const sA = run[0] * track.ds
	const sB = (run[0] + run[1]) * track.ds
	for (let b = Math.floor(sA / pitch);
			b * pitch < sB; b++) {
		const s0 = Math.max(sA, b * pitch)
		const s1 = Math.min(sB, (b + 1) * pitch)
		if (s1 <= s0) continue
		ctx.fillStyle = (b & 1) ? '#e03a33' : '#eceff2'
		for (const side of [-1, 1]) {
			kerbQuad(ctx, track, s0, s1, side)
		}
	}
}

// The ramps, painted across the road at each end of a jump.
// The take-off ramp and the landing on the far side of the
// gap. The take-off is striped and the landing is not, so at
// a glance you can tell which end of a jump you are looking
// at — they sit a couple of hundred units apart with nothing
// but fresh air between them.
const RAMP_LEN = 30

function drawRamps(ctx, track, cam) {
	for (const j of track.JUMPS) {
		if (near(track, j.s0, cam, 340)) {
			rampBand(ctx, track, j.s0, true)
		}
		if (near(track, j.s1, cam, 340)) {
			rampBand(ctx, track, j.s1, false)
		}
	}
}

function near(track, s, cam, within) {
	return Math.abs(deltaS(track, s, cam.s)) < within
}

function rampRun(track, s, takeoff) {
	const i0 = Math.round(
		(takeoff ? s - RAMP_LEN : s) / track.ds)
	return [i0, Math.round(RAMP_LEN / track.ds)]
}

function rampBand(ctx, track, s, takeoff) {
	const run = rampRun(track, s, takeoff)
	runBand(
		ctx, track, run, -track.halfWidth, track.halfWidth)
	ctx.save()
	ctx.clip()
	ctx.fillStyle = takeoff ? '#8a8d99' : '#6e7280'
	ctx.fill()
	if (takeoff) rampStripes(ctx, track, s)
	ctx.restore()
	runBand(
		ctx, track, run, -track.halfWidth, track.halfWidth)
	ctx.strokeStyle = 'rgba(12, 14, 22, 0.8)'
	ctx.lineWidth = 2
	ctx.stroke()
}

function rampStripes(ctx, track, s) {
	const w = track.halfWidth
	for (let i = -6; i <= 6; i++) {
		const a = offsetPoint(
			track, s - RAMP_LEN + i * 13, -w)
		const b = offsetPoint(track, s + i * 13, w)
		ctx.strokeStyle = '#e0bb4e'
		ctx.lineWidth = 7
		ctx.beginPath()
		ctx.moveTo(a.x, a.y)
		ctx.lineTo(b.x, b.y)
		ctx.stroke()
	}
}

function drawStartLine(ctx, track) {
	const a = offsetPoint(
		track, track.START.s, -track.halfWidth)
	const b = offsetPoint(
		track, track.START.s, track.halfWidth)
	ctx.strokeStyle = '#fff'
	ctx.lineWidth = 3
	ctx.beginPath()
	ctx.moveTo(a.x, a.y)
	ctx.lineTo(b.x, b.y)
	ctx.stroke()
}

function drawGridSlot(ctx, slot) {
	ctx.save()
	ctx.translate(slot.x, slot.y)
	ctx.rotate(slot.angle)
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
	ctx.lineWidth = 1.5
	ctx.strokeRect(
		-CAR_LENGTH * 0.7, -CAR_WIDTH * 0.9,
		CAR_LENGTH * 1.4, CAR_WIDTH * 1.8)
	ctx.restore()
}

function drawStartGrid(ctx, track) {
	for (const slot of track.GRID_SLOTS) {
		drawGridSlot(ctx, slot)
	}
}

// Everything from here is a blit of a sprite baked once at
// init (sprites.js). The world is drawn inside the camera's
// scale, so PX has to be divided back out or a sprite baked at
// four pixels to the world unit is magnified four times again.
function blit(ctx, img, x, y, lift) {
	const w = img.width / PX
	const h = img.height / PX
	ctx.drawImage(
		img, x - w / 2, y - h / 2 - (lift || 0), w, h)
}

// Nothing more than a bounds test. The treeline is around five
// hundred trees and the viewport shows a 240x100 slice of the
// world, so almost all of them are off screen every frame —
// cheap to reject, and five hundred drawImage calls is not
// cheap to make. A spatial index would be more code than this
// saves at this count.
function onScreen(x, y, cam) {
	return Math.abs(x - cam.x) < CULL_X &&
		Math.abs(y - cam.y) < CULL_Y
}

function drawTreeLine(ctx, track, atlas, cam) {
	for (const tree of track.TREE_LINE) {
		if (!onScreen(tree.x, tree.y, cam)) continue
		const img = variant(atlas.tree, tree.x, tree.y)
		// Scenery is baked at one size and scaled by the
		// radius the generator gave it, which is what keeps a
		// treeline from looking stamped out.
		drawScaled(ctx, img, tree.x, tree.y, tree.r / 15)
	}
}

function drawScaled(ctx, img, x, y, k) {
	const w = (img.width / PX) * k
	const h = (img.height / PX) * k
	ctx.drawImage(img, x - w / 2, y - h / 2, w, h)
}

// Water is still painted rather than baked: it is a flat
// surface seen from directly above, which is the one case
// where a solid buys nothing at all over a filled ellipse.
function drawWater(ctx, x, y, r) {
	ctx.fillStyle = '#1b5e9e'
	ctx.beginPath()
	ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2)
	ctx.fill()
	ctx.strokeStyle = 'rgba(190, 225, 255, 0.35)'
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.ellipse(x, y, r * 0.6, r * 0.4, 0, 0, Math.PI * 2)
	ctx.stroke()
}

const SPRITE_FOR = {
	tyre: ['tyre', 4], barrel: ['barrel', 4.5],
	building: ['building', 20], tree: ['tree', 15],
}

function drawHardObstacle(ctx, atlas, o) {
	const [kind, baseR] = SPRITE_FOR[o.type] || SPRITE_FOR.tree
	drawScaled(
		ctx, variant(atlas[kind], o.x, o.y),
		o.x, o.y, o.r / baseR)
}

function drawObstacles(ctx, track, atlas, cam) {
	for (const hazard of track.WATER_HAZARDS) {
		if (!onScreen(hazard.x, hazard.y, cam)) continue
		drawWater(ctx, hazard.x, hazard.y, hazard.r)
	}
	for (const o of track.HARD_OBSTACLES) {
		if (!onScreen(o.x, o.y, cam)) continue
		drawHardObstacle(ctx, atlas, o)
	}
}

// Airborne, the sprite is lifted up the screen and scaled up,
// and a shadow is left where the car actually is. From
// directly above the lift alone says nothing — it just looks
// like the car is somewhere else — and the gap between car and
// shadow is the whole of what reads as height.
function drawCarSprite(ctx, car, colours) {
	const z = airLift(car)
	const img = frameFor(carRing(colours), car.facing)
	if (z > 0.5) {
		ctx.save()
		ctx.globalAlpha = 0.35
		ctx.fillStyle = '#000'
		ctx.beginPath()
		ctx.ellipse(
			car.x, car.y, 9, 5.5, car.facing,
			0, Math.PI * 2)
		ctx.fill()
		ctx.restore()
	}
	const k = 1 + z * 0.02
	const w = (img.width / PX) * k
	const h = (img.height / PX) * k
	ctx.drawImage(
		img, car.x - w / 2, car.y - h / 2 - z * 0.75, w, h)
}

const SAND_COLOR = 'rgba(216, 186, 128, 0.85)'

function sandS(w, i, steps) {
	return w.s - w.half + (2 * w.half * i) / steps
}

// Sand in the verge, over a stretch of the lap rather than an
// angular wedge — see the track builder for why.
function drawSand(ctx, track, cam) {
	for (const w of track.SAND_WEDGES) {
		if (Math.abs(deltaS(track, w.s, cam.s)) > 400) {
			continue
		}
		const steps = 14
		ctx.beginPath()
		for (let i = 0; i <= steps; i++) {
			const s = sandS(w, i, steps)
			const p = offsetPoint(
				track, s, w.side * track.halfWidth)
			if (i === 0) ctx.moveTo(p.x, p.y)
			else ctx.lineTo(p.x, p.y)
		}
		for (let i = steps; i >= 0; i--) {
			const s = sandS(w, i, steps)
			const p = offsetPoint(
				track, s, w.side * track.boundOff)
			ctx.lineTo(p.x, p.y)
		}
		ctx.closePath()
		ctx.fillStyle = SAND_COLOR
		ctx.fill()
	}
}

// The ground is still painted, not baked: road, kerbs, grass
// and markings are flat surfaces seen from directly above, and
// a solid would give them nothing a fill does not. Only the
// things that stand up off it are sprites.
// A gate: a band painted across the road, with a post each
// side so it reads from a distance in the dusk. Lit once the
// player has it, dim until then — the rule is only fair if
// you can see which ones you are missing.
const GATE_DIM = 'rgba(126, 186, 210, 0.3)'
const GATE_LIT = 'rgba(143, 233, 255, 0.72)'
const POST_DIM = '#3a5a68'
const POST_LIT = '#8fe9ff'

function drawGate(ctx, track, s, got) {
	const a = offsetPoint(track, s, -track.halfWidth)
	const b = offsetPoint(track, s, track.halfWidth)
	ctx.strokeStyle = got ? GATE_LIT : GATE_DIM
	ctx.lineWidth = 2.5
	ctx.setLineDash([6, 6])
	ctx.beginPath()
	ctx.moveTo(a.x, a.y)
	ctx.lineTo(b.x, b.y)
	ctx.stroke()
	ctx.setLineDash([])
	ctx.fillStyle = got ? POST_LIT : POST_DIM
	for (const p of [a, b]) {
		ctx.beginPath()
		ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
		ctx.fill()
	}
}

function drawGates(ctx, track, state) {
	const got = state.gates || 0
	track.GATES.forEach((s, i) => {
		// Gate 0 is the start line, which is already painted.
		if (i === 0) return
		if (Math.abs(deltaS(track, s, state.s)) > 320) return
		drawGate(ctx, track, s, (got & (1 << i)) !== 0)
	})
}

// A painted arrow on the road: a rectangular shaft and a
// triangular head, square-cut, the way one is actually
// painted on tarmac.
//
// The first attempt was a tapering curved stroke that bent
// toward the inside of the corner. It read as a smear. The
// shape wants hard edges and straight lines — the whole
// arrow is eight points, and that is what makes it look
// stencilled rather than drawn.
const SHAFT_LEN = 34
const SHAFT_W = 9
const HEAD_LEN = 20
const HEAD_W = 23
const ARROW_PAINT = 'rgba(246, 249, 255, 0.86)'

// Canted toward the inside of the bend rather than lying
// along the road, so it points where the corner goes.
const ARROW_CANT = 0.5

function arrowPoly(ctx, cx, cy, ang, k) {
	const co = Math.cos(ang), si = Math.sin(ang)
	const put = (x, y) => [
		cx + (x * co - y * si) * k,
		cy + (x * si + y * co) * k,
	]
	const tail = -(SHAFT_LEN + HEAD_LEN) / 2
	const neck = tail + SHAFT_LEN
	const tip = neck + HEAD_LEN
	const pts = [
		put(tail, -SHAFT_W / 2), put(neck, -SHAFT_W / 2),
		put(neck, -HEAD_W / 2), put(tip, 0),
		put(neck, HEAD_W / 2), put(neck, SHAFT_W / 2),
		put(tail, SHAFT_W / 2),
	]
	ctx.beginPath()
	pts.forEach((p, i) => {
		if (i === 0) ctx.moveTo(p[0], p[1])
		else ctx.lineTo(p[0], p[1])
	})
	ctx.closePath()
	ctx.fillStyle = ARROW_PAINT
	ctx.fill()
}

function paintArrow(ctx, track, s, dir, k) {
	const p = sampleAt(track, s)
	const ang = Math.atan2(p.uy, p.ux) + dir * ARROW_CANT
	// Set over toward the side the corner turns, so it sits
	// on the line you want to be taking.
	const off = dir * track.halfWidth * 0.3
	const at = offsetPoint(track, s, off)
	arrowPoly(ctx, at.x, at.y, ang, k)
}

function drawArrows(ctx, track, cam) {
	for (const a of track.ARROWS) {
		if (Math.abs(deltaS(track, a.s, cam.s)) > 320) {
			continue
		}
		paintArrow(ctx, track, a.s, a.dir, 1)
		// A second, smaller one further back for the ones
		// worth slowing down for.
		if (a.hard) {
			paintArrow(ctx, track, a.s - 74, a.dir, 0.78)
		}
	}
}

// A pickup: a ring with a dot in it, pulsing so it reads as
// something to collect rather than as another painted mark.
// Greyed while it is on cooldown, so an empty one does not
// look like one you missed.
function drawPickups(ctx, state, cam) {
	const pts = state.track.PICKUPS
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i]
		if (!onScreen(p.x, p.y, cam)) continue
		const live = state.pickups[i] <= 0
		ctx.strokeStyle = live
			? 'rgba(255, 224, 130, 0.9)'
			: 'rgba(120, 130, 140, 0.4)'
		ctx.lineWidth = 2
		ctx.beginPath()
		ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
		ctx.stroke()
		if (!live) continue
		ctx.fillStyle = 'rgba(255, 206, 84, 0.95)'
		ctx.beginPath()
		ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
		ctx.fill()
	}
}

function drawMissiles(ctx, state) {
	for (const m of state.missiles) {
		const back = 0.03
		ctx.strokeStyle = 'rgba(255, 170, 90, 0.9)'
		ctx.lineWidth = 2.5
		ctx.lineCap = 'round'
		ctx.beginPath()
		ctx.moveTo(m.x, m.y)
		ctx.lineTo(m.x - m.vx * back, m.y - m.vy * back)
		ctx.stroke()
	}
}

// Rubber and scorch, drawn over the paint and under the cars.
//
// One alpha and one stroke for the whole lot. It used to be
// quantised into four bands by age, which is what a fading
// mark needs; rubber does not fade, so there is one path with
// every visible segment in it.
const RUBBER_W = 3
const RUBBER_DARK = 0.55

function drawRubber(ctx, marks, cam) {
	ctx.lineWidth = RUBBER_W
	ctx.lineCap = 'round'
	ctx.strokeStyle = `rgba(26, 23, 26, ${RUBBER_DARK})`
	ctx.beginPath()
	for (const m of marks.rubber) {
		if (!onScreen(m.x0, m.y0, cam)) continue
		ctx.moveTo(m.x0, m.y0)
		ctx.lineTo(m.x1, m.y1)
	}
	ctx.stroke()
}

// A scorched disc with cracks running out of it. The crack
// lengths come off the index rather than off Math.random so
// they are the same every frame: a blast mark is a mark, and
// one that reshuffles itself sixty times a second reads as a
// flame instead.
const CRACKS = 9

function blastCracks(ctx, r, a) {
	ctx.strokeStyle = `rgba(18, 16, 18, ${a})`
	ctx.lineWidth = 1.5
	ctx.lineCap = 'round'
	ctx.beginPath()
	for (let i = 0; i < CRACKS; i++) {
		const ang = (i / CRACKS) * Math.PI * 2
		const len = r * (0.88 + ((i * 7) % 5) * 0.14)
		const co = Math.cos(ang), si = Math.sin(ang)
		ctx.moveTo(co * r * 0.45, si * r * 0.45)
		ctx.lineTo(co * len, si * len)
	}
	ctx.stroke()
}

function drawBlast(ctx, m) {
	const f = m.t / m.life
	ctx.save()
	ctx.translate(m.x, m.y)
	ctx.rotate(m.turn)
	const g = ctx.createRadialGradient(
		0, 0, 0, 0, 0, BLAST_R)
	g.addColorStop(0, `rgba(14, 12, 14, ${0.82 * f})`)
	g.addColorStop(0.5, `rgba(34, 29, 31, ${0.6 * f})`)
	g.addColorStop(1, 'rgba(44, 38, 40, 0)')
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(0, 0, BLAST_R, 0, Math.PI * 2)
	ctx.fill()
	blastCracks(ctx, BLAST_R, 0.55 * f)
	ctx.restore()
}

function drawMarks(ctx, state, cam) {
	for (const m of state.marks.blasts) {
		if (!onScreen(m.x, m.y, cam)) continue
		drawBlast(ctx, m)
	}
	drawRubber(ctx, state.marks, cam)
}

function drawWorld(ctx, state, atlas, cam) {
	const track = state.track
	drawRoad(ctx, track, state)
	drawSand(ctx, track, state)
	drawRamps(ctx, track, state)
	drawArrows(ctx, track, state)
	drawGates(ctx, track, state)
	drawStartGrid(ctx, track)
	drawStartLine(ctx, track)
	// Over the paint and the grid: rubber lies on top of
	// whatever is painted on the road, not under it.
	drawMarks(ctx, state, cam)
	// The treeline stands outside the boundary, so it goes
	// down after the road rather than before it — a tree is
	// taller than the kerb it overhangs.
	drawTreeLine(ctx, track, atlas.scenery, cam)
	drawObstacles(ctx, track, atlas.scenery, cam)
	drawPickups(ctx, state, cam)
	// Cars that are out are off the road entirely; a wrecked
	// one is still there, spinning, and has to be visible or
	// you cannot avoid it.
	drawRivals(
		ctx, state.rivals.filter((r) => !r.out),
		drawCarSprite)
	if (!state.out) drawCarSprite(ctx, state, PLAYER_COLOURS)
	drawMissiles(ctx, state)
}

// The time of day, picked per run (game.js).
//
// The world is drawn in daylight and then a fill goes over the
// top with the headlamps cut back out of it, so morning is not
// a third rendering path — it is the absence of the fill, and
// costs nothing at all.
//
// Evening sat at 0.45 for a while, out of a worry that
// dimming a baked mesh by more than half flattens the shading
// that is the whole point of the sprites. True, but 0.45 is
// not dusk, it is an overcast afternoon — and the beams now
// restore the full daylight colours wherever they fall, so
// the contrast is there to be seen in the place you are
// actually looking.
//
// Night is 0.88 of something much nearer black, which is dark
// enough that the beams are the only way to read the road.
// Night is 0.965 of something very near black, which is dark
// enough that the beams and the circles at the end of them
// are the only way to read the road at all.
//
// `wash` is the warm light a lamp adds along its wedge and
// `glow` the stronger one in the circle, both added rather
// than painted over, because a lamp is emissive. Restoring
// the daylight colours under a beam says "not dimmed here";
// it does not say "lit from here".
const LIGHT = {
	morning: null,
	evening: {
		fill: 'rgba(18, 22, 48, 0.58)',
		wash: 'rgba(255, 214, 140, 0.05)',
		glow: 'rgba(255, 236, 186, 0.12)',
	},
	night: {
		fill: 'rgba(3, 4, 12, 0.965)',
		wash: 'rgba(255, 214, 140, 0.06)',
		glow: 'rgba(255, 238, 192, 0.16)',
	},
}

export const TIMES = Object.keys(LIGHT)

function lightFor(state) {
	return LIGHT[state.light] !== undefined
		? LIGHT[state.light] : LIGHT.evening
}

// A headlamp throws a wedge that ends in a bright circle on
// the road, and every car on the track has two.
//
// The wedge and the circle are one shape, not two effects
// layered: the spread is derived from the circle rather than
// chosen, so the wedge is exactly as wide at its far end as
// the circle it finishes in and the two meet instead of one
// floating in the other. Change the reach or the radius and
// the spread follows.
//
// Each lamp is aimed a little outward, by enough to put the
// two circles side by side with a good overlap between them.
// Parallel beams put both in the same place — the lamps are
// five units apart and a circle is twenty-six across — and
// two circles in the same place are one circle.
//
// The reach is bounded by the window, not by taste. The
// viewport is a hundred units tall, so the camera sees fifty
// either side of the car: a circle thrown further than that
// is off the top of the screen whenever the car is pointing
// up it. At 58 it always was, and the player's own headlights
// were the two that could never be seen. From a nose eight
// units forward, 28 at this splay puts the far edge of the
// circle at 48 and keeps it in frame whichever way the car
// faces.
const POOL_AHEAD = 28
const POOL_R = 13
const SPLAY = 0.28

// The beams come off the two headlamps, out on the corners
// of the nose, and the shape of one is the hull of its lamp
// and its circle: a small disc at the lamp, the big circle at
// the far end, and the two straight sides between them. A
// cone, in other words, with a real source — and no spread
// angle to set, because the two circles already say how wide
// it is at both ends.
//
// Taking it as a wedge from a point, which is the obvious
// thing, is what put a shadow between the two beams. Each
// lamp aims away from the other, so the strip straight ahead
// of the car fell outside the left cone and outside the right
// one too, and stayed outside both until twelve units out. No
// spread closes that: the angle from a point on the
// centreline to a lamp beside it goes to a right angle as you
// approach. A mouth as wide as the lamps are apart closes it
// at the nose instead, where it belongs, and looks more like
// a headlight anyway.
const LAMP_R = 4
const LAMP_SIDE = 2.5
const NOSE = CAR_LENGTH / 2

// Where a car's lamps are, in viewport units. The player sits
// at the centre of the window and a rival is wherever it is
// relative to the player, so one function covers both and the
// player is simply the car the camera is on.
function lampsOf(car, cam) {
	const sx = VIEWPORT_WIDTH / 2 + (car.x - cam.x)
	const sy = VIEWPORT_HEIGHT / 2 + (car.y - cam.y)
	const f = car.facing
	const px = Math.cos(f + Math.PI / 2) * LAMP_SIDE
	const py = Math.sin(f + Math.PI / 2) * LAMP_SIDE
	const cx = sx + Math.cos(f) * NOSE
	const cy = sy + Math.sin(f) * NOSE
	return [-1, 1].map((side) => ({
		x: cx + px * side,
		y: cy + py * side,
		aim: f + SPLAY * side,
	}))
}

// One convex outline for the whole beam: round the front of
// the far circle, then round the back of the lamp, which
// joins them with the two straight sides. Traversed with the
// angle only ever increasing, so every subpath winds the same
// way — and that matters, because nonzero only unions shapes
// that agree about which way is in. Mixed windings would cut
// holes wherever two beams crossed.
function lampPath(ctx, lamp) {
	const a = lamp.aim
	const cx = lamp.x + Math.cos(a) * POOL_AHEAD
	const cy = lamp.y + Math.sin(a) * POOL_AHEAD
	const q = Math.PI / 2
	ctx.moveTo(
		cx + Math.cos(a - q) * POOL_R,
		cy + Math.sin(a - q) * POOL_R)
	ctx.arc(cx, cy, POOL_R, a - q, a + q)
	ctx.arc(lamp.x, lamp.y, LAMP_R, a + q, a + q * 3)
	ctx.closePath()
	return { cx, cy }
}

// The box a lamp can reach into, so a frame blits the part
// of the world that is lit rather than all of it. A beam is
// the hull of two circles, so the two circles' boxes between
// them contain it.
function lampBox(lamp, c) {
	const x0 = Math.min(lamp.x - LAMP_R, c.cx - POOL_R) - 2
	const y0 = Math.min(lamp.y - LAMP_R, c.cy - POOL_R) - 2
	const x1 = Math.max(lamp.x + LAMP_R, c.cx + POOL_R) + 2
	const y1 = Math.max(lamp.y + LAMP_R, c.cy + POOL_R) + 2
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function growBox(a, b) {
	if (!a) return b
	const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
	return {
		x, y,
		w: Math.max(a.x + a.w, b.x + b.w) - x,
		h: Math.max(a.y + a.h, b.y + b.h) - y,
	}
}

function blitPatch(ctx, world, b) {
	ctx.drawImage(
		world,
		b.x * VIEW_SCALE, b.y * VIEW_SCALE,
		b.w * VIEW_SCALE, b.h * VIEW_SCALE,
		b.x, b.y, b.w, b.h)
}

// Off the window by more than a lamp can reach, so nothing it
// lights could be on screen either.
function lit(car, cam) {
	return Math.abs(car.x - cam.x) <
			VIEWPORT_WIDTH / 2 + POOL_AHEAD + POOL_R &&
		Math.abs(car.y - cam.y) <
			VIEWPORT_HEIGHT / 2 + POOL_AHEAD + POOL_R
}

function litCars(state) {
	const all = state.out ? [] : [state]
	for (const r of state.rivals) {
		if (!r.out && lit(r, state)) all.push(r)
	}
	return all
}

function allLamps(state) {
	const out = []
	for (const car of litCars(state)) {
		out.push(...lampsOf(car, state))
	}
	return out
}

// Every lamp into one path, then one clip and one paste of
// the daylight world, then the light added on top.
//
// A lamp at a time was wrong, and wrong in a way that showed:
// each reveal pasted opaque daylight over its own clip, so
// wherever two beams crossed, the second one wiped out the
// first one's glow and replaced it with whatever its own glow
// happened to be there — which, out at the edge of a beam, is
// nothing. Two beams crossing therefore came out darker than
// either beam alone. They looked like shadows cast by one
// headlight onto another, and that is what they were.
//
// Pasted once and lit afterwards, the lights add up instead,
// which is what lights do. It is also fewer blits.
function drawNightfall(ctx, world, state, light) {
	ctx.fillStyle = light.fill
	ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
	const lamps = allLamps(state)
	if (!lamps.length) return
	ctx.save()
	ctx.beginPath()
	let box = null
	const eyes = lamps.map((l) => {
		const c = lampPath(ctx, l)
		box = growBox(box, lampBox(l, c))
		return c
	})
	// Overlapping subpaths all wind the same way, so nonzero
	// unions them. Even-odd would toggle the overlaps back to
	// "outside" and cut holes where the beams cross.
	ctx.clip()
	blitPatch(ctx, world, box)
	ctx.globalCompositeOperation = 'lighter'
	ctx.fillStyle = light.wash
	ctx.fillRect(box.x, box.y, box.w, box.h)
	for (const c of eyes) glow(ctx, c, box, light)
	ctx.restore()
}

// Brighter in the circle than along the wedge: the lamp is
// pointed at it.
function glow(ctx, c, box, light) {
	const g = ctx.createRadialGradient(
		c.cx, c.cy, 0, c.cx, c.cy, POOL_R)
	g.addColorStop(0, light.glow)
	g.addColorStop(1, 'rgba(255, 228, 170, 0)')
	ctx.fillStyle = g
	ctx.fillRect(box.x, box.y, box.w, box.h)
}

// Renders world-space (true daylight colors) to its own
// offscreen canvas so drawNightfall can paste pieces back in
// per-lamp — see revealLamp. It's a full-size canvas with
// VIEW_SCALE baked in, exactly like the visible one: rendering
// it at viewport units instead and letting the blit magnify it
// would throw away VIEW_SCALE's worth of detail and pixellate
// the whole scene.
function renderWorldToOffscreen(world, state, atlas) {
	const wctx = world.ctx
	wctx.save()
	wctx.scale(VIEW_SCALE, VIEW_SCALE)
	wctx.fillStyle = '#3e8e41'
	wctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
	wctx.translate(
		VIEWPORT_WIDTH / 2 - state.x,
		VIEWPORT_HEIGHT / 2 - state.y)
	drawWorld(wctx, state, atlas, state)
	wctx.restore()
}

// Drawn back at viewport units, which the caller's VIEW_SCALE
// turns into a 1:1 pixel copy — no resampling, nothing softened.
function blitWorld(ctx, worldCanvas) {
	ctx.drawImage(
		worldCanvas, 0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
}

// The lamps go on over the fill, not under it: a light is
// emissive, so dimming it with the scenery it sits on would
// hide the one thing that makes a car visible out there.
// Without this a car behind you, or alongside but outside the
// beams, is simply not on screen.
function drawLamps(ctx, state) {
	const cars = state.out ?
		state.rivals : [state, ...state.rivals]
	ctx.save()
	ctx.globalCompositeOperation = 'lighter'
	ctx.translate(
		VIEWPORT_WIDTH / 2 - state.x,
		VIEWPORT_HEIGHT / 2 - state.y)
	drawCarLights(ctx, cars.filter((c) => !c.out))
	ctx.restore()
}

export function draw(ctx, world, state, atlas) {
	renderWorldToOffscreen(world, state, atlas)
	const light = lightFor(state)
	ctx.save()
	ctx.scale(VIEW_SCALE, VIEW_SCALE)
	blitWorld(ctx, world.canvas)
	// In the morning there is nothing over the top, so there
	// is nothing for a lamp to show against either: headlamps
	// belong to the times of day that need them.
	if (light) {
		drawNightfall(ctx, world.canvas, state, light)
		drawLamps(ctx, state)
	}
	ctx.restore()
}

export function createWorldCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = WIDTH
	canvas.height = HEIGHT
	return { canvas, ctx: canvas.getContext('2d') }
}
