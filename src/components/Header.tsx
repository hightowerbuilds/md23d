import { Link } from '@tanstack/solid-router'

export default function Header() {
  return (
    <header class="site-header">
      <nav class="nav-shell">
        <h2 class="site-brand">
          <Link to="/" class="brand-pill">
            <span class="brand-dot" />
            MD23D
          </Link>
        </h2>

        <div class="nav-links">
          <Link
            to="/"
            class="nav-link"
            activeProps={{ class: 'nav-link is-active' }}
          >
            Studio
          </Link>
          <Link
            to="/uml"
            class="nav-link"
            activeProps={{ class: 'nav-link is-active' }}
          >
            UML
          </Link>
          <Link
            to="/about"
            class="nav-link"
            activeProps={{ class: 'nav-link is-active' }}
          >
            About
          </Link>
          <a
            href="https://tanstack.com/start/latest/docs/framework/solid/overview"
            target="_blank"
            rel="noreferrer"
            class="nav-link"
          >
            Solid Start
          </a>
        </div>
      </nav>
    </header>
  )
}
