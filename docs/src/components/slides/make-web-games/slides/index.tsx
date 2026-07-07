import type { CSSProperties } from 'react'
import { Slide, Eyebrow, Headline, Subline } from '../../../deck/primitives'
import { SpriteSizzleStats } from '../SpriteSizzleStats'
import { StyledQR } from '../StyledQR'

const linkStyle = (color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.7rem',
  font: "600 clamp(1rem, 1.9vw, 1.35rem)/1.2 Inter, system-ui, sans-serif",
  color,
  textDecoration: 'none',
})

function GlobeIcon() {
  return (
    <svg width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

const GEMS = ['gold', 'ruby', 'emerald', 'diamond', 'amethyst', 'turquoize', 'pink', 'salmon']

const FEATURES: [string, string][] = [
  ['Sprite batching', 'automatic, ECS-driven'],
  ['Tilemaps', 'LDtk maps, autotiling'],
  ['2D lighting', 'soft shadows, normal maps'],
  ['Radiance cascades', 'global illumination'],
  ['Skia', 'animated SVG & vector'],
  ['Slug', 'resolution-independent GPU fonts'],
  ['TSL shaders', 'composable node materials'],
  ['Pass effects', 'CRT, bloom, pixelate, dither'],
  ['Animation', 'spritesheets & tweens'],
  ['Hit testing', 'pixel-perfect picking'],
  ['Devtools', 'Tweakpane, stats, inspection'],
  ['Bake pipeline', 'offline normals & hitmasks'],
]

function FeatureGrid() {
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: '1.8rem 0 0',
        padding: '1.5rem 2rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '0.7rem 2.6rem',
        maxWidth: '56rem',
        background: 'rgba(8, 10, 14, 0.64)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        borderRadius: '0.9rem',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {FEATURES.map(([name, desc], i) => (
        <li
          key={name}
          style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', font: "400 clamp(0.95rem, 1.7vw, 1.25rem)/1.35 'Public Sans', system-ui, sans-serif" }}
        >
          <span aria-hidden style={{ color: `var(--${GEMS[i % GEMS.length]})`, fontWeight: 800 }}>▪</span>
          <span>
            <strong style={{ fontWeight: 700 }}>{name}</strong>{' '}
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>— {desc}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Slides() {
  return (
    <>
      {/* 1 */}
      <Slide>
        <Headline hero>MAKE<br />WEB<br />GAMES</Headline>
        <p
          style={{
            margin: '2.6rem 0 0',
            textAlign: 'right',
            font: "600 clamp(1rem, 1.8vw, 1.35rem)/1.3 Inter, system-ui, sans-serif",
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          Justin Walsh · June 2026
        </p>
        <aside className="notes">
          Who I am, and the provocation. This room ships on Unity and Unreal. I am
          here to make the case for the platform you already have open.
        </aside>
      </Slide>

      {/* 2 */}
      <Slide>
        <Eyebrow gem="diamond">Distribution</Eyebrow>
        <Headline>Share a URL.<br />No install.<br />No friction.</Headline>
        <Subline>Your game is one click from every player on Earth.</Subline>
        <aside className="notes">
          The friction tax of native distribution — downloads, store review,
          platform cuts. The web collapses it to a link. Instant play is a feature.
        </aside>
      </Slide>

      {/* 3 */}
      <Slide>
        <Eyebrow gem="emerald">Use the platform</Eyebrow>
        <Headline>The web is a games platform.</Headline>
        <Subline>
          Poki: 100M monthly players · CrazyGames: 50M+ monthly players · browser
          games market: $7.81B (2025)
        </Subline>
        <aside className="notes">
          Reach plus revenue — this is the load-bearing data slide. Web games are a
          real market, not a toy. Cite each figure: Poki hit 100 million monthly
          players in June 2025, announced by the platform itself — that puts them in
          the same sentence as PlayStation Network (119M). Source: Poki via
          techfundingnews.com, June 2025 (https://techfundingnews.com/browser-gaming-website-poki-won-big-at-the-dutch-game-awards-celebrating-hitting-1-billion-monthly-plays/).
          CrazyGames reports 50M+ monthly players in their official developer docs.
          Source: docs.crazygames.com/faq/ (2025). Browser games market valued at
          $7.81B in 2025, projected $9.07B by 2030 at 3.1% CAGR. Source: The
          Business Research Company, thebusinessresearchcompany.com/report/browser-games-global-market-report
          (2026). Bloomberg named the web "video games' hottest new platform" in
          November 2025: bloomberg.com/news/articles/2025-11-07/video-games-hottest-new-platform-is-an-old-one-websites.
        </aside>
      </Slide>

      {/* 4 */}
      <Slide>
        <Eyebrow gem="ruby">Web Game FUD</Eyebrow>
        <Headline small>"Web games are low quality casual free-to-play traps."</Headline>
        <Subline>WebGPU and WebAudio slap.<br />Three.js is pushing AAA quality to the web.</Subline>
        <aside className="notes">
          Name the Unity/Unreal skepticism directly and respect it. The turn:
          WebGPU and TSL changed the rendering ceiling. Set up the toolkit.
        </aside>
      </Slide>

      {/* 5 */}
      <Slide>
        <Eyebrow gem="gold">The composable 2D library for Three.js</Eyebrow>
        <Headline>FLATLAND</Headline>
        <Subline>Spartan game development.<br />3D and 2D composition.</Subline>
        <aside className="notes">
          raylib calls it Spartan development — minimal dependencies, you against
          the machine. three-flatland is that for web 2D: WebGPU + TSL, sprites,
          tilemaps, lighting, GI, in one place.
        </aside>
      </Slide>

      {/* 6 */}
      <Slide>
        <Eyebrow gem="amethyst">Sprite Batching</Eyebrow>
        <SpriteSizzleStats />
        <aside className="notes">
          The real tech on display: automatic, ECS-driven sprite batching. This demo
          ramps the sprite count on a timer with live FPS and count on screen, scaling
          until it stops being stable (≈30k, not a magic 100k).
        </aside>
      </Slide>

      {/* 7 — first beat: tilemap (lights off); fragment reveal: lights on */}
      <Slide>
        <Eyebrow gem="amethyst">Tiles & Lighting</Eyebrow>
        <Headline>Tilemaps.</Headline>
        <div className="fragment">
          <Subline>Real-time 2D lights. Soft shadows.</Subline>
        </div>
        <aside className="notes">
          First beat: the tilemap, lights off. Next click flips on real-time 2D
          lights + soft shadows — lighting that used to mean a PC/console budget,
          in a 2D browser scene.
        </aside>
      </Slide>

      {/* 8 — full feature breakdown */}
      <Slide>
        <Eyebrow gem="gold">The toolkit</Eyebrow>
        <Headline small>One library. Everything 2D.</Headline>
        <FeatureGrid />
        <aside className="notes">
          The full kit, composable on top of Three.js — beyond what's on the sizzle
          slides. Call out the headliners: Skia for animated SVG/vector, Slug for
          GPU font rendering, plus lighting, GI, pass effects, and the bake pipeline.
        </aside>
      </Slide>

      {/* 9 */}
      <Slide>
        <Eyebrow gem="diamond">Go Native</Eyebrow>
        <Headline>You're not trapped in a browser.</Headline>
        <Subline>NativeScript, React Native, and my native tech can take you to SteamDeck, Mobile and Desktop, without a browser.</Subline>
        <aside className="notes">
          The Steam Deck / native question is the real worry — answer it head-on. In
          2026 you are not boxed in: my NativeScript + three.js demo, ANGLE bridging
          WebGL2 to native, Steam Deck's browser-grade runtime. Hylo is the long game —
          publish once, ship everywhere — mention it here as the trajectory, not a slide.

          Full credits: This work is based on "Steam Deck"
          (https://sketchfab.com/3d-models/steam-deck-502407f2dab048728e1b63699bf99d45)
          by VM-Models licensed under CC-BY-4.0. This work is based on "iPhone 16 Pro Max"
          (https://sketchfab.com/3d-models/iphone-16-pro-max-41a071ae12794b668502f58d1e0fd1a3)
          by MajdyModels licensed under CC-BY-4.0.
        </aside>
      </Slide>

      {/* 9 — the provocation */}
      <Slide>
        <Eyebrow gem="turquoize">Our AI Overlords</Eyebrow>
        <Headline>Is your next teammate an agent?</Headline>
        <Subline>
          Agents are here, they are good at react, typescript, html, and three.js. What do our workflows look like outside of Unity and Unreal?
        </Subline>
        <aside className="notes">
          My bet: as agents do more of the building, they reach for the web — it is
          the platform they know best, and they can drive the whole loop themselves:
          write the code, open a browser, test it, ship it, with no GUI editor in the
          way. The signal is already here — one AI game jam pulled in over a thousand
          games, browser-only, three.js the default. The honest nuance: LLMs
          autocomplete C# inside Unity; agents build whole games on the web.
          three-flatland is built for that agent. I do not think this is settled —
          that is the point. The question I want to leave you with: with AI in the
          room, what should we be building games with? [pause — invite questions]
        </aside>
      </Slide>

      {/* 10 */}
      <Slide>
        <Headline small>three-flatland</Headline>
        <Subline>Make web games. First-class 2D. Go anywhere.</Subline>
        <div style={{ marginTop: '2.4rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <StyledQR data="https://tjw.dev/three-flatland/" size={200} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <a
              href="https://tjw.dev/three-flatland/"
              target="_blank"
              rel="noreferrer"
              style={linkStyle('var(--diamond)')}
            >
              <GlobeIcon /> tjw.dev/three-flatland
            </a>
            <a
              href="https://x.com/thejustinwalsh"
              target="_blank"
              rel="noreferrer"
              style={linkStyle('var(--foreground)')}
            >
              <XIcon /> @thejustinwalsh
            </a>
          </div>
        </div>
        <aside className="notes">
          The advertisement close. Invite questions — leave one thread deliberately
          unpulled (Hylo / the native pipeline / a feature not shown) so the Q&A has
          an obvious place to start. Replace the QR placeholder with a generated code
          pointing at the Getting Started page.
        </aside>
      </Slide>
    </>
  )
}
