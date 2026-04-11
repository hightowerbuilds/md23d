# MD23D

MD23D is a Solid Start + Bun prototype that turns markdown into a 3D reading experience.

## What it does

- Compose markdown directly in the browser or upload a `.md` file
- Parse the document into typed content blocks
- Use `@chenglou/pretext` to measure and wrap text before rendering
- Project those blocks into two Three.js environments:
  - `space`: floating editorial panels in orbit
  - `train`: forward-motion rail sequence with roadside content boards

## Stack

- Bun
- Solid Start
- Three.js
- `@chenglou/pretext`
- `marked`

## Run locally

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

## Current architecture

1. Markdown is authored client-side in a textarea or read from an uploaded file.
2. `marked` tokenizes the source into headings, paragraphs, lists, quotes, code blocks, and tables.
3. Large blocks are paginated into smaller scene cards.
4. `@chenglou/pretext` lays out the text onto canvases.
5. Canvas textures are mapped onto Three.js planes and placed into the selected environment.

## Next steps

- Add durable multi-session draft libraries
- Add richer inline markdown styling
- Expand the environment system beyond the first two scene types
- Export shareable scene presets per article
