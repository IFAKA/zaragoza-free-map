# Product ad: Zaragoza a mano (43 s, 9:16, Spanish)

Made with [adkit](../../../../../adkit) (`node bin/adkit.mjs`). Run from the app folder; set `ADKIT=/path/to/adkit/bin/adkit.mjs`.

    node $ADKIT capture ad/ad.yaml            # builds the app in ad/.adkit/work, photographs it (50 s, cached)
    node $ADKIT render  ad/ad.yaml --draft    # half size, fast
    node $ADKIT render  ad/ad.yaml            # final: ad/out/zaragoza-a-mano.mp4 (not committed)
    node $ADKIT check   ad/ad.yaml            # must pass; prints the spectrogram PNGs to look at
    node $ADKIT tile    ad/ad.yaml            # contact sheet; --from F --to T --count N to zoom

Files: `ad.yaml` (story, copy), `capture.yaml` + `capture/*.js` (fixed place, Madrid summer afternoon, 8 fountain pins, live data answered by fixed files in capture/live),
`sound.yaml` (sound map: every cue is an object of Zaragoza), `music.json` (the approved jota extended to 43 bars, 3/4 at 180 bpm).
Music samples: `~/.cache/adkit/venv/bin/python <adkit>/audio/fetch_samples.py` once.
Not an official city video: no crest or logo, the end card says "Proyecto independiente. No oficial."
