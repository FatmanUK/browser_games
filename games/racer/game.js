// Top-down racing game on an oval track.

import { createChrome, createStat } from '../_shared/chrome.js'
import { loadNumber, saveNumber } from '../_shared/storage.js'

const WIDTH = 580
const HEIGHT = 420
const CENTER = { x: 290, y: 210 }
const OUTER = { a: 220, b: 150 }
const INNER = { a: 120, b: 70 }
const BOUND = { a: 256, b: 186 }

const ACCEL = 220
const BRAKE = 260
const MAX_SPEED = 260
const MAX_REVERSE = -80
const FRICTION = 0.6
const OFF_TRACK_DRAG = 2.2
const TURN_RATE = 2.6
const CAR_LENGTH = 16
const CAR_WIDTH = 9
const TREE_COUNT = 28
const BEST_KEY = 'bg-dash-bestlap'

const KEY_DIRS = {
	ArrowUp: 'accel', w: 'accel', W: 'accel',
	ArrowDown: 'brake', s: 'brake', S: 'brake',
	ArrowLeft: 'left', a: 'left', A: 'left',
	ArrowRight: 'right', d: 'right', D: 'right',
}

function trackPoint(aMid, bMid, angleDeg) {
	const rad = (angleDeg * Math.PI) / 180
	return {
		x: CENTER.x + aMid * Math.cos(rad),
		y: CENTER.y + bMid * Math.sin(rad),
	}
}

const MID_OBSTACLES = [
	{ x: CENTER.x, y: CENTER.y - 55, r: 16, type: 'tree' },
	{ x: CENTER.x + 70, y: CENTER.y, r: 13, type: 'tyre' },
	{
		x: CENTER.x, y: CENTER.y + 55, r: 20,
		type: 'water',
	},
	{
		x: CENTER.x - 70, y: CENTER.y, r: 13,
		type: 'barrel',
	},
]

const ZONE_A = (INNER.a + OUTER.a) / 2
const ZONE_B = (INNER.b + OUTER.b) / 2

const TRACK_ZONES = [
	{ ...trackPoint(ZONE_A, ZONE_B, 45), r: 22, type: 'oil' },
	{
		...trackPoint(ZONE_A, ZONE_B, 135), r: 24,
		type: 'sand',
	},
	{ ...trackPoint(ZONE_A, ZONE_B, 225), r: 22, type: 'oil' },
	{
		...trackPoint(ZONE_A, ZONE_B, 315), r: 24,
		type: 'sand',
	},
]

function createState() {
	return {
		x: CENTER.x,
		y: CENTER.y - (OUTER.b + INNER.b) / 2,
		angle: 0,
		speed: 0,
		totalAngle: 0,
		elapsed: 0,
		lapsShown: 0,
		lastLapAt: 0,
		keys: new Set(),
	}
}

function ellipseNorm(x, y, cx, cy, a, b) {
	return ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2
}

function onTrack(x, y) {
	const outerNorm = ellipseNorm(
		x, y, CENTER.x, CENTER.y, OUTER.a, OUTER.b)
	const innerNorm = ellipseNorm(
		x, y, CENTER.x, CENTER.y, INNER.a, INNER.b)
	return outerNorm <= 1 && innerNorm >= 1
}

function zoneAt(x, y) {
	for (const zone of TRACK_ZONES) {
		const dist = Math.hypot(x - zone.x, y - zone.y)
		if (dist <= zone.r) return zone.type
	}
	return null
}

function zoneEffect(x, y) {
	const zone = zoneAt(x, y)
	if (zone === 'oil') return { drag: 0.3, turn: 0.4 }
	if (zone === 'sand') return { drag: 2.5, turn: 1 }
	return { drag: 1, turn: 1 }
}

function angleDelta(a, b) {
	let d = b - a
	while (d > Math.PI) d -= Math.PI * 2
	while (d < -Math.PI) d += Math.PI * 2
	return d
}

function applyControls(state, dt) {
	if (state.keys.has('accel')) state.speed += ACCEL * dt
	if (state.keys.has('brake')) state.speed -= BRAKE * dt

	const base = onTrack(state.x, state.y) ?
		FRICTION : FRICTION * OFF_TRACK_DRAG
	const effect = zoneEffect(state.x, state.y)
	state.speed -= state.speed * base * effect.drag * dt
	state.speed = Math.min(
		MAX_SPEED, Math.max(MAX_REVERSE, state.speed))

	const turn = TURN_RATE * dt * effect.turn *
		Math.sign(state.speed || 1)
	if (state.keys.has('left')) state.angle -= turn
	if (state.keys.has('right')) state.angle += turn
}

function resolveObstacle(state, obstacle) {
	const dx = state.x - obstacle.x
	const dy = state.y - obstacle.y
	const dist = Math.hypot(dx, dy)
	const minDist = obstacle.r + CAR_LENGTH / 2
	if (dist >= minDist || dist === 0) return
	state.x = obstacle.x + (dx / dist) * minDist
	state.y = obstacle.y + (dy / dist) * minDist
	state.speed *= -0.3
}

function resolveObstacles(state) {
	for (const obstacle of MID_OBSTACLES) {
		resolveObstacle(state, obstacle)
	}
}

function clampToBound(state) {
	const norm = ellipseNorm(
		state.x, state.y, CENTER.x, CENTER.y,
		BOUND.a, BOUND.b)
	if (norm <= 1) return
	const angle = Math.atan2(
		state.y - CENTER.y, state.x - CENTER.x)
	state.x = CENTER.x + Math.cos(angle) * BOUND.a
	state.y = CENTER.y + Math.sin(angle) * BOUND.b
	state.speed *= -0.3
}

function integrate(state, dt) {
	const prevAngle = Math.atan2(
		state.y - CENTER.y, state.x - CENTER.x)
	state.x += Math.cos(state.angle) * state.speed * dt
	state.y += Math.sin(state.angle) * state.speed * dt
	resolveObstacles(state)
	clampToBound(state)
	const angle = Math.atan2(
		state.y - CENTER.y, state.x - CENTER.x)
	state.totalAngle += angleDelta(prevAngle, angle)
}

function laps(state) {
	return Math.floor(
		Math.abs(state.totalAngle) / (Math.PI * 2))
}

function recordLap(state, best) {
	const lapTime = state.elapsed - state.lastLapAt
	state.lastLapAt = state.elapsed
	if (best.value === 0 || lapTime < best.value) {
		best.value = lapTime
		saveNumber(BEST_KEY, best.value)
	}
}

function update(state, dt, best) {
	applyControls(state, dt)
	integrate(state, dt)
	state.elapsed += dt
	const current = laps(state)
	if (current > state.lapsShown) {
		recordLap(state, best)
		state.lapsShown = current
	}
}

function drawEllipse(ctx, radii, color) {
	ctx.fillStyle = color
	ctx.beginPath()
	ctx.ellipse(
		CENTER.x, CENTER.y, radii.a, radii.b,
		0, 0, Math.PI * 2)
	ctx.fill()
}

function drawRumbleRing(ctx, radii, inset) {
	ctx.save()
	ctx.setLineDash([10, 10])
	ctx.lineWidth = 6
	ctx.strokeStyle = '#fff'
	ctx.beginPath()
	ctx.ellipse(
		CENTER.x, CENTER.y,
		radii.a + inset, radii.b + inset,
		0, 0, Math.PI * 2)
	ctx.stroke()
	ctx.lineDashOffset = 10
	ctx.strokeStyle = '#e53935'
	ctx.stroke()
	ctx.restore()
}

function drawStartLine(ctx) {
	ctx.strokeStyle = '#fff'
	ctx.lineWidth = 3
	ctx.beginPath()
	ctx.moveTo(CENTER.x, CENTER.y - INNER.b)
	ctx.lineTo(CENTER.x, CENTER.y - OUTER.b)
	ctx.stroke()
}

function drawTree(ctx, x, y, r) {
	ctx.fillStyle = '#4e342e'
	ctx.fillRect(x - 2, y, 4, r * 0.8)
	ctx.fillStyle = '#2e7d32'
	ctx.beginPath()
	ctx.arc(x, y - r * 0.3, r, 0, Math.PI * 2)
	ctx.fill()
}

function drawTreeRing(ctx) {
	for (let i = 0; i < TREE_COUNT; i++) {
		const angle = (i / TREE_COUNT) * Math.PI * 2
		const x = CENTER.x + Math.cos(angle) * BOUND.a
		const y = CENTER.y + Math.sin(angle) * BOUND.b
		drawTree(ctx, x, y, 10)
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

function drawObstacle(ctx, obstacle) {
	const { x, y, r, type } = obstacle
	if (type === 'tyre') drawTyre(ctx, x, y, r)
	else if (type === 'barrel') drawBarrel(ctx, x, y, r)
	else if (type === 'tree') drawTree(ctx, x, y, r)
	else drawWater(ctx, x, y, r)
}

function drawObstacles(ctx) {
	for (const obstacle of MID_OBSTACLES) {
		drawObstacle(ctx, obstacle)
	}
}

function drawZone(ctx, zone) {
	ctx.fillStyle = zone.type === 'oil' ?
		'rgba(20, 20, 30, 0.6)' :
		'rgba(210, 180, 120, 0.7)'
	ctx.beginPath()
	ctx.ellipse(
		zone.x, zone.y, zone.r, zone.r * 0.7,
		0, 0, Math.PI * 2)
	ctx.fill()
}

function drawZones(ctx) {
	for (const zone of TRACK_ZONES) drawZone(ctx, zone)
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

function draw(ctx, state) {
	ctx.fillStyle = '#3e8e41'
	ctx.fillRect(0, 0, WIDTH, HEIGHT)
	drawTreeRing(ctx)
	drawEllipse(ctx, OUTER, '#555')
	drawEllipse(ctx, INNER, '#3e8e41')
	drawRumbleRing(ctx, OUTER, -4)
	drawRumbleRing(ctx, INNER, 4)
	drawZones(ctx)
	drawObstacles(ctx)
	drawStartLine(ctx)
	drawCar(ctx, state)
}

function formatBest(value) {
	return value === 0 ? '–' : `${value.toFixed(1)}s`
}

function createCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = WIDTH
	canvas.height = HEIGHT
	canvas.tabIndex = 0
	return canvas
}

function createInput(ref) {
	function onKeyDown(e) {
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

function createRuntime(ctx, stats, best) {
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
		update(ref.state, dt, best)
		render()
		handle = requestAnimationFrame(frame)
	}

	function start() {
		ref.state = createState()
		last = null
		render()
	}

	const input = createInput(ref)
	handle = requestAnimationFrame(frame)

	return {
		start,
		onKeyDown: input.onKeyDown,
		onKeyUp: input.onKeyUp,
		stop: () => cancelAnimationFrame(handle),
	}
}

export default {
	id: 'racer',
	title: 'Dash',
	description:
		'A top-down racer. Arrow keys / WASD to drive ' +
		'laps around the oval track — mind the oil, ' +
		'sand and obstacles.',

	init(container, controls) {
		const canvas = createCanvas()
		let runtime = null

		const { main, side } = createChrome(container, {
			title: this.title,
			onBack: controls.back,
			onNewGame: () => runtime.start(),
		})
		main.appendChild(canvas)

		const stats = {
			setLaps: createStat(side, 'Laps'),
			setSpeed: createStat(side, 'Speed'),
			setBest: createStat(side, 'Best lap'),
		}

		const best = { value: loadNumber(BEST_KEY, 0) }
		runtime = createRuntime(
			canvas.getContext('2d'), stats, best)

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
