// Drawing for the belt and guardian phases, plus the banner and
// game-over overlay. Nothing here computes anything about the
// game — it only blits the pre-rendered atlas (see sprites.js).
//
// Every field entity is drawn through wrapDraw(), which repeats
// it across the seam when it is within a sprite's reach of an
// edge. Without that, a rock straddling the left edge would pop
// out of existence instead of half-appearing on the right.

import { W, H } from './common.js'
import { frameFor } from './rocks.js'
import { SHIP_R } from './craft.js'
import { PICKUP_LIFE } from './common.js'
import { drawHud } from './hud.js'
import { drawTunnel } from './render-tunnel.js'

function spread(v, span, pad) {
	if (v < pad) return [v, v + span]
	if (v > span - pad) return [v, v - span]
	return [v]
}

function wrapDraw(x, y, pad, fn) {
	for (const px of spread(x, W, pad)) {
		for (const py of spread(y, H, pad)) fn(px, py)
	}
}

function blit(ctx, img, x, y, scale) {
	const w = img.width * scale
	const h = img.height * scale
	wrapDraw(x, y, Math.max(w, h) / 2 + 2, (px, py) => {
		ctx.drawImage(img, px - w / 2, py - h / 2, w, h)
	})
}

function drawRocks(ctx, atlas, state) {
	for (const r of state.rocks) {
		const frames = atlas.rocks[r.kind][r.size]
		blit(ctx, frameFor(frames, r.a), r.x, r.y, 1)
	}
}

function drawShots(ctx, atlas, state) {
	ctx.globalCompositeOperation = 'lighter'
	for (const s of state.shots) {
		const img = s.foe
			? atlas.shots.theirs
			: atlas.shots.mine
		blit(ctx, img, s.x, s.y, 1)
	}
	ctx.globalCompositeOperation = 'source-over'
}

export function drawParts(ctx, atlas, state, blitter) {
	ctx.globalCompositeOperation = 'lighter'
	for (const p of state.parts) {
		const k = p.t / p.life
		const i = Math.min(
			atlas.puffs.length - 1,
			Math.floor(k * atlas.puffs.length))
		ctx.globalAlpha = Math.max(0, 1 - k) * 0.9
		blitter(
			atlas.puffs[i], p.x, p.y,
			p.scale * (0.35 + k * 0.9))
	}
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'
}

// Drops blink out over their last couple of seconds, which is
// the only warning the player gets that one is about to go.
function drawPickups(ctx, atlas, state) {
	for (const p of state.pickups) {
		const left = PICKUP_LIFE - p.t
		if (left < 2.5 &&
			Math.floor(p.t * 7) % 2 === 0) continue
		const frames = p.kind === 'cash'
			? atlas.coins
			: atlas.pods
		const img = frames[
			Math.floor(p.frame) % frames.length]
		blit(ctx, img, p.x, p.y, 1)
	}
}

function drawFlame(ctx, atlas, ship) {
	const frames = atlas.flame
	const img = frames[
		Math.floor(ship.flame * 22) % frames.length]
	ctx.globalCompositeOperation = 'lighter'
	wrapDraw(ship.x, ship.y, 60, (px, py) => {
		ctx.save()
		ctx.translate(px, py)
		ctx.rotate(ship.a)
		ctx.drawImage(
			img, -img.width / 2 - SHIP_R * 0.95,
			-img.height / 2)
		ctx.restore()
	})
	ctx.globalCompositeOperation = 'source-over'
}

function drawShip(ctx, atlas, state) {
	const ship = state.ship
	if (ship.dead) return
	if (ship.thrust) drawFlame(ctx, atlas, ship)
	// Blink while invulnerable, but never fully off: a ship
	// you cannot see is worse to fly than one you cannot hit.
	const blink = ship.invuln > 0
		? 0.45 + 0.55 * Math.abs(
			Math.sin(ship.invuln * 11))
		: 1
	ctx.globalAlpha = blink
	blit(ctx, frameFor(atlas.ship, ship.a), ship.x, ship.y, 1)
	ctx.globalAlpha = 1
	if (ship.invuln <= 0) return
	ctx.globalCompositeOperation = 'lighter'
	ctx.globalAlpha = Math.min(1, ship.invuln) * 0.8
	blit(ctx, atlas.shield, ship.x, ship.y, 1)
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'
}

function drawBoss(ctx, atlas, state) {
	const b = state.boss
	if (!b) return
	const art = atlas.boss
	const cx = b.x - art.hull.width / 2
	const cy = b.y - art.hull.height / 2
	ctx.drawImage(art.hull, cx, cy)
	ctx.globalCompositeOperation = 'lighter'
	const core = art.core[
		Math.floor(b.core) % art.core.length]
	ctx.drawImage(
		core, b.x - core.width / 2, b.y - core.height / 2)
	if (b.flash > 0) {
		ctx.globalAlpha = b.flash * 0.55
		ctx.drawImage(art.flash, cx, cy)
		ctx.globalAlpha = 1
	}
	ctx.globalCompositeOperation = 'source-over'
}

function drawBossBar(ctx, state) {
	const b = state.boss
	if (!b || b.y < 0) return
	const w = W * 0.5
	const x = (W - w) / 2
	const y = H - 52
	ctx.fillStyle = 'rgba(0,0,0,0.5)'
	ctx.fillRect(x - 2, y - 2, w + 4, 16)
	const k = Math.max(0, b.hp / b.max)
	const g = ctx.createLinearGradient(x, 0, x + w, 0)
	g.addColorStop(0, '#ff5a3c')
	g.addColorStop(0.6, '#ffc24a')
	g.addColorStop(1, '#8cff9a')
	ctx.fillStyle = g
	ctx.fillRect(x, y, w * k, 12)
	ctx.strokeStyle = 'rgba(255,225,170,0.7)'
	ctx.lineWidth = 1
	ctx.strokeRect(x, y, w, 12)
	ctx.fillStyle = 'rgba(255,235,200,0.85)'
	ctx.font = 'bold 10px ui-monospace, Menlo, monospace'
	ctx.textAlign = 'center'
	ctx.fillText('GUARDIAN', W / 2, y - 12)
}

function drawBanner(ctx, state) {
	const b = state.banner
	if (!b) return
	const k = b.t / b.life
	const fade = Math.min(1, (1 - k) * 3, k * 6)
	ctx.save()
	ctx.globalAlpha = Math.max(0, fade)
	ctx.textAlign = 'center'
	ctx.font = 'bold 46px system-ui, sans-serif'
	ctx.shadowColor = '#4ad6ff'
	ctx.shadowBlur = 22
	ctx.fillStyle = '#eaf6ff'
	ctx.fillText(b.text, W / 2, H / 2 - 52)
	ctx.restore()
}

function drawReady(ctx, state) {
	if (state.phase !== 'ready') return
	const left = Math.ceil(state.ready)
	const text = left > 0 ? String(left) : 'Go!'
	const k = 1 - (state.ready - Math.floor(state.ready))
	ctx.save()
	ctx.textAlign = 'center'
	ctx.font = 'bold 96px system-ui, sans-serif'
	ctx.shadowColor = '#4ad6ff'
	ctx.shadowBlur = 26
	ctx.globalAlpha = 0.35 + 0.65 * (1 - k)
	ctx.fillStyle = '#f2faff'
	ctx.fillText(text, W / 2, H / 2 + 66)
	ctx.restore()
}

function drawOver(ctx, state) {
	if (!state.over) return
	ctx.fillStyle = 'rgba(2,4,10,0.6)'
	ctx.fillRect(0, 0, W, H)
	ctx.textAlign = 'center'
	ctx.fillStyle = '#ffd9d0'
	ctx.font = 'bold 52px system-ui, sans-serif'
	ctx.fillText('GAME OVER', W / 2, H / 2 - 6)
	ctx.fillStyle = 'rgba(230,240,255,0.8)'
	ctx.font = '16px system-ui, sans-serif'
	ctx.fillText(
		`Score ${state.score} — press New game`,
		W / 2, H / 2 + 30)
}

function drawHint(ctx, state) {
	if (state.level > 1 || state.t > 9 || state.over) return
	ctx.globalAlpha = Math.max(0, 1 - state.t / 9)
	ctx.textAlign = 'center'
	ctx.fillStyle = 'rgba(150,215,245,0.85)'
	ctx.font = '11px ui-monospace, "SF Mono", Menlo, monospace'
	ctx.fillText(
		'ARROWS / WASD · SPACE TO FIRE · ' +
		'SHIFT FOR HYPERSPACE', W / 2, H - 70)
	ctx.globalAlpha = 1
}

function drawField(ctx, atlas, state) {
	ctx.drawImage(state.backdrop, 0, 0)
	drawRocks(ctx, atlas, state)
	if (state.phase === 'boss') drawBoss(ctx, atlas, state)
	drawPickups(ctx, atlas, state)
	drawShots(ctx, atlas, state)
	drawShip(ctx, atlas, state)
	drawParts(
		ctx, atlas, state,
		(img, x, y, s) => blit(ctx, img, x, y, s))
	if (state.phase === 'boss') drawBossBar(ctx, state)
	drawHint(ctx, state)
}

export function draw(ctx, atlas, state, best) {
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	if (state.phase === 'tunnel') {
		drawTunnel(ctx, atlas, state)
	} else {
		drawField(ctx, atlas, state)
	}
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	drawHud(ctx, atlas, state, best)
	drawBanner(ctx, state)
	drawReady(ctx, state)
	drawOver(ctx, state)
}
