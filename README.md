# Minecraft Clone++

Minecraft Clone++ is a browser-based voxel sandbox inspired by Minecraft, but tuned to feel more immediately playful: instant load, procedural biomes, a live minimap, dynamic sky, boost movement, and undo/redo building.

## Features

- **Procedural world generation** with multiple biome flavors: Plains, Forest, Mesa, and Tundra.
- **First-person pointer-lock controls** for a true sandbox feel in the browser.
- **Mining and building loop** with five placeable block types.
- **Undo/redo building** so experimentation is less punishing than in classic survival sandboxes.
- **Boost dash traversal** to move through terrain faster than standard Minecraft movement.
- **Live minimap** with zoom controls for easier navigation.
- **Dynamic day/night cycle** with shifting lighting and fog.
- **One-file static hosting**: no build step required.

## Run locally

Because the game uses ES modules, serve the repository over HTTP:

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173> in a modern browser.

## Controls

- `WASD`: move
- `Mouse`: look around
- `Space`: jump
- `Shift`: sprint
- `Q`: boost dash
- `Left click`: break block
- `Right click`: place block
- `1-5`: select block type
- `Z` / `Y`: undo / redo
- `M`: change minimap zoom
- `R`: generate a new seeded world
- `Esc`: release cursor

## Notes

This project is “better than Minecraft” in a few opinionated ways for a quick prototype—faster start-up, built-in navigation help, and more forgiving building tools—but it is not a full replacement for every Minecraft system.
