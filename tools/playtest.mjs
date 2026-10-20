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
//   tools/playtest.mjs [--levels N] [--seeds N] [--seconds N]
//
// Exits non-zero if any check fails, so it can be wired to CI
// later without changing anything here.

import { buildLevel } from '../games/logical/level.js'
import { tierFor } from '../games/logical/tiers.js'
import { codeFor } from '../games/logical/code.js'
import { newGame, update } from '../games/logical/world.js'
import { canFire, fireSlot } from '../games/logical/travel.js'
import { nudge } from '../games/logical/wheel.js'
import {
	COLS, ROWS, WHEEL_R, accepts, along, at, carries,
} from '../games/logical/board.js'

const FX = [
	'slot', 'bounce', 'fire', 'refuse', 'feed', 'accept',
	'paint', 'divert', 'breakWheel', 'dump', 'levelClear',
	'gameOver', 'patternOn', 'patternOff', 'turn',
]

const DT = 1 / 60

function options(argv) {
	const opt = { levels: 100, seeds: 2, seconds: 60 }
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i].replace(/^--/, '')
		if (!(key in opt)) continue
		opt[key] = Math.max(1, parseInt(argv[i + 1], 10) || 1)
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
	const bad = failed(out)
	console.log(bad ? 'FAIL' : 'ok')
	process.exit(bad ? 1 : 0)
}

main()
