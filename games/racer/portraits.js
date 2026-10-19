// The rivals' faces, drawn rather than built.
//
// Everything else in this game is a convex solid shaded
// against a fixed light (models.js), and faces made that way
// came out as five blocky heads that differed only in the
// width of the jaw. A face is not a solid you look at, it is
// a set of marks — the line of a mouth, where the brows sit,
// which eye is more open — and none of those is a plane with
// a normal. So these are drawn: flat colour inside an ink
// line, the way a comic panel is.
//
// Authored in a 0..1 square and scaled to whatever size is
// asked for, so the same code draws the podium's face and the
// standings row's. Line widths are in the same units and so
// scale with it.
//
// The player is not here. He keeps a helmet, which is both
// what you would see of yourself and the quickest way to find
// your own row in a list of six.

import { rng } from '../_shared/art.js'

const INK = '#2a1d18'
const WHITE = '#f6f1e6'

// Who they are. Skin and hair carry most of it; `style` picks
// the features, which is where the rest lives.
export const DRIVERS = {
	VOSS: {
		skin: '#f1c7a1', shade: '#d7a37a', hair: '#3b2a1b',
		w: 0.27, h: 0.33, jaw: 0.86, style: 'voss',
		look: 0.4, open: 1, browLift: 0.095,
		browTilt: 0.012, browW: 0.03, nose: 0.015,
		mouth: 0.075, smile: 0.012, crown: 0.02,
	},
	KESTREL: {
		skin: '#edc79c', shade: '#d0a376', hair: '#17120f',
		w: 0.255, h: 0.33, jaw: 0.6, style: 'kestrel',
		look: 0, open: 0.52, browLift: 0.1,
		browTilt: -0.018, browW: 0.024, nose: 0.01,
		mouth: 0.055, smile: 0.004, crown: 0.0,
		lashes: true,
	},
	MARLO: {
		skin: '#8a5634', shade: '#6b4127', hair: '#140f0c',
		w: 0.285, h: 0.32, jaw: 0.92, style: 'marlo',
		look: -0.3, open: 1, browLift: 0.115,
		browTilt: 0.02, browW: 0.034, nose: 0.028,
		mouth: 0.115, smile: 0.055, crown: 0.0,
		teeth: true,
	},
	DRAKE: {
		skin: '#e3b089', shade: '#c08c66', hair: '#241b15',
		w: 0.29, h: 0.32, jaw: 1.02, style: 'drake',
		look: 0.2, open: 0.68, browLift: 0.075,
		browTilt: -0.03, browW: 0.046, nose: 0.03,
		mouth: 0.085, smile: -0.03, crown: 0.01,
		stubble: true,
	},
	IBBOTT: {
		skin: '#f2cfae', shade: '#d6ad8a', hair: '#b7bcc2',
		w: 0.26, h: 0.325, jaw: 0.72, style: 'ibbott',
		look: 0, open: 0.8, browLift: 0.105,
		browTilt: 0.006, browW: 0.022, nose: 0.018,
		mouth: 0.05, smile: -0.008, crown: 0.03,
		lashes: true,
	},
}

// A hand drawn line is not a straight one. Every control
// point gets a small push from a generator seeded on the
// driver's name, so a face is wonky in its own particular way
// and wonky the same way every time it is drawn.
function wobbler(name) {
	let h = 7
	for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
	const r = rng(h)
	return (v, k) => v + (r() - 0.5) * (k === undefined ?
		0.014 : k)
}

function ink(ctx, w) {
	ctx.strokeStyle = INK
	ctx.lineWidth = w
	ctx.lineJoin = 'round'
	ctx.lineCap = 'round'
	ctx.stroke()
}

function headPath(ctx, d, q) {
	const w = d.w, h = d.h, j = d.jaw
	ctx.beginPath()
	ctx.moveTo(q(0.5 - w), 0.52)
	ctx.bezierCurveTo(
		q(0.5 - w), q(0.52 - h * 1.25),
		q(0.5 + w), q(0.52 - h * 1.25), q(0.5 + w), 0.52)
	ctx.bezierCurveTo(
		q(0.5 + w), q(0.52 + h * 0.72),
		q(0.5 + w * j), q(0.52 + h), 0.5, q(0.52 + h))
	ctx.bezierCurveTo(
		q(0.5 - w * j), q(0.52 + h),
		q(0.5 - w), q(0.52 + h * 0.72), q(0.5 - w), 0.52)
	ctx.closePath()
}

// The light is from the left, the same side it comes from in
// every other sprite, so a face agrees with the cars it is
// sitting above.
function headParts(ctx, d, q) {
	for (const s of [-1, 1]) {
		ctx.beginPath()
		ctx.ellipse(0.5 + s * (d.w + 0.012), 0.56,
			0.035, 0.05, 0, 0, Math.PI * 2)
		ctx.fillStyle = d.skin
		ctx.fill()
		ink(ctx, 0.016)
	}
	headPath(ctx, d, q)
	ctx.fillStyle = d.skin
	ctx.fill()
	ctx.save()
	ctx.clip()
	ctx.beginPath()
	ctx.ellipse(0.5 + d.w * 0.85, 0.6, d.w * 0.62, d.h,
		0, 0, Math.PI * 2)
	ctx.fillStyle = d.shade
	ctx.fill()
	ctx.restore()
	headPath(ctx, d, q)
	ink(ctx, 0.022)
}

// Eyes carry more of a character than anything else on the
// face, so the shape of them is per driver rather than one
// pair scaled: Kestrel's are narrowed to a line and Marlo's
// are wide open, and that difference reads at twenty pixels
// when nothing else does.
const EYE_Y = 0.55
const EYE_X = 0.115

function eye(ctx, x, d, open) {
	ctx.beginPath()
	ctx.ellipse(x, EYE_Y, 0.052, 0.052 * open,
		0, 0, Math.PI * 2)
	ctx.fillStyle = WHITE
	ctx.fill()
	ink(ctx, 0.015)
	ctx.beginPath()
	ctx.ellipse(x + d.look * 0.02, EYE_Y, 0.024,
		0.026 * Math.min(1, open * 1.6), 0, 0, Math.PI * 2)
	ctx.fillStyle = INK
	ctx.fill()
}

// Lashes, as three strokes off the outer corner. Small, and
// the clearest single mark there is at this size: without
// them the two women read as two more men in different hats.
function lashes(ctx, d, s) {
	const x = 0.5 + s * EYE_X
	for (let i = 0; i < 3; i++) {
		const a = -0.5 + i * 0.3
		ctx.beginPath()
		ctx.moveTo(x + s * 0.045, EYE_Y - 0.01 + i * 0.016)
		ctx.lineTo(
			x + s * (0.045 + 0.035 * Math.cos(a)),
			EYE_Y - 0.03 + i * 0.022)
		ink(ctx, 0.012)
	}
}

function eyes(ctx, d) {
	for (const s of [-1, 1]) {
		// One eye a little more open than the other. Perfect
		// symmetry is the thing that made the first set of
		// these look like dolls.
		eye(ctx, 0.5 + s * EYE_X, d,
			d.open * (s < 0 ? 1 : 0.86))
		if (d.lashes) lashes(ctx, d, s)
	}
}

function brow(ctx, d, s) {
	const x = 0.5 + s * EYE_X
	const lift = d.browLift * (s < 0 ? 1 : 0.78)
	ctx.beginPath()
	ctx.moveTo(x - 0.07, EYE_Y - lift + s * d.browTilt)
	ctx.quadraticCurveTo(
		x, EYE_Y - lift - 0.028,
		x + 0.07, EYE_Y - lift - s * d.browTilt)
	ctx.strokeStyle = d.hair
	ctx.lineWidth = d.browW
	ctx.lineCap = 'round'
	ctx.stroke()
}

function brows(ctx, d) {
	for (const s of [-1, 1]) brow(ctx, d, s)
}

function nose(ctx, d, q) {
	ctx.beginPath()
	ctx.moveTo(q(0.5 - 0.01), EYE_Y + 0.03)
	ctx.quadraticCurveTo(
		q(0.5 - 0.035 - d.nose), q(0.69),
		q(0.5 + 0.022), q(0.7))
	ink(ctx, 0.018)
}

function grin(ctx, d) {
	ctx.beginPath()
	ctx.moveTo(0.5 - d.mouth, 0.76)
	ctx.quadraticCurveTo(0.5, 0.76 + d.smile * 2.4,
		0.5 + d.mouth, 0.76)
	ctx.quadraticCurveTo(0.5, 0.775, 0.5 - d.mouth, 0.76)
	ctx.closePath()
	ctx.fillStyle = INK
	ctx.fill()
	ctx.save()
	ctx.clip()
	ctx.fillStyle = WHITE
	ctx.fillRect(0.5 - d.mouth, 0.745, d.mouth * 2, 0.028)
	ctx.restore()
	ink(ctx, 0.016)
}

function mouth(ctx, d) {
	if (d.teeth) return grin(ctx, d)
	ctx.beginPath()
	ctx.moveTo(0.5 - d.mouth, 0.775 - d.smile * 0.5)
	ctx.quadraticCurveTo(
		0.5, 0.775 + d.smile * 1.5,
		0.5 + d.mouth, 0.775 - d.smile * 0.5)
	ink(ctx, 0.02)
}

// Hair comes in two passes, because some of it is behind the
// head and some in front: a bob frames the face from behind
// its own outline, a fringe lies over it.
function hairBack(ctx, d) {
	ctx.fillStyle = d.hair
	if (d.style === 'kestrel') {
		// A bob, which needs a flat hem to read as one: an
		// ellipse round the head is just a bigger head.
		const x = d.w + 0.085
		ctx.beginPath()
		ctx.moveTo(0.5 - x, 0.84)
		ctx.lineTo(0.5 - x, 0.5)
		ctx.quadraticCurveTo(0.5 - x, 0.14, 0.5, 0.14)
		ctx.quadraticCurveTo(0.5 + x, 0.14, 0.5 + x, 0.5)
		ctx.lineTo(0.5 + x, 0.84)
		ctx.quadraticCurveTo(0.5, 0.79, 0.5 - x, 0.84)
		ctx.closePath()
		ctx.fill()
		ink(ctx, 0.018)
	}
	if (d.style === 'ibbott') {
		// The bun sits high enough to clear the cap, which
		// is the only part of it anyone will see.
		ctx.beginPath()
		ctx.arc(0.5, 0.19, 0.12, 0, Math.PI * 2)
		ctx.fill()
		ink(ctx, 0.018)
		for (const t of [-1, 1]) {
			ctx.beginPath()
			ctx.ellipse(0.5 + t * (d.w + 0.03), 0.52,
				0.05, 0.14, 0, 0, Math.PI * 2)
			ctx.fill()
			ink(ctx, 0.016)
		}
	}
}

function fringe(ctx, d, q) {
	ctx.fillStyle = d.hair
	ctx.beginPath()
	ctx.moveTo(0.5 - d.w - 0.01, 0.46)
	ctx.quadraticCurveTo(
		q(0.5 - d.w * 0.4), q(0.27 + d.crown),
		0.5 + d.w + 0.01, 0.44)
	ctx.quadraticCurveTo(
		q(0.5), q(0.4 + d.crown * 0.5),
		0.5 - d.w - 0.01, 0.46)
	ctx.closePath()
	ctx.fill()
	ink(ctx, 0.016)
}

function sideburns(ctx, d) {
	ctx.fillStyle = d.hair
	for (const s of [-1, 1]) {
		ctx.beginPath()
		ctx.ellipse(0.5 + s * (d.w - 0.01), 0.58,
			0.028, 0.065, 0, 0, Math.PI * 2)
		ctx.fill()
	}
}

// Marlo's grin needs something under it or the chin is a bare
// curve; Drake's stubble is the same mark used as shadow.
function beard(ctx, d) {
	ctx.save()
	headPath(ctx, d, (v) => v)
	ctx.clip()
	ctx.globalAlpha = d.stubble ? 0.3 : 1
	ctx.fillStyle = d.hair
	if (d.stubble) {
		ctx.fillRect(0.5 - d.w, 0.72, d.w * 2, 0.3)
	} else {
		ctx.beginPath()
		ctx.ellipse(0.5, 0.84, 0.1, 0.07, 0, 0, Math.PI * 2)
		ctx.fill()
	}
	ctx.restore()
}

// Eyewear goes over the eyes that are already there, so a
// character who takes the shades off still has a face under
// them. Voss's are one dark bar; Ibbott's are two rings.
function shades(ctx, d) {
	ctx.beginPath()
	ctx.moveTo(0.5 - d.w - 0.01, EYE_Y - 0.05)
	ctx.lineTo(0.5 + d.w + 0.01, EYE_Y - 0.055)
	ctx.lineTo(0.5 + d.w - 0.02, EYE_Y + 0.055)
	ctx.quadraticCurveTo(0.5, EYE_Y + 0.025,
		0.5 - d.w + 0.02, EYE_Y + 0.06)
	ctx.closePath()
	ctx.fillStyle = '#1d2733'
	ctx.fill()
	ink(ctx, 0.016)
	ctx.beginPath()
	ctx.moveTo(0.5 - 0.17, EYE_Y + 0.03)
	ctx.lineTo(0.5 - 0.1, EYE_Y - 0.035)
	ctx.strokeStyle = 'rgba(255,255,255,0.55)'
	ctx.lineWidth = 0.018
	ctx.stroke()
}

function specs(ctx, d) {
	for (const s of [-1, 1]) {
		ctx.beginPath()
		ctx.arc(0.5 + s * EYE_X, EYE_Y, 0.082, 0, Math.PI * 2)
		ctx.fillStyle = 'rgba(214, 236, 246, 0.3)'
		ctx.fill()
		ink(ctx, 0.018)
	}
	ctx.beginPath()
	ctx.moveTo(0.5 - 0.035, EYE_Y)
	ctx.lineTo(0.5 + 0.035, EYE_Y)
	ink(ctx, 0.016)
}

// The livery, worn, so a face still says which car. A peak
// rather than a band alone: at twenty pixels the peak is the
// part that reads as a cap and not as a hat band.
function cap(ctx, d, colours, q) {
	const y = 0.34 - d.crown
	ctx.beginPath()
	ctx.moveTo(0.5 - d.w - 0.02, y + 0.07)
	ctx.quadraticCurveTo(
		q(0.5), q(y - 0.19), 0.5 + d.w + 0.02, y + 0.07)
	ctx.closePath()
	ctx.fillStyle = colours.body
	ctx.fill()
	ink(ctx, 0.02)
	ctx.beginPath()
	ctx.ellipse(0.5, y + 0.075, d.w + 0.085, 0.045,
		0, Math.PI, Math.PI * 2)
	ctx.closePath()
	ctx.fillStyle = colours.shell
	ctx.fill()
	ink(ctx, 0.02)
}

// The Stig, in other words. A white shell and a black visor,
// with a stripe of the livery over the crown so the row still
// ties to the red car on the road.
export function drawHelmet(ctx, colours) {
	ctx.beginPath()
	ctx.ellipse(0.5, 0.54, 0.33, 0.36, 0, 0, Math.PI * 2)
	ctx.fillStyle = '#eceff2'
	ctx.fill()
	ink(ctx, 0.024)
	ctx.save()
	ctx.beginPath()
	ctx.ellipse(0.5, 0.54, 0.33, 0.36, 0, 0, Math.PI * 2)
	ctx.clip()
	ctx.fillStyle = '#c9d0d6'
	ctx.fillRect(0.66, 0.1, 0.4, 0.9)
	ctx.fillStyle = colours.body
	ctx.fillRect(0.44, 0.1, 0.12, 0.3)
	ctx.restore()
	ctx.beginPath()
	ctx.moveTo(0.26, 0.5)
	ctx.quadraticCurveTo(0.5, 0.42, 0.74, 0.5)
	ctx.quadraticCurveTo(0.72, 0.64, 0.5, 0.65)
	ctx.quadraticCurveTo(0.28, 0.64, 0.26, 0.5)
	ctx.closePath()
	ctx.fillStyle = '#12161c'
	ctx.fill()
	ink(ctx, 0.022)
	ctx.beginPath()
	ctx.moveTo(0.33, 0.56)
	ctx.lineTo(0.45, 0.49)
	ctx.strokeStyle = 'rgba(255,255,255,0.5)'
	ctx.lineWidth = 0.02
	ctx.stroke()
}

const EXTRAS = {
	voss: (ctx, d) => { sideburns(ctx, d); shades(ctx, d) },
	kestrel: () => {},
	marlo: (ctx, d) => beard(ctx, d),
	drake: (ctx, d) => beard(ctx, d),
	ibbott: (ctx, d) => specs(ctx, d),
}

function drawFace(ctx, d, colours, q) {
	hairBack(ctx, d)
	headParts(ctx, d, q)
	if (!d.teeth) nose(ctx, d, q)
	eyes(ctx, d)
	brows(ctx, d)
	mouth(ctx, d)
	if (d.teeth) nose(ctx, d, q)
	EXTRAS[d.style](ctx, d)
	fringe(ctx, d, q)
	cap(ctx, d, colours, q)
}

// Scaled from the 0..1 square the drawing is authored in, so
// one set of marks serves every size it is asked for.
//
// FIT blows it up past the square and crops: authored to fit
// inside, a head leaves a fifth of the panel empty all round
// and the face ends up smaller than the space it was given.
// Heads are cropped at the chin in portraits anyway.
const FIT = 1.22
const FOCUS = 0.54

export function paintPortrait(ctx, px, name, colours) {
	ctx.save()
	ctx.translate(px * 0.5, px * FOCUS)
	ctx.scale(px * FIT, px * FIT)
	ctx.translate(-0.5, -FOCUS)
	const d = DRIVERS[name]
	if (!d) drawHelmet(ctx, colours)
	else drawFace(ctx, d, colours, wobbler(name))
	ctx.restore()
}
