import { Slide, Eyebrow, Headline, Subline, Credit } from '../../../deck/primitives'

export function Slides() {
  return (
    <>
      {/* 1 */}
      <Slide>
        <Headline hero>MAKE WEB GAMES</Headline>
        <aside className="notes">
          Who I am, and the provocation. This room ships on Unity and Unreal. I am
          here to make the case for the platform you already have open.
        </aside>
      </Slide>

      {/* 2 */}
      <Slide>
        <Eyebrow gem="diamond">The pitch</Eyebrow>
        <Headline>No install. No store. One URL.</Headline>
        <Subline>Your game is one click from every player on Earth.</Subline>
        <aside className="notes">
          The friction tax of native distribution — downloads, store review,
          platform cuts. The web collapses it to a link. Instant play is a feature.
        </aside>
      </Slide>

      {/* 3 */}
      <Slide>
        <Eyebrow gem="emerald">Use the platform</Eyebrow>
        <Headline>The web is already the biggest game platform.</Headline>
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
        <Eyebrow gem="ruby">The catch</Eyebrow>
        <Headline>"But the web can't make real games."</Headline>
        <Subline>That was true. It isn't anymore.</Subline>
        <aside className="notes">
          Name the Unity/Unreal skepticism directly and respect it. The turn:
          WebGPU and TSL changed the rendering ceiling. Set up the toolkit.
        </aside>
      </Slide>

      {/* 5 */}
      <Slide>
        <Eyebrow gem="gold">First class 2D</Eyebrow>
        <Headline>three-flatland</Headline>
        <Subline>Spartan development. One library. All you need.</Subline>
        <aside className="notes">
          raylib calls it Spartan development — minimal dependencies, you against
          the machine. three-flatland is that for web 2D: WebGPU + TSL, sprites,
          tilemaps, lighting, GI, in one place.
        </aside>
      </Slide>

      {/* 6 */}
      <Slide>
        <Eyebrow gem="amethyst">Sizzle</Eyebrow>
        <Headline>30,000 sprites. One draw call.</Headline>
        <Subline>Automatic, ECS-driven batching — scaling live until the frame budget says stop.</Subline>
        <aside className="notes">
          The real tech on display: automatic, ECS-driven sprite batching. This demo
          ramps the sprite count on a timer with live FPS and count on screen, scaling
          until it stops being stable (≈30k, not a magic 100k). One draw call the whole way.
        </aside>
      </Slide>

      {/* 7 */}
      <Slide>
        <Eyebrow gem="amethyst">Sizzle</Eyebrow>
        <Headline>Tilemaps. Real-time 2D lights. Soft shadows.</Headline>
        <aside className="notes">
          Tiled Forward+ lighting and dynamic shadows — lighting that used to mean
          a PC/console budget, in a 2D browser scene. (Live background demo target.)
        </aside>
      </Slide>

      {/* 8 */}
      <Slide>
        <Eyebrow gem="amethyst">Sizzle</Eyebrow>
        <Headline>Radiance cascades. Global illumination in 2D.</Headline>
        <Subline>Light that bounces. In a browser.</Subline>
        <aside className="notes">
          GI was console/PC-only territory. Radiance cascades bring bounced light to
          2D, running live in the page. This is the wow beat. (Live background demo target.)
        </aside>
      </Slide>

      {/* 9 */}
      <Slide>
        <Eyebrow gem="diamond">Go native</Eyebrow>
        <Headline>You're not trapped in a browser.</Headline>
        <Subline>NativeScript + three.js · ANGLE → native WebGL2 · Steam Deck</Subline>
        <Credit>
          Device models: "Steam Deck" by VM-Models and "iPhone 16 Pro Max" by
          MajdyModels, licensed CC-BY-4.0.
        </Credit>
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

      {/* 10 — the provocation */}
      <Slide>
        <Eyebrow gem="turquoize">The question</Eyebrow>
        <Headline>Your next teammate is an agent.</Headline>
        <Subline>
          It already speaks the web — and reaches for three-flatland. As AI writes
          more of the game, what do we build with?
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

      {/* 11 */}
      <Slide>
        <Headline>three-flatland</Headline>
        <Subline>Make web games. First-class 2D. Go anywhere.</Subline>
        <p style={{ marginTop: '2rem', font: "600 1rem/1 Inter, sans-serif", color: 'var(--gold)' }}>
          [QR → Getting Started]
        </p>
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
