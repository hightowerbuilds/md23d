export const sampleMarkdown = `# Orbit Log: Building a Blog You Can Fly Through

This prototype turns a plain markdown file into a spatial reading experience. Instead of flattening a post into one scroll column, each section becomes a panel you can orbit around, drive past, and sequence like a scene.

## What the pipeline does

1. Read markdown directly from an uploaded \`.md\` file.
2. Break the document into structured blocks such as headings, paragraphs, lists, and code.
3. Layout each block with \`pretext\` so line wrapping is stable and measured before rendering.
4. Project those blocks into a Three.js environment.

## Environment One: Space

In the space mode, the article behaves like a constellation. Each section floats at a different depth, with the camera easing through the cluster while the panels drift in place. The result should feel calm, editorial, and slightly cinematic.

## Environment Two: Rail Runner

The train mode changes the reading posture. Instead of hovering, the reader moves forward. The camera advances down the track and the article reveals itself as signboards, station prompts, and broadcast frames appearing beside the route.

## Design Rules

- Headings should read like waypoints.
- Paragraphs need enough width to stay legible in motion.
- Lists should become compact command cards.
- Code snippets should keep their line breaks and feel more industrial than editorial.

## A small code block

\`\`\`ts
const markdown = await file.text()
const documentModel = parseMarkdownDocument(markdown)
const world = buildScene(documentModel, 'space')
\`\`\`

## Why this matters

Markdown is already the authoring format most teams trust. The opportunity is not to replace it, but to reinterpret it spatially. If the upload path stays simple and the environments stay strong, the tool can make 3D publishing feel practical instead of gimmicky.
`
