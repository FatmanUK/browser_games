// Shared game window and HUD drawing.
//
// Two ideas, both first worked out in Belt Breaker and pulled
// up here so every game can have them.
//
// One: a game is a window of a fixed size (WIDTH x HEIGHT),
// the same for every game in the suite, with its controls laid
// over the top of the canvas rather than beside it. A game
// whose playfield is a different shape centres inside that
// window rather than resizing it — see fitBoard().
//
// Two: the meters are drawn on the canvas, in the game's own
// palette, instead of being createStat() lines in a sidebar. A
// stat line is the right default for something plain; a drawn
// readout stops the game looking like a browser form with a
// picture in it. chrome.js is still there for games that want
// the simpler sidebar.

export const WIDTH = 960
export const HEIGHT = 400

export const FONT = 'ui-monospace, "SF Mono", Menlo, monospace'
export const LIVE = '#8fe9ff'
export const DIM = 'rgba(126,186,210,0.72)'

function createButton(label, onClick) {
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'game-side-button'
	btn.textContent = label
	// See chrome.js: suppressing mousedown's default keeps
	// focus on the canvas, so the keys keep working.
	btn.addEventListener(
		'mousedown', (e) => e.preventDefault())
	btn.addEventListener('click', onClick)
	return btn
}

// Returns { canvas, controlsRow }. controlsRow is where the
// Sound/Music toggles go (createAudioToggles takes it).
export function buildWindow(container, opts) {
	const frame = document.createElement('div')
	frame.className = 'game-window'

	const header = document.createElement('div')
	header.className = 'game-hud'
	const controlsRow = document.createElement('div')
	controlsRow.className = 'game-hud-row'

	const heading = document.createElement('h2')
	heading.textContent = opts.title
	controlsRow.append(
		heading,
		createButton('New game', opts.onNewGame),
		createButton('← Back to games', opts.onBack))

	const canvas = document.createElement('canvas')
	canvas.width = WIDTH
	canvas.height = HEIGHT
	canvas.tabIndex = 0

	header.append(controlsRow)
	frame.append(canvas, header)
	container.appendChild(frame)
	return { canvas, controlsRow }
}

// Angular brackets around a readout, the way an instrument
// panel frames a value. Cheap, and it does more to make a HUD
// look built-in than the choice of typeface does.
export function brackets(ctx, x, y, w, h) {
	const tick = 7
	ctx.strokeStyle = 'rgba(120,214,255,0.4)'
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(x, y + tick)
	ctx.lineTo(x, y)
	ctx.lineTo(x + tick, y)
	ctx.moveTo(x + w - tick, y + h)
	ctx.lineTo(x + w, y + h)
	ctx.lineTo(x + w, y + h - tick)
	ctx.stroke()
}

// A dark outline under everything. The glow alone is enough
// over a starfield, but Dash's HUD sits over grass and
// sunlit tarmac, where cyan-on-light is barely there.
function outlined(ctx, text, x, y, width) {
	ctx.lineWidth = width
	ctx.lineJoin = 'round'
	ctx.strokeStyle = 'rgba(2,8,16,0.8)'
	ctx.strokeText(text, x, y)
	ctx.fillText(text, x, y)
}

// A labelled value: small dim label, big glowing number under
// it. `align` is 'left' (default) or 'right', in which case x
// is the right-hand edge.
export function readout(ctx, x, y, label, value, size, align) {
	ctx.textAlign = align || 'left'
	ctx.fillStyle = DIM
	ctx.font = `10px ${FONT}`
	outlined(ctx, label, x, y, 2.5)
	ctx.fillStyle = LIVE
	ctx.font = `bold ${size}px ${FONT}`
	ctx.shadowColor = 'rgba(80,200,255,0.75)'
	ctx.shadowBlur = 10
	outlined(ctx, String(value), x, y + size + 2, 3.5)
	ctx.shadowBlur = 0
	ctx.textAlign = 'left'
}

export function label(ctx, x, y, text, align, colour) {
	ctx.textAlign = align || 'left'
	ctx.fillStyle = colour || DIM
	ctx.font = `11px ${FONT}`
	outlined(ctx, text, x, y, 2.5)
	ctx.textAlign = 'left'
}

// Centres a playfield of its own shape inside the shared
// window, scaling it down if it will not fit between the
// controls bar and whatever the game puts along the bottom.
// Leaves the transform applied; the caller restores.
export function fitBoard(ctx, boardW, boardH, top, bottom) {
	const room = HEIGHT - top - bottom
	const scale = Math.min(
		1, room / boardH, WIDTH / boardW)
	const x = (WIDTH - boardW * scale) / 2
	const y = top + (room - boardH * scale) / 2
	ctx.setTransform(scale, 0, 0, scale, x, y)
	return { scale, x, y }
}
