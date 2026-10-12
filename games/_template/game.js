// Copy this folder to games/<slug>/ and fill in the contract
// below to add a new game. This stub is NOT registered in
// js/registry.js — it's a reference only. See games/README.md
// for the full contract.

import { createChrome, createStat } from '../_shared/chrome.js'

function newGame(main, setScore) {
	main.replaceChildren()
	const message = document.createElement('p')
	message.textContent = 'Hello from the template game!'
	main.appendChild(message)
	setScore(0)
}

export default {
	id: 'template',
	title: 'Template Game',
	description: 'A minimal stub showing the game contract.',

	// Called when the player picks this game from the
	// launcher. `container` is an empty <div> you own until
	// destroy() is called. `controls.back()` returns to the
	// launcher.
	init(container, controls) {
		const { main, side } = createChrome(container, {
			title: this.title,
			onBack: controls.back,
			onNewGame: () =>
				newGame(main, this._setScore),
		})
		this._setScore = createStat(side, 'Score')
		newGame(main, this._setScore)
	},

	// Optional. Called when the player returns to the
	// launcher. Stop timers/animation frames and remove any
	// listeners added outside `container` (its own contents
	// are cleared for you).
	destroy() {},
}
