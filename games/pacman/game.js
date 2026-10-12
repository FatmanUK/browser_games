// Pac-Man-style maze chase game.

const MAZE = [
	'#############',
	'#...........#',
	'#.##.#.#.##.#',
	'#...........#',
	'#.#.#####.#.#',
	'#...........#',
	'#.##.#.#.##.#',
	'#...........#',
	'#############',
]

const CELL = 28
const TICK_MS = 180
const COLS = MAZE[0].length
const ROWS = MAZE.length

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

function createState() {
	return {
		player: { x: 1, y: 1, dir: [0, 0], next: [0, 0] },
		ghosts: [
			{ x: COLS - 2, y: 1, dir: [0, 1] },
			{ x: 1, y: ROWS - 2, dir: [0, -1] },
		],
		pellets: initialPellets(),
		score: 0,
		over: false,
		won: false,
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
		state.over = true
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
	for (const ghost of state.ghosts) {
		if (ghost.x === p.x && ghost.y === p.y) {
			state.over = true
		}
	}
}

function tick(state) {
	if (state.over) return
	stepPlayer(state)
	stepGhosts(state)
	checkCaught(state)
}

function drawMaze(ctx) {
	ctx.fillStyle = '#1a237e'
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			if (MAZE[y][x] === '#') {
				ctx.fillRect(
					x * CELL, y * CELL,
					CELL, CELL)
			}
		}
	}
}

function drawPellets(ctx, pellets) {
	ctx.fillStyle = '#fff59d'
	for (const key of pellets) {
		const [x, y] = key.split(',').map(Number)
		ctx.beginPath()
		ctx.arc(
			x * CELL + CELL / 2, y * CELL + CELL / 2,
			3, 0, Math.PI * 2)
		ctx.fill()
	}
}

function drawEntity(ctx, entity, color) {
	ctx.fillStyle = color
	ctx.beginPath()
	ctx.arc(
		entity.x * CELL + CELL / 2,
		entity.y * CELL + CELL / 2,
		CELL / 2 - 3, 0, Math.PI * 2)
	ctx.fill()
}

function drawBanner(ctx, text) {
	ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	ctx.fillStyle = '#fff'
	ctx.font = '20px system-ui, sans-serif'
	ctx.textAlign = 'center'
	ctx.fillText(text, COLS * CELL / 2, ROWS * CELL / 2)
	ctx.textAlign = 'left'
}

function drawHud(ctx, state) {
	ctx.fillStyle = '#fff'
	ctx.font = '14px system-ui, sans-serif'
	ctx.fillText(`Score: ${state.score}`, 6, 16)
	if (state.over) {
		drawBanner(ctx, state.won ? 'You win!' : 'Caught!')
	}
}

function draw(ctx, state) {
	ctx.fillStyle = '#000'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	drawMaze(ctx)
	drawPellets(ctx, state.pellets)
	drawEntity(ctx, state.player, '#ffeb3b')
	for (const ghost of state.ghosts) {
		drawEntity(ctx, ghost, '#f06292')
	}
	drawHud(ctx, state)
}

function createCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = COLS * CELL
	canvas.height = ROWS * CELL
	canvas.tabIndex = 0
	return canvas
}

function wire(canvas, ctx, state) {
	const render = () => draw(ctx, state)

	const onKeyDown = (e) => {
		const dir = DIRS[e.key]
		if (!dir) return
		state.player.next = dir
		e.preventDefault()
	}

	canvas.addEventListener('keydown', onKeyDown)
	canvas.focus()
	render()

	const timer = setInterval(() => {
		tick(state)
		render()
	}, TICK_MS)

	return () => {
		clearInterval(timer)
		canvas.removeEventListener('keydown', onKeyDown)
	}
}

export default {
	id: 'pacman',
	title: 'Maze Muncher',
	description:
		'A Pac-Man-style maze chase. Arrow keys to move, ' +
		'eat every dot while avoiding the ghosts.',

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
