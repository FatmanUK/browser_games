// Copy this folder to games/<slug>/ and fill in the contract below to add a
// new game. This stub is NOT registered in js/registry.js — it's a reference
// only. See games/README.md for the full contract.

export default {
  id: 'template',
  title: 'Template Game',
  description: 'A minimal stub showing the game module contract.',

  // Called when the player picks this game from the launcher.
  // `container` is an empty <div> you own until destroy() is called.
  init(container) {
    const message = document.createElement('p')
    message.textContent = 'Hello from the template game!'
    container.appendChild(message)
  },

  // Optional. Called when the player returns to the launcher.
  // Stop timers/animation frames and remove any listeners added outside
  // `container` (the container's own contents are cleared for you).
  destroy() {},
}
