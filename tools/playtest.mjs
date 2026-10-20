#!/usr/bin/env node
// Wheelworks' playtest harness: builds every level, audits the
// layouts, then plays them all with a random-but-legal
// auto-player and checks that nothing impossible happens.
//
// Node rather than Python, which is what the other tools here
// are, and deliberately: this imports games/logical/*.js and
// plays the real rules. A Python reimplementation would be a
// second opinion about how marbles move, and a second opinion
// is exactly how a generator comes to bless a level the
// runtime cannot play. Needs node; nothing else in the repo
// does, so this is the one tool that will not run without it.
//
// Every check here is one that has already caught something:
//
//   layout      spurs ending at nothing, which made runs that
//               stopped in mid-air
//   conserved   marbles lost or duplicated in a handoff
//   wrong side  a marble that landed exactly on a wheel's rim
//               walked through the middle and out the far side
//   gutter      a marble bouncing back up a feed pipe reset the
//               feed clock, so the gutter stopped producing
//
// --solve N additionally plays the first N levels with a
// player that is trying to win rather than to rattle the
// board, and reports how many it clears and how near the
// gutter clock ever came. That is the balance question, and it
// is a baseline rather than a verdict: this player is greedy
// and plans one wheel ahead, so levels it cannot finish are
// not thereby proved too hard.
//
//   tools/playtest.mjs [--levels N] [--seeds N] [--seconds N]
//                      [--solve N]
//
// Exits non-zero if any check fails, so it can be wired to CI
// later without changing anything here.

import { buildLevel } from '../games/logical/level.js'
import { tierFor } from '../games/logical/tiers.js'
import { codeFor } from '../games/logical/code.js'
import { newGame, update } from '../games/logical/world.js'
import {
	canFire, fireSlot, slotDir,
} from '../games/logical/travel.js'
import {
	alignedSlot, isTurning, nudge,
} from '../games/logical/wheel.js'
import {
	COLS, ROWS, WHEEL_R, accepts, along, at, back, carries,
	wheelAt,
} from '../games/logical/board.js'

const FX = [
	'slot', 'bounce', 'fire', 'refuse', 'feed', 'accept',
	'paint', 'divert', 'breakWheel', 'dump', 'levelClear',
	'gameOver', 'patternOn', 'patternOff', 'turn',
]

const DT = 1 / 60

function options(argv) {
	const opt = { levels: 100, seeds: 2, seconds: 60, solve: 0 }
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i].replace(/^--/, '')
		if (!(key in opt)) continue
		const n = parseInt(argv[i + 1], 10)
		opt[key] = Number.isFinite(n) ? Math.max(0, n) : 1
	}
	return opt
}

function stubFx() {
	const fx = {}
	for (const name of FX) fx[name] = () => {}
	return fx
}

function rngOf(seed) {
	let a = seed >>> 0
	return () => {
		a = (a * 1664525 + 1013904223) >>> 0
		return a / 4294967296
	}
}

// A run that stops at nothing. Spurs used to be built on
// purpose to manufacture crossings and left sidings a marble
// had to be fired back out of.
function cellDeadEnds(grid, c, r) {
	const cell = at(grid, c, r)
	if (!cell || cell.kind === 'wheel') return 0
	let n = 0
	for (let d = 0; d < 4; d++) {
		if (!carries(cell, d)) continue
		if (accepts(grid, c, r, d).act === 'bounce') n++
	}
	return n
}

function deadEnds(level) {
	let n = 0
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			n += cellDeadEnds(level.grid, c, r)
		}
	}
	return n
}

function countMarbles(st) {
	let n = st.transit.length + (st.gutter ? 1 : 0)
	for (const w of st.wheels) {
		for (const s of w.slots) if (s !== null) n++
	}
	return n
}

// Inside a wheel cell, past its middle, pointing at something
// that cannot take it: the marble is on the side of the wheel
// it could never have reached.
function wrongSide(st, m) {
	const cell = at(st.grid, m.c, m.r)
	if (!cell) return true
	if (cell.kind !== 'wheel') return false
	if (along(m) <= WHEEL_R) return false
	return accepts(st.grid, m.c, m.r, m.dir).act === 'bounce'
}

// Fire something, or turn something. Not trying to win — just
// to keep the board busy enough to exercise the rules.
function fiddle(st, rand, fx) {
	const w = st.wheels[(rand() * st.wheels.length) | 0]
	if (rand() < 0.45) {
		nudge(w)
		return
	}
	for (let k = 0; k < 4; k++) {
		if (!canFire(st, w, k)) continue
		fireSlot(st, w, k, fx)
		return
	}
}

function tally(out, st, empty) {
	out.marbleFrames += st.transit.length
	out.emptyLane = Math.max(out.emptyLane, empty)
}

function play(level, seed, seconds, out) {
	const fx = stubFx()
	const st = newGame(level, 0)
	// The clock is the only way to lose, and losing early
	// would stop the run before it had tested anything. With
	// it disabled, a lane that stays empty is a stalled feed
	// rather than a game that ended.
	st.gutterMs = 10 * 60 * 1000
	st.gutterLeft = st.gutterMs
	const rand = rngOf(seed)
	let acc = 0
	let emptySince = null
	for (let i = 0; i < seconds * 60; i++) {
		update(st, DT, fx)
		if (st.phase !== 'play') break
		const t = i * DT
		if (st.gutter) emptySince = null
		else if (emptySince === null) emptySince = t
		const idle = emptySince === null ? 0 : t - emptySince
		tally(out, st, idle)
		for (const m of st.transit) {
			if (wrongSide(st, m)) out.wrongSide++
		}
		const want = st.marblesIn - st.destroyed
		if (countMarbles(st) !== want) out.lost++
		acc += DT
		if (acc > 0.11) {
			acc = 0
			fiddle(st, rand, fx)
		}
	}
	out.frames += seconds * 60
}

function auditLayout(n, out) {
	const level = buildLevel(n)
	if (!level) {
		out.unbuildable.push(n)
		return null
	}
	const ends = deadEnds(level)
	if (ends) out.deadEnds.push(`L${n} (${codeFor(n)}): ${ends}`)
	const tier = tierFor(n)
	if (level.wheels.length < tier.wheels) out.shortOfTarget++
	if (level.feeds.length < tier.feeds) {
		out.shortOfFeeds.push(n)
	}
	return level
}

function report(out, opt) {
	const lines = [
		`levels built           ${opt.levels}`,
		`unbuildable            ${out.unbuildable.length}`,
		`dead-end runs          ${out.deadEnds.length}`,
		`short of wheel target  ${out.shortOfTarget}`,
		`short of feed target   ${out.shortOfFeeds.length}`,
		`frames simulated       ${out.frames}`,
		`marble-frames checked  ${out.marbleFrames}`,
		`marbles lost or copied ${out.lost}`,
		`marbles on wrong side  ${out.wrongSide}`,
		`longest empty lane     ${out.emptyLane.toFixed(2)}s`,
		`crashes                ${out.crashes.length}`,
	]
	for (const line of lines) console.log(line)
	for (const d of out.deadEnds.slice(0, 6)) console.log('  ', d)
	for (const c of out.crashes.slice(0, 3)) console.log('  ', c)
}

// The lane is only ever empty for the beat between a marble
// being taken and the next one arriving. Anything longer is
// the feed having stalled.
const LANE_LIMIT = 1.2

function failed(out) {
	return out.unbuildable.length > 0
		|| out.deadEnds.length > 0
		|| out.lost > 0
		|| out.wrongSide > 0
		|| out.crashes.length > 0
		|| out.emptyLane > LANE_LIMIT
}

// ---- a player that is trying to win -------------------------

// Where a marble fired from this wheel in this direction ends
// up, bounces included.
function destOf(st, w, dir) {
	let c = w.c
	let r = w.r
	let d = dir
	for (let guard = 0; guard < 90; guard++) {
		const res = accepts(st.grid, c, r, d)
		if (res.act === 'wheel') return res.id
		if (res.act === 'bounce') {
			d = back(d)
			continue
		}
		c = res.c
		r = res.r
		d = res.dir
	}
	return -1
}

function graphOf(st) {
	return st.wheels.map((w) => {
		const out = {}
		for (let d = 0; d < 4; d++) {
			const res = accepts(st.grid, w.c, w.r, d)
			if (res.act === 'bounce') continue
			const id = destOf(st, w, d)
			if (id >= 0) out[d] = id
		}
		return out
	})
}

function relax(graph, dist, i) {
	for (const d of Object.keys(graph[i])) {
		const j = graph[i][d]
		if (dist[j] + 1 < dist[i]) dist[i] = dist[j] + 1
	}
}

function distTo(st, graph, target) {
	const dist = st.wheels.map(() => 99)
	dist[target] = 0
	for (let pass = 0; pass < st.wheels.length; pass++) {
		for (let i = 0; i < st.wheels.length; i++) {
			relax(graph, dist, i)
		}
	}
	return dist
}

// The wheel nearest a full set, and of which colour. Broken
// wheels count at a penalty — they are the only sink there is.
// Full ones are penalised harder: a full wheel cannot be
// finished from the gutter, and aiming at one is how a board
// locks up with three of a colour and nowhere to put a fourth.
function countHeld(w) {
	const held = {}
	for (const s of w.slots) {
		if (s) held[s] = (held[s] || 0) + 1
	}
	return held
}

// How much of the board's slot space is occupied.
function pressure(st) {
	let held = 0
	for (const w of st.wheels) {
		for (const x of w.slots) if (x) held++
	}
	return held / (st.wheels.length * 4)
}

function scoreFor(w, held, colour, brokenCost) {
	const full = w.slots.every((x) => x !== null)
	return (held[colour] || 0) * 10
		- (w.broken ? brokenCost : 0)
		- (full ? 25 : 0)
}

// Chase unbroken wheels while there is room to, and fall back
// on broken ones as somewhere to put rubbish only once the
// board is tight. At a flat cost a broken wheel holding three
// of a colour always beat an empty unbroken one, so the far
// wheel at the end of a chain never saw a marble all game and
// the level could not be finished at all.
function aimAt(st) {
	let best = null
	const cost = pressure(st) > 0.65 ? 15 : 40
	for (const w of st.wheels) {
		const held = countHeld(w)
		for (const colour of st.palette) {
			const score = scoreFor(w, held, colour, cost)
			if (!best || score > best.score) {
				best = { wheel: w, colour, score }
			}
		}
	}
	return best
}

// Point a feed wheel at the lane. The wheel being filled takes
// a marble only if it is the colour wanted; below a third of
// the clock that choosiness stops, because anywhere beats a
// jammed gutter. Returns the wheel committed to, so nothing
// else turns it back out of position.
function tendGutter(st, aim) {
	if (!st.gutter) return null
	const urgent = st.gutterLeft < st.gutterMs * 0.35
	for (const c of st.feeds) {
		const res = accepts(st.grid, c, -1, 2)
		if (res.act !== 'wheel') continue
		const w = wheelAt(st, c, 0)
		if (!w.slots.some((s) => s === null)) continue
		const picky = w === aim.wheel
			&& st.gutter.colour !== aim.colour
		if (!urgent && picky) continue
		if (isTurning(w)) return w
		const k = alignedSlot(w, 0)
		if (k < 0 || w.slots[k] !== null) nudge(w)
		return w
	}
	return null
}

// 'fired', or the wheel holding a marble it wants to send but
// pointing the wrong way, or null.
function route(st, aim, graph, dist, fx) {
	let wants = null
	for (const w of st.wheels) {
		if (isTurning(w)) continue
		for (let k = 0; k < 4; k++) {
			const s = w.slots[k]
			if (s === null) continue
			const mine = w === aim.wheel
			if (mine === (s === aim.colour)) continue
			const d = slotDir(w, k)
			const to = d < 0 ? undefined : graph[w.id][d]
			const ok = to !== undefined
				&& (mine || dist[to] < dist[w.id])
			if (ok && canFire(st, w, k)) {
				fireSlot(st, w, k, fx)
				return 'fired'
			}
			if (!wants) wants = w
		}
	}
	return wants
}

function jammed(w, busy) {
	if (w === busy || isTurning(w)) return false
	return w.slots.some(
		(s, k) => s !== null && slotDir(w, k) < 0)
}

function unstick(st, aim, rand, busy) {
	const stuck = st.wheels.filter((w) => jammed(w, busy))
	if (stuck.length) {
		nudge(stuck[(rand() * stuck.length) | 0])
		return
	}
	const w = aim.wheel
	if (w === busy || isTurning(w)) return
	if (w.slots.some((s) => s === null)) nudge(w)
}

function solveStep(st, rand, fx) {
	const aim = aimAt(st)
	if (!aim) return
	const busy = tendGutter(st, aim)
	const graph = graphOf(st)
	const dist = distTo(st, graph, aim.wheel.id)
	const got = route(st, aim, graph, dist, fx)
	if (got === 'fired') return
	if (got && got !== busy && !isTurning(got)) {
		nudge(got)
		return
	}
	unstick(st, aim, rand, busy)
}

function solveOne(level, seed, seconds) {
	const fx = stubFx()
	const st = newGame(level, 0)
	const rand = rngOf(seed)
	let acc = 0
	let t = 0
	let worst = st.gutterMs
	for (let i = 0; i < seconds * 60; i++) {
		if (st.phase !== 'play') break
		update(st, DT, fx)
		t += DT
		if (st.gutter) worst = Math.min(worst, st.gutterLeft)
		acc += DT
		if (acc > 0.1) {
			acc = 0
			solveStep(st, rand, fx)
		}
	}
	return {
		ok: st.phase === 'clear', t,
		head: worst / st.gutterMs,
	}
}

function solveLine(n, r) {
	const how = r.ok
		? `cleared in ${r.t.toFixed(0)}s`
		: 'not cleared'
	const pct = (r.head * 100).toFixed(0)
	console.log(
		`  L${String(n).padStart(3)}  ${how}` +
		`   clock low-water ${pct}%`)
}

function solveReport(opt) {
	console.log('')
	console.log(`played to win, levels 1-${opt.solve}:`)
	let won = 0
	let head = 1
	for (let n = 1; n <= opt.solve; n++) {
		const r = solveOne(n, 0x1234 + n * 7919, 300)
		if (r.ok) won++
		head = Math.min(head, r.head)
		if (opt.solve <= 12) solveLine(n, r)
	}
	console.log(`  cleared ${won}/${opt.solve}, ` +
		`clock never below ${(head * 100).toFixed(0)}%`)
}

function main() {
	const opt = options(process.argv.slice(2))
	const out = {
		unbuildable: [], deadEnds: [], crashes: [],
		shortOfFeeds: [], shortOfTarget: 0,
		frames: 0, marbleFrames: 0, lost: 0, wrongSide: 0,
		emptyLane: 0,
	}
	for (let n = 1; n <= opt.levels; n++) {
		if (!auditLayout(n, out)) continue
		for (let s = 1; s <= opt.seeds; s++) {
			try {
				play(n, 0xabc + n * 131 + s * 7919,
					opt.seconds, out)
			} catch (err) {
				const where = `L${n} seed${s}`
				out.crashes.push(`${where}: ${err}`)
			}
		}
	}
	report(out, opt)
	if (opt.solve) solveReport(opt)
	const bad = failed(out)
	console.log(bad ? 'FAIL' : 'ok')
	process.exit(bad ? 1 : 0)
}

main()
