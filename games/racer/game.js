// Top-down racing game on an oval track.

const WIDTH = 480
const HEIGHT = 360
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 }
const OUTER = { a: 220, b: 150 }
const INNER = { a: 120, b: 70 }

const ACCEL = 220
const BRAKE = 260
const MAX_SPEED = 260
const MAX_REVERSE = -80
const FRICTION = 0.6
const OFF_TRACK_DRAG = 2.2
const TURN_RATE = 2.6
const CAR_LENGTH = 16
const CAR_WIDTH = 9

const KEY_DIRS = {
	ArrowUp: 'accel', w: 'accel', W: 'accel',
	ArrowDown: 'brake', s: 'brake', S: 'brake',
	ArrowLeft: 'left', a: 'left', A: 'left',
	ArrowRight: 'right', d: 'right', D: 'right',
}

function createState() {
	return {
		x: CENTER.x,
		y: CENTER.y - (OUTER.b + INNER.b) / 2,
		angle: 0,
		speed: 0,
		totalAngle: 0,
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

function angleDelta(a, b) {
	let d = b - a
	while (d > Math.PI) d -= Math.PI * 2
	while (d < -Math.PI) d += Math.PI * 2
	return d
}

function applyControls(state, dt) {
	if (state.keys.has('accel')) state.speed += ACCEL * dt
	if (state.keys.has('brake')) state.speed -= BRAKE * dt
	const drag = onTrack(state.x, state.y) ?
		FRICTION : FRICTION * OFF_TRACK_DRAG
	state.speed -= state.speed * drag * dt
	state.speed = Math.min(
		MAX_SPEED, Math.max(MAX_REVERSE, state.speed))

	const turn = TURN_RATE * dt *
		Math.sign(state.speed || 1)
	if (state.keys.has('left')) state.angle -= turn
	if (state.keys.has('right')) state.angle += turn
}

function integrate(state, dt) {
	const prevAngle = Math.atan2(
		state.y - CENTER.y, state.x - CENTER.x)
	state.x += Math.cos(state.angle) * state.speed * dt
	state.y += Math.sin(state.angle) * state.speed * dt
	const angle = Math.atan2(
		state.y - CENTER.y, state.x - CENTER.x)
	state.totalAngle += angleDelta(prevAngle, angle)
}

function update(state, dt) {
	applyControls(state, dt)
	integrate(state, dt)
}

function laps(state) {
	return Math.floor(
		Math.abs(state.totalAngle) / (Math.PI * 2))
}

function drawEllipse(ctx, radii, color) {
	ctx.fillStyle = color
	ctx.beginPath()
	ctx.ellipse(
		CENTER.x, CENTER.y, radii.a, radii.b,
		0, 0, Math.PI * 2)
	ctx.fill()
}

function drawStartLine(ctx) {
	ctx.strokeStyle = '#fff'
	ctx.lineWidth = 3
	ctx.beginPath()
	ctx.moveTo(CENTER.x, CENTER.y - INNER.b)
	ctx.lineTo(CENTER.x, CENTER.y - OUTER.b)
	ctx.stroke()
}

function drawCar(ctx, state) {
	ctx.save()
	ctx.translate(state.x, state.y)
	ctx.rotate(state.angle)
	ctx.fillStyle = '#e53935'
	ctx.fillRect(
		-CAR_LENGTH / 2, -CAR_WIDTH / 2,
		CAR_LENGTH, CAR_WIDTH)
	ctx.restore()
}

function drawHud(ctx, state) {
	ctx.fillStyle = '#fff'
	ctx.font = '14px system-ui, sans-serif'
	ctx.fillText(`Laps: ${laps(state)}`, 6, 16)
	ctx.fillText(
		`Speed: ${Math.round(state.speed)}`, 6, 34)
}

function draw(ctx, state) {
	ctx.fillStyle = '#3e8e41'
	ctx.fillRect(0, 0, WIDTH, HEIGHT)
	drawEllipse(ctx, OUTER, '#555')
	drawEllipse(ctx, INNER, '#3e8e41')
	drawStartLine(ctx)
	drawCar(ctx, state)
	drawHud(ctx, state)
}

function createCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = WIDTH
	canvas.height = HEIGHT
	canvas.tabIndex = 0
	return canvas
}

function wire(canvas, ctx, state) {
	const onKeyDown = (e) => {
		const action = KEY_DIRS[e.key]
		if (!action) return
		state.keys.add(action)
		e.preventDefault()
	}
	const onKeyUp = (e) => {
		const action = KEY_DIRS[e.key]
		if (action) state.keys.delete(action)
	}

	canvas.addEventListener('keydown', onKeyDown)
	canvas.addEventListener('keyup', onKeyUp)
	canvas.focus()

	let handle = null
	let last = null
	const frame = (time) => {
		if (last === null) last = time
		const dt = Math.min((time - last) / 1000, 0.05)
		last = time
		update(state, dt)
		draw(ctx, state)
		handle = requestAnimationFrame(frame)
	}
	handle = requestAnimationFrame(frame)

	return () => {
		cancelAnimationFrame(handle)
		canvas.removeEventListener('keydown', onKeyDown)
		canvas.removeEventListener('keyup', onKeyUp)
	}
}

export default {
	id: 'racer',
	title: 'Oval Dash',
	description:
		'A top-down racer. Arrow keys / WASD to drive ' +
		'laps around the oval track.',

	init(container) {
		const canvas = createCanvas()
		container.appendChild(canvas)
		const ctx = canvas.getContext('2d')
		const state = createState()
		this._cleanup = wire(canvas, ctx, state)
	},

	destroy() {
		this._cleanup?.()
	},
}
