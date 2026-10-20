// The art, baked once on first play.
//
// Nothing here runs during a frame: a frame only blits. And
// nothing here runs at module load either, because
// js/registry.js imports every game's module the moment the
// launcher page opens — baking there would cost every visitor
// the art for five games they have not chosen yet.
//
// Wheels are baked per heading rather than ctx.rotate()d,
// because shadeFace lights the *rotated* normal against a
// fixed light: a turned sprite is not a turned picture. But
// only a quarter turn of headings is baked. The solid is
// four-fold symmetric about its axle (a twelve-sided hub and
// four arms), the axle points at the viewer, and the light
// does not move, so the frame at a quarter turn is the frame
// at nought pixel for pixel. A full ring would be four copies
// of the same ninety degrees.

import { WHEEL_R, MARBLE_R, COLOURS } from './board.js'
import { bakeOne } from '../_shared/bake.js'
import { centred } from '../_shared/art.js'
import { intactWheel, brokenWheel } from './models.js'

// 24 frames over ninety degrees is 3.75 degrees apiece. The
// alignment tolerance is about 17, so the picture and the rule
// can never disagree by more than half a frame.
const FRAMES = 24

const QUARTER = Math.PI / 2
const TOP_DOWN = { x: QUARTER, z: 0 }

// Baked at board units and blitted inside fitBoard's scaled
// transform, so the one resample is a minification. Baking at
// final screen size would be sharper by a hair and would put
// every wheel's position through the transform by hand.
const WHEEL_PX = WHEEL_R

let atlas = null

function quarterOf(mdl) {
	const out = []
	for (let i = 0; i < FRAMES; i++) {
		out.push(bakeOne(mdl, WHEEL_PX, {
			x: TOP_DOWN.x,
			z: TOP_DOWN.z,
			spin: (i / FRAMES) * QUARTER,
		}))
	}
	return out
}

const INK = {
	blue: ['#cfe8ff', '#2f7fd8', '#09203c'],
	green: ['#ddffd8', '#38b24a', '#06290f'],
	yellow: ['#fff4cc', '#e2ad1b', '#352001'],
	red: ['#ffd8d2', '#d8392f', '#36070a'],
}

// Marbles are a gradient rather than a solid. A sphere is not
// an intersection of half-spaces, so it has no place in the
// mesh pipeline, and at eighteen pixels across a two-stop
// gradient with a hot spot off to the upper left reads as
// glass better than any amount of geometry would.
function bakeMarble(colour) {
	const r = MARBLE_R
	const { canvas, ctx } = centred(r * 2 + 6)
	const [lit, mid, dark] = INK[colour]
	const g = ctx.createRadialGradient(
		-r * 0.34, -r * 0.4, r * 0.1, 0, 0, r)
	g.addColorStop(0, lit)
	g.addColorStop(0.42, mid)
	g.addColorStop(1, dark)
	ctx.fillStyle = g
	ctx.beginPath()
	ctx.arc(0, 0, r, 0, Math.PI * 2)
	ctx.fill()
	ctx.fillStyle = 'rgba(255,255,255,0.72)'
	ctx.beginPath()
	ctx.arc(-r * 0.34, -r * 0.4, r * 0.2, 0, Math.PI * 2)
	ctx.fill()
	return canvas
}

export function getAtlas() {
	if (atlas) return atlas
	const marbles = {}
	for (const colour of COLOURS) {
		marbles[colour] = bakeMarble(colour)
	}
	const inks = {}
	const deeps = {}
	for (const colour of COLOURS) {
		inks[colour] = INK[colour][1]
		deeps[colour] = INK[colour][2]
	}
	atlas = {
		intact: quarterOf(intactWheel()),
		broken: quarterOf(brokenWheel()),
		marbles,
		inks,
		deeps,
		span: WHEEL_PX * 2 + 6,
	}
	return atlas
}

// Indexed off the continuous rotation, not off a wheel's
// target: mid-turn is most of what there is to look at.
export function wheelFrame(atlasIn, wheel) {
	const frames = wheel.broken
		? atlasIn.broken
		: atlasIn.intact
	const frac = wheel.turns - Math.floor(wheel.turns)
	const i = Math.floor(frac * FRAMES) % FRAMES
	return frames[i]
}

export { FRAMES }
