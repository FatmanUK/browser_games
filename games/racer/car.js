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
// as one.
//
// Four knobs rather than one, because a field that varies only
// in top speed is a field of one driver at five settings. They
// are meant to be learnable:
//
//   pace  fraction of the field's top speed
//   grip  how hard it will lean on a corner
//   look  how far ahead it brakes — low is late and ragged
//   nerve how readily it takes a missile shot
//   lane  the line it takes, as a signed fraction of the
//         half-width, negative to the right of the road
//
// So Voss is quick and tidy and brakes early, Marlo is slower
// but hangs on to the corner and will shoot at anything, and
// Drake brakes so late it keeps running wide.
//
// A fifth knob, a per-driver wobble on the steering, came back
// out: it measured as doing nothing at all. The steering
// controller corrects the wobble inside a frame, so every
// driver strayed from its line by the same 1.4 units whatever
// the setting said.
//
// Deliberately nothing red: the player's car has to be the one
// you can pick out of a pack at a glance, in a beam, at speed.
// Names are kept short so the standings column stays narrow.
export const RIVALS = [
	{
		name: 'VOSS',
		pace: 0.97, grip: 1.05, look: 1.15,
		nerve: 0.9, lane: -0.45,
		colours: { shell: '#0d47a1', body: '#1e88e5' },
	},
	{
		name: 'KESTREL',
		pace: 0.94, grip: 0.92, look: 1.0,
		nerve: 0.6, lane: 0.3,
		colours: { shell: '#1b5e20', body: '#43a047' },
	},
	{
		name: 'MARLO',
		pace: 0.9, grip: 1.08, look: 0.95,
		nerve: 1.0, lane: -0.15,
		colours: { shell: '#e65100', body: '#fb8c00' },
	},
	{
		name: 'DRAKE',
		pace: 0.92, grip: 0.84, look: 0.72,
		nerve: 0.45, lane: 0.5,
		colours: { shell: '#4a148c', body: '#8e24aa' },
	},
	{
		name: 'IBBOTT',
		pace: 0.86, grip: 0.95, look: 1.1,
		nerve: 0.75, lane: 0.05,
		colours: { shell: '#37474f', body: '#78909c' },
	},
]
