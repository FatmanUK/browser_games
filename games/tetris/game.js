// Tetris-style falling block game.

import { createChrome, createStat } from '../_shared/chrome.js'
import { loadNumber, saveNumber } from '../_shared/storage.js'

const COLS = 10
const ROWS = 20
const CELL = 18
const TICK_MS = 600
const PREVIEW = CELL * 4
const BEST_KEY = 'bg-blockfall-best'

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

function shuffledBag() {
	const bag = KEYS.slice()
	for (let i = bag.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[bag[i], bag[j]] = [bag[j], bag[i]]
	}
	return bag
}

function takeNext(queue) {
	const key = queue.shift()
	if (queue.length === 0) queue.push(...shuffledBag())
	return key
}

function emptyBoard() {
	return Array.from(
		{ length: ROWS }, () => Array(COLS).fill(null))
}

function rotateCells(cells, size) {
	return cells.map(([x, y]) => [size - 1 - y, x])
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

function drawCell(ctx, x, y, color) {
	const px = x * CELL
	const py = y * CELL
	ctx.fillStyle = color
	ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
	ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
	ctx.fillRect(px + 1, py + 1, CELL - 2, 2)
	ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
	ctx.fillRect(px + 1, py + CELL - 3, CELL - 2, 2)
}

function drawCells(ctx, cells) {
	for (const { x, y, key } of cells) {
		if (y < 0) continue
		drawCell(ctx, x, y, COLORS[key])
	}
}

function drawGridLines(ctx) {
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
	ctx.lineWidth = 1
	for (let x = 1; x < COLS; x++) {
		ctx.beginPath()
		ctx.moveTo(x * CELL + 0.5, 0)
		ctx.lineTo(x * CELL + 0.5, ROWS * CELL)
		ctx.stroke()
	}
	for (let y = 1; y < ROWS; y++) {
		ctx.beginPath()
		ctx.moveTo(0, y * CELL + 0.5)
		ctx.lineTo(COLS * CELL, y * CELL + 0.5)
		ctx.stroke()
	}
}

function drawGameOver(ctx) {
	ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	ctx.fillStyle = '#fff'
	ctx.font = '16px system-ui, sans-serif'
	ctx.textAlign = 'center'
	ctx.fillText(
		'Game Over', COLS * CELL / 2, ROWS * CELL / 2)
	ctx.textAlign = 'left'
}

function draw(ctx, board, piece, over) {
	ctx.fillStyle = '#14141c'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	drawGridLines(ctx)
	drawCells(ctx, boardCells(board))
	if (piece) drawCells(ctx, pieceCells(piece))
	if (over) drawGameOver(ctx)
}

function drawPreviewCell(ctx, x, y, color) {
	ctx.fillStyle = color
	ctx.fillRect(
		x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
}

function drawPreview(ctx, key) {
	ctx.fillStyle = '#14141c'
	ctx.fillRect(0, 0, PREVIEW, PREVIEW)
	if (!key) return
	const shape = SHAPES[key]
	const offset = (4 - shape.size) / 2
	for (const [cx, cy] of shape.cells) {
		drawPreviewCell(
			ctx, offset + cx, offset + cy, COLORS[key])
	}
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
	state.piece = spawn(takeNext(state.queue))
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

function createState() {
	const queue = shuffledBag()
	return {
		board: emptyBoard(),
		piece: spawn(takeNext(queue)),
		queue,
		score: 0,
		over: false,
	}
}

function createCanvas(width, height) {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	canvas.tabIndex = 0
	return canvas
}

function appendPreview(side, preview) {
	const label = document.createElement('p')
	label.className = 'game-stat'
	label.textContent = 'Next'
	side.appendChild(label)
	side.appendChild(preview)
}

function createRuntime(ctx, previewCtx, stats, best) {
	let state = null
	let timer = null

	function render() {
		draw(ctx, state.board, state.piece, state.over)
		drawPreview(previewCtx, state.queue[0])
		stats.setScore(state.score)
		if (state.score > best.value) {
			best.value = state.score
			saveNumber(BEST_KEY, best.value)
		}
		stats.setBest(best.value)
	}

	function start() {
		state = createState()
		clearInterval(timer)
		timer = setInterval(() => {
			dropTick(state)
			render()
		}, TICK_MS)
		render()
	}

	function onKeyDown(e) {
		if (state.over) return
		if (handleKey(state, e.key)) {
			e.preventDefault()
			render()
		}
	}

	function stop() {
		clearInterval(timer)
	}

	return { start, onKeyDown, stop }
}

export default {
	id: 'tetris',
	title: 'Blockfall',
	description:
		'A Tetris-style falling block game. Arrow keys ' +
		'to move/rotate, space to hard-drop.',

	init(container, controls) {
		const canvas = createCanvas(COLS * CELL, ROWS * CELL)
		const preview = createCanvas(PREVIEW, PREVIEW)
		let runtime = null

		const { main, side } = createChrome(container, {
			title: this.title,
			onBack: controls.back,
			onNewGame: () => runtime.start(),
		})
		main.appendChild(canvas)
		appendPreview(side, preview)
		const stats = {
			setScore: createStat(side, 'Score'),
			setBest: createStat(side, 'Best'),
		}

		const best = { value: loadNumber(BEST_KEY, 0) }
		runtime = createRuntime(
			canvas.getContext('2d'),
			preview.getContext('2d'), stats, best)

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
