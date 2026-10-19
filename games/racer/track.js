// Builds a whole track from a seed, at load.
//
// This was a Python script, run by hand, writing a generated
// track into the repo. A level is a seed now, so it runs in
// the browser instead and no track data is committed at all.
//
// The port cannot reproduce the tracks the script made, and
// nothing could: Python's Mersenne Twister and a mulberry32
// are different streams, so the same seed gives a different
// track. What carries over is the shape of the data and every
// rule about it, which is what this was checked against.

import { rng } from '../_shared/art.js'
import {
	catmullClosed, isStarShaped, headings, turnRates,
	longestStraight, resample, differentiate, smoothOnce,
	minRadius, selfCrossings,
} from './spline.js'
import {
	locate, offsetPoint, headingAt, deltaS, wrapS,
} from './path.js'
import {
	buildHazards, buildSand, buildTreeLine,
} from './hazards.js'

export const ROAD_WIDTH = 100
export const VERGE_WIDTH = 40

// Sample spacing along the centreline. Four units is about a
// quarter of a car length, which is fine enough that a corner
// reads as a curve and coarse enough that a lap is under a
// thousand samples.
const DS = 4

// Swept rather than guessed. The old 16/550/120/0.35 gave a
// tightest corner of 15 units of radius across 60 seeds, on a
// road 100 wide — the inner kerb would have had a radius of
// minus 35, which is not a corner but a fold. Fewer control
// points and far less angular jitter is what fixes it: these
// give a tightest corner of 86 over the same seeds, with a
// median of 113 and about eight corners a lap, so the tracks
// still vary and still have bends worth braking for.
//
// The polar model never showed this because it measured the
// road radially from the centre instead of across the
// centreline, so the band stayed well-defined no matter how
// sharp the curve underneath it got.
const CONTROL_POINTS = 16
const BASE_RADIUS = 580
const RADIUS_JITTER = 60
const ANGLE_JITTER = 0.15
const PER_SEGMENT = 40
const MAX_ATTEMPTS = 50

const CAR_LENGTH = 16
const GRID_ROWS = 6
const GRID_ROW_GAP = CAR_LENGTH * 1.8
const GRID_LANE_OFFSET = ROAD_WIDTH * 0.22
const LINE_SETBACK = CAR_LENGTH * 1.2

const DEG = Math.PI / 180
const STRAIGHT_TURN = 2.2 * DEG

// Corners come off the resampled curvature now, not off runs
// of heading change in the raw spline. Curvature is per unit
// length, so the threshold is a radius. Measured across ten
// tracks: half the lap bends tighter than 630 units of radius
// and a twentieth tighter than 263, so 450 picks out about
// eight corners a lap — the bends you would name if you were
// describing the circuit to somebody.
const CORNER_K = 1 / 450
const CORNER_MIN = 40
const TWO_PI = Math.PI * 2

// Control points laid out in polar and then sorted by angle.
// The sort keeps the loop from wandering back through itself,
// which is what a track without a flyover wants.
function controlPoints(rand) {
	const step = TWO_PI / CONTROL_POINTS
	const polar = []
	for (let i = 0; i < CONTROL_POINTS; i++) {
		const a = i * step +
			(rand() * 2 - 1) * step * ANGLE_JITTER
		const r = BASE_RADIUS +
			(rand() * 2 - 1) * RADIUS_JITTER
		polar.push([((a % TWO_PI) + TWO_PI) % TWO_PI, r])
	}
	polar.sort((p, q) => p[0] - q[0])
	return polar.map(([a, r]) => ({
		x: Math.cos(a) * r, y: Math.sin(a) * r,
	}))
}

// A track that crosses over itself, built as a figure of
// eight rather than discovered by accident.
//
// The first attempt took the ordinary loop and swapped one
// adjacent pair of control points, which does make it double
// back through itself — 54 of 60 seeds crossed, and 31 of
// those crossed steeply enough to bridge. It was still no
// good: the double-back is a hairpin of about 5 units of
// radius on a road 100 wide, which is not a corner but a
// fold, and no amount of relaxing fixed it (median radius 5
// before smoothing and 5 after). Two cleverer variations on
// the swap were worse.
//
// The lemniscate of Gerono has the crossing built into it.
// x = A cos t, y = B sin t cos t passes through the origin at
// t = pi/2 and 3pi/2 and nowhere else, so there is exactly one
// crossing, its angle is set by the ratio A:B rather than by
// luck, and both lobes are as wide as the track is big.
// Measured over 60 seeds: one crossing every time, at 53
// degrees every time, median tightest corner 97.
//
// The variety comes from two low-frequency harmonics and a
// rotation. Per-point jitter, which is what the plain loop
// uses, puts a kink at the scale of one control point and
// drops the tightest corner from 97 to 37.
const LOBE_X = 840
const LOBE_Y = 450
const WOBBLE = 0.08

function figureEight(rand) {
	const harm = [2, 3].map((k) => ({
		k, a: (rand() * 2 - 1) * WOBBLE, p: rand() * TWO_PI,
	}))
	const spin = rand() * TWO_PI
	const cos = Math.cos(spin), sin = Math.sin(spin)
	const out = []
	for (let i = 0; i < CONTROL_POINTS; i++) {
		const t = (i / CONTROL_POINTS) * TWO_PI
		let j = 1
		for (const h of harm) {
			j += h.a * Math.sin(h.k * t + h.p)
		}
		const x = LOBE_X * Math.cos(t) * j
		const y = LOBE_Y * Math.sin(t) * Math.cos(t) * j
		out.push({
			x: x * cos - y * sin,
			y: x * sin + y * cos,
		})
	}
	return out
}

function centreline(rand, wantJump) {
	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		const pts = wantJump
			? figureEight(rand) : controlPoints(rand)
		const dense = catmullClosed(pts, PER_SEGMENT)
		// A plain loop has to be star-shaped: the cheapest
		// guarantee that it does not cross by accident.
		if (wantJump || isStarShaped(dense)) return dense
	}
	return null
}



function gridFor(dense, heads, straight) {
	const n = dense.length
	const idx = (straight.start +
		Math.max(1, Math.round(straight.len * 0.7))) % n
	const dir = heads[idx]
	const dx = Math.cos(dir), dy = Math.sin(dir)
	const px = -dy, py = dx
	const lx = dense[idx].x - dx * LINE_SETBACK
	const ly = dense[idx].y - dy * LINE_SETBACK
	const slots = []
	for (let row = 0; row < GRID_ROWS; row++) {
		const back = (row + 1) * GRID_ROW_GAP
		const side = row % 2 === 0
			? GRID_LANE_OFFSET : -GRID_LANE_OFFSET
		slots.push({
			x: lx - dx * back + px * side,
			y: ly - dy * back + py * side,
			angle: dir,
		})
	}
	return { start: { x: lx, y: ly, angle: dir }, slots }
}



// Twelve gates evenly spaced round the lap, each a point on
// the road's centreline. A lap counts only if every one of
// them was passed ON the road, which is the whole anti-cut
// rule: swept angle alone cannot tell a lap from a straight
// line across the infield, because the shortcut sweeps the
// same angle the long way round does.
const MIN_RADIUS = (ROAD_WIDTH / 2) * 1.7
const SMOOTH_PASSES = 60
const SMOOTH_ALPHA = 0.35

// A safety net under the tuned control points above, not the
// main defence: a seed that still comes out too sharp gets
// relaxed until it clears, and one that will not relax is
// rejected by assemble.
function relax(pts, ds) {
	let cur = pts
	for (let i = 0; i < SMOOTH_PASSES; i++) {
		const d = differentiate(cur, ds)
		if (minRadius(d.k) >= MIN_RADIUS) break
		cur = smoothOnce(cur, SMOOTH_ALPHA)
	}
	return cur
}

// The arc-length half of a track: the centreline resampled to
// even spacing, with tangents and signed curvature. This is
// what everything that drives on the track actually uses; the
// radius tables are only still here because the generator
// places its scenery in polar terms.
function pathOf(dense) {
	let r = resample(dense, DS)
	// Smoothing shortens the loop, so resample again to get
	// the even spacing the whole model depends on back.
	r = resample(relax(r.pts, r.ds), DS)
	const d = differentiate(r.pts, r.ds)
	return {
		n: r.pts.length,
		ds: r.ds,
		L: r.pts.length * r.ds,
		px: Float64Array.from(r.pts, (p) => p.x),
		py: Float64Array.from(r.pts, (p) => p.y),
		ux: Float64Array.from(d.ux),
		uy: Float64Array.from(d.uy),
		k: Float64Array.from(d.k),
		halfWidth: ROAD_WIDTH / 2,
		vergeWidth: VERGE_WIDTH,
		boundOff: ROAD_WIDTH / 2 + VERGE_WIDTH,
	}
}

// Anything the generator placed in polar terms gets its arc
// length attached here, once, rather than every frame.
// The arc length of an arbitrary point, by a search over the
// whole centreline. Only used while building a track — during
// play the windowed locate() answers this, and it has to,
// because a global search cannot tell the two branches of a
// crossing apart.
function atS(track, x, y) {
	let best = null
	for (let i = 0; i < track.n; i++) {
		const dx = x - track.px[i], dy = y - track.py[i]
		const d2 = dx * dx + dy * dy
		if (best && d2 >= best.d2) continue
		best = { d2, i }
	}
	return locate(track, x, y, best.i * track.ds)
}



// The centreline is traced in whichever direction the spline
// happened to run, and the grid may face the other way. Arc
// length has to increase the way the cars go or every
// lookahead in the game points backwards, so the samples are
// reversed rather than every consumer being made to care.
function orientToTravel(track, grid) {
	const at = atS(track, grid.start.x, grid.start.y)
	if (Math.cos(headingAt(track, at.s) -
			grid.start.angle) < 0) {
		const rev = (a) => Float64Array.from(a).reverse()
		track.px = rev(track.px)
		track.py = rev(track.py)
		track.ux = rev(track.ux).map((v) => -v)
		track.uy = rev(track.uy).map((v) => -v)
		track.k = rev(track.k).map((v) => -v)
	}
	track.START = grid.start
	track.GRID_SLOTS = grid.slots
	track.START.s = atS(track, grid.start.x, grid.start.y).s
	for (const g of grid.slots) g.s = atS(track, g.x, g.y).s
	return track
}




// A seed that fails every check is a track that cannot be
// played, and with a level mapped to a seed the player has no
// way to ask for another. So the retry walks the seed rather
// than giving up — the level still lands on a fixed track,
// just not always the first one tried.
// Runs of curvature above the threshold. Each carries where
// it is, how long it runs, how sharp it gets and which way it
// bends — all four of which the old generator computed and
// then threw all but two of away.
function findCorners(track) {
	const out = []
	let i = 0
	while (i < track.n) {
		if (Math.abs(track.k[i]) < CORNER_K) { i++; continue }
		const start = i
		const sign = Math.sign(track.k[i])
		let peak = 0
		while (i < track.n &&
				Math.abs(track.k[i]) >= CORNER_K &&
				Math.sign(track.k[i]) === sign) {
			peak = Math.max(peak, Math.abs(track.k[i]))
			i++
		}
		const len = (i - start) * track.ds
		if (len < CORNER_MIN) continue
		out.push({
			s: (start + (i - start) / 2) * track.ds,
			len,
			severity: peak,
			dir: sign,
		})
	}
	return out
}

// A chevron before a corner sharp enough to need one. Most of
// what the curvature pass finds is a kink you drive straight
// through, and an arrow at every one would mean nothing.
const ARROW_K = 1 / 260
const ARROW_LEAD = 60

function buildArrows(corners) {
	return corners
		.filter((c) => c.severity >= ARROW_K)
		.map((c) => ({
			s: c.s - c.len / 2 - ARROW_LEAD,
			dir: c.dir,
			hard: c.severity >= 1 / 180,
		}))
}

// Gates evenly spaced in arc length from the line, which is
// what "evenly spaced round the lap" should always have meant.
const GATE_COUNT = 12

function buildGates(track) {
	const out = []
	for (let i = 0; i < GATE_COUNT; i++) {
		out.push(
			(track.START.s + (i / GATE_COUNT) * track.L) %
				track.L)
	}
	return out
}

// Missile pickups, offset side to side so collecting one is a
// line choice rather than something that happens to you.
const PICKUP_COUNT = 8

function buildPickups(track) {
	const out = []
	for (let i = 1; i <= PICKUP_COUNT; i++) {
		const s = track.START.s +
			(i / (PICKUP_COUNT + 1)) * track.L
		const off = (i % 3 - 1) * track.halfWidth * 0.45
		const p = offsetPoint(track, s, off)
		out.push({ x: p.x, y: p.y, s, off })
	}
	return out
}

// Turning a crossing into a flyover.
//
// The two branches meet at an angle, and the shallower that
// angle the longer the stretch where the road bands lie on top
// of each other: a road 100 wide crossed at 30 degrees overlaps
// for 200 units. The branch that goes over has to clear all of
// it, so the overlap is what sets the length of the jump.
//
// Which branch goes over is decided by how straight it is
// there. A ramp on a straight is drivable; a ramp mid-corner
// is not.
const MIN_SIN = 0.42
const CROSS_MIN_GAP = 0.16
const RAMP_LEN = 34
const LINE_CLEAR = 220

function branchFlatness(track, i) {
	let sum = 0
	const span = 14
	for (let d = -span; d <= span; d++) {
		const j = ((i + d) % track.n + track.n) % track.n
		sum += Math.abs(track.k[j])
	}
	return sum / (span * 2 + 1)
}

function crossingToJump(track, h, id) {
	const dot = track.ux[h.i] * track.ux[h.j] +
		track.uy[h.i] * track.uy[h.j]
	const sin = Math.sqrt(Math.max(0, 1 - dot * dot))
	if (sin < MIN_SIN) return null
	const si = h.i * track.ds
	const sj = h.j * track.ds
	if (Math.abs(deltaS(track, si, sj)) <
			CROSS_MIN_GAP * track.L) {
		return null
	}
	for (const s of [si, sj]) {
		if (Math.abs(deltaS(track, track.START.s, s)) <
				LINE_CLEAR) {
			return null
		}
	}
	// Flatter branch flies; the other one passes underneath.
	const overI = branchFlatness(track, h.i) <=
		branchFlatness(track, h.j)
	const over = overI ? si : sj
	const under = overI ? sj : si
	const span = track.ROAD_WIDTH / sin
	return {
		id,
		s0: wrapS(track, over - span / 2 - RAMP_LEN),
		s1: wrapS(track, over + span / 2 + RAMP_LEN),
		mid: over,
		span: span + RAMP_LEN * 2,
		under,
		underSpan: span,
	}
}

function buildJumps(track) {
	const pts = []
	for (let i = 0; i < track.n; i++) {
		pts.push({ x: track.px[i], y: track.py[i] })
	}
	const hits = selfCrossings(pts, 30)
	if (!hits.length || hits.length > 2) return null
	const jumps = []
	for (const h of hits) {
		const j = crossingToJump(track, h, jumps.length)
		if (!j) return null
		jumps.push(j)
	}
	return jumps
}

function assemble(seed, dense, wantJumps) {
	const path = pathOf(dense)
	// An undrivable corner is a level nobody can finish, and
	// the seed walk can simply try another one.
	if (minRadius(path.k) < MIN_RADIUS) return null
	const heads = headings(dense)
	const straight = longestStraight(
		turnRates(heads), STRAIGHT_TURN)
	if (straight.len < 6) return null
	const track = Object.assign(path, {
		TRACK_ID: seed,
		ROAD_WIDTH, VERGE_WIDTH,
	})
	orientToTravel(track, gridFor(dense, heads, straight))
	track.JUMPS = wantJumps ? buildJumps(track) : []
	if (track.JUMPS === null) return null
	return populate(track, seed)
}

function populate(track, seed) {
	track.CORNERS = findCorners(track)
	if (!track.CORNERS.length) return null
	track.ARROWS = buildArrows(track.CORNERS)
	track.GATES = buildGates(track)
	track.PICKUPS = buildPickups(track)
	const rand = rng((seed ^ 0x5be5) >>> 0)
	const h = buildHazards(track, rand, track.CORNERS)
	track.HARD_OBSTACLES = h.obstacles
	track.WATER_HAZARDS = h.water
	track.SAND_WEDGES = buildSand(track, rand)
	track.TREE_LINE = buildTreeLine(track)
	for (const o of track.HARD_OBSTACLES) {
		o.s = atS(track, o.x, o.y).s
	}
	return track
}

// A seed that fails every check is a level nobody can play,
// and a level is a fixed seed, so the player cannot ask for
// another. The walk tries a crossing track first and falls
// back to a plain loop rather than giving up: a level without
// a jump is a disappointment, a level that throws is a broken
// game.
export function buildTrack(seed) {
	for (let k = 0; k < 60; k++) {
		const s = (seed + k * 7919) >>> 0
		const dense = centreline(rng(s), true)
		if (!dense) continue
		const track = assemble(s, dense, true)
		if (track) return track
	}
	for (let k = 0; k < 40; k++) {
		const s = (seed + k * 7919) >>> 0
		const dense = centreline(rng(s), false)
		if (!dense) continue
		const track = assemble(s, dense, false)
		if (track) return track
	}
	return null
}
