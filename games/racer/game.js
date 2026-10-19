// Dash: the rules and the driving.
//
// The track is built from a seed at load (track.js). It is
// star-shaped around CENTER — every angle maps to exactly one
// boundary point — so it is stored as a radius per angle and
// looked up that way (geom.js).
//
// The drawing is in render.js, the sprites in sprites.js and
// models.js, the field in rivals.js, the race in race.js.

import { buildWindow } from '../_shared/hud.js'
import { loadNumber, saveNumber } from '../_shared/storage.js'
import { setupSound } from './audio.js'
import { getAtlas } from './sprites.js'
import { draw, createWorldCanvas } from './render.js'
import {
	CAR_LENGTH, ACCEL, BRAKE, MAX_SPEED, MAX_REVERSE,
	FRICTION, OFF_TRACK_DRAG, TURN_RATE,
} from './car.js'
import {
	CENTER, lerpArray, angleOf, angleDelta, normFor, onTrack,
	inWedge,
} from './geom.js'
import {
	createRivals, updateRivals, resolveContacts,
} from './rivals.js'
import {
	createRace, isRunning, isOver, tickCountdown, lapsOf,
	placeOf, checkFinishes, trackGates,
} from './race.js'
import { drawHud } from './hud.js'
import { buildTrack } from './track.js'

// Keyed by the track's own seed so each track keeps its own
// best lap rather than sharing one score across whatever
// happens to be loaded.
function bestKey(track) {
	return `bg-dash-bestlap-${track.TRACK_ID}`
}

// The seed a level maps to. Deterministic, so a best lap keeps
// belonging to the track it was set on.
export function seedForLevel(level) {
	return (level * 2654435761) >>> 0
}

const KEY_DIRS = {
	ArrowUp: 'accel', w: 'accel', W: 'accel',
	ArrowDown: 'brake', s: 'brake', S: 'brake',
	ArrowLeft: 'left', a: 'left', A: 'left',
	ArrowRight: 'right', d: 'right', D: 'right',
}

function createState(track) {
	const pole = track.GRID_SLOTS[0]
	return {
		track,
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
		rivals: createRivals(track),
		race: createRace(),
		keys: new Set(),
	}
}

function waterAt(track, x, y) {
	return track.WATER_HAZARDS.some(
		(w) => Math.hypot(x - w.x, y - w.y) <= w.r)
}

// Takes bare coordinates rather than a car, because the rivals
// need to ask about their own patch of ground too and they are
// not shaped like the player's state object.
function terrainAt(track, x, y) {
	const outerNorm = normFor(x, y, track.OUTER_RADIUS)
	const boundNorm = normFor(x, y, track.BOUND_RADIUS)
	const inVerge = outerNorm > 1 && boundNorm <= 1
	if (inVerge && inWedge(angleOf(x, y), track.SAND_WEDGES)) {
		return 'sand'
	}
	if (waterAt(track, x, y)) return 'water'
	return null
}

function dragFor(track, x, y, terrain) {
	// Higher than water: sand grabs the car hard and hauls it
	// down to a stop quickly, just not instantly — it's still
	// the same exponential-decay drag model as everything else,
	// so there's no single-frame dead stop.
	if (terrain === 'sand') return 3.2
	if (terrain === 'water') return 2.5
	return onTrack(track, x, y) ?
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

	const drag = dragFor(
		state.track, state.x, state.y, terrain)
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
	for (const obstacle of state.track.HARD_OBSTACLES) {
		if (resolveObstacle(state, obstacle)) hit = true
	}
	return hit
}

// The treeline marks this boundary, so running into it should
// feel the same as hitting one of the solid tree obstacles —
// stopped dead, not bounced back onto the track.
function clampToBound(state) {
	const bound = state.track.BOUND_RADIUS
	const norm = normFor(state.x, state.y, bound)
	if (norm <= 1) return false
	const normalAngle = angleOf(state.x, state.y)
	const r = lerpArray(bound, normalAngle)
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

	const newTerrain = terrainAt(state.track, state.x, state.y)
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
		saveNumber(bestKey(state.track), best.value)
	}
	return isBest
}

function drivePlayer(state, dt, best, audio) {
	const terrain = terrainAt(state.track, state.x, state.y)
	applyControls(state, dt, terrain)
	integrate(state, dt, audio)
	// Nothing after the flag: the car is still coasting to a
	// stop, but it is no longer setting lap times.
	if (isOver(state.race)) return
	state.elapsed += dt
	const current = lapsOf(state.track, state)
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
	trackGates(state.track, state)
	for (const rival of state.rivals) {
		trackGates(state.track, rival)
	}
	updateRivals(
		state.track, state.rivals, dt,
		(x, y) => terrainAt(state.track, x, y))
	if (resolveContacts(state, state.rivals)) audio.bump()
	if (checkFinishes(state.track, race, state, state.rivals)) {
		audio.finish()
	}
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

function createRuntime(ctx, track, best, audio) {
	const ref = { state: null }
	const world = createWorldCanvas()
	// Baked here, not at module load: js/registry.js imports
	// every game when the launcher opens, and this is the
	// first moment Dash is known to have been picked.
	const atlas = getAtlas()

	function render() {
		const s = ref.state
		draw(ctx, world, s, atlas)
		const place = placeOf(s.track, s.race, s, s.rivals)
		drawHud(ctx, s, best, MAX_SPEED, place)
	}

	const loop = createLoop((dt) => {
		update(ref.state, dt, best, audio)
		render()
	})
	const input = createInput(ref, audio)

	return {
		start() {
			ref.state = createState(track)
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

		// Level 1 for now; the ladder arrives with the
		// progression. A track that cannot be built at all
		// would leave nothing to drive on, so the seed walk
		// in buildTrack has to be what guarantees one.
		const track = buildTrack(seedForLevel(1))
		const best = {
			value: loadNumber(bestKey(track), 0),
		}
		runtime = createRuntime(
			canvas.getContext('2d'), track, best, audio)

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
