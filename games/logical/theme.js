// Wheelworks' palette and its text, drawn light where the rest
// of the suite is drawn dark.
//
// The shared readout/label/brackets in games/_shared/hud.js
// are cyan with a dark halo under them, which is right over a
// starfield and unreadable over paper. These are the same
// three shapes in the opposite polarity: dark ink with a pale
// halo. They live here rather than in hud.js because render.js
// wants the colours too, and a palette in two files is a
// palette that drifts.
//
// The window furniture — the title bar with New game, Back to
// games and the Sound/Music toggles — is the suite's shared
// CSS and stays dark. It reads as a dark toolbar above a light
// board, which is a normal enough arrangement; turning it
// light would mean changing the chrome for all five games.

import { FONT } from '../_shared/hud.js'

// The ground, the trough and the pipe are not here: they
// change every ten levels and live in bands.js. What is left
// is the furniture that must not change, because a label that
// shifts colour with the level is a label you have to read
// twice.
export const PAPER = '#eceef2'
export const FRAME = 'rgba(42,52,66,0.28)'

export const INK = '#1f2733'
export const FAINT = '#6b7889'
export const HALO = 'rgba(255,255,255,0.9)'

export const HOT = '#c1392b'
export const WARN = '#9a6b14'
export const POCKET = 'rgba(28,36,48,0.86)'
export const BLOCK_FILL = '#dcefdf'
export const BLOCK_EDGE = '#2d7a42'
export const SCRIM = 'rgba(236,238,242,0.94)'
export const KEY_FILL = '#dfe4ec'
export const KEY_HOT = '#2f6fb0'
export const KEY_EDGE = 'rgba(42,52,66,0.3)'

// A pale halo under dark text, the mirror of the shared
// outlined(). The board is light but a marble or a brass wheel
// can sit under a label, and ink on brass is nearly ink on
// ink.
function haloed(ctx, text, x, y, width) {
	ctx.lineWidth = width
	ctx.lineJoin = 'round'
	ctx.strokeStyle = HALO
	ctx.strokeText(text, x, y)
	ctx.fillText(text, x, y)
}

export function readout(ctx, x, y, name, value, size, align) {
	ctx.textAlign = align || 'left'
	ctx.fillStyle = FAINT
	ctx.font = `10px ${FONT}`
	haloed(ctx, name, x, y, 3)
	ctx.fillStyle = INK
	ctx.font = `bold ${size}px ${FONT}`
	haloed(ctx, String(value), x, y + size + 2, 4)
	ctx.textAlign = 'left'
}

export function label(ctx, x, y, text, align, colour) {
	ctx.textAlign = align || 'left'
	ctx.fillStyle = colour || FAINT
	ctx.font = `11px ${FONT}`
	haloed(ctx, text, x, y, 3)
	ctx.textAlign = 'left'
}

// Angular corner ticks round a cluster of readouts, the way an
// instrument panel frames a value.
export function brackets(ctx, x, y, w, h) {
	const tick = 7
	ctx.strokeStyle = FRAME
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

export function banner(ctx, text, x, y, size, colour) {
	ctx.textAlign = 'center'
	ctx.font = `bold ${size}px system-ui, sans-serif`
	ctx.lineWidth = size * 0.16
	ctx.lineJoin = 'round'
	ctx.strokeStyle = HALO
	ctx.strokeText(text, x, y)
	ctx.fillStyle = colour || INK
	ctx.fillText(text, x, y)
	ctx.textAlign = 'left'
}
