// Tetris-style falling block game.

const COLS = 10
const ROWS = 20
const CELL = 24
const TICK_MS = 600

const SHAPES = {
	I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
	O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
	T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
	S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
	Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
	J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
	L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
}

const COLORS = {
	I: '#4dd0e1', O: '#ffd54f', T: '#ba68c8',
	S: '#81c784', Z: '#e57373', J: '#64b5f6',
	L: '#ffb74d',
}

const KEYS = Object.keys(SHAPES)

function emptyBoard() {
	return Array.from(
		{ length: ROWS }, () => Array(COLS).fill(null))
}

function rotateCells(cells, size) {
	return cells.map(([x, y]) => [size - 1 - y, x])
}

function randomKey() {
	return KEYS[Math.floor(Math.random() * KEYS.length)]
}

function spawn(key) {
	const shape = SHAPES[key]
	return {
		key,
		size: shape.size,
		cells: shape.cells,
		x: Math.floor((COLS - shape.size) / 2),
		y: 0,
	}
}

function fits(board, cells, x, y) {
	return cells.every(([cx, cy]) => {
		const bx = x + cx
		const by = y + cy
		if (bx < 0 || bx >= COLS || by >= ROWS) {
			return false
		}
		if (by < 0) return true
		return board[by][bx] === null
	})
}

function merge(board, piece) {
	for (const [cx, cy] of piece.cells) {
		const bx = piece.x + cx
		const by = piece.y + cy
		if (by >= 0) board[by][bx] = piece.key
	}
}

function clearLines(board) {
	let cleared = 0
	for (let y = ROWS - 1; y >= 0; y--) {
		if (board[y].every((c) => c !== null)) {
			board.splice(y, 1)
			board.unshift(Array(COLS).fill(null))
			cleared++
			y++
		}
	}
	return cleared
}

function boardCells(board) {
	const out = []
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			const key = board[y][x]
			if (key) out.push({ x, y, key })
		}
	}
	return out
}

function pieceCells(piece) {
	return piece.cells.map(([cx, cy]) => ({
		x: piece.x + cx,
		y: piece.y + cy,
		key: piece.key,
	}))
}

function drawCells(ctx, cells) {
	for (const { x, y, key } of cells) {
		if (y < 0) continue
		ctx.fillStyle = COLORS[key]
		ctx.fillRect(
			x * CELL + 1, y * CELL + 1,
			CELL - 2, CELL - 2)
	}
}

function drawScore(ctx, score) {
	ctx.fillStyle = '#eee'
	ctx.font = '14px system-ui, sans-serif'
	ctx.fillText(`Score: ${score}`, 6, 16)
}

function drawGameOver(ctx) {
	ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	ctx.fillStyle = '#fff'
	ctx.font = '20px system-ui, sans-serif'
	ctx.textAlign = 'center'
	ctx.fillText(
		'Game Over', COLS * CELL / 2, ROWS * CELL / 2)
	ctx.textAlign = 'left'
}

function draw(ctx, board, piece, score, over) {
	ctx.fillStyle = '#111'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	drawCells(ctx, boardCells(board))
	if (piece) drawCells(ctx, pieceCells(piece))
	drawScore(ctx, score)
	if (over) drawGameOver(ctx)
}

function tryMove(state, dx, dy) {
	const { board, piece } = state
	const x = piece.x + dx
	const y = piece.y + dy
	if (!fits(board, piece.cells, x, y)) return false
	piece.x = x
	piece.y = y
	return true
}

function tryRotate(state) {
	const { board, piece } = state
	const cells = rotateCells(piece.cells, piece.size)
	if (!fits(board, cells, piece.x, piece.y)) return false
	piece.cells = cells
	return true
}

function lockPiece(state) {
	merge(state.board, state.piece)
	state.score += clearLines(state.board) * 100
	state.piece = spawn(randomKey())
	const p = state.piece
	if (!fits(state.board, p.cells, p.x, p.y)) {
		state.over = true
	}
}

function hardDrop(state) {
	while (tryMove(state, 0, 1)) {
		/* keep falling */
	}
	lockPiece(state)
}

function handleKey(state, key) {
	switch (key) {
		case 'ArrowLeft':
			return tryMove(state, -1, 0)
		case 'ArrowRight':
			return tryMove(state, 1, 0)
		case 'ArrowDown':
			return tryMove(state, 0, 1)
		case 'ArrowUp':
			return tryRotate(state)
		case ' ':
			hardDrop(state)
			return true
		default:
			return false
	}
}

function dropTick(state) {
	if (state.over) return
	if (!tryMove(state, 0, 1)) lockPiece(state)
}

function createCanvas() {
	const canvas = document.createElement('canvas')
	canvas.width = COLS * CELL
	canvas.height = ROWS * CELL
	canvas.tabIndex = 0
	return canvas
}

function createState() {
	return {
		board: emptyBoard(),
		piece: spawn(randomKey()),
		score: 0,
		over: false,
	}
}

function wire(canvas, ctx, state) {
	const render = () => draw(
		ctx, state.board, state.piece,
		state.score, state.over)

	const onKeyDown = (e) => {
		if (state.over) return
		if (handleKey(state, e.key)) {
			e.preventDefault()
			render()
		}
	}

	canvas.addEventListener('keydown', onKeyDown)
	canvas.focus()
	render()

	const timer = setInterval(() => {
		dropTick(state)
		render()
	}, TICK_MS)

	return () => {
		clearInterval(timer)
		canvas.removeEventListener('keydown', onKeyDown)
	}
}

export default {
	id: 'tetris',
	title: 'Blockfall',
	description:
		'A Tetris-style falling block game. Arrow keys ' +
		'to move/rotate, space to hard-drop.',

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
