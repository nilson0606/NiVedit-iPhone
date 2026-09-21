# NiVedit iPhone

Independent iPhone Web App, desktop V13 semantics. **0.2.0, phase 2 preview.**
Desktop NiVedit and its restore points are unchanged.

- Site: https://nilson0606.github.io/NiVedit-iPhone/
- Baseline: nilson0606/NiVedit V13 at 1e73b55ea388e6b9f1c7925f0651846cdb8f20c0.
- Plan: [To_IPhone.md](docs/To_IPhone.md).
- Current handoff: [phase-2.md](docs/phase-2.md); historical [phase-1.md](docs/phase-1.md).
- Guide: [manual.html](manual.html).
- Local: python -m http.server 8093 --bind 127.0.0.1. Use HTTPS/localhost, not file://.
- Dependency: vendored unmodified Mediabunny 1.58.1 (MPL-2.0); see THIRD_PARTY.md. No runtime CDN.
- Media stays on-device. Public example uses only original synthetic graphics and tones.
- NVPROJ1 portable projects preserve desktop fields and embedded assets. Unsupported desktop effects are retained and visibly flagged; incomplete video export is blocked.
- Browser projects/drafts use IndexedDB transactions; downloaded/shared NVPROJ1 is the external backup.
- Two video tracks with original audio, independent images with overlap/transparency, gaps, trim/split/move/delete, undo/redo, local projects/copies, protected example, 720p/1080p30 H.264/AAC.
- Intermittent iPhone export errors remain open and were explicitly deferred by the user. Phase 2 awaits real iPhone acceptance; desktop touch emulation is not real-device validation.

## Development and verification

Generate fixtures: python tests/make-fixtures.py --ffmpeg /path/to/ffmpeg.
Core: node --test tests/model.test.mjs tests/project.test.mjs.
Browser: node tests/phase2.cjs and node tests/browser.cjs (Playwright with Edge).
Race protection: node tests/export-race.cjs.
Upgrade/draft migration: node tests/update.cjs (requires full history).
Actual desktop V13 bridge: node tests/desktop-bridge.cjs (read-only sibling ../NiVedit.html).
Independent decoded outputs: python tests/check-composition.py --ffmpeg /path/to/ffmpeg.
Optional private local project: node tests/desktop-roundtrip.mjs /path/to/project.nvproj; reports only counts and preservation results in ignored qa/.
Rebuild example: python scripts/make-example.py --ffmpeg /path/to/ffmpeg.

After app edits, update package/model/SW/UI version and run python scripts/release.py. All precached assets are SHA-256 pinned; mixed releases cannot install. update.html activates only after a user click, preserving drafts, named projects and OPFS data.
