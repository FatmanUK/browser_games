// Shared sidebar chrome for games: title + New game/Back to
// games buttons, positioned beside the game rather than above
// it. Used by all three bundled games; not part of the required
// contract in games/README.md, just common UI worth not
// re-implementing three times.

function createButton(label, onClick) {
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'game-side-button'
	btn.textContent = label
	btn.addEventListener('click', onClick)
	return btn
}

export function createChrome(container, opts) {
	container.classList.add('game-chrome')

	const main = document.createElement('div')
	main.className = 'game-main'

	const side = document.createElement('div')
	side.className = 'game-side'

	const heading = document.createElement('h2')
	heading.textContent = opts.title
	side.appendChild(heading)

	side.appendChild(createButton('New game', opts.onNewGame))
	side.appendChild(
		createButton('← Back to games', opts.onBack))

	container.append(main, side)
	return { main, side }
}

export function createStat(side, label) {
	const p = document.createElement('p')
	p.className = 'game-stat'
	side.appendChild(p)
	const set = (value) => {
		p.textContent = `${label}: ${value}`
	}
	set('–')
	return set
}
