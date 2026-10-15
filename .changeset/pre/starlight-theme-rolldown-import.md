---
'starlight-theme': patch
---

fix: drop the `@vite-ignore` hints on SoundToggle/MusicPlayer's static sounds
import. rollup (vite ≤7) bundled the literal specifier despite the hint; rolldown
(vite 8, used by astro 7) honors it and ships the raw source path, which 404s in
the built site and broke audio on every docs page.
