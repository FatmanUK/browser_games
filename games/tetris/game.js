// Tetris-style falling block game.
//
// The board is its own narrow shape; it is centred inside the
// suite's shared window (see games/_shared/hud.js) rather than
// sizing the canvas to itself, so every game in the launcher
// opens the same size. The space either side of the board is
// where the meters and the next-piece preview go.

import {
	buildWindow, fitBoard, WIDTH, HEIGHT,
} from '../_shared/hud.js'
import { loadNumber, saveNumber } from '../_shared/storage.js'
import { setupSound } from './audio.js'
import { drawHud, previewBox } from './hud.js'

const COLS = 10
const ROWS = 20
const CELL = 18
const TICK_MS = 600
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
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.fillStyle = 'rgba(2, 4, 10, 0.68)'
	ctx.fillRect(0, 0, WIDTH, HEIGHT)
	ctx.fillStyle = '#dff4ff'
	ctx.font = 'bold 44px ui-monospace, Menlo, monospace'
	ctx.textAlign = 'center'
	ctx.fillText('GAME OVER', WIDTH / 2, HEIGHT / 2)
	ctx.font = '13px ui-monospace, Menlo, monospace'
	ctx.fillStyle = 'rgba(190,225,245,0.8)'
	ctx.fillText(
		'PRESS NEW GAME', WIDTH / 2, HEIGHT / 2 + 28)
	ctx.textAlign = 'left'
}

function drawWell(ctx, state) {
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.fillStyle = '#05070f'
	ctx.fillRect(0, 0, WIDTH, HEIGHT)
	fitBoard(ctx, COLS * CELL, ROWS * CELL, 44, 16)
	ctx.fillStyle = '#14141c'
	ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL)
	drawGridLines(ctx)
	drawCells(ctx, boardCells(state.board))
	if (state.piece) drawCells(ctx, pieceCells(state.piece))
	ctx.strokeStyle = 'rgba(120,214,255,0.3)'
	ctx.lineWidth = 2
	ctx.strokeRect(0, 0, COLS * CELL, ROWS * CELL)
	ctx.setTransform(1, 0, 0, 1, 0, 0)
}

function drawPreviewCell(ctx, x, y, color) {
	ctx.fillStyle = color
	ctx.fillRect(
		x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
}

function drawPreview(ctx, key) {
	const at = previewBox(ctx, CELL)
	if (!key) return
	const shape = SHAPES[key]
	const offset = (4 - shape.size) / 2
	ctx.save()
	ctx.translate(at.x, at.y)
	for (const [cx, cy] of shape.cells) {
		drawPreviewCell(
			ctx, offset + cx, offset + cy, COLORS[key])
	}
	ctx.restore()
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
	const cleared = clearLines(state.board)
	state.score += cleared * 100
	state.lines += cleared
	state.piece = spawn(takeNext(state.queue))
	const p = state.piece
	if (!fits(state.board, p.cells, p.x, p.y)) {
		state.over = true
	}
	return cleared
}

function hardDrop(state) {
	while (tryMove(state, 0, 1)) {
		/* keep falling */
	}
	return lockPiece(state)
}

function tryMoveSound(state, dx, dy, audio) {
	const moved = tryMove(state, dx, dy)
	if (moved) audio.move()
	return moved
}

function handleKey(state, key, audio) {
	switch (key) {
		case 'ArrowLeft':
			return tryMoveSound(state, -1, 0, audio)
		case 'ArrowRight':
			return tryMoveSound(state, 1, 0, audio)
		case 'ArrowDown':
			return tryMoveSound(state, 0, 1, audio)
		case 'ArrowUp': {
			const rotated = tryRotate(state)
			if (rotated) audio.rotate()
			return rotated
		}
		case ' ': {
			audio.hardDrop()
			const cleared = hardDrop(state)
			if (cleared > 0) audio.lineClear(cleared)
			return true
		}
		default:
			return false
	}
}

function dropTick(state) {
	if (state.over) return null
	if (tryMove(state, 0, 1)) return null
	return lockPiece(state)
}

function createState() {
	const queue = shuffledBag()
	return {
		board: emptyBoard(),
		piece: spawn(takeNext(queue)),
		queue,
		score: 0,
		lines: 0,
		over: false,
	}
}

function checkGameOverSound(state, audio, wasOver) {
	if (state.over && !wasOver.value) audio.gameOver()
	wasOver.value = state.over
}

function playLockSound(cleared, audio) {
	if (cleared === null) return
	if (cleared > 0) audio.lineClear(cleared)
	else audio.lock()
}

function render(ctx, best, state) {
	drawWell(ctx, state)
	drawPreview(ctx, state.queue[0])
	if (state.score > best.value) {
		best.value = state.score
		saveNumber(BEST_KEY, best.value)
	}
	drawHud(ctx, state, best)
	if (state.over) drawGameOver(ctx)
}

function createRuntime(ctx, best, audio) {
	let state = null
	let timer = null
	const wasOver = { value: false }
	const redraw = () => render(ctx, best, state)

	function onTick() {
		playLockSound(dropTick(state), audio)
		checkGameOverSound(state, audio, wasOver)
		redraw()
	}

	function start() {
		state = createState()
		wasOver.value = false
		clearInterval(timer)
		timer = setInterval(onTick, TICK_MS)
		redraw()
	}

	function onKeyDown(e) {
		audio.unlock()
		if (state.over) return
		if (handleKey(state, e.key, audio)) {
			e.preventDefault()
			checkGameOverSound(state, audio, wasOver)
			redraw()
		}
	}

	function stop() {
		clearInterval(timer)
		audio.stop()
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
		let runtime = null
		const { canvas, controlsRow } = buildWindow(
			container, {
				title: this.title,
				onBack: controls.back,
				onNewGame: () => runtime.start(),
			})
		const audio = setupSound(controlsRow)

		const best = { value: loadNumber(BEST_KEY, 0) }
		runtime = createRuntime(
			canvas.getContext('2d'), best, audio)

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
