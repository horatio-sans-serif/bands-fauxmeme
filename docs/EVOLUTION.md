# FAUXMEME — evolution

## 2026-10-19 — brainstorm created

**Subject.** Brian's note: "FAUXMEME, as in phoneme, but fake culture / faux meme culture." Asked for
an adjacent treatment brainstorm next to `bands/meat-proxy`.

**Claims.**
- The name is a minimal pair with "phoneme": /ˈfoʊ.niːm/ vs /ˈfoʊ.miːm/, one nasal swapped.
- Meme already means "imitated thing" (Dawkins 1976, from Greek mīmēma), so a fauxmeme is a fake
  imitation: a copy with no original (Baudrillard's simulacrum).
- The adjacency to Meat Proxy is relay vs payload: Meat Proxy is the person on the route, FAUXMEME is
  what travels it. The two charters mirror each other (Rule 02 invent/borrow, §08 filter/no filter).
- Five readings ranked in `BRAINSTORM.md` §3; reading 1 (a band that exists only as its own memes)
  ranked first.

**Questions.** Which reading? Own treatment, MP-0000 section, or note? Is it a band at all?

**Risks.** It could read as a rename of Meat Proxy. The private Appendix A material must not leak
across.

**Annotations.** Meat Proxy is not a git repo; neither is this. Files: `BRAINSTORM.md`, `AGENTS.md`.

## 2026-10-19 — reading 2 picked: the phoneme instrument

**Subject.** Brian: make up "words" from phonemes as an instrument; sing each phoneme into a library
and play it from a MIDI controller. Reason given: he has nothing to say, he thinks in music and
rhythm, he likes to create.

**Claims.**
- Design in `INSTRUMENT.md` (FM-0001): consonants on pads as drums, vowels and hums on keys as
  pitched held notes; kit mode (one sound per key) and word mode (typed word, one syllable per note).
- Prior art: UTAU (own-voice voicebanks from a recording list), Yamaha Pocket Miku (2014) and
  Vocaloid Keyboard (2019) for word mode; konnakol and beatboxing for consonants-as-rhythm.
- Machine check: GarageBand only, no plug-ins, no USB MIDI device attached at check time; 13 GB free.
  `audio/demo-tape` can record takes; `audio/looper` already does CoreMIDI.
- Proposed v0: ~40 phonemes → slicer → one-file Web Audio + Web MIDI page.

**Questions.** Which controller? Single phonemes (choppy) or recorded syllables (smooth, a few
hundred takes)? Browser page vs iPad vs a sampler plug-in?

**Risks.** Formant shift above ~3 semitones (chipmunk) — needs vowels sung at 3–4 pitches. Web Audio
latency on macOS may sit near the 20 ms tolerance; unmeasured.

**Annotations.** Rubric in `INSTRUMENT.md` §4; criteria 5–6 are human-judged and unmeasured.

## 2026-10-20 — v0 instrument built

**Subject.** Brian answered: keyboard with drum pads (1A); single phonemes, choppy (2A). Built the
cheapest version that can be assessed.

**Claims.**
- `instrument/`: `server.mjs` (zero-dependency node:http on 127.0.0.1:4797, library as WAV files +
  `library.json`), `dsp.mjs` (WAV, YIN pitch, steadiest-stretch finder, crossfade loop, word parser —
  shared by page and Node), `index.html` (Record / Kit / Word / Setup views, Web MIDI + Web Audio),
  `seed.mjs` (synthetic library), `collect.mjs` (assess collector), `test.mjs`.
- Kit mode: keys sing the current vowel, mod wheel (CC1) sweeps vowels and crossfades held notes,
  pitch bend ±2. Word mode: onset consonants on press, vowel held, coda on release.
- Tests 13/13 pass. Synthetic library: median spread 0 cents, `aa@mid` seam −53.5 dB.
- Browser-pane smoke on the synthetic library: all 79 takes load, Word mode advances syllables,
  Kit mode picks the nearest take (G3 → `ee@high`, rate 1.122 = +2 semitones), pad 1 plays `k`,
  Setup stages and discards, no console errors. Slop scan: 0.
- First assessment (no recordings yet): behavior 0.33 (coverage fails, latency unmeasured until the
  page plays a note in Chrome), representation and experience unmeasured.

**Questions.** Does Brian's controller send pads on channel 10 from note 36? What is his middle
note (default C3)? Do the human criteria pass once he plays it?

**Risks.** Recording path not exercised automatically (the pane has no microphone). YIN analysis
takes ~0.3 s per sung take. Tolerances for steadiness (15 cents) and loop join (−10 dB) are starting
guesses until checked by ear.

**Annotations.** Rubric changed: criterion 3 rewritten (see INSTRUMENT.md rev 0.2), criterion
`real-voice` added.
