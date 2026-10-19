// One car's size and sprite. The player's car used to be drawn
// inline in game.js with its reds hardcoded; a field of rivals
// needs the same sprite in other colours, so it lives here with
// the palette passed in.

export const CAR_LENGTH = 16
export const CAR_WIDTH = 9

// The driving envelope, shared by the player and the rivals so
// the field is beatable but not walkable: a rival is held back
// by its own caution (see rivals.js), not by a lower top speed.
export const ACCEL = 220
export const BRAKE = 260
export const MAX_SPEED = 260
export const MAX_REVERSE = -80
export const FRICTION = 0.6
export const OFF_TRACK_DRAG = 2.2
export const TURN_RATE = 2.6

// `facing` rather than heading: on oil the sprite spins while
// the car keeps sliding along the line it was already on, so
// the two come apart (see game.js applyControls).
export function drawCar(ctx, car, colours) {
	ctx.save()
	ctx.translate(car.x, car.y)
	ctx.rotate(car.facing)
	ctx.fillStyle = colours.shell
	ctx.fillRect(
		-CAR_LENGTH / 2, -CAR_WIDTH / 2,
		CAR_LENGTH, CAR_WIDTH)
	ctx.fillStyle = colours.body
	ctx.fillRect(
		-CAR_LENGTH / 2 + 2, -CAR_WIDTH / 2 + 1,
		CAR_LENGTH - 6, CAR_WIDTH - 2)
	ctx.fillStyle = '#90caf9'
	ctx.fillRect(1, -CAR_WIDTH / 2 + 2, 4, CAR_WIDTH - 4)
	ctx.restore()
}

export const PLAYER_COLOURS = {
	shell: '#b71c1c',
	body: '#e53935',
}

// One per rival, in grid order. Deliberately nothing red: the
// player's car has to be the one you can pick out of a pack at
// a glance, in a beam, at speed.
export const RIVAL_COLOURS = [
	{ shell: '#0d47a1', body: '#1e88e5' },
	{ shell: '#1b5e20', body: '#43a047' },
	{ shell: '#e65100', body: '#fb8c00' },
	{ shell: '#4a148c', body: '#8e24aa' },
	{ shell: '#37474f', body: '#78909c' },
]
