// Dash's geometry and materials.
//
// Everything used to be fillRect and arc with hardcoded hex: a
// car was two rectangles and a blue windscreen, a tree a brown
// stick under a green circle. Drawn from above that reads as a
// diagram of a race rather than a race, and no amount of
// picking better colours fixes it — a circle has no light on
// it. These are solids instead, flat-shaded face by face
// against a fixed light (games/_shared/mesh.js), which is the
// same thing Belt Breaker's rocks do.
//
// Authored in unit-ish coordinates and normalised to a pixel
// radius when baked, so the numbers here are proportions, not
// sizes.
//
// The axis convention is forced, not chosen: +X forward, +Y up
// out of the ground, +Z across. makeRotate applies the heading
// spin about Y *first* and the camera tilt about X second, so
// Y is the only axis a heading can turn about — author a car
// Z-up and the spin rolls it instead of steering it. The tilt
// that follows (TOP_DOWN in sprites.js) brings +Y round to
// face the viewer.

import {
	box, prism, cone, convex, unit,
} from '../_shared/mesh.js'
import { model } from '../_shared/bake.js'

// The liveries are CSS hex (they are also what the standings
// swatches use), but shadeFace works in linear light, so they
// have to be decoded on the way in. Feeding sRGB straight to a
// linear shader is the classic way to get everything looking
// washed out and chalky.
export function linear(hex) {
	const n = parseInt(hex.slice(1), 16)
	return [16, 8, 0].map(
		(sh) => Math.pow(((n >> sh) & 255) / 255, 2.2))
}

// Materials. A metal's trick is a low diffuse albedo under a
// bright tight specular, so the painted panels keep kd high
// and ks modest while the glass and the chrome do the reverse.
function paint(base) {
	return {
		base, tint: [1, 1, 1], sky: [0.22, 0.3, 0.44],
		amb: 0.08, fill: 0.16, kd: 1.15, shine: 34,
		ks: 0.7, rim: 0.26,
	}
}

const GLASS = {
	base: [0.05, 0.07, 0.12], tint: [0.8, 0.9, 1],
	sky: [0.34, 0.46, 0.7], amb: 0.05, fill: 0.42,
	kd: 0.2, shine: 90, ks: 2.4, rim: 1,
}

// The glasshouse and the sills: near-black, so the cabin
// reads against the paint instead of being a second shade of
// it. The first car used the livery's own two tones for body
// and cabin, and at this size that is one flat rectangle.
const TRIM = {
	base: [0.04, 0.045, 0.05], tint: [1, 1, 1],
	sky: [0.2, 0.26, 0.36], amb: 0.1, fill: 0.2,
	kd: 0.9, shine: 20, ks: 0.3, rim: 0.2,
}

// Rubber was coming out mid-grey, because a shine of 7 is a
// specular so broad it lights the whole tyre: the highlight
// term alone was contributing more than the albedo. Tight and
// weak is what makes it read as black.
const RUBBER = {
	base: [0.03, 0.03, 0.035], tint: [1, 1, 1],
	sky: [0.2, 0.26, 0.36], amb: 0.05, fill: 0.12,
	kd: 0.9, shine: 22, ks: 0.1, rim: 0.08,
}

// The hub: bright enough that a tyre reads as a tyre from
// directly above rather than as a dark dot. At four world
// units across there is no room for anything subtler.
const HUB = {
	base: [0.42, 0.43, 0.46], tint: [1, 1, 1],
	sky: [0.25, 0.3, 0.4], amb: 0.12, fill: 0.2,
	kd: 1.1, shine: 40, ks: 0.9, rim: 0.3,
}

const BARK = {
	base: [0.24, 0.15, 0.09], tint: [1, 0.95, 0.9],
	sky: [0.2, 0.24, 0.3], amb: 0.1, fill: 0.18,
	kd: 1.2, shine: 5, ks: 0.1, rim: 0.08,
}

const LEAF = {
	base: [0.13, 0.6, 0.16], tint: [0.85, 1, 0.8],
	sky: [0.18, 0.33, 0.26], amb: 0.12, fill: 0.2,
	kd: 1.45, shine: 9, ks: 0.2, rim: 0.1,
}

const CONCRETE = {
	base: [0.46, 0.45, 0.43], tint: [1, 1, 1],
	sky: [0.22, 0.28, 0.4], amb: 0.1, fill: 0.18,
	kd: 1.1, shine: 6, ks: 0.12, rim: 0.12,
}

const ROOF = {
	base: [0.26, 0.2, 0.17], tint: [1, 1, 1],
	sky: [0.2, 0.26, 0.36], amb: 0.09, fill: 0.16,
	kd: 1.1, shine: 10, ks: 0.2, rim: 0.14,
}

const LIT = {
	base: [0.95, 0.82, 0.42], tint: [1, 0.95, 0.75],
	sky: [0.5, 0.45, 0.4], amb: 0.85, fill: 0.2,
	kd: 0.3, shine: 12, ks: 0.3, rim: 0.2,
}

// A car.
//
// The first one was a box with a second box on it, both in
// the livery's own two tones, and from directly above that is
// one flat red rectangle with a sliver of blue on it. Three
// things had to change. The cabin went near-black, so it
// reads against the paint rather than blending into it. The
// wheels moved outboard of the body, because a wheel tucked
// under it is a wheel you cannot see from above. And the
// bonnet slopes, because every upward face sharing one normal
// means a uniformly lit shape with nothing on it — the slope
// is the only reason the nose is a different brightness from
// the roof.
const BODY_L = 1, BODY_H = 0.2, BODY_W = 0.42
const WHEEL_R = 0.2, WHEEL_HALF = 0.09
const WHEEL_X = 0.62, WHEEL_Z = BODY_W + 0.14

// A box with the front corners sliced off and the top sloping
// away toward the nose. The slices give the silhouette a
// direction you can read at a glance; the slope gives the
// light something to do.
function shellPlanes() {
	const p = box(BODY_L, BODY_H, BODY_W)
		.filter((q) => !(q.n[1] === 1))
	// Roof deck, then the bonnet falling away from it.
	p.push({ n: [0, 1, 0], d: BODY_H })
	const nose = unit([0.5, 1, 0])
	p.push({ n: nose, d: BODY_H * 0.86 + BODY_L * 0.2 })
	for (const side of [-1, 1]) {
		const n = unit([1, 0, side])
		const corner = (BODY_L + BODY_W) / Math.SQRT2
		p.push({ n, d: corner - 0.13 })
	}
	return p
}

function wheel(x, z) {
	return {
		// Axis Z: the axle lies across the car.
		faces: convex(prism(WHEEL_R, WHEEL_HALF, 10, 2)),
		pal: RUBBER,
		offset: [x, -BODY_H * 0.25, z],
	}
}

export function carModel(colours) {
	const shell = paint(linear(colours.shell))
	return model([
		wheel(WHEEL_X, WHEEL_Z), wheel(WHEEL_X, -WHEEL_Z),
		wheel(-WHEEL_X, WHEEL_Z), wheel(-WHEEL_X, -WHEEL_Z),
		{
			faces: convex(shellPlanes()),
			pal: shell, offset: [0, 0, 0],
		},
		// The glasshouse: a dark band across the middle with
		// the roof panel sitting inside it, which from above
		// is the whole of what says "there is a cabin here".
		{
			faces: convex(box(0.44, 0.1, 0.37)),
			pal: TRIM, offset: [-0.1, BODY_H + 0.02, 0],
		},
		{
			faces: convex(box(0.3, 0.06, 0.29)),
			pal: paint(linear(colours.body)),
			offset: [-0.18, BODY_H + 0.1, 0],
		},
		{
			faces: convex(box(0.1, 0.07, 0.3)),
			pal: GLASS, offset: [0.21, BODY_H + 0.07, 0],
		},
	])
}

// A tyre stack. Seen from directly above, only the topmost
// surface of a stack is visible at all, so the detail has to
// be on top of it: a bright hub inside a dark ring is what
// reads as a tyre at four world units across. Stacking a
// second, narrower tyre under it widens the silhouette.
export function tyreModel() {
	return model([
		{
			faces: convex(prism(1, 0.34, 10)),
			pal: RUBBER, offset: [0, 0, 0],
		},
		{
			faces: convex(prism(0.88, 0.34, 10)),
			pal: RUBBER, offset: [0, 0.6, 0],
		},
		{
			faces: convex(prism(0.4, 0.1, 8)),
			pal: HUB, offset: [0, 0.92, 0],
		},
	])
}

// A barrel stood on end: body, then a lid inset on top.
//
// The first try put a band round the middle, wider than the
// body so it would stand proud. From directly above a wider
// ring hides everything inside it, so the barrel came out as
// a dark disc with none of its colour showing at all. Nothing
// below the topmost surface is visible in a plan view, which
// is the rule the whole of this file has to respect.
export function barrelModel(colour) {
	return model([
		{
			faces: convex(prism(1, 1.1, 12)),
			pal: paint(colour), offset: [0, 0, 0],
		},
		{
			faces: convex(prism(0.72, 0.12, 12)),
			pal: paint([0.1, 0.1, 0.12]),
			offset: [0, 1.12, 0],
		},
	])
}

// A tree, seen from directly above. The first version stacked
// seven-sided cones of nearly equal radius, which from a plan
// view is a faceted lump with no silhouette to it — it read as
// one of Belt Breaker's rocks dropped in a field.
//
// What makes a canopy read from above is concentric relief: a
// wide dark skirt, a narrower tier inside it, a crown on top.
// So the radius steps have to be large, and the cones need
// enough sides to come out round rather than crystalline.
export function treeModel(bushy) {
	const parts = [{
		faces: convex(prism(0.15, 0.5, 6)),
		pal: BARK, offset: [0, 0, 0],
	}]
	const tiers = bushy ? 3 : 2
	for (let i = 0; i < tiers; i++) {
		const k = 1 - i * 0.33
		parts.push({
			faces: convex(cone(k, 0.62 * k, 11)),
			pal: LEAF,
			offset: [0, 0.22 + i * 0.36, 0],
		})
	}
	return model(parts)
}

// A building. Everything interesting about a building is on
// its walls, and from directly above a roof hides all of it —
// the first version was a plain grey rectangle for exactly
// that reason. So the detail goes on the roof instead: a
// parapet standing proud of a lower deck, a lit rooflight,
// and a vent block to throw a shadow edge across it.
export function buildingModel() {
	return model([
		{
			faces: convex(box(1, 0.6, 0.8)),
			pal: CONCRETE, offset: [0, 0, 0],
		},
		{
			faces: convex(box(0.88, 0.1, 0.68)),
			pal: ROOF, offset: [0, 0.6, 0],
		},
		{
			faces: convex(box(0.26, 0.16, 0.22)),
			pal: ROOF, offset: [-0.42, 0.72, 0.3],
		},
		{
			faces: convex(box(0.3, 0.06, 0.18)),
			pal: LIT, offset: [0.34, 0.7, -0.22],
		},
	])
}
