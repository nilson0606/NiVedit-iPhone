# NiVedit iPhone
Independent iPhone Web App, based on desktop V13 semantics. Phase 1 preview 0.1.0.
Desktop NiVedit is not modified or deployed by this repository.

- Site: https://nilson0606.github.io/NiVedit-iPhone/
- Baseline: nilson0606/NiVedit at `1e73b55ea388e6b9f1c7925f0651846cdb8f20c0` (V13).
- Plan: [To_IPhone.md](docs/To_IPhone.md).
- Status: [phase-1.md](docs/phase-1.md).
- Local development: `python -m http.server 8093 --bind 127.0.0.1`, then open http://localhost:8093/.
- Tests: `node --test tests/model.test.mjs`; browser integration: `node tests/browser.cjs` (Playwright, Edge, generated QA fixtures).
- No build required. Serve via HTTPS or localhost, not file://.
- Dependency: vendored, unmodified Mediabunny **1.58.1** (MPL-2.0), for lazy Blob reads, decoding, timed transcoding and muxing. No runtime CDN dependency. See [THIRD_PARTY.md](THIRD_PARTY.md).
- Source video/audio never leaves the device. Files are held in local IndexedDB drafts and optional OPFS output storage.
- Internal draft fields reuse V13 `clips/inP/outP/at/track/proj` meanings, but the phase-1 draft is NOT NVPROJ1. Desktop project round-trip is phase 2.

First phase: one source clip, portrait/landscape UI, trim, undo/redo, original audio preview, 720p30 MP4 H.264/AAC export, cancel/retry, save/share, local draft, dark/light, Chinese/English, PWA shell, guide, diagnostics.
Full V13 parity and real iPhone acceptance are pending. No feature has been removed from the final roadmap.

