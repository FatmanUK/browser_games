// Dash's baked sprites.
//
// Nothing here may run at module load. js/registry.js imports
// every game's module when the launcher page opens, so baking
// a few hundred canvases for a game nobody has picked yet
// would stall the launcher — the same trap Belt Breaker's
// sprites.js warns about. getAtlas() is called once, from
// createRuntime, and the car rings bake lazily on top of that.

import { rng } from '../_shared/art.js'
import { bakeOne, ringOf, frameFor } from '../_shared/bake.js'
import { PX } from './view.js'
import {
	carModel, tyreModel, barrelModel, treeModel,
	buildingModel, faceModel,
} from './models.js'

export { frameFor }

// The camera tilt. makeRotate turns the heading about Y first,
// then tilts about X: at exactly a quarter turn, +Y (the
// model's up) comes round to face the viewer and +Z lies along
// the screen's vertical. That is a true plan view, which is
// what keeps a sprite aligned with the flat road under it —
// tilt it any less and the world would need to squash to match
// and the road is not going to.
const TOP_DOWN = { x: Math.PI / 2, z: 0 }

// 32 headings, 11.25 degrees apart. The car turns at 2.6 rad/s
// flat out, so a step lasts about 75ms — visible if you look
// for it, invisible while driving, and a third of the bake and
// the memory of the 48 Belt Breaker's ship uses at twice the
// on-screen size.
const CAR_FRAMES = 32

// World radii, in the units the track data uses. Baked at
// PX times these, because every blit happens inside the
// camera's scale (see view.js).
const CAR_R = 11

// Straight on, with no tilt: a portrait looks out of the
// panel rather than down at the road.
const HEAD_ON = { x: 0, z: 0 }
const PORTRAIT_R = 19
const SIZES = {
	tyre: 4, barrel: 4.5, tree: 15, building: 20,
}

function bake(mdl, worldR) {
	return bakeOne(mdl, worldR * PX, TOP_DOWN)
}

function barrel(colour) {
	return bake(barrelModel(colour), SIZES.barrel)
}

// Three of each scenery piece, picked by position, so a
// treeline is not one tree stamped five hundred times. The
// variants differ in shape, not just in scale.
function sceneryAtlas() {
	return {
		tyre: [bake(tyreModel(), SIZES.tyre)],
		barrel: [
			barrel([0.55, 0.22, 0.04]),
			barrel([0.6, 0.5, 0.06]),
		],
		tree: [
			bake(treeModel(true), SIZES.tree),
			bake(treeModel(false), SIZES.tree),
		],
		building: [bake(buildingModel(), SIZES.building)],
	}
}

let atlas = null

export function getAtlas() {
	if (atlas) return atlas
	atlas = { scenery: sceneryAtlas(), cars: new Map() }
	return atlas
}

// One ring per livery, built on first use. shadeFace takes the
// palette as a parameter, so a livery is the same geometry with
// a different base colour — there is no tinting pass, and there
// must not be: tinting a baked sprite tints its specular too,
// and the cars stop reading as painted metal.
export function carRing(colours) {
	const key = colours.shell + colours.body
	const cars = getAtlas().cars
	if (!cars.has(key)) {
		cars.set(key, ringOf(
			carModel(colours), CAR_FRAMES, CAR_R * PX,
			TOP_DOWN))
	}
	return cars.get(key)
}

// One portrait per driver, built on first use like the cars.
// These are drawn in the HUD, which is not inside the
// camera's scale, so they bake at their own pixel size and
// not at PX times it.
//
// Two sizes, because the standings rows are a third of the
// podium's size and a face drawn down to fourteen pixels is
// a smudge — the small one is modelled the same and baked
// small, not shrunk.
const heads = new Map()

export const ROW_R = 8

export function portrait(name, colours, r) {
	const radius = r || PORTRAIT_R
	const key = name + colours.shell + colours.body + radius
	if (!heads.has(key)) {
		heads.set(key, bakeOne(
			faceModel(name, colours), radius, HEAD_ON))
	}
	return heads.get(key)
}

// Picks a variant from a world position, so a given tree is
// always the same tree rather than flickering between them.
export function variant(list, x, y) {
	if (list.length === 1) return list[0]
	const r = rng(Math.abs(Math.round(x * 31 + y * 17)) + 1)
	return list[Math.floor(r() * list.length)]
}
