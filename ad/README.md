# Product ad: Zaragoza a mano (two cuts: 43 s master and 27 s short, 9:16, Spanish)

Made with [adkit](../../../../../adkit) (`node bin/adkit.mjs`). Run from the app folder; set `ADKIT=/path/to/adkit/bin/adkit.mjs`.

| Cut | Spec | Capture file | Music | Output |
|---|---|---|---|---|
| Long master, 43 s: hook, water, bus, tram + Bizi, 3-service montage, end card | `ad/ad.yaml` | `ad/capture.yaml` (take `take`, 960 frames, 15 actions) | `music.json` (43 bars) | `ad/out/zaragoza-a-mano.mp4` |
| Short cut, 27 s: hook, water, bus, Bizi, end card (no montage) | `ad/ad-short.yaml` | `ad/capture-short.yaml` (take `take-short`, 580 frames, 6 actions) | `music-short.json` (27 bars) | `ad/out/zaragoza-a-mano-short.mp4` |

Build either cut (swap the spec name):

    node $ADKIT capture ad/ad.yaml            # builds the app in ad/.adkit/work, records the take (long: 8 min, short: 4 min, cached)
    node $ADKIT render  ad/ad.yaml --draft    # half size, fast
    node $ADKIT render  ad/ad.yaml            # final (not committed)
    node $ADKIT check   ad/ad.yaml            # must pass; prints the spectrogram PNGs to look at
    node $ADKIT tile    ad/ad.yaml            # contact sheet; --from F --to T --count N to zoom

The app part of each cut is ONE take (one page session, stepped clock, no reset); blocks only choose a time range of it. A take leaves
Playwright's fake clock installed, which stalls the app's own fades in any screen shot after it. That is why the short cut has its own capture
file: its take must run right after `map`, with no long take before it. Frame 0 of each take is the first frame of its `near` block.

All data in the take is mocked: every network request is answered by a fixed file (Bizi, bus and tram in `capture/live`, map tiles in
`ad/tiles`, routes in `ad/routes`), the clock is fixed (Europe/Madrid, 2026-07-15 17:00, moving only with the stepped frames), the
position is fixed (41.6563, -0.8790), the saved state is a preset, service workers are blocked. `adkit check` (unmocked) fails a take
that asks the network for anything else. Live values on screen: bus "3 min", Bizi "7 bicis (3 eléctricas) · 22 anclajes", tram "2 min" (long cut only).
The app fades a drawer page through (cherry-picked app commit: old out 80 ms, new in 150 ms), so there is no empty-drawer flash longer than 3 frames. `checks.cuts` in each spec lists the few video frames where the content change plus drawer height still make a small spike.

Files: `ad.yaml` (story, copy), `capture.yaml` + `capture/*.js` (fixed place, Madrid summer afternoon, 8 fountain pins, live data answered by fixed files in capture/live),
`sound.yaml` (sound map: every cue is an object of Zaragoza), `music.json` (the approved jota extended to 43 bars, 3/4 at 180 bpm), `sound-short.yaml` + `music-short.json` (the short cut: same sounds, jota sections 1, 2, 6, 6, 7 and the cadence, ends on the tonic Dm).
Music samples: `~/.cache/adkit/venv/bin/python <adkit>/audio/fetch_samples.py` once.
Not an official city video: no crest or logo, the end card says "Proyecto independiente. No oficial."
