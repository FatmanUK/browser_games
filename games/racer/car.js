// One car's size, its driving envelope, and who is driving.
//
// It used to hold the sprite too — two fillRects and a blue
// windscreen. The sprite is a baked mesh now (models.js,
// sprites.js); what is left here is the numbers everything
// else agrees on.

export const CAR_LENGTH = 16
export const CAR_WIDTH = 9

// The driving envelope, shared by the player and the rivals so
// the field is beatable but not walkable: a rival is held back
// by its own caution (see rivals.js), not by a lower top speed.
export const ACCEL = 220
export const BRAKE = 260
// 225 rather than 260: at the old top speed the camera's
// 240-unit-wide window gave about a second of warning before
// anything you were about to hit, which is not enough to react
// to it. ACCEL and BRAKE are untouched, so the car is as
// responsive as it was and only slower flat out.
export const MAX_SPEED = 225
export const MAX_REVERSE = -80
export const FRICTION = 0.6
export const OFF_TRACK_DRAG = 2.2
export const TURN_RATE = 2.6

export const PLAYER_COLOURS = {
	shell: '#b71c1c',
	body: '#e53935',
}

export const PLAYER_NAME = 'YOU'

// The field, in grid order. One roster rather than three
// parallel arrays keyed by index: a rival is a driver, and its
// name, pace and line belong together where you can read them
// as one. `skill` is its fraction of the field's pace and
// `lane` its line across the road band (0 inner, 1 outer),
// spread wide enough that two rivals on the same corner take
// visibly different lines instead of grinding together all lap.
//
// Deliberately nothing red: the player's car has to be the one
// you can pick out of a pack at a glance, in a beam, at speed.
// Names are kept short so the standings column stays narrow.
export const RIVALS = [
	{
		name: 'VOSS', skill: 0.97, lane: 0.38,
		colours: { shell: '#0d47a1', body: '#1e88e5' },
	},
	{
		name: 'KESTREL', skill: 0.94, lane: 0.58,
		colours: { shell: '#1b5e20', body: '#43a047' },
	},
	{
		name: 'MARLO', skill: 0.91, lane: 0.3,
		colours: { shell: '#e65100', body: '#fb8c00' },
	},
	{
		name: 'DRAKE', skill: 0.88, lane: 0.68,
		colours: { shell: '#4a148c', body: '#8e24aa' },
	},
	{
		name: 'IBBOTT', skill: 0.85, lane: 0.48,
		colours: { shell: '#37474f', body: '#78909c' },
	},
]
