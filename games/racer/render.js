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
import { CENTER, lerpArray, angleOf } from './geom.js'
import { drawRivals, drawRivalLights } from './rivals.js'
function deg(d) {
	return (d * Math.PI) / 180
}

// The rumble strips are the road edges pulled in a little.
// Derived per track and cached on it: there is more than one
// track now, and recomputing two 720-entry tables every frame
// to draw the same two rings would be silly.
function rumbles(track) {
	if (!track._rumble) {
		track._rumble = {
			outer: track.OUTER_RADIUS.map((r) => r - 4),
			inner: track.INNER_RADIUS.map((r) => r + 4),
		}
	}
	return track._rumble
}

// Traces the closed path of a radius lookup table (one point per
// table entry, evenly spaced in angle) — the generalization of
// ctx.ellipse() for a track shape with no closed form.
function ringPath(ctx, table) {
	const n = table.length
	ctx.beginPath()
	for (let i = 0; i < n; i++) {
		const angle = (i / n) * Math.PI * 2
		const r = table[i]
		const x = CENTER.x + Math.cos(angle) * r
		const y = CENTER.y + Math.sin(angle) * r
		if (i === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	}
	ctx.closePath()
}

function drawTrackRing(ctx, table, color) {
	ringPath(ctx, table)
	ctx.fillStyle = color
	ctx.fill()
}

function drawRumbleRing(ctx, table) {
	ctx.save()
	ctx.setLineDash([10, 10])
	ctx.lineWidth = 6
	ctx.strokeStyle = '#fff'
	ringPath(ctx, table)
	ctx.stroke()
	ctx.lineDashOffset = 10
	ctx.strokeStyle = '#e53935'
	ctx.stroke()
	ctx.restore()
}

function drawStartLine(ctx, track) {
	const { x, y, angle } = track.START
	const perp = angle + Math.PI / 2
	const half = track.ROAD_WIDTH / 2
	ctx.strokeStyle = '#fff'
	ctx.lineWidth = 3
	ctx.beginPath()
	ctx.moveTo(
		x + Math.cos(perp) * half, y + Math.sin(perp) * half)
	ctx.lineTo(
		x - Math.cos(perp) * half, y - Math.sin(perp) * half)
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

function drawCarSprite(ctx, car, colours) {
	blit(ctx, frameFor(carRing(colours), car.facing),
		car.x, car.y)
}

function wedgePoint(table, angle) {
	const r = lerpArray(table, angle)
	return {
		x: CENTER.x + Math.cos(angle) * r,
		y: CENTER.y + Math.sin(angle) * r,
	}
}

function drawWedge(ctx, innerTable, outerTable, wedge, color) {
	const steps = 12
	ctx.fillStyle = color
	ctx.beginPath()
	for (let i = 0; i <= steps; i++) {
		const a = wedge.angle - wedge.spread +
			(2 * wedge.spread * i) / steps
		const p = wedgePoint(outerTable, a)
		if (i === 0) ctx.moveTo(p.x, p.y)
		else ctx.lineTo(p.x, p.y)
	}
	for (let i = steps; i >= 0; i--) {
		const a = wedge.angle - wedge.spread +
			(2 * wedge.spread * i) / steps
		const p = wedgePoint(innerTable, a)
		ctx.lineTo(p.x, p.y)
	}
	ctx.closePath()
	ctx.fill()
}

const SAND_COLOR = 'rgba(216, 186, 128, 0.85)'

function drawWedges(ctx, track) {
	for (const wedge of track.SAND_WEDGES) {
		drawWedge(
			ctx, track.OUTER_RADIUS, track.BOUND_RADIUS,
			wedge, SAND_COLOR)
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

function drawGate(ctx, track, angle, got) {
	const inner = lerpArray(track.INNER_RADIUS, angle)
	const outer = lerpArray(track.OUTER_RADIUS, angle)
	const cos = Math.cos(angle), sin = Math.sin(angle)
	ctx.strokeStyle = got ? GATE_LIT : GATE_DIM
	ctx.lineWidth = 2.5
	ctx.setLineDash([6, 6])
	ctx.beginPath()
	ctx.moveTo(cos * inner, sin * inner)
	ctx.lineTo(cos * outer, sin * outer)
	ctx.stroke()
	ctx.setLineDash([])
	ctx.fillStyle = got ? POST_LIT : POST_DIM
	for (const r of [inner, outer]) {
		ctx.beginPath()
		ctx.arc(cos * r, sin * r, 3, 0, Math.PI * 2)
		ctx.fill()
	}
}

function drawGates(ctx, track, state) {
	const got = state.gates || 0
	track.GATES.forEach((angle, i) => {
		// Gate 0 is the start line, which is already painted.
		if (i === 0) return
		drawGate(ctx, track, angle, (got & (1 << i)) !== 0)
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

function drawArrows(ctx, track) {
	for (const a of track.ARROWS) {
		const inner = lerpArray(track.INNER_RADIUS, a.angle)
		const outer = lerpArray(track.OUTER_RADIUS, a.angle)
		const r = inner + (outer - inner) * 0.5
		const x = Math.cos(a.angle) * r
		const y = Math.sin(a.angle) * r
		// Along the road, which on a star-shaped track is the
		// tangent at this angle turned by the travel sense.
		const face = a.angle +
			track.TRAVEL_DIR * Math.PI / 2
		chevron(ctx, x, y, face, a.dir, 13, 0.8)
		if (!a.hard) continue
		const back = a.angle - track.TRAVEL_DIR * 0.03
		chevron(
			ctx, Math.cos(back) * r, Math.sin(back) * r,
			face, a.dir, 13, 0.55)
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
	const rb = rumbles(track)
	drawTrackRing(ctx, track.OUTER_RADIUS, '#555')
	drawTrackRing(ctx, track.INNER_RADIUS, '#3e8e41')
	drawRumbleRing(ctx, rb.outer)
	drawRumbleRing(ctx, rb.inner)
	drawWedges(ctx, track)
	drawArrows(ctx, track)
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
