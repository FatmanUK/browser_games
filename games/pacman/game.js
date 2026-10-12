// Pac-Man-style maze chase game.

import { createChrome, createStat } from '../_shared/chrome.js'
import { loadNumber, saveNumber } from '../_shared/storage.js'

const MAZE = [
	'###################',
	'#.................#',
	'#.##.#.##.##.#.##.#',
	'#.................#',
	'#.##.#.##.##.#.##.#',
	'#.................#',
	'#.##.#.##.##.#.##.#',
	'#.................#',
	'#.##.#.##.##.#.##.#',
	'#.................#',
	'#.##.#.##.##.#.##.#',
	'#.................#',
	'###################',
]

const CELL = 22
const TICK_MS = 160
const TICKS_PER_SEC = Math.round(1000 / TICK_MS)
const GHOST_EVERY = 2
const LIVES_START = 3
const COLS = MAZE[0].length
const ROWS = MAZE.length
const BEST_KEY = 'bg-mazemuncher-best'
const START = { x: 1, y: 1 }

const GHOST_HOMES = [
	{ x: COLS - 2, y: 1, dir: [0, 1], color: '#f06292' },
	{ x: 1, y: ROWS - 2, dir: [0, -1], color: '#4fc3f7' },
	{
		x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2),
		dir: [1, 0], color: '#ffb74d',
	},
]

const DIRS = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
}

function isWall(x, y) {
	if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
		return true
	}
	return MAZE[y][x] === '#'
}

function initialPellets() {
	const pellets = new Set()
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			if (MAZE[y][x] === '.') {
				pellets.add(`${x},${y}`)
			}
		}
	}
	return pellets
}

function makeGhosts() {
	return GHOST_HOMES.map((home) => ({
		x: home.x,
		y: home.y,
		dir: home.dir,
		color: home.color,
		home,
	}))
}

function createState() {
	return {
		player: {
			x: START.x, y: START.y,
			dir: [0, 0], next: [0, 0],
		},
		ghosts: makeGhosts(),
		pellets: initialPellets(),
		score: 0,
		lives: LIVES_START,
		phase: 'countdown',
		countdown: 3,
		countdownTicks: TICKS_PER_SEC,
		tickCount: 0,
		won: false,
	}
}

function resetPositions(state) {
	state.player.x = START.x
	state.player.y = START.y
	state.player.dir = [0, 0]
	state.player.next = [0, 0]
	for (const ghost of state.ghosts) {
		ghost.x = ghost.home.x
		ghost.y = ghost.home.y
		ghost.dir = ghost.home.dir
	}
}

function tryDir(entity, dir) {
	const x = entity.x + dir[0]
	const y = entity.y + dir[1]
	if (isWall(x, y)) return false
	entity.x = x
	entity.y = y
	return true
}

function eatPellet(state) {
	const key = `${state.player.x},${state.player.y}`
	if (!state.pellets.delete(key)) return
	state.score += 10
	if (state.pellets.size === 0) {
		state.phase = 'over'
		state.won = true
	}
}

function stepPlayer(state) {
	const p = state.player
	if (tryDir(p, p.next)) {
		p.dir = p.next
	} else {
		tryDir(p, p.dir)
	}
	eatPellet(state)
}

function ghostMoves(ghost) {
	return Object.values(DIRS).filter((d) => {
		const x = ghost.x + d[0]
		const y = ghost.y + d[1]
		const reverse = d[0] === -ghost.dir[0] &&
			d[1] === -ghost.dir[1]
		return !isWall(x, y) && !reverse
	})
}

function bestMove(moves, ghost, player) {
	let best = moves[0]
	let bestDist = Infinity
	for (const d of moves) {
		const dist = Math.abs(ghost.x + d[0] - player.x) +
			Math.abs(ghost.y + d[1] - player.y)
		if (dist < bestDist) {
			bestDist = dist
			best = d
		}
	}
	return best
}

function chooseGhostDir(ghost, player) {
	const moves = ghostMoves(ghost)
	if (moves.length === 0) {
		return [-ghost.dir[0], -ghost.dir[1]]
	}
	if (Math.random() < 0.3) {
		return moves[
			Math.floor(Math.random() * moves.length)]
	}
	return bestMove(moves, ghost, player)
}

function stepGhosts(state) {
	for (const ghost of state.ghosts) {
		ghost.dir = chooseGhostDir(ghost, state.player)
		tryDir(ghost, ghost.dir)
	}
}

function checkCaught(state) {
	const p = state.player
	const hit = state.ghosts.some(
		(g) => g.x === p.x && g.y === p.y)
	if (!hit) return
	state.lives--
	if (state.lives <= 0) {
		state.phase = 'over'
		state.won = false
		return
	}
	resetPositions(state)
	state.phase = 'countdown'
	state.countdown = 3
	state.countdownTicks = TICKS_PER_SEC
}

function tickCountdown(state) {
	state.countdownTicks--
	if (state.countdownTicks > 0) return
	state.countdown--
	state.countdownTicks = TICKS_PER_SEC
	if (state.countdown <= 0) state.phase = 'playing'
}

function tick(state) {
	if (state.phase === 'countdown') {
		tickCountdown(state)
		return
	}
	if (state.phase !== 'playing') return
	state.tickCount++
	stepPlayer(state)
	if (state.tickCount % GHOST_EVERY === 0) {
		stepGhosts(state)
	}
	checkCaught(state)
}

function drawWallCell(ctx, x, y) {
	const px = x * CELL
	const py = y * CELL
	ctx.fillStyle = '#1a237e'
	ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
	ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
	ctx.fillRect(px + 1, py + 1, CELL - 2, 2)
	ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
	ctx.fillRect(px + 1, py + CELL - 3, CELL - 2, 2)
}

function drawMaze(ctx) {
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			if (MAZE[y][x] === '#') {
				drawWallCell(ctx, x, y)
			}
		}
	}
}

function drawPellet(ctx, x, y) {
	const cx = x * CELL + CELL / 2
	const cy = y * CELL + CELL / 2
	ctx.fillStyle = 'rgba(255, 245, 157, 0.25)'
	ctx.beginPath()
	ctx.arc(cx, cy, 5, 0, Math.PI * 2)
	ctx.fill()
	ctx.fillStyle = '#fff59d'
	ctx.beginPath()
	ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
	ctx.fill()
}

function drawPellets(ctx, pellets) {
	for (const key of pellets) {
		const [x, y] = key.split(',').map(Number)
		drawPellet(ctx, x, y)
	}
}

function drawPlayer(ctx, player) {
	const cx = player.x * CELL + CELL / 2
	const cy = player.y * CELL + CELL / 2
	const r = CELL / 2 - 2
	const dir = player.dir[0] || player.dir[1] ?
		player.dir : [1, 0]
	const facing = Math.atan2(dir[1], dir[0])
	const gap = Math.PI / 5
	ctx.fillStyle = '#ffeb3b'
	ctx.beginPath()
	ctx.moveTo(cx, cy)
	ctx.arc(
		cx, cy, r,
		facing + gap, facing - gap + Math.PI * 2)
	ctx.closePath()
	ctx.fill()
}

function drawGhostBody(ctx, cx, cy, r, color) {
	ctx.fillStyle = color
	ctx.beginPath()
	ctx.arc(cx, cy, r, Math.PI, 0)
	ctx.lineTo(cx + r, cy + r)
	const bumps = 3
	const step = (2 * r) / (bumps * 2)
	for (let i = 0; i < bumps * 2; i++) {
		const x = cx + r - step * (i + 1)
		const y = cy + (i % 2 === 0 ? r * 0.5 : r)
		ctx.lineTo(x, y)
	}
	ctx.closePath()
	ctx.fill()
}

function drawEye(ctx, x, y, r) {
	ctx.fillStyle = '#fff'
	ctx.beginPath()
	ctx.arc(x, y, r, 0, Math.PI * 2)
	ctx.fill()
	ctx.fillStyle = '#1a237e'
	ctx.beginPath()
	ctx.arc(x, y + r * 0.2, r * 0.5, 0, Math.PI * 2)
	ctx.fill()
}

function drawGhostEyes(ctx, cx, cy, r) {
	const ex = r * 0.35
	const ey = -r * 0.1
	drawEye(ctx, cx - ex, cy + ey, r * 0.28)
	drawEye(ctx, cx + ex, cy + ey, r * 0.28)
}

function drawGhost(ctx, ghost) {
	const cx = ghost.x * CELL + CELL / 2
	const cy = ghost.y * CELL + CELL / 2
	const r = CELL / 2 - 2
	drawGhostBody(ctx, cx, cy, r, ghost.color)
	drawGhostEyes(ctx, cx, cy, r)
}

function drawBanner(ctx, text) {
	ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	ctx.fillStyle = '#fff'
	ctx.font = '22px system-ui, sans-serif'
	ctx.textAlign = 'center'
	ctx.fillText(text, COLS * CELL / 2, ROWS * CELL / 2)
	ctx.textAlign = 'left'
}

function drawCountdown(ctx, n) {
	drawBanner(ctx, n > 0 ? String(n) : 'Go!')
}

function draw(ctx, state) {
	ctx.fillStyle = '#000'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	drawMaze(ctx)
	drawPellets(ctx, state.pellets)
	drawPlayer(ctx, state.player)
	for (const ghost of state.ghosts) {
		drawGhost(ctx, ghost)
	}
	if (state.phase === 'countdown') {
		drawCountdown(ctx, state.countdown)
	}
	if (state.phase === 'over') {
		drawBanner(ctx, state.won ? 'You win!' : 'Game Over')
	}
}

function createCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = COLS * CELL
	canvas.height = ROWS * CELL
	canvas.tabIndex = 0
	return canvas
}

function createRuntime(ctx, stats, best) {
	let state = null

	function render() {
		draw(ctx, state)
		stats.setScore(state.score)
		stats.setLives(state.lives)
		if (state.score > best.value) {
			best.value = state.score
			saveNumber(BEST_KEY, best.value)
		}
		stats.setBest(best.value)
	}

	function start() {
		state = createState()
		render()
	}

	function onKeyDown(e) {
		const dir = DIRS[e.key]
		if (!dir) return
		state.player.next = dir
		e.preventDefault()
	}

	const timer = setInterval(() => {
		tick(state)
		render()
	}, TICK_MS)

	return {
		start,
		onKeyDown,
		stop: () => clearInterval(timer),
	}
}

export default {
	id: 'pacman',
	title: 'Maze Muncher',
	description:
		'A Pac-Man-style maze chase. Arrow keys to move, ' +
		'eat every dot while avoiding the ghosts.',

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
			setScore: createStat(side, 'Score'),
			setLives: createStat(side, 'Lives'),
			setBest: createStat(side, 'Best'),
		}

		const best = { value: loadNumber(BEST_KEY, 0) }
		runtime = createRuntime(
			canvas.getContext('2d'), stats, best)

		canvas.addEventListener('keydown', runtime.onKeyDown)
		canvas.focus()
		runtime.start()

		this._cleanup = () => {
			runtime.stop()
			canvas.removeEventListener(
				'keydown', runtime.onKeyDown)
		}
	},

	destroy() {
		this._cleanup?.()
	},
}
