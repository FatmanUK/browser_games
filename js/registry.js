// Central list of registered games. To add a new game:
//   1. Create games/<slug>/game.js implementing the
//      contract in games/README.md
//   2. Import it below and add it to the `games` array.
// No other launcher code needs to change.

import tetrisGame from '../games/tetris/game.js'
import pacmanGame from '../games/pacman/game.js'
import racerGame from '../games/racer/game.js'

export const games = [tetrisGame, pacmanGame, racerGame]
