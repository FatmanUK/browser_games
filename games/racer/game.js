// Top-down racing game on a randomly generated track (built by
// tools/generate_track.py into track-data.js — rerun that script
// for a fresh layout). The track is star-shaped around CENTER
// (every angle maps to exactly one boundary point), so it reuses
// the same angle-indexed-radius-lookup approach the old fixed
// oval used, generalized from a closed-form ellipse formula to a
// lookup table.

import { buildWindow, WIDTH, HEIGHT } from '../_shared/hud.js'
import {
	VIEWPORT_WIDTH, VIEWPORT_HEIGHT, VIEW_SCALE, PX,
	CULL_X, CULL_Y,
} from './view.js'
import {
	getAtlas, carRing, frameFor, variant,
} from './sprites.js'
import { loadNumber, saveNumber } from '../_shared/storage.js'
import { setupSound } from './audio.js'
import {
	CAR_LENGTH, CAR_WIDTH, ACCEL, BRAKE, MAX_SPEED,
	MAX_REVERSE, FRICTION, OFF_TRACK_DRAG, TURN_RATE,
	PLAYER_COLOURS,
} from './car.js'
import {
	CENTER, lerpArray, angleOf, angleDelta, normFor, onTrack,
	inWedge, trackBandPoint,
} from './geom.js'
import {
	createRivals, updateRivals, resolveContacts, drawRivals,
	drawRivalLights,
} from './rivals.js'
import {
	createRace, isRunning, isOver, tickCountdown, lapsOf,
	placeOf, checkFinishes,
} from './race.js'
import { drawHud } from './hud.js'
import * as TRACK from './track-data.js'

const OUTER_RUMBLE = offsetTable(TRACK.OUTER_RADIUS, -4)
const INNER_RUMBLE = offsetTable(TRACK.INNER_RADIUS, 4)

// Keyed by the track's own id so each generated track (see
// tools/generate_track.py) keeps its own best lap rather than
// sharing one score across whatever track happens to be loaded.
const BEST_KEY = `bg-dash-bestlap-${TRACK.TRACK_ID}`

const KEY_DIRS = {
	ArrowUp: 'accel', w: 'accel', W: 'accel',
	ArrowDown: 'brake', s: 'brake', S: 'brake',
	ArrowLeft: 'left', a: 'left', A: 'left',
	ArrowRight: 'right', d: 'right', D: 'right',
}

function deg(d) {
	return (d * Math.PI) / 180
}

function offsetTable(table, inset) {
	return table.map((r) => r + inset)
}

function createState() {
	const pole = TRACK.GRID_SLOTS[0]
	return {
		x: pole.x,
		y: pole.y,
		// `angle` is the true heading (travel direction);
		// `facing` is how the sprite and the headlamps are
		// drawn. They are the same while the car is driving,
		// and the split is kept because the two do come apart
		// — a car can be pointing somewhere other than where
		// it is going.
		angle: pole.angle,
		facing: pole.angle,
		speed: 0,
		totalAngle: 0,
		elapsed: 0,
		lapsShown: 0,
		lastLapAt: 0,
		terrain: null,
		wasColliding: false,
		rivals: createRivals(),
		race: createRace(),
		keys: new Set(),
	}
}

function waterAt(x, y) {
	return TRACK.WATER_HAZARDS.some(
		(w) => Math.hypot(x - w.x, y - w.y) <= w.r)
}

// Takes bare coordinates rather than a car, because the rivals
// need to ask about their own patch of ground too and they are
// not shaped like the player's state object.
function terrainAt(x, y) {
	const outerNorm = normFor(x, y, TRACK.OUTER_RADIUS)
	const boundNorm = normFor(x, y, TRACK.BOUND_RADIUS)
	const inVerge = outerNorm > 1 && boundNorm <= 1
	if (inVerge && inWedge(angleOf(x, y), TRACK.SAND_WEDGES)) {
		return 'sand'
	}
	if (waterAt(x, y)) return 'water'
	return null
}

function dragFor(x, y, terrain) {
	// Higher than water: sand grabs the car hard and hauls it
	// down to a stop quickly, just not instantly — it's still
	// the same exponential-decay drag model as everything else,
	// so there's no single-frame dead stop.
	if (terrain === 'sand') return 3.2
	if (terrain === 'water') return 2.5
	return onTrack(x, y) ?
		FRICTION : FRICTION * OFF_TRACK_DRAG
}

function turnMultiplier(terrain) {
	if (terrain === 'sand') return 0.8
	if (terrain === 'water') return 0.6
	return 1
}

function applyControls(state, dt, terrain) {
	if (state.keys.has('accel')) state.speed += ACCEL * dt
	if (state.keys.has('brake')) state.speed -= BRAKE * dt

	const drag = dragFor(state.x, state.y, terrain)
	state.speed -= state.speed * drag * dt
	state.speed = Math.min(
		MAX_SPEED, Math.max(MAX_REVERSE, state.speed))

	const turn = TURN_RATE * dt * turnMultiplier(terrain) *
		Math.sign(state.speed || 1)
	if (state.keys.has('left')) state.angle -= turn
	if (state.keys.has('right')) state.angle += turn

	state.facing = state.angle
}

function bounceOff(state, normalAngle, damping) {
	const tangent = normalAngle + Math.PI / 2
	state.angle = 2 * tangent - state.angle
	state.speed *= damping
}

const TYRE_DAMPING = 0.75

function resolveObstacle(state, obstacle) {
	const dx = state.x - obstacle.x
	const dy = state.y - obstacle.y
	const dist = Math.hypot(dx, dy)
	const minDist = obstacle.r + CAR_LENGTH / 2
	if (dist >= minDist || dist === 0) return false
	const normalAngle = Math.atan2(dy, dx)
	state.x = obstacle.x + Math.cos(normalAngle) * minDist
	state.y = obstacle.y + Math.sin(normalAngle) * minDist
	if (obstacle.behavior === 'stop') {
		state.speed = 0
	} else {
		bounceOff(state, normalAngle, TYRE_DAMPING)
	}
	return true
}

function resolveObstacles(state) {
	let hit = false
	for (const obstacle of TRACK.HARD_OBSTACLES) {
		if (resolveObstacle(state, obstacle)) hit = true
	}
	return hit
}

// The treeline marks this boundary, so running into it should
// feel the same as hitting one of the solid tree obstacles —
// stopped dead, not bounced back onto the track.
function clampToBound(state) {
	const norm = normFor(state.x, state.y, TRACK.BOUND_RADIUS)
	if (norm <= 1) return false
	const normalAngle = angleOf(state.x, state.y)
	const r = lerpArray(TRACK.BOUND_RADIUS, normalAngle)
	state.x = CENTER.x + Math.cos(normalAngle) * r
	state.y = CENTER.y + Math.sin(normalAngle) * r
	state.speed = 0
	return true
}

function playTerrainSound(terrain, audio) {
	if (terrain === 'sand') audio.slow()
	else if (terrain === 'water') audio.splash()
}

function integrate(state, dt, audio) {
	const prevAngle = angleOf(state.x, state.y)
	state.x += Math.cos(state.angle) * state.speed * dt
	state.y += Math.sin(state.angle) * state.speed * dt

	const hitObstacle = resolveObstacles(state)
	const hitBound = clampToBound(state)
	const collided = hitObstacle || hitBound
	if (collided && !state.wasColliding) audio.bump()
	state.wasColliding = collided

	const newTerrain = terrainAt(state.x, state.y)
	if (newTerrain !== state.terrain) {
		playTerrainSound(newTerrain, audio)
	}
	state.terrain = newTerrain

	const angle = angleOf(state.x, state.y)
	state.totalAngle += angleDelta(prevAngle, angle)
}

function recordLap(state, best) {
	const lapTime = state.elapsed - state.lastLapAt
	state.lastLapAt = state.elapsed
	const isBest = best.value === 0 || lapTime < best.value
	if (isBest) {
		best.value = lapTime
		saveNumber(BEST_KEY, best.value)
	}
	return isBest
}

function drivePlayer(state, dt, best, audio) {
	const terrain = terrainAt(state.x, state.y)
	applyControls(state, dt, terrain)
	integrate(state, dt, audio)
	// Nothing after the flag: the car is still coasting to a
	// stop, but it is no longer setting lap times.
	if (isOver(state.race)) return
	state.elapsed += dt
	const current = lapsOf(state)
	if (current > state.lapsShown) {
		const isBest = recordLap(state, best)
		audio[isBest ? 'bestLap' : 'lap']()
		state.lapsShown = current
	}
}

// The grid is held until the lights go out, so the countdown
// ticks on its own before anything moves. The last lap's time
// still has to be recorded, so the finish is checked after the
// player has driven, not before.
function update(state, dt, best, audio) {
	const race = state.race
	if (race.phase === 'countdown') {
		tickCountdown(race, dt, audio)
	}
	if (!isRunning(race)) return
	if (isOver(race)) state.keys.clear()
	drivePlayer(state, dt, best, audio)
	updateRivals(state.rivals, dt, terrainAt)
	if (resolveContacts(state, state.rivals)) audio.bump()
	if (checkFinishes(race, state, state.rivals)) {
		audio.finish()
	}
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

function drawStartLine(ctx) {
	const { x, y, angle } = TRACK.START
	const perp = angle + Math.PI / 2
	const half = TRACK.ROAD_WIDTH / 2
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

function drawStartGrid(ctx) {
	for (const slot of TRACK.GRID_SLOTS) drawGridSlot(ctx, slot)
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

function drawTreeLine(ctx, atlas, cam) {
	for (const tree of TRACK.TREE_LINE) {
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

function drawObstacles(ctx, atlas, cam) {
	for (const hazard of TRACK.WATER_HAZARDS) {
		if (!onScreen(hazard.x, hazard.y, cam)) continue
		drawWater(ctx, hazard.x, hazard.y, hazard.r)
	}
	for (const o of TRACK.HARD_OBSTACLES) {
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

function drawWedges(ctx) {
	for (const wedge of TRACK.SAND_WEDGES) {
		drawWedge(
			ctx, TRACK.OUTER_RADIUS, TRACK.BOUND_RADIUS,
			wedge, SAND_COLOR)
	}
}

// The ground is still painted, not baked: road, kerbs, grass
// and markings are flat surfaces seen from directly above, and
// a solid would give them nothing a fill does not. Only the
// things that stand up off it are sprites.
function drawWorld(ctx, state, atlas, cam) {
	drawTrackRing(ctx, TRACK.OUTER_RADIUS, '#555')
	drawTrackRing(ctx, TRACK.INNER_RADIUS, '#3e8e41')
	drawRumbleRing(ctx, OUTER_RUMBLE)
	drawRumbleRing(ctx, INNER_RUMBLE)
	drawWedges(ctx)
	drawStartGrid(ctx)
	drawStartLine(ctx)
	// The treeline stands outside the boundary, so it goes
	// down after the road rather than before it — a tree is
	// taller than the kerb it overhangs.
	drawTreeLine(ctx, atlas.scenery, cam)
	drawObstacles(ctx, atlas.scenery, cam)
	drawRivals(ctx, state.rivals, drawCarSprite)
	drawCarSprite(ctx, state, PLAYER_COLOURS)
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

function draw(ctx, world, state, atlas) {
	renderWorldToOffscreen(world, state, atlas)
	ctx.save()
	ctx.scale(VIEW_SCALE, VIEW_SCALE)
	blitWorld(ctx, world.canvas)
	drawDusk(ctx, world.canvas, state.facing)
	drawCarLights(ctx, state)
	ctx.restore()
}

// Builds the game window: title, New game/Back buttons,
// Sound/Music toggles and the Laps/Speed/Best lap meters sit in
// a translucent bar overlaid on top of the canvas itself — not
// beside or above it — so the canvas can be the whole window.
function createInput(ref, audio) {
	function onKeyDown(e) {
		audio.unlock()
		const action = KEY_DIRS[e.key]
		if (!action) return
		ref.state.keys.add(action)
		e.preventDefault()
	}

	function onKeyUp(e) {
		const action = KEY_DIRS[e.key]
		if (action) ref.state.keys.delete(action)
	}

	// Without this, a keyup delivered to whatever took the
	// focus leaves the action held forever and the car drives
	// itself at full lock — which is what "the canvas loses
	// focus" actually looked like from the driving seat.
	function onBlur() {
		ref.state.keys.clear()
	}

	return { onKeyDown, onKeyUp, onBlur }
}

function createWorldCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = WIDTH
	canvas.height = HEIGHT
	return { canvas, ctx: canvas.getContext('2d') }
}

// The animation-frame clock, kept apart from what it drives.
// `reset` drops the previous timestamp so a New Game does not
// hand the first frame the whole gap since the last one as its
// dt and teleport the car through the first corner.
function createLoop(step) {
	let handle = null, last = null
	function frame(time) {
		if (last === null) last = time
		const dt = Math.min((time - last) / 1000, 0.05)
		last = time
		step(dt)
		handle = requestAnimationFrame(frame)
	}
	handle = requestAnimationFrame(frame)
	return {
		reset: () => { last = null },
		stop: () => cancelAnimationFrame(handle),
	}
}

function createRuntime(ctx, best, audio) {
	const ref = { state: null }
	const world = createWorldCanvas()
	// Baked here, not at module load: js/registry.js imports
	// every game when the launcher opens, and this is the
	// first moment Dash is known to have been picked.
	const atlas = getAtlas()

	function render() {
		const s = ref.state
		draw(ctx, world, s, atlas)
		const place = placeOf(s.race, s, s.rivals)
		drawHud(ctx, s, best, MAX_SPEED, place)
	}

	const loop = createLoop((dt) => {
		update(ref.state, dt, best, audio)
		render()
	})
	const input = createInput(ref, audio)

	return {
		start() {
			ref.state = createState()
			loop.reset()
			render()
		},
		onKeyDown: input.onKeyDown,
		onKeyUp: input.onKeyUp,
		onBlur: input.onBlur,
		stop: () => {
			loop.stop()
			audio.stop()
		},
	}
}

export default {
	id: 'racer',
	title: 'Dash',
	description:
		'A top-down racer. Arrow keys / WASD to race five ' +
		'rivals over three laps of a randomly generated ' +
		'track — mind the sand, water and obstacles.',

	init(container, controls) {
		let runtime = null
		const { canvas, controlsRow } = buildWindow(
			container, {
				title: this.title,
				onBack: controls.back,
				onNewGame: () => {
					runtime.start()
					canvas.focus()
				},
			})
		const audio = setupSound(controlsRow)

		const best = { value: loadNumber(BEST_KEY, 0) }
		runtime = createRuntime(
			canvas.getContext('2d'), best, audio)

		canvas.addEventListener('keydown', runtime.onKeyDown)
		canvas.addEventListener('keyup', runtime.onKeyUp)
		window.addEventListener('blur', runtime.onBlur)
		canvas.focus()
		runtime.start()

		this._cleanup = () => {
			runtime.stop()
			canvas.removeEventListener(
				'keydown', runtime.onKeyDown)
			canvas.removeEventListener(
				'keyup', runtime.onKeyUp)
			window.removeEventListener(
				'blur', runtime.onBlur)
		}
	},

	destroy() {
		this._cleanup?.()
	},
}
