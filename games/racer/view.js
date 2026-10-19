// Dash's camera, and the one number the art has to agree with.
//
// These lived in game.js, which is fine until the sprite bakers
// need them too: sprites.js importing game.js would be a cycle,
// since game.js is what draws the sprites.

import { WIDTH, HEIGHT } from '../_shared/hud.js'
import * as TRACK from './track-data.js'

// The camera follows the car and only shows a window onto the
// world — tall enough to always show the full width of the
// track's road surface rather than the whole track at once.
// VIEW_SCALE blows that up to the shared window size without
// changing how much of the track it actually shows.
//
// The window is the suite's (games/_shared/hud.js), and the
// scale is derived from it rather than the other way round:
// the canvas used to be sized from the track's road width, so
// regenerating the track with a different ROAD_WIDTH would
// have quietly changed how big this game's window was.
export const VIEWPORT_HEIGHT = TRACK.ROAD_WIDTH
export const VIEW_SCALE = HEIGHT / VIEWPORT_HEIGHT
export const VIEWPORT_WIDTH = WIDTH / VIEW_SCALE

// Everything the world draws happens inside a
// ctx.scale(VIEW_SCALE), because the world is in world units.
// A sprite is pixels, so it has to be baked at world radius
// times this and then drawn with it divided back out — bake a
// 3-unit tyre at 3px and blit it in there and you get 12px of
// mush. PX is that number, named so the rule reads in one
// place rather than being spelled out at every blit.
export const PX = VIEW_SCALE

// Half the viewport plus a sprite's worth of slack, for
// culling scenery that cannot be on screen.
export const CULL_X = VIEWPORT_WIDTH / 2 + 30
export const CULL_Y = VIEWPORT_HEIGHT / 2 + 30
