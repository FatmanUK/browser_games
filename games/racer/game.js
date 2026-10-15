// Top-down racing game on a randomly generated track (built by
// tools/generate_track.py into track-data.js — rerun that script
// for a fresh layout). The track is star-shaped around CENTER
// (every angle maps to exactly one boundary point), so it reuses
// the same angle-indexed-radius-lookup approach the old fixed
// oval used, generalized from a closed-form ellipse formula to a
// lookup table.

import { createStat } from '../_shared/chrome.js'
import { loadNumber, saveNumber } from '../_shared/storage.js'
import { setupSound } from './audio.js'
import * as TRACK from './track-data.js'

const CENTER = { x: 0, y: 0 }

const OUTER_RUMBLE = offsetTable(TRACK.OUTER_RADIUS, -4)
const INNER_RUMBLE = offsetTable(TRACK.INNER_RADIUS, 4)

// The camera follows the car and only shows a window onto the
// world — tall enough to always show the full width of the
// track's road surface rather than the whole track at once.
// VIEW_SCALE blows that up to a sensible on-screen window size
// without changing how much of the track it actually shows.
const VIEWPORT_HEIGHT = TRACK.ROAD_WIDTH
const VIEWPORT_WIDTH = Math.round(VIEWPORT_HEIGHT * 2.4)
const VIEW_SCALE = 4
const CANVAS_WIDTH = VIEWPORT_WIDTH * VIEW_SCALE
const CANVAS_HEIGHT = VIEWPORT_HEIGHT * VIEW_SCALE

const ACCEL = 220
const BRAKE = 260
const MAX_SPEED = 260
const MAX_REVERSE = -80
const FRICTION = 0.6
const OFF_TRACK_DRAG = 2.2
const TURN_RATE = 2.6
const CAR_LENGTH = 16
const CAR_WIDTH = 9

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

const OIL_COUNT = 5
const OIL_RADIUS_MIN = 7
const OIL_RADIUS_RANGE = 5

// Small randomly-scattered puddles on the track surface —
// regenerated each New Game, so the hazard layout isn't the
// same lap after lap. Positions are restricted to the actual
// road band (between the inner and outer lookup radii), away
// from its very edges, so a puddle never ends up partly off
// the track.
function trackBandPoint(angle, frac) {
	const innerR = lerpArray(TRACK.INNER_RADIUS, angle)
	const outerR = lerpArray(TRACK.OUTER_RADIUS, angle)
	const r = innerR + (outerR - innerR) * frac
	return {
		x: CENTER.x + Math.cos(angle) * r,
		y: CENTER.y + Math.sin(angle) * r,
	}
}

function randomOilPatches() {
	const patches = []
	for (let i = 0; i < OIL_COUNT; i++) {
		const angle = Math.random() * Math.PI * 2
		const frac = 0.3 + Math.random() * 0.4
		const p = trackBandPoint(angle, frac)
		patches.push({
			x: p.x,
			y: p.y,
			r: OIL_RADIUS_MIN +
				Math.random() * OIL_RADIUS_RANGE,
			seed: Math.random() * Math.PI * 2,
		})
	}
	return patches
}

function createState() {
	const pole = TRACK.GRID_SLOTS[0]
	return {
		x: pole.x,
		y: pole.y,
		angle: pole.angle,
		speed: 0,
		totalAngle: 0,
		elapsed: 0,
		lapsShown: 0,
		lastLapAt: 0,
		terrain: null,
		wasColliding: false,
		oilPatches: randomOilPatches(),
		keys: new Set(),
	}
}

// Radius of the track's angle-indexed lookup table at an
// arbitrary (geometric) angle, linearly interpolated between
// the two nearest sampled entries. This is the generalization
// of the old ellipse's closed-form radius formula to a track
// shape with no closed form.
function lerpArray(table, angle) {
	const n = table.length
	const twoPi = Math.PI * 2
	const norm = ((angle % twoPi) + twoPi) % twoPi
	const t = (norm / twoPi) * n
	const i0 = Math.floor(t) % n
	const i1 = (i0 + 1) % n
	const frac = t - Math.floor(t)
	return table[i0] * (1 - frac) + table[i1] * frac
}

function angleOf(x, y) {
	return Math.atan2(y - CENTER.y, x - CENTER.x)
}

// How far (x, y) sits past a lookup-table boundary, as a ratio
// (<=1 inside it, >1 outside) — the lookup-table equivalent of
// the old ellipseNorm.
function normFor(x, y, table) {
	const dist = Math.hypot(x - CENTER.x, y - CENTER.y)
	return dist / lerpArray(table, angleOf(x, y))
}

function onTrack(x, y) {
	const outerNorm = normFor(x, y, TRACK.OUTER_RADIUS)
	const innerNorm = normFor(x, y, TRACK.INNER_RADIUS)
	return outerNorm <= 1 && innerNorm >= 1
}

function angleDelta(a, b) {
	let d = b - a
	while (d > Math.PI) d -= Math.PI * 2
	while (d < -Math.PI) d += Math.PI * 2
	return d
}

function inWedge(angle, wedges) {
	return wedges.some(
		(w) => Math.abs(angleDelta(w.angle, angle)) <=
			w.spread)
}

function waterAt(x, y) {
	return TRACK.WATER_HAZARDS.some(
		(w) => Math.hypot(x - w.x, y - w.y) <= w.r)
}

function oilAt(x, y, patches) {
	return patches.some(
		(p) => Math.hypot(x - p.x, y - p.y) <= p.r)
}

function terrainAt(state) {
	const { x, y } = state
	if (oilAt(x, y, state.oilPatches)) return 'oil'
	const outerNorm = normFor(x, y, TRACK.OUTER_RADIUS)
	const boundNorm = normFor(x, y, TRACK.BOUND_RADIUS)
	const inVerge = outerNorm > 1 && boundNorm <= 1
	if (inVerge && inWedge(angleOf(x, y), TRACK.SAND_WEDGES)) {
		return 'sand'
	}
	if (waterAt(x, y)) return 'water'
	return null
}

function dragFor(state, terrain) {
	if (terrain === 'oil') return 0.1
	// Higher than water: sand grabs the car hard and hauls it
	// down to a stop quickly, just not instantly — it's still
	// the same exponential-decay drag model as everything else,
	// so there's no single-frame dead stop.
	if (terrain === 'sand') return 3.2
	if (terrain === 'water') return 2.5
	return onTrack(state.x, state.y) ?
		FRICTION : FRICTION * OFF_TRACK_DRAG
}

function turnMultiplier(terrain) {
	if (terrain === 'oil') return 0.3
	if (terrain === 'sand') return 0.8
	if (terrain === 'water') return 0.6
	return 1
}

function applyControls(state, dt, terrain) {
	if (state.keys.has('accel')) state.speed += ACCEL * dt
	if (state.keys.has('brake')) state.speed -= BRAKE * dt

	const drag = dragFor(state, terrain)
	state.speed -= state.speed * drag * dt
	state.speed = Math.min(
		MAX_SPEED, Math.max(MAX_REVERSE, state.speed))

	const turn = TURN_RATE * dt * turnMultiplier(terrain) *
		Math.sign(state.speed || 1)
	if (state.keys.has('left')) state.angle -= turn
	if (state.keys.has('right')) state.angle += turn
	if (terrain === 'oil') {
		state.angle += (Math.random() - 0.5) * 6 * dt
	}
}

// A sudden spin-out kick applied the instant the car enters oil
// (see integrate, which fires this on the terrain edge rather
// than every frame) — a sharp, random half-to-full-turn jolt on
// top of the continuous wobble applyControls adds for as long as
// the car sits in the puddle.
const SPIN_MIN = deg(60)
const SPIN_RANGE = deg(120)

function applySpinOut(state) {
	const dir = Math.random() < 0.5 ? -1 : 1
	state.angle += dir * (SPIN_MIN + Math.random() * SPIN_RANGE)
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

function clampToBound(state) {
	const norm = normFor(state.x, state.y, TRACK.BOUND_RADIUS)
	if (norm <= 1) return false
	const normalAngle = angleOf(state.x, state.y)
	const r = lerpArray(TRACK.BOUND_RADIUS, normalAngle)
	state.x = CENTER.x + Math.cos(normalAngle) * r
	state.y = CENTER.y + Math.sin(normalAngle) * r
	bounceOff(state, normalAngle, 0.5)
	return true
}

function playTerrainSound(terrain, audio) {
	if (terrain === 'oil') audio.skid()
	else if (terrain === 'sand') audio.slow()
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

	const newTerrain = terrainAt(state)
	if (newTerrain !== state.terrain) {
		playTerrainSound(newTerrain, audio)
		if (newTerrain === 'oil') applySpinOut(state)
	}
	state.terrain = newTerrain

	const angle = angleOf(state.x, state.y)
	state.totalAngle += angleDelta(prevAngle, angle)
}

function laps(state) {
	return Math.floor(
		Math.abs(state.totalAngle) / (Math.PI * 2))
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

function update(state, dt, best, audio) {
	const terrain = terrainAt(state)
	applyControls(state, dt, terrain)
	integrate(state, dt, audio)
	state.elapsed += dt
	const current = laps(state)
	if (current > state.lapsShown) {
		const isBest = recordLap(state, best)
		audio[isBest ? 'bestLap' : 'lap']()
		state.lapsShown = current
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

function drawTree(ctx, x, y, r) {
	ctx.fillStyle = '#4e342e'
	ctx.fillRect(x - 2, y, 4, r * 0.8)
	ctx.fillStyle = '#2e7d32'
	ctx.beginPath()
	ctx.arc(x, y - r * 0.3, r, 0, Math.PI * 2)
	ctx.fill()
}

function drawTreeLine(ctx) {
	for (const tree of TRACK.TREE_LINE) {
		drawTree(ctx, tree.x, tree.y, tree.r)
	}
}

function drawTyre(ctx, x, y, r) {
	ctx.fillStyle = '#212121'
	ctx.beginPath()
	ctx.arc(x, y, r, 0, Math.PI * 2)
	ctx.fill()
	ctx.fillStyle = '#616161'
	ctx.beginPath()
	ctx.arc(x, y, r * 0.5, 0, Math.PI * 2)
	ctx.fill()
}

function drawBarrel(ctx, x, y, r) {
	ctx.fillStyle = '#ef6c00'
	ctx.fillRect(x - r, y - r, r * 2, r * 2)
	ctx.fillStyle = '#4e342e'
	ctx.fillRect(x - r, y - r * 0.3, r * 2, r * 0.3)
}

function drawWater(ctx, x, y, r) {
	ctx.fillStyle = '#2196f3'
	ctx.beginPath()
	ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2)
	ctx.fill()
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
	ctx.beginPath()
	ctx.ellipse(
		x, y, r * 0.6, r * 0.4, 0, 0, Math.PI * 2)
	ctx.stroke()
}

function drawHardObstacle(ctx, obstacle) {
	const { x, y, r, type } = obstacle
	if (type === 'tyre') drawTyre(ctx, x, y, r)
	else if (type === 'barrel') drawBarrel(ctx, x, y, r)
	else drawTree(ctx, x, y, r)
}

function drawObstacles(ctx) {
	for (const obstacle of TRACK.HARD_OBSTACLES) {
		drawHardObstacle(ctx, obstacle)
	}
	for (const hazard of TRACK.WATER_HAZARDS) {
		drawWater(ctx, hazard.x, hazard.y, hazard.r)
	}
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

const OIL_COLOR = 'rgba(15, 15, 25, 0.7)'
const SAND_COLOR = 'rgba(216, 186, 128, 0.85)'

function drawWedges(ctx) {
	for (const wedge of TRACK.SAND_WEDGES) {
		drawWedge(
			ctx, TRACK.OUTER_RADIUS, TRACK.BOUND_RADIUS,
			wedge, SAND_COLOR)
	}
}

function drawBlob(ctx, patch) {
	const { x, y, r, seed } = patch
	ctx.fillStyle = OIL_COLOR
	const lobes = 5
	for (let i = 0; i < lobes; i++) {
		const a = seed + (i / lobes) * Math.PI * 2
		const wobble = 0.5 +
			0.3 * Math.abs(Math.sin(seed * (i + 2)))
		ctx.beginPath()
		ctx.arc(
			x + Math.cos(a) * r * 0.4,
			y + Math.sin(a) * r * 0.4,
			r * wobble, 0, Math.PI * 2)
		ctx.fill()
	}
	ctx.beginPath()
	ctx.arc(x, y, r * 0.55, 0, Math.PI * 2)
	ctx.fill()
}

function drawOilPatches(ctx, patches) {
	for (const patch of patches) drawBlob(ctx, patch)
}

function drawCar(ctx, state) {
	ctx.save()
	ctx.translate(state.x, state.y)
	ctx.rotate(state.angle)
	ctx.fillStyle = '#b71c1c'
	ctx.fillRect(
		-CAR_LENGTH / 2, -CAR_WIDTH / 2,
		CAR_LENGTH, CAR_WIDTH)
	ctx.fillStyle = '#e53935'
	ctx.fillRect(
		-CAR_LENGTH / 2 + 2, -CAR_WIDTH / 2 + 1,
		CAR_LENGTH - 6, CAR_WIDTH - 2)
	ctx.fillStyle = '#90caf9'
	ctx.fillRect(1, -CAR_WIDTH / 2 + 2, 4, CAR_WIDTH - 4)
	ctx.restore()
}

function formatBest(value) {
	return value === 0 ? '–' : `${value.toFixed(1)}s`
}

function drawWorld(ctx, state) {
	drawTreeLine(ctx)
	drawTrackRing(ctx, TRACK.OUTER_RADIUS, '#555')
	drawTrackRing(ctx, TRACK.INNER_RADIUS, '#3e8e41')
	drawRumbleRing(ctx, OUTER_RUMBLE)
	drawRumbleRing(ctx, INNER_RUMBLE)
	drawWedges(ctx)
	drawOilPatches(ctx, state.oilPatches)
	drawObstacles(ctx)
	drawStartGrid(ctx)
	drawStartLine(ctx)
	drawCar(ctx, state)
}

// Dusky evening: dim everything down except a headlight cone
// ahead of the car, where the normal daylight colors underneath
// show through undimmed (not brightened — restored, not washed
// out) with a soft fade back to full dusk at the beam's reach.
const DUSK_COLOR = 'rgba(18, 22, 48, 0.55)'
const DUSK_CLEAR = 'rgba(18, 22, 48, 0)'
const BEAM_SPREAD = deg(18)
const BEAM_LENGTH = 85

function headlightOrigin(angle) {
	const frontDist = CAR_LENGTH / 2
	return {
		x: VIEWPORT_WIDTH / 2 + Math.cos(angle) * frontDist,
		y: VIEWPORT_HEIGHT / 2 + Math.sin(angle) * frontDist,
	}
}

function beamPath(ctx, origin, angle) {
	ctx.moveTo(origin.x, origin.y)
	ctx.arc(
		origin.x, origin.y, BEAM_LENGTH,
		angle - BEAM_SPREAD, angle + BEAM_SPREAD)
	ctx.closePath()
}

// A rectangle covering the viewport, with the beam wedge cut out
// of it (even-odd fill rule), filled dusk — so everything outside
// the beam dims, and the beam itself is left untouched (showing
// whatever was already drawn there at full daylight brightness).
function drawDuskOutsideBeam(ctx, origin, angle) {
	ctx.save()
	ctx.beginPath()
	ctx.rect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
	beamPath(ctx, origin, angle)
	ctx.fillStyle = DUSK_COLOR
	ctx.fill('evenodd')
	ctx.restore()
}

// Within just the beam, fade back to full dusk toward its far
// reach, so the headlight looks like it's shining a finite
// distance rather than cutting a hard-edged hole.
function drawBeamFalloff(ctx, origin, angle) {
	ctx.save()
	ctx.beginPath()
	beamPath(ctx, origin, angle)
	ctx.clip()
	const grad = ctx.createRadialGradient(
		origin.x, origin.y, BEAM_LENGTH * 0.4,
		origin.x, origin.y, BEAM_LENGTH)
	grad.addColorStop(0, DUSK_CLEAR)
	grad.addColorStop(1, DUSK_COLOR)
	ctx.fillStyle = grad
	ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
	ctx.restore()
}

function drawDusk(ctx, angle) {
	const origin = headlightOrigin(angle)
	drawDuskOutsideBeam(ctx, origin, angle)
	drawBeamFalloff(ctx, origin, angle)
}

function draw(ctx, state) {
	ctx.save()
	ctx.scale(VIEW_SCALE, VIEW_SCALE)

	ctx.fillStyle = '#3e8e41'
	ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)

	ctx.save()
	ctx.translate(
		VIEWPORT_WIDTH / 2 - state.x,
		VIEWPORT_HEIGHT / 2 - state.y)
	drawWorld(ctx, state)
	ctx.restore()

	drawDusk(ctx, state.angle)
	ctx.restore()
}

function createCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = CANVAS_WIDTH
	canvas.height = CANVAS_HEIGHT
	canvas.tabIndex = 0
	return canvas
}

function createButton(label, onClick) {
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'game-side-button'
	btn.textContent = label
	// Don't let clicking this button steal keyboard focus from
	// the game canvas — it needs to stay focused for the arrow
	// keys to keep driving.
	btn.addEventListener(
		'mousedown', (e) => e.preventDefault())
	btn.addEventListener('click', onClick)
	return btn
}

// Builds the game window: title, New game/Back buttons,
// Sound/Music toggles and the Laps/Speed/Best lap meters sit in
// a translucent bar overlaid on top of the canvas itself — not
// beside or above it — so the canvas can be the whole window.
function buildWindow(container, title, controls, onNewGame) {
	const dashWindow = document.createElement('div')
	dashWindow.className = 'dash-window'

	const header = document.createElement('div')
	header.className = 'dash-header'

	const controlsRow = document.createElement('div')
	controlsRow.className = 'dash-row'
	const statsRow = document.createElement('div')
	statsRow.className = 'dash-row'

	const heading = document.createElement('h2')
	heading.textContent = title
	controlsRow.append(
		heading,
		createButton('New game', onNewGame),
		createButton('← Back to games', controls.back))

	const canvas = createCanvas()
	header.append(controlsRow, statsRow)
	dashWindow.append(canvas, header)
	container.appendChild(dashWindow)

	return { canvas, controlsRow, statsRow }
}

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

	return { onKeyDown, onKeyUp }
}

function createRuntime(ctx, stats, best, audio) {
	const ref = { state: null }
	let handle = null
	let last = null

	function render() {
		draw(ctx, ref.state)
		stats.setLaps(ref.state.lapsShown)
		stats.setSpeed(Math.round(ref.state.speed))
		stats.setBest(formatBest(best.value))
	}

	function frame(time) {
		if (last === null) last = time
		const dt = Math.min((time - last) / 1000, 0.05)
		last = time
		update(ref.state, dt, best, audio)
		render()
		handle = requestAnimationFrame(frame)
	}

	function start() {
		ref.state = createState()
		last = null
		render()
	}

	const input = createInput(ref, audio)
	handle = requestAnimationFrame(frame)

	return {
		start,
		onKeyDown: input.onKeyDown,
		onKeyUp: input.onKeyUp,
		stop: () => {
			cancelAnimationFrame(handle)
			audio.stop()
		},
	}
}

export default {
	id: 'racer',
	title: 'Dash',
	description:
		'A top-down racer. Arrow keys / WASD to drive ' +
		'laps around a randomly generated track, from a ' +
		'starting grid — mind the oil, sand and obstacles.',

	init(container, controls) {
		let runtime = null
		const { canvas, controlsRow, statsRow } = buildWindow(
			container, this.title, controls,
			() => runtime.start())

		const stats = {
			setLaps: createStat(statsRow, 'Laps'),
			setSpeed: createStat(statsRow, 'Speed'),
			setBest: createStat(statsRow, 'Best lap'),
		}
		const audio = setupSound(controlsRow)

		const best = { value: loadNumber(BEST_KEY, 0) }
		runtime = createRuntime(
			canvas.getContext('2d'), stats, best, audio)

		canvas.addEventListener('keydown', runtime.onKeyDown)
		canvas.addEventListener('keyup', runtime.onKeyUp)
		canvas.focus()
		runtime.start()

		this._cleanup = () => {
			runtime.stop()
			canvas.removeEventListener(
				'keydown', runtime.onKeyDown)
			canvas.removeEventListener(
				'keyup', runtime.onKeyUp)
		}
	},

	destroy() {
		this._cleanup?.()
	},
}
