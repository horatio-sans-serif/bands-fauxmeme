# FAUXMEME

**What this is.** A phoneme instrument: Brian sings each sound of English once (about 40 sounds,
79 recordings), and a MIDI controller plays them back. Consonants are on the pads as drums; vowels
and hums are on the keys as held, pitched notes. Word mode sings a typed made-up word one syllable
per key press. Design: `INSTRUMENT.md`. Origin: `BRAINSTORM.md` (sibling of `../meat-proxy`).

## Commands

```bash
node instrument/server.mjs                 # http://127.0.0.1:4797/ — open in Chrome (Web MIDI)
node --test instrument/test.mjs            # 13 hermetic checks, ~20 s, no browser or mic
node instrument/seed.mjs --data /tmp/fm    # synthetic library for trying the page; never data/
node instrument/server.mjs --port 4798 --data /tmp/fm
assess run --no-judge                      # the rubric (assess/rubrics/), from the real library
assess rate keep-playing 4 "note"          # Brian's ratings for the human criteria
```

## Traps

- **Chrome only.** Safari has no Web MIDI. Chrome asks for MIDI and microphone permission on first
  use; a denied MIDI prompt shows as "MIDI blocked" in the header.
- **Echo cancellation, noise suppression and auto gain are turned off on purpose** in
  `getUserMedia`. With them on, a held vowel gets reshaped and the pitch measure lies.
- **Pitch shifting moves formants.** Each sung sound is recorded at three pitches (middle note and
  5 semitones either side) so the sampler shifts by 2.5 semitones at most inside that range.
- **Pads are matched by MIDI channel and note**: channel 10, notes 36–51 by default. If the pads do
  nothing, Setup → `b` → hit the bottom-left pad.
- **A loop seam metric that can't fail is not a metric.** The crossfade removes the click by
  construction, so `seamDb` measures the difference between the two crossfaded stretches instead.
- The browser pane cannot grant the microphone, so recording (mic → take → save) has not been run yet — not
  by the smoke test, not by hand.
- Meat Proxy's Appendix A is private. Do not carry its personal material into this project.
- Meat Proxy's Rule 02 forbids invented vocabulary. FAUXMEME deliberately reverses it.

## Working agreements

- `instrument/data/` is Brian's voice: live state, the only copy, gitignored. Re-recording moves
  the old take to `data/takes/old/`; nothing is deleted.
- The agent commits at tested checkpoints without asking; never push without asking. Detail and
  decisions go in `docs/EVOLUTION.md`.
