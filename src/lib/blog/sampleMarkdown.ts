export const sampleMarkdown = `# Orbit Log: Building a Blog You Can Fly Through

This prototype turns a plain markdown file into a spatial reading experience. Instead of flattening a post into one scroll column, each section becomes a panel you can orbit around, drive past, and sequence like a scene.

<!-- note: This is the opening slide. Set the tone — we are not building another markdown viewer, we are building a spatial reading engine. -->

## What the pipeline does

1. Read markdown directly from an uploaded \`.md\` file.
2. Break the document into structured blocks such as headings, paragraphs, lists, and code.
3. Layout each block with \`pretext\` so line wrapping is stable and measured before rendering.
4. Project those blocks into a Three.js environment.

---

## Environment One: Space

In the space mode, the article behaves like a constellation. Each section floats at a different depth, with the camera easing through the cluster while the panels drift in place. The result should feel calm, editorial, and slightly cinematic.

Click any card to focus it. Press Escape to return to the constellation. Arrow keys cycle between cards.

## Environment Two: Drift

In drift mode, your content is alive. Eight thousand particles form the text of each slide — readable, glowing, breathing. Grab the slide and drag to spin it. The particles scatter into a cloud, then reconverge as the next section materializes from the fog.

The effect is pointillist — every word is made of light.

---

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

---

## Mathematics in 3D

The relationship between energy and mass is one of the most famous results in physics.

\`\`\`math
E = mc^2
\`\`\`

Einstein's equation shows that mass and energy are interchangeable. In Cosmos mode, formulas are displayed with their surrounding context so the reader never loses the thread of the argument.

## Why this matters

Markdown is already the authoring format most teams trust. The opportunity is not to replace it, but to reinterpret it spatially. If the upload path stays simple and the environments stay strong, the tool can make 3D publishing feel practical instead of gimmicky.

> The best interface is the one that disappears. The best 3D is the kind that makes you forget you are looking at 3D — you are just reading, and it happens to feel like a place.
`
