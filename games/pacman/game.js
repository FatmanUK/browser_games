// Pac-Man-style maze chase game.

import { createChrome, createStat } from '../_shared/chrome.js'
import { loadNumber, saveNumber } from '../_shared/storage.js'
import { setupSound } from './audio.js'

const CELL = 22
const TICK_MS = 160
const TICKS_PER_SEC = Math.round(1000 / TICK_MS)
const LEVEL_COMPLETE_TICKS = TICKS_PER_SEC * 2
const LIVES_START = 3
const COLS = 19
const ROWS = 13
const BEST_KEY = 'bg-mazemuncher-best'
const START = { x: 1, y: 1 }

// Every level reuses the same open-row / wall-row skeleton (rows
// 1,3,5,7,9,11 fully open; rows 2,4,6,8,10 walled except at the
// listed connector columns). Column 1 is always a connector, so
// every level is guaranteed fully connected regardless of the
// rest of the set — only the connector columns change the look
// and the navigation difficulty between levels.
const LEVEL_CONNECTORS = [
	[1, 4, 6, 9, 12, 14, 17],
	[1, 9, 17],
	[1, 3, 8, 10, 15, 17],
]

function buildWallRow(connectorCols) {
	let row = '#'
	for (let x = 1; x < COLS - 1; x++) {
		row += connectorCols.includes(x) ? '.' : '#'
	}
	return row + '#'
}

function buildMaze(connectorCols) {
	const openRow = '#' + '.'.repeat(COLS - 2) + '#'
	const wallRow = buildWallRow(connectorCols)
	const border = '#'.repeat(COLS)
	const rows = [border]
	for (let i = 0; i < 5; i++) rows.push(openRow, wallRow)
	rows.push(openRow, border)
	return rows
}

const LEVEL_MAZES = LEVEL_CONNECTORS.map(buildMaze)

function mazeForLevel(level) {
	return LEVEL_MAZES[(level - 1) % LEVEL_MAZES.length]
}

// All on fully-open rows (1, 5, 11), so these stay valid homes
// no matter which level's connector set is active.
const GHOST_HOME_POOL = [
	{ x: COLS - 2, y: 1, dir: [0, 1], color: '#f06292' },
	{ x: 1, y: ROWS - 2, dir: [0, -1], color: '#4fc3f7' },
	{
		x: Math.floor(COLS / 2), y: 5,
		dir: [1, 0], color: '#ffb74d',
	},
	{
		x: COLS - 2, y: ROWS - 2,
		dir: [-1, 0], color: '#ba68c8',
	},
	{
		x: Math.floor(COLS / 2), y: 1,
		dir: [0, 1], color: '#aed581',
	},
]

function ghostCountForLevel(level) {
	return Math.min(5, 3 + Math.floor((level - 1) / 2))
}

function ghostEveryForLevel(level) {
	return Math.max(1, 2 - Math.floor((level - 1) / 2))
}

function makeGhosts(level) {
	const count = ghostCountForLevel(level)
	return GHOST_HOME_POOL.slice(0, count).map((home) => ({
		x: home.x,
		y: home.y,
		dir: home.dir,
		color: home.color,
		home,
	}))
}

const DIRS = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
}

function isWall(maze, x, y) {
	if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
		return true
	}
	return maze[y][x] === '#'
}

function initialPellets(maze) {
	const pellets = new Set()
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			if (maze[y][x] === '.') {
				pellets.add(`${x},${y}`)
			}
		}
	}
	return pellets
}

function createState() {
	const maze = mazeForLevel(1)
	return {
		maze,
		level: 1,
		player: {
			x: START.x, y: START.y,
			dir: [0, 0], next: [0, 0],
		},
		ghosts: makeGhosts(1),
		pellets: initialPellets(maze),
		score: 0,
		lives: LIVES_START,
		phase: 'countdown',
		countdown: 3,
		countdownTicks: TICKS_PER_SEC,
		levelCompleteTicks: 0,
		tickCount: 0,
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

function beginCountdown(state, audio) {
	state.phase = 'countdown'
	state.countdown = 3
	state.countdownTicks = TICKS_PER_SEC
	audio.countdownBeep()
}

function tryDir(maze, entity, dir) {
	const x = entity.x + dir[0]
	const y = entity.y + dir[1]
	if (isWall(maze, x, y)) return false
	entity.x = x
	entity.y = y
	return true
}

function eatPellet(state, audio) {
	const key = `${state.player.x},${state.player.y}`
	if (!state.pellets.delete(key)) return
	state.score += 10
	audio.eat()
	if (state.pellets.size === 0) {
		state.phase = 'levelComplete'
		state.levelCompleteTicks = LEVEL_COMPLETE_TICKS
		audio.levelComplete()
	}
}

function stepPlayer(state, audio) {
	const p = state.player
	if (tryDir(state.maze, p, p.next)) {
		p.dir = p.next
	} else {
		tryDir(state.maze, p, p.dir)
	}
	eatPellet(state, audio)
}

function ghostMoves(maze, ghost) {
	return Object.values(DIRS).filter((d) => {
		const x = ghost.x + d[0]
		const y = ghost.y + d[1]
		const reverse = d[0] === -ghost.dir[0] &&
			d[1] === -ghost.dir[1]
		return !isWall(maze, x, y) && !reverse
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

function chooseGhostDir(maze, ghost, player) {
	const moves = ghostMoves(maze, ghost)
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
		ghost.dir = chooseGhostDir(
			state.maze, ghost, state.player)
		tryDir(state.maze, ghost, ghost.dir)
	}
}

function checkCaught(state, audio) {
	const p = state.player
	const hit = state.ghosts.some(
		(g) => g.x === p.x && g.y === p.y)
	if (!hit) return
	audio.hit()
	state.lives--
	if (state.lives <= 0) {
		state.phase = 'over'
		audio.gameOver()
		return
	}
	resetPositions(state)
	beginCountdown(state, audio)
}

function tickCountdown(state, audio) {
	state.countdownTicks--
	if (state.countdownTicks > 0) return
	state.countdownTicks = TICKS_PER_SEC
	state.countdown--
	if (state.countdown <= 0) {
		state.phase = 'playing'
		audio.go()
	} else {
		audio.countdownBeep()
	}
}

function advanceLevel(state, audio) {
	state.level++
	state.maze = mazeForLevel(state.level)
	state.pellets = initialPellets(state.maze)
	state.ghosts = makeGhosts(state.level)
	resetPositions(state)
	beginCountdown(state, audio)
}

function tickLevelComplete(state, audio) {
	state.levelCompleteTicks--
	if (state.levelCompleteTicks <= 0) {
		advanceLevel(state, audio)
	}
}

function tick(state, audio) {
	if (state.phase === 'countdown') {
		tickCountdown(state, audio)
		return
	}
	if (state.phase === 'levelComplete') {
		tickLevelComplete(state, audio)
		return
	}
	if (state.phase !== 'playing') return
	state.tickCount++
	stepPlayer(state, audio)
	const every = ghostEveryForLevel(state.level)
	if (state.tickCount % every === 0) stepGhosts(state)
	checkCaught(state, audio)
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

function drawMaze(ctx, maze) {
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			if (maze[y][x] === '#') {
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

function drawOverlay(ctx, state) {
	if (state.phase === 'countdown') {
		drawCountdown(ctx, state.countdown)
	} else if (state.phase === 'levelComplete') {
		drawBanner(ctx, `Level ${state.level} clear!`)
	} else if (state.phase === 'over') {
		drawBanner(ctx, 'Game Over')
	}
}

function draw(ctx, state) {
	ctx.fillStyle = '#000'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	drawMaze(ctx, state.maze)
	drawPellets(ctx, state.pellets)
	drawPlayer(ctx, state.player)
	for (const ghost of state.ghosts) {
		drawGhost(ctx, ghost)
	}
	drawOverlay(ctx, state)
}

function createCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = COLS * CELL
	canvas.height = ROWS * CELL
	canvas.tabIndex = 0
	return canvas
}

function render(ctx, stats, best, state) {
	draw(ctx, state)
	stats.setScore(state.score)
	stats.setLives(state.lives)
	stats.setLevel(state.level)
	if (state.score > best.value) {
		best.value = state.score
		saveNumber(BEST_KEY, best.value)
	}
	stats.setBest(best.value)
}

function createRuntime(ctx, stats, best, audio) {
	let state = null
	const redraw = () => render(ctx, stats, best, state)

	function start() {
		state = createState()
		redraw()
	}

	function onKeyDown(e) {
		const dir = DIRS[e.key]
		if (!dir) return
		state.player.next = dir
		e.preventDefault()
	}

	const timer = setInterval(() => {
		tick(state, audio)
		redraw()
	}, TICK_MS)

	return {
		start,
		onKeyDown,
		stop: () => {
			clearInterval(timer)
			audio.stop()
		},
	}
}

export default {
	id: 'pacman',
	title: 'Maze Muncher',
	description:
		'A Pac-Man-style maze chase across multiple ' +
		'levels. Arrow keys to move, eat every dot ' +
		'while avoiding the ghosts.',

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
			setLevel: createStat(side, 'Level'),
			setBest: createStat(side, 'Best'),
		}
		const audio = setupSound(side)

		const best = { value: loadNumber(BEST_KEY, 0) }
		runtime = createRuntime(
			canvas.getContext('2d'), stats, best, audio)

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
