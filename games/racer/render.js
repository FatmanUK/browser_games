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
// offscreen canvas first, which drawDusk then dims and the
// headlights reveal; see revealBeam for why that has to be a
// per-beam paste rather than a cutout.

import { WIDTH, HEIGHT } from '../_shared/hud.js'
import {
	VIEWPORT_WIDTH, VIEWPORT_HEIGHT, VIEW_SCALE, PX,
	CULL_X, CULL_Y,
} from './view.js'
import { getAtlas, carRing, frameFor, variant } from './sprites.js'
import { CAR_LENGTH, CAR_WIDTH, PLAYER_COLOURS } from './car.js'
import { sampleAt, offsetPoint, deltaS } from './path.js'
import { airLift } from './jump.js'
import { drawRivals, drawRivalLights } from './rivals.js'
function deg(d) {
	return (d * Math.PI) / 180
}

// The road as a ribbon along the centreline, not as a band of
// radii about a centre. This is the drawing half of the move
// to arc length, and it is not optional: a radial band and a
// perpendicular band are different shapes wherever the
// centreline is not square to the radius, so leaving the paint
// polar would have put the painted road somewhere other than
// the road the car is driving on.
//
// Only the stretch near the camera is traced. The whole lap is
// about 950 samples and the window shows 240 by 100 units of
// it, so almost all of them are behind you.
function ribbonRun(ctx, track, cam, off) {
	const half = Math.ceil(300 / track.ds)
	const i0 = Math.floor(cam.s / track.ds)
	ctx.beginPath()
	for (let d = -half; d <= half; d++) {
		const p = offsetPoint(track, (i0 + d) * track.ds, off)
		if (d === -half) ctx.moveTo(p.x, p.y)
		else ctx.lineTo(p.x, p.y)
	}
}

function ribbonBand(ctx, track, cam, a, b, reach) {
	const half = Math.ceil((reach || 300) / track.ds)
	const i0 = Math.floor(cam.s / track.ds)
	ctx.beginPath()
	for (let d = -half; d <= half; d++) {
		const p = offsetPoint(track, (i0 + d) * track.ds, a)
		if (d === -half) ctx.moveTo(p.x, p.y)
		else ctx.lineTo(p.x, p.y)
	}
	for (let d = half; d >= -half; d--) {
		const p = offsetPoint(track, (i0 + d) * track.ds, b)
		ctx.lineTo(p.x, p.y)
	}
	ctx.closePath()
}

function roadAt(ctx, track, s, surface) {
	ribbonBand(
		ctx, track, { s }, -track.halfWidth, track.halfWidth)
	ctx.fillStyle = surface
	ctx.fill()
	for (const side of [-1, 1]) {
		const kerb = side * (track.halfWidth - 4)
		ribbonRun(ctx, track, { s }, kerb)
		ctx.save()
		ctx.setLineDash([10, 10])
		ctx.lineWidth = 6
		ctx.strokeStyle = '#fff'
		ctx.stroke()
		ctx.lineDashOffset = 10
		ctx.strokeStyle = '#e53935'
		ctx.stroke()
		ctx.restore()
	}
}

// Where the track crosses itself the two branches are far
// apart in arc length but right on top of each other on the
// map, so standing on one means the other has to be drawn too
// — and drawn first, because it is the one underneath.
function pairedS(track, cam) {
	for (const j of track.JUMPS) {
		const dOver = Math.abs(deltaS(track, j.mid, cam.s))
		if (dOver < 340) return { s: j.under, over: false }
		const dUnder = Math.abs(deltaS(track, j.under, cam.s))
		if (dUnder < 340) return { s: j.mid, over: true }
	}
	return null
}

const DECK = '#6a6a72'
const ROAD = '#555'

function drawRoad(ctx, track, cam) {
	const pair = pairedS(track, cam)
	if (pair && !pair.over) {
		// Standing on the bridge: the ground road goes down
		// first, then the deck's shadow, then the deck.
		roadAt(ctx, track, pair.s, ROAD)
		deckShadow(ctx, track, cam.s)
		roadAt(ctx, track, cam.s, DECK)
		deckEdge(ctx, track, cam.s)
		return
	}
	roadAt(ctx, track, cam.s, ROAD)
	if (!pair) return
	// Standing underneath: the deck passes overhead, and its
	// shadow falls on the road you are on.
	deckShadow(ctx, track, pair.s)
	roadAt(ctx, track, pair.s, DECK)
	deckEdge(ctx, track, pair.s)
}

// Seen from directly above, an elevated road and a flat one
// are the same shape in the same place. A cast shadow is the
// only thing that says which of the two is which, so the deck
// gets one, thrown the way the baked sprites are lit — down
// and to the right of the light that made them.
const SHADOW_X = 9
const SHADOW_Y = 11

function deckShadow(ctx, track, s) {
	ctx.save()
	ctx.translate(SHADOW_X, SHADOW_Y)
	ribbonBand(
		ctx, track, { s },
		-track.halfWidth - 3, track.halfWidth + 3)
	ctx.fillStyle = 'rgba(4, 7, 14, 0.5)'
	ctx.fill()
	ctx.restore()
}

// A dark lip down each side of the deck, so the edge you must
// not run off reads at speed.
function deckEdge(ctx, track, s) {
	for (const side of [-1, 1]) {
		ribbonRun(ctx, track, { s }, side * track.halfWidth)
		ctx.strokeStyle = 'rgba(8, 10, 18, 0.85)'
		ctx.lineWidth = 5
		ctx.stroke()
	}
}

// The ramps, painted across the road at each end of a jump.
function drawRamps(ctx, track, cam) {
	for (const j of track.JUMPS) {
		for (const s of [j.s0, j.s1]) {
			if (Math.abs(deltaS(track, s, cam.s)) > 320) {
				continue
			}
			rampBand(ctx, track, s)
		}
	}
}

// Hazard stripes across the road. A plain band reads as a
// patch of different tarmac; the stripes read as a thing the
// track is telling you about.
function rampBand(ctx, track, s) {
	const len = 30
	ribbonBand(
		ctx, track, { s }, -track.halfWidth,
		track.halfWidth, len)
	ctx.save()
	ctx.clip()
	ctx.fillStyle = '#8a8d99'
	ctx.fill()
	for (let i = -6; i <= 6; i++) {
		const a = offsetPoint(
			track, s - len + i * 13, -track.halfWidth)
		const b = offsetPoint(
			track, s + len + i * 13, track.halfWidth)
		ctx.strokeStyle = '#e0bb4e'
		ctx.lineWidth = 7
		ctx.beginPath()
		ctx.moveTo(a.x, a.y)
		ctx.lineTo(b.x, b.y)
		ctx.stroke()
	}
	ctx.restore()
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

// A chevron on the road pointing the way the corner bends.
// Two of them for a hard one, which is the only difference a
// driver needs at the speed they go past.
//
// Canted 45 degrees off the direction of travel, not 90. A
// quarter turn points the arrow straight across the road,
// which reads as "go that way now" rather than as "the road
// bends that way"; half of that keeps the forward sense in it.
const ARROW_CANT = Math.PI / 4

function chevron(ctx, x, y, face, dir, size, alpha) {
	ctx.save()
	ctx.translate(x, y)
	ctx.rotate(face + (dir > 0 ? 1 : -1) * ARROW_CANT)
	ctx.strokeStyle = `rgba(255, 206, 84, ${alpha})`
	ctx.lineWidth = 3.5
	ctx.lineJoin = 'round'
	ctx.lineCap = 'round'
	ctx.beginPath()
	ctx.moveTo(-size, -size * 0.8)
	ctx.lineTo(size * 0.5, 0)
	ctx.lineTo(-size, size * 0.8)
	ctx.stroke()
	ctx.restore()
}

function drawArrows(ctx, track, cam) {
	for (const a of track.ARROWS) {
		if (Math.abs(deltaS(track, a.s, cam.s)) > 320) {
			continue
		}
		const p = sampleAt(track, a.s)
		const face = Math.atan2(p.uy, p.ux)
		chevron(ctx, p.x, p.y, face, a.dir, 13, 0.8)
		if (!a.hard) continue
		const q = sampleAt(track, a.s - 22)
		chevron(ctx, q.x, q.y, face, a.dir, 13, 0.55)
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

function drawWorld(ctx, state, atlas, cam) {
	const track = state.track
	drawRoad(ctx, track, state)
	drawSand(ctx, track, state)
	drawRamps(ctx, track, state)
	drawArrows(ctx, track, state)
	drawGates(ctx, track, state)
	drawStartGrid(ctx, track)
	drawStartLine(ctx, track)
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

// Dusky evening: dim everything down except two headlight cones
// ahead of the car, where the normal daylight colors underneath
// show through undimmed (not brightened — restored, not washed
// out) with a soft fade back to full dusk at each beam's reach.
// 0.45, not the 0.55 this was when everything on the ground
// was a flat fill. A baked mesh carries its own light and
// shade, and dimming it by more than half flattens that back
// out — the whole point of the sprites is the contrast across
// a surface, and the dusk was eating it.
const DUSK_COLOR = 'rgba(18, 22, 48, 0.45)'
const DUSK_CLEAR = 'rgba(18, 22, 48, 0)'

// Restoring the daylight colours inside the beam says "not
// dimmed here". It does not say "lit from here" — for that the
// beam has to add its own colour, which is what this is. Added
// rather than painted over, because a lamp is emissive.
const BEAM_WASH = 'rgba(255, 214, 140, 0.16)'
const BEAM_SPREAD = deg(18)
const BEAM_LENGTH = 85
const HEADLIGHT_OFFSET = 2.5

// The two headlamps sit a little either side of the car's front
// center, so their beams overlap for almost their whole length —
// see revealBeam for why that overlap has to be handled by
// layering independent reveals rather than cutting both wedges
// out of one dusk fill (evenodd parity breaks on overlapping
// holes: a point inside both wedges gets toggled back "outside").
function headlightOrigins(facing) {
	const frontDist = CAR_LENGTH / 2
	const perp = facing + Math.PI / 2
	const cx = VIEWPORT_WIDTH / 2 + Math.cos(facing) * frontDist
	const cy = VIEWPORT_HEIGHT / 2 + Math.sin(facing) * frontDist
	const ox = Math.cos(perp) * HEADLIGHT_OFFSET
	const oy = Math.sin(perp) * HEADLIGHT_OFFSET
	return [
		{ x: cx - ox, y: cy - oy },
		{ x: cx + ox, y: cy + oy },
	]
}

function beamPath(ctx, origin, facing) {
	ctx.moveTo(origin.x, origin.y)
	ctx.arc(
		origin.x, origin.y, BEAM_LENGTH,
		facing - BEAM_SPREAD, facing + BEAM_SPREAD)
	ctx.closePath()
}

// Clips to one beam's wedge and pastes the true-color world
// (pre-rendered to worldCanvas, see draw) back in over the dusk
// fill, then fades that back toward dusk with distance. Confined
// entirely to its own clip, so a second beam's reveal just lays
// over this one wherever they overlap — always correct, however
// much the wedges intersect, unlike a shared fill-rule cutout.
function revealBeam(ctx, worldCanvas, origin, facing) {
	ctx.save()
	ctx.beginPath()
	beamPath(ctx, origin, facing)
	ctx.clip()
	blitWorld(ctx, worldCanvas)
	const wash = ctx.createRadialGradient(
		origin.x, origin.y, 0,
		origin.x, origin.y, BEAM_LENGTH)
	wash.addColorStop(0, BEAM_WASH)
	wash.addColorStop(1, DUSK_CLEAR)
	ctx.globalCompositeOperation = 'lighter'
	ctx.fillStyle = wash
	ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
	ctx.globalCompositeOperation = 'source-over'
	const grad = ctx.createRadialGradient(
		origin.x, origin.y, BEAM_LENGTH * 0.4,
		origin.x, origin.y, BEAM_LENGTH)
	grad.addColorStop(0, DUSK_CLEAR)
	grad.addColorStop(1, DUSK_COLOR)
	ctx.fillStyle = grad
	ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
	ctx.restore()
}

function drawDusk(ctx, worldCanvas, facing) {
	ctx.fillStyle = DUSK_COLOR
	ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
	for (const origin of headlightOrigins(facing)) {
		revealBeam(ctx, worldCanvas, origin, facing)
	}
}

// Renders world-space (true daylight colors) to its own
// offscreen canvas so drawDusk can paste pieces of it back in
// per-beam — see revealBeam. It's a full-size canvas with
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

// The rivals' lamps go on over the dusk fill, not under it: a
// light is emissive, so dimming it with the scenery it sits on
// would hide the one thing that makes a car visible out there.
// Without this a rival behind you, or alongside but outside the
// beams, is simply not on screen.
function drawCarLights(ctx, state) {
	ctx.save()
	ctx.globalCompositeOperation = 'lighter'
	ctx.translate(
		VIEWPORT_WIDTH / 2 - state.x,
		VIEWPORT_HEIGHT / 2 - state.y)
	drawRivalLights(ctx, state.rivals)
	ctx.restore()
}

export function draw(ctx, world, state, atlas) {
	renderWorldToOffscreen(world, state, atlas)
	ctx.save()
	ctx.scale(VIEW_SCALE, VIEW_SCALE)
	blitWorld(ctx, world.canvas)
	drawDusk(ctx, world.canvas, state.facing)
	drawCarLights(ctx, state)
	ctx.restore()
}

export function createWorldCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = WIDTH
	canvas.height = HEIGHT
	return { canvas, ctx: canvas.getContext('2d') }
}
