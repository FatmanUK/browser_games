import { games } from './registry.js'

const gameSelect = document.getElementById('game-select')
const gameView = document.getElementById('game-view')
const gameGrid = document.getElementById('game-grid')
const emptyState = document.getElementById('empty-state')
const gameContainer = document.getElementById('game-container')

let activeGame = null

function renderGrid() {
	emptyState.hidden = games.length > 0

	for (const game of games) {
		const card = document.createElement('button')
		card.className = 'game-card'
		card.type = 'button'

		const title = document.createElement('h2')
		title.textContent = game.title

		const description = document.createElement('p')
		description.textContent = game.description ?? ''

		card.append(title, description)
		card.addEventListener('click', () => openGame(game))
		gameGrid.appendChild(card)
	}
}

function openGame(game) {
	activeGame = game
	gameSelect.hidden = true
	gameView.hidden = false
	game.init(gameContainer, { back: closeGame })
}

function closeGame() {
	activeGame?.destroy?.()
	activeGame = null
	gameContainer.replaceChildren()
	gameView.hidden = true
	gameSelect.hidden = false
}

renderGrid()
