# NiVedit iPhone

Independent iPhone Web App, desktop V13 semantics. **0.2.3, local projects and categorized media/audio.**
Desktop NiVedit and its restore points are unchanged.

- Site: https://nilson0606.github.io/NiVedit-iPhone/
- Baseline: nilson0606/NiVedit V13 at 1e73b55ea388e6b9f1c7925f0651846cdb8f20c0.
- Plan: [To_IPhone.md](docs/To_IPhone.md).
- Current release: [local-projects-audio-0.2.3.md](docs/local-projects-audio-0.2.3.md).
- Previous preview fix: [preview-0.2.2.md](docs/preview-0.2.2.md); phase 2: [phase-2.md](docs/phase-2.md); historical [phase-1.md](docs/phase-1.md).
- Guide: [manual.html](manual.html).
- Local: python -m http.server 8093 --bind 127.0.0.1. Use HTTPS/localhost, not file://.
- Dependency: vendored unmodified Mediabunny 1.58.1 (MPL-2.0); see THIRD_PARTY.md. No runtime CDN.
- Media stays on-device. Public example uses only original synthetic graphics and tones.
- NVPROJ1 portable projects preserve desktop fields and embedded assets. Unsupported desktop effects are retained and visibly flagged; incomplete video export is blocked.
- Browser projects use explicit Save / Save a copy with IndexedDB transactions. Autosave drafts are removed; a one-time migration recovers existing drafts into the Projects list. A downloaded/shared NVPROJ1 is the external backup.
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

After app edits, update package/model/SW/UI version and run python scripts/release.py. All precached assets are SHA-256 pinned; mixed releases cannot install. update.html activates only after a user click, preserving named projects and OPFS data.

Preview playback: node tests/preview-playback.cjs measures the actual Web Audio output graph, overlaps/mute/pause, slow decode and black-frame continuity. Preview decodes video/audio in a disposable worker, renders each selected frame once, and schedules bounded PCM audio on the UI thread.

Playback stress: node tests/preview-stress.cjs (13s 1080p60, five complete plays, 4x UI CPU throttle, repeat pause/seek, forced worker hangs). PREVIEW_BASELINE=ba9102c runs the previous build for comparison. The prior build also plays smoothly on this PC: the user subsequently reported no stutter in the latest playback attempt on 0.2.2. This does not close every device/performance case. The user declined to provide the source clip; use generic fixtures rather than clip-specific tuning.

0.2.3: Name new projects, save to My projects, and reopen from the home screen. Photos/Files video-image categories, Files audio import and the approved 41-track music catalog are available. User media stays in local IndexedDB and portable backups; no upload backend. Library MP3 files are fetched only when selected, verified by SHA-256, and embedded after adding/saving. Title/subtitle/GIF and advanced audio remain staged work. Audio-only projects can preview; MP4 export requires a visual clip.
Audio/local storage integration: node tests/local-projects-audio.cjs. Music sources copied byte-for-byte from the desktop approved music_pack_41_v2; rejected trial packs are excluded.
