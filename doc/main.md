# Documentation of eskuel-suite

## Responsive design

The suite has two related but independent responsive mechanisms. Both use the page viewport width and the same breakpoint, but compact presentation changes continuously with the viewport while a Dockview layout is selected only when a view is initialized or when the user selects one manually.

### Compact presentation

- Compact mode applies while the viewport width is `<= 767.98px`.
- Default, non-compact presentation applies while the viewport width is `> 767.98px`.
- CSS media queries update the presentation immediately when the viewport crosses the breakpoint.
- Compact mode reduces the button sizes and padding in the top bar, abbreviates the language labels to `DE` and `EN`, reduces the size of designated responsive action buttons, and uses tighter spacing and an abbreviated scene counter in the game console's scene navigation bar.

### Dockview workspace layouts

The SQL Browser and SQL Game Console each provide `mobile` and `desktop` Dockview presets. The initial preset is selected with `window.matchMedia('(max-width: 767.98px)')` when the inner Dockview is created. This checks the page viewport, not the width of the containing panel. Resizing the page later does not automatically replace the Dockview layout, so user-adjusted panel sizes and positions are retained.

The layout button in the top navigation bar can apply either preset manually at any viewport width. Applying a preset clears and reconstructs the inner Dockview, discarding manual panel rearrangements and sizes. Dockview layouts are not persisted across page loads.
## TODOs
- Some form elements have unique ID's: Replace with a generic unique ID generator
