// A look per ten levels.
//
// Empty cells, pipe and the gutter are most of the board's
// area, and painted one flat grey they read as nothing at all
// — the wheels and marbles end up floating on a blank page.
// So the ground is tinted and textured, and the tint changes
// every ten levels. It is also the only thing on screen that
// says how far up the ladder you are without reading a number.
//
// Everything here must stay quiet. The marbles are four
// saturated colours and the wheels are brass: any ground that
// competes with them costs legibility, which is why the papers
// all sit near the top of the range and the textures are drawn
// at low alpha over them.
//
// Tiles are baked once, lazily, and tiled with createPattern.
// Drawing a texture over the whole window every frame would be
// thousands of operations for something that never changes.

import { makeCanvas, rng } from '../_shared/art.js'

const TILE = 72

// Shapes near a tile edge have to be drawn again on the far
// side or the pattern shows its seams.
function wrapped(s, x, y, draw) {
	for (let dx = -1; dx <= 1; dx++) {
		for (let dy = -1; dy <= 1; dy++) {
			draw(x + dx * s, y + dy * s)
		}
	}
}

function dot(ctx, x, y, r) {
	ctx.beginPath()
	ctx.arc(x, y, r, 0, Math.PI * 2)
	ctx.fill()
}

function graph(ctx, s, col) {
	ctx.strokeStyle = col
	ctx.lineWidth = 1
	ctx.beginPath()
	for (let i = 0; i < s; i += s / 4) {
		ctx.moveTo(i + 0.5, 0)
		ctx.lineTo(i + 0.5, s)
		ctx.moveTo(0, i + 0.5)
		ctx.lineTo(s, i + 0.5)
	}
	ctx.stroke()
}

function hatch(ctx, s, col) {
	ctx.strokeStyle = col
	ctx.lineWidth = 3
	ctx.beginPath()
	for (let i = -s; i < s * 2; i += s / 4) {
		ctx.moveTo(i, 0)
		ctx.lineTo(i + s, s)
	}
	ctx.stroke()
}

function leaf(ctx, s, col) {
	const rand = rng(7)
	ctx.fillStyle = col
	for (let i = 0; i < 14; i++) {
		const x = rand() * s
		const y = rand() * s
		const r = 1.6 + rand() * 2.6
		wrapped(s, x, y, (px, py) => dot(ctx, px, py, r))
	}
}

function bubbles(ctx, s, col) {
	const rand = rng(11)
	ctx.strokeStyle = col
	ctx.lineWidth = 1.5
	for (let i = 0; i < 7; i++) {
		const x = rand() * s
		const y = rand() * s
		const r = 4 + rand() * 13
		wrapped(s, x, y, (px, py) => {
			ctx.beginPath()
			ctx.arc(px, py, r, 0, Math.PI * 2)
			ctx.stroke()
		})
	}
}

function strata(ctx, s, col) {
	ctx.fillStyle = col
	let y = 0
	const rand = rng(3)
	while (y < s) {
		const h = 2 + rand() * 7
		ctx.fillRect(0, y, s, h)
		y += h + 4 + rand() * 9
	}
}

function bricks(ctx, s, col) {
	ctx.strokeStyle = col
	ctx.lineWidth = 1.5
	const h = s / 4
	ctx.beginPath()
	for (let r = 0; r < 4; r++) {
		const y = r * h
		ctx.moveTo(0, y + 0.5)
		ctx.lineTo(s, y + 0.5)
		const off = (r % 2) * (s / 4)
		for (let x = off; x < s; x += s / 2) {
			ctx.moveTo(x + 0.5, y)
			ctx.lineTo(x + 0.5, y + h)
		}
	}
	ctx.stroke()
}

const SPECTRUM = [
	'rgba(214,96,96,0.14)', 'rgba(216,160,80,0.14)',
	'rgba(190,196,86,0.14)', 'rgba(104,186,122,0.14)',
	'rgba(94,166,210,0.14)', 'rgba(150,124,206,0.14)',
]

function spectrum(ctx, s) {
	const w = s / SPECTRUM.length
	SPECTRUM.forEach((col, i) => {
		ctx.fillStyle = col
		ctx.fillRect(i * w, 0, w + 1, s)
	})
}

function rivets(ctx, s, col) {
	const step = s / 3
	for (let gx = 0; gx < 3; gx++) {
		for (let gy = 0; gy < 3; gy++) {
			const x = (gx + 0.5) * step
			const y = (gy + 0.5) * step
			ctx.fillStyle = col
			dot(ctx, x, y, 3)
			ctx.fillStyle = 'rgba(255,255,255,0.45)'
			dot(ctx, x - 0.9, y - 0.9, 1.2)
		}
	}
}

function shards(ctx, s, col) {
	const rand = rng(23)
	ctx.strokeStyle = col
	ctx.lineWidth = 1.5
	ctx.beginPath()
	for (let i = 0; i < 9; i++) {
		const x = rand() * s
		const y = rand() * s
		const a = rand() * Math.PI
		const r = 6 + rand() * 16
		ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r)
		ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
	}
	ctx.stroke()
}

function specks(ctx, s, col) {
	const rand = rng(31)
	ctx.fillStyle = col
	for (let i = 0; i < 46; i++) {
		dot(ctx, rand() * s, rand() * s, 0.6 + rand() * 1.2)
	}
}

// name, the ground it is painted on, the gutter trough, the
// pipe fill and its wall, then the texture and its ink.
export const BANDS = [
	{
		name: 'paper', paper: '#f2efe6', trough: '#e6e1d3',
		pipe: '#d9d3c3', edge: 'rgba(92,80,58,0.34)',
		tex: graph, ink: 'rgba(150,135,100,0.22)',
	},
	{
		name: 'workshop', paper: '#e8ecf1', trough: '#d7dde6',
		pipe: '#c7cfdb', edge: 'rgba(50,62,80,0.34)',
		tex: hatch, ink: 'rgba(90,110,140,0.14)',
	},
	{
		name: 'verdant', paper: '#eaf1e7', trough: '#d9e4d4',
		pipe: '#cad7c5', edge: 'rgba(52,78,50,0.34)',
		tex: leaf, ink: 'rgba(90,130,85,0.2)',
	},
	{
		name: 'bubble', paper: '#e5f1f6', trough: '#d3e6ee',
		pipe: '#c3dae6', edge: 'rgba(40,78,92,0.34)',
		tex: bubbles, ink: 'rgba(70,140,170,0.22)',
	},
	{
		name: 'sunset', paper: '#f7ece3', trough: '#eeddce',
		pipe: '#e2cdbb', edge: 'rgba(110,70,45,0.34)',
		tex: strata, ink: 'rgba(200,130,90,0.16)',
	},
	{
		name: 'slate', paper: '#e9ebee', trough: '#d8dbe0',
		pipe: '#c8ccd3', edge: 'rgba(55,60,70,0.34)',
		tex: bricks, ink: 'rgba(90,96,110,0.16)',
	},
	{
		name: 'spectrum', paper: '#f0eef5', trough: '#e0dcea',
		pipe: '#d1ccdd', edge: 'rgba(70,60,95,0.34)',
		tex: spectrum, ink: null,
	},
	{
		name: 'foundry', paper: '#f1e8dc', trough: '#e2d4c1',
		pipe: '#d5c5ae', edge: 'rgba(100,72,40,0.34)',
		tex: rivets, ink: 'rgba(150,110,65,0.24)',
	},
	{
		name: 'ice', paper: '#eaf1f7', trough: '#d9e5f0',
		pipe: '#c9d8e8', edge: 'rgba(45,70,100,0.34)',
		tex: shards, ink: 'rgba(100,150,195,0.22)',
	},
	{
		name: 'dusk', paper: '#eeeaf4', trough: '#ded8ea',
		pipe: '#cfc8df', edge: 'rgba(62,52,90,0.34)',
		tex: specks, ink: 'rgba(110,95,160,0.26)',
	},
]

// A wash over the playfield so the board reads as a surface
// laid on the textured ground rather than a hole in it.
export const BOARD_WASH = 'rgba(255,255,255,0.42)'

export function bandFor(level) {
	const i = Math.floor((Math.max(1, level) - 1) / 10)
	return BANDS[Math.min(BANDS.length - 1, i)]
}

const tiles = new Map()

export function bandPattern(ctx, band) {
	const i = BANDS.indexOf(band)
	if (!tiles.has(i)) {
		const canvas = makeCanvas(TILE, TILE)
		band.tex(canvas.getContext('2d'), TILE, band.ink)
		tiles.set(i, canvas)
	}
	return ctx.createPattern(tiles.get(i), 'repeat')
}
