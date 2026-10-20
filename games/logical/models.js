// Wheelworks' geometry and materials.
//
// A wheel is a hub with four arms radiating from it, and the
// four gaps between the arms are the slots a marble sits in.
// Drawing it instead — a circle with four smaller circles cut
// out of it — reads as a diagram of a wheel rather than a
// wheel, which is the same thing Dash's models.js says about
// its cars. These are solids, flat-shaded face by face against
// a fixed light (games/_shared/mesh.js).
//
// Authored in unit-ish coordinates and normalised to a pixel
// radius when baked, so the numbers here are proportions.
//
// The axis convention is forced by makeRotate, which spins
// about Y first and tilts about X second: at a quarter turn of
// tilt, +Y comes round to face the viewer and the spin becomes
// rotation in the screen plane. So a wheel is authored lying
// in the X-Z plane with its axle up the Y axis — the rig
// games/racer/sprites.js calls TOP_DOWN.

import { cone, convex, unit } from '../_shared/mesh.js'
import { model } from '../_shared/bake.js'

// Low diffuse under a bright tight specular is what makes
// metal; the broken one keeps the geometry and loses the
// polish, because a wheel that has been used up should read as
// burnt iron at a glance and not as a wheel in another colour.
// Lit for a light board. The first set of these was tuned
// against a near-black ground, where a median face luminance
// of 95 reads as metal; on paper at 238 the same wheel is a
// dark blob with holes in it. Ambient does most of the lifting
// — scaling the base alone keeps the dark faces dark — and the
// speculars come down, because a hot highlight over a bright
// diffuse clips to a white blob rather than reading as shine.
const STEEL = {
	base: [1, 1.12, 1.32], tint: [1, 1, 1],
	sky: [0.3, 0.38, 0.5], amb: 0.5, fill: 0.3,
	kd: 0.5, shine: 50, ks: 0.8, rim: 0.22,
}

const BRASS = {
	base: [1.36, 0.99, 0.36], tint: [1, 0.86, 0.5],
	sky: [0.4, 0.4, 0.42], amb: 0.5, fill: 0.3,
	kd: 0.55, shine: 52, ks: 0.8, rim: 0.2,
}

// Cold against the brass, and matte against its shine: at
// seventy pixels a player is reading hue and brightness, not
// detail, so a used-up wheel has to be a different colour
// temperature rather than a darker version of the same one.
// Enough slope is kept on both to shade — a broken wheel still
// turns, and its heading still has to be readable.
const BURNT = {
	base: [0.72, 0.78, 0.9], tint: [0.7, 0.75, 0.85],
	sky: [0.2, 0.26, 0.36], amb: 0.46, fill: 0.26,
	kd: 0.6, shine: 12, ks: 0.16, rim: 0.06,
}

const ASH = {
	base: [0.38, 0.45, 0.58], tint: [0.5, 0.56, 0.66],
	sky: [0.18, 0.24, 0.34], amb: 0.42, fill: 0.3,
	kd: 0.6, shine: 10, ks: 0.14, rim: 0.05,
}

// A bar lying in the X-Z plane along (ax, az). box() only
// builds axis-aligned planes, and the arms have to sit on the
// diagonals — the slots are at the compass points, because
// that is where the run mouths are — so the four side planes
// are written out at the angle wanted.
//
// `pitch` replaces the flat top with two sloped ones meeting
// at a ridge along the bar. Without it every top face has the
// same normal, and since the axle points at the viewer and the
// light never moves, every one of them shades to the same
// grey: a wheel drawn as a flat grey X. A roof is the cheapest
// thing that gives each arm two faces at different angles, and
// it is what makes the rotation visible at all.
function bar(ax, az, half, hy, hw, pitch) {
	const px = -az
	const pz = ax
	const planes = [
		{ n: [ax, 0, az], d: half },
		{ n: [-ax, 0, -az], d: half },
		{ n: [px, 0, pz], d: hw },
		{ n: [-px, 0, -pz], d: hw },
		{ n: [0, -1, 0], d: hy },
	]
	if (!pitch) {
		planes.push({ n: [0, 1, 0], d: hy })
		return planes
	}
	const sn = Math.sin(pitch)
	const cs = Math.cos(pitch)
	planes.push(
		{ n: unit([px * sn, cs, pz * sn]), d: cs * hy },
		{ n: unit([-px * sn, cs, -pz * sn]), d: cs * hy })
	return planes
}

// Sixteen facets on the body and everything else in fours, so
// the whole solid maps onto itself every quarter turn — which
// is what lets sprites.js bake ninety degrees of frames
// instead of three hundred and sixty.
const SIDES = 16
const PITCH = 0.33

const LUG_R = 0.58
const LUG_HALF = 0.3
const LUG_HW = 0.15

// The body is a shallow faceted dome, not a ring of spokes. A
// spoked version was built first and read as a grey X with
// blobs on it: a wheel needs a face for the slots to be cut
// into, and four arms with four gaps is a wheel with no face.
// The slots are cut back in by render.js, as pockets drawn at
// the compass points — a circle looks the same at every
// heading, so it is the one thing that may be drawn rather
// than baked without the shading going wrong.
function disc(pal, r, h) {
	return {
		faces: convex(cone(r, h, SIDES)),
		pal,
		offset: [0, -h * 0.5, 0],
	}
}

// Four lugs on the diagonals, which is where there is room for
// them. Without something off-centre the body is very nearly
// symmetric about its axle, and the one thing the player most
// needs to read — which way the wheel is facing, mid-turn — is
// the thing a symmetric body cannot show.
function lug(pal, i, y, hy) {
	const a = (i + 0.5) * (Math.PI / 2)
	const d = unit([Math.cos(a), 0, Math.sin(a)])
	const planes = bar(
		d[0], d[2], LUG_HALF, hy, LUG_HW, PITCH)
	return {
		faces: convex(planes),
		pal,
		offset: [d[0] * LUG_R, y, d[2] * LUG_R],
	}
}

export function intactWheel() {
	const parts = [disc(BRASS, 0.98, 0.4)]
	for (let i = 0; i < 4; i++) {
		parts.push(lug(STEEL, i, 0.16, 0.1))
	}
	return model(parts)
}

// Used up: the dome has collapsed to a low mound and the lugs
// to flat stubs with no shine on them. It still works exactly
// as the other does — it accepts, it turns, it breaks again —
// but nothing about the surface says so, which is the point.
export function brokenWheel() {
	const parts = [disc(ASH, 0.94, 0.12)]
	for (let i = 0; i < 4; i++) {
		parts.push(lug(BURNT, i, 0.05, 0.035))
	}
	return model(parts)
}
