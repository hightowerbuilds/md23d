import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main class="about-page">
      <section class="about-panel">
        <p class="eyebrow">Architecture</p>
        <h1>Markdown stays the source of truth.</h1>
        <p>
          The current build reads markdown client-side, tokenizes it into typed
          content blocks, lays out each card with <code>@chenglou/pretext</code>
          for measured wrapping, and renders those cards as textured planes in
          Three.js.
        </p>
        <p>
          Two environments ship in this first pass: <strong>space</strong> for
          floating editorial panels and <strong>rail runner</strong> for a
          forward-motion reading sequence. The next layer would be reusable
          themes, richer block styling, and persistent file libraries.
        </p>
      </section>
    </main>
  )
}
