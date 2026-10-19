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
import { lerpArray, travelDir } from './geom.js'
import {
	catmullClosed, isStarShaped, headings, turnRates,
	longestStraight, unwrapped, wrapDelta, resample,
	differentiate, smoothOnce, minRadius,
} from './spline.js'
import { locate, offsetPoint, headingAt } from './path.js'
import {
	buildHazards, buildSand, buildTreeLine,
} from './hazards.js'

export const ANGLE_STEPS = 720
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
const CONTROL_POINTS = 14
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
const CORNER_TURN = 0.9 * DEG
const CORNER_MIN_RUN = 10
const TWO_PI = Math.PI * 2

// Control points laid out in polar and then sorted by angle.
// The sort is what makes the curve star-shaped by
// construction rather than by luck — without it the loop
// doubles back on itself and the radius tables below stop
// being able to describe it at all.
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

function centreline(rand) {
	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		const dense = catmullClosed(
			controlPoints(rand), PER_SEGMENT)
		if (isStarShaped(dense)) return dense
	}
	return null
}

// One radius per evenly spaced angle. The curve is extended by
// a full turn either side first, so interpolating across the
// 0/2pi seam never has to special-case the ends of the array.
function radiusLookup(dense) {
	const un = unwrapped(dense)
	const radii = dense.map((p) => Math.hypot(p.x, p.y))
	const span = []
	const spanR = []
	for (const shift of [-TWO_PI, 0, TWO_PI]) {
		for (let i = 0; i < un.length; i++) {
			span.push(un[i] + shift)
			spanR.push(radii[i])
		}
	}
	const table = []
	for (let k = 0; k < ANGLE_STEPS; k++) {
		const target = (k * TWO_PI) / ANGLE_STEPS
		let lo = 1, hi = span.length - 1
		while (lo < hi) {
			const mid = (lo + hi) >> 1
			if (span[mid] < target) lo = mid + 1
			else hi = mid
		}
		const a0 = span[lo - 1], a1 = span[lo]
		const f = a1 === a0 ? 0 : (target - a0) / (a1 - a0)
		table.push(spanR[lo - 1] +
			(spanR[lo] - spanR[lo - 1]) * f)
	}
	return table
}

// The script never checked this, and the one track it left in
// the repo happens to be fine, so it never showed. The grid is
// laid straight back along the start straight's tangent, six
// rows at 28.8 apart — 172 units of it — and a straight that
// only just passed the length test puts the back rows round
// the bend behind it and off the road entirely. Cheaper to
// reject the track than to shuffle the grid about.
function gridOnRoad(slots, t) {
	return slots.every((g) => {
		const a = Math.atan2(g.y, g.x)
		const d = Math.hypot(g.x, g.y)
		return d > lerpArray(t.inner, a) + 4 &&
			d < lerpArray(t.outer, a) - 4
	})
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
	// The cleared angle is centred on the middle of the grid,
	// not on the line. The grid runs 172 units back from the
	// line, which at this radius is most of the clearance, so
	// centring on the line left the back of the field inside
	// the zone and hazards could land among the rear rows.
	const mid = slots.reduce(
		(a, g) => ({ x: a.x + g.x / 6, y: a.y + g.y / 6 }),
		{ x: 0, y: 0 })
	return {
		start: { x: lx, y: ly, angle: dir },
		slots,
		lineAngle: Math.atan2(mid.y, mid.x),
	}
}

// Runs of consecutive turning. The script threw away both the
// sign and the severity of each run; the arrows want a
// direction and the AI wants to know a hairpin from a kink, so
// both are kept here.
// Which way the corner bends. The script took abs() of every
// turn rate and threw the sign away; an arrow pointing the
// wrong way round a bend is worse than no arrow.
function turnSign(heads, start, end) {
	return Math.sign(wrapDelta(heads[start], heads[end])) || 1
}

function buildCorners(dense, heads) {
	const n = heads.length
	const turn = turnRates(heads)
	const out = []
	let i = 0
	while (i < n) {
		if (turn[i] < CORNER_TURN) { i++; continue }
		const start = i
		let peak = 0
		while (i < n && turn[i] >= CORNER_TURN) {
			peak = Math.max(peak, turn[i]); i++
		}
		if (i - start < CORNER_MIN_RUN) continue
		const a0 = Math.atan2(
			dense[start].y, dense[start].x)
		const a1 = Math.atan2(
			dense[i - 1].y, dense[i - 1].x)
		const span = wrapDelta(a0, a1)
		if (span <= 0) continue
		out.push({
			angle: (a0 + span / 2) % TWO_PI,
			spread: span / 2,
			severity: peak,
			dir: turnSign(heads, start, i - 1),
		})
	}
	return out
}

// Twelve gates evenly spaced round the lap, each a point on
// the road's centreline. A lap counts only if every one of
// them was passed ON the road, which is the whole anti-cut
// rule: swept angle alone cannot tell a lap from a straight
// line across the infield, because the shortcut sweeps the
// same angle the long way round does.
const GATE_COUNT = 12

function buildGates(start, travel) {
	const base = Math.atan2(start.y, start.x)
	const gates = []
	for (let i = 0; i < GATE_COUNT; i++) {
		const a = base + travel * (i / GATE_COUNT) * TWO_PI
		gates.push(((a % TWO_PI) + TWO_PI) % TWO_PI)
	}
	return gates
}

// A chevron painted on the road before a corner, pointing the
// way it bends. Only for the ones worth warning about: the
// curvature pass finds eleven-odd runs a lap and most are
// kinks you drive straight through.
const ARROW_SEVERITY = 2.6 * DEG
const ARROW_LEAD = 0.1

function buildArrows(corners, travel) {
	return corners
		.filter((c) => c.severity >= ARROW_SEVERITY)
		.map((c) => ({
			angle: c.angle -
				travel * (c.spread + ARROW_LEAD),
			dir: c.dir,
			hard: c.severity >= ARROW_SEVERITY * 1.8,
		}))
}

// Missile pickups, spread round the lap and offset side to
// side so collecting them is a line choice rather than
// something that happens to you on the way past.
const PICKUP_COUNT = 8

function buildPickups(track, start, travel) {
	const base = Math.atan2(start.y, start.x)
	const out = []
	for (let i = 1; i <= PICKUP_COUNT; i++) {
		const f = i / (PICKUP_COUNT + 1)
		const a = base + travel * f * TWO_PI
		const lane = 0.3 + (i % 3) * 0.2
		const inner = lerpArray(track.inner, a)
		const outer = lerpArray(track.outer, a)
		const r = inner + (outer - inner) * lane
		out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
	}
	return out
}

// The tightest corner a 100-wide road can have and still be a
// road. Below the half-width the inner kerb has a negative
// radius and the surface folds through itself; 1.7 times it
// leaves a corner that is tight but drivable.
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

function assemble(seed, dense) {
	const centre = radiusLookup(dense)
	const t = {
		inner: centre.map((r) => r - ROAD_WIDTH / 2),
		outer: centre.map((r) => r + ROAD_WIDTH / 2),
	}
	t.bound = t.outer.map((r) => r + VERGE_WIDTH)
	const heads = headings(dense)
	const straight = longestStraight(
		turnRates(heads), STRAIGHT_TURN)
	if (straight.len < 6) return null
	const grid = gridFor(dense, heads, straight)
	if (!gridOnRoad(grid.slots, t)) return null
	const corners = buildCorners(dense, heads)
	if (!corners.length) return null
	return finish(seed, dense, t, grid, corners)
}

// The second half of assemble, split only to keep both halves
// inside forty lines.
function finish(seed, dense, t, grid, corners) {
	const travel = travelDir(grid.start)
	const hz = rng((seed ^ 0x5be5) >>> 0)
	const h = buildHazards(t, hz, grid.lineAngle, corners)
	const path = pathOf(dense)
	// Last line of defence: an undrivable corner is a level
	// nobody can finish, and the seed walk can simply try
	// another one.
	if (minRadius(path.k) < MIN_RADIUS) return null
	const track = Object.assign(path, {
		TRACK_ID: seed,
		ANGLE_STEPS, ROAD_WIDTH, VERGE_WIDTH,
		INNER_RADIUS: t.inner,
		OUTER_RADIUS: t.outer,
		BOUND_RADIUS: t.bound,
		HARD_OBSTACLES: h.obstacles,
		WATER_HAZARDS: h.water,
		SAND_WEDGES: buildSand(hz, grid.lineAngle),
		TREE_LINE: buildTreeLine(t.bound),
		CORNERS: corners,
		START: grid.start,
		GRID_SLOTS: grid.slots,
		TRAVEL_DIR: travel,
		PICKUPS: buildPickups(t, grid.start, travel),
		ARROWS: buildArrows(corners, travel),
	})
	return attachArcLength(track)
}

// The centreline is traced in whichever direction the spline
// happened to run, and the grid may face the other way. Arc
// length has to increase the way the cars go or every
// lookahead in the game points backwards, so the samples are
// reversed rather than every consumer being made to care.
function orientToTravel(track) {
	const at = atS(track, track.START.x, track.START.y)
	const h = headingAt(track, at.s)
	const d = Math.cos(h - track.START.angle)
	if (d >= 0) return track
	const rev = (a) => Float64Array.from(a).reverse()
	track.px = rev(track.px)
	track.py = rev(track.py)
	track.ux = rev(track.ux).map((v) => -v)
	track.uy = rev(track.uy).map((v) => -v)
	track.k = rev(track.k).map((v) => -v)
	return track
}

function attachArcLength(track) {
	orientToTravel(track)
	const sOf = (p) => atS(track, p.x, p.y).s
	track.START.s = sOf(track.START)
	for (const g of track.GRID_SLOTS) g.s = sOf(g)
	for (const p of track.PICKUPS) p.s = sOf(p)
	track.GATES = buildGatesS(track)
	for (const a of track.ARROWS) {
		const p = pointAtAngle(track, a.angle)
		a.s = sOf(p)
	}
	for (const c of track.CORNERS) {
		c.s = sOf(pointAtAngle(track, c.angle))
		c.len = c.spread * 2 * track.L / (Math.PI * 2)
	}
	// Sand sits in the verge over a stretch of the lap, and a
	// stretch is an arc length. As an angular wedge it bunched
	// up wherever the track ran close to the centre and spread
	// out where it ran wide, for no reason anyone could see.
	for (const w of track.SAND_WEDGES) {
		w.s = sOf(pointAtAngle(track, w.angle))
		w.half = w.spread * track.L / (Math.PI * 2)
		w.side = w.angle % 2 < 1 ? 1 : -1
	}
	// Obstacles and water keep their arc length too, so the
	// drawing can cull by it without a distance test.
	for (const o of track.HARD_OBSTACLES) o.s = sOf(o)
	for (const o of track.WATER_HAZARDS) o.s = sOf(o)
	return track
}

// Gates evenly spaced in arc length from the start line, which
// is what "evenly spaced round the lap" should always have
// meant: evenly spaced in angle bunches them up wherever the
// track runs close to the centre.
function buildGatesS(track) {
	const out = []
	for (let i = 0; i < GATE_COUNT; i++) {
		out.push((track.START.s + (i / GATE_COUNT) * track.L)
			% track.L)
	}
	return out
}

function pointAtAngle(track, angle) {
	const r = lerpArray(track.INNER_RADIUS, angle) +
		ROAD_WIDTH / 2
	return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
}

// A seed that fails every check is a track that cannot be
// played, and with a level mapped to a seed the player has no
// way to ask for another. So the retry walks the seed rather
// than giving up — the level still lands on a fixed track,
// just not always the first one tried.
export function buildTrack(seed) {
	for (let k = 0; k < 40; k++) {
		const s = (seed + k * 7919) >>> 0
		const dense = centreline(rng(s))
		if (!dense) continue
		const track = assemble(s, dense)
		if (track) return track
	}
	return null
}
