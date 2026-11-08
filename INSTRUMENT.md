# FAUXMEME — the phoneme instrument

**Document FM-0001, rev 0.1 (design).** Brian picked reading 2 of `BRAINSTORM.md` on 2026-10-19:
*"I would love to make up 'words' or long strings of phonemes as a musical instrument … Maybe have me
sing each phoneme of a library of such as a voice and use it on a MIDI controller."*

Why, in his words: *"I really don't have anything TO SAY … I am just a guy who thinks in MUSIC and
RHYTHM. I like to create."* So the instrument makes sounds that behave like words but carry no
message. There is a long line of singers who used invented syllables for this reason: Elizabeth
Fraser of Cocteau Twins, Sigur Rós's "Hopelandic" (Vonlenska), Meredith Monk, scat singing. In each
case the singer kept the sound of language and dropped the meaning.

---

## 1. The idea, in layers

**Layer 0 — one key, one sound of your voice.** Brian sings each phoneme once. Each recording goes on
its own key or pad. Pressing the key plays that sound.
Running example: the key C3 plays Brian singing **"aa"**; a pad plays **"k"**.

**Layer 1 — consonants are drums, vowels are notes.** Built on Layer 0: the recordings are not all
the same kind of sound, so they go on different kinds of control.

```
 phoneme kind              sounds like          goes on            plays as
 p t k b d g  (stops)      a drum hit           pads               one-shot, not pitched
 s sh f th h  (hiss)       hi-hat, shaker       pads               one-shot or held
 m n ng l r   (hums)       a pad or drone       keys               held, pitched
 aa ee oo eh… (vowels)     a sung note          keys               held, pitched, looped
```

This split matches how rhythm syllables already work. In Carnatic konnakol, a drummer speaks
"ta ka di mi" — the consonants carry the rhythm. Beatboxing does the same thing with p, t, k and s.
Running example: a pad plays **k**, then the key C3 plays **aa** held for two beats. That is the
syllable "kaa", made by two hands.

**Layer 2 — joining sounds into made-up words.** Built on Layer 1: a word is a sequence of these
sounds. Real speech blends each sound into the next (linguists call it coarticulation). Joining
single recorded phonemes end to end skips the blend, so the result sounds chopped and robotic.
Two ways to handle it:

- **Keep the chop.** It sounds made of parts, which is what a fauxmeme is. This is the cheapest, and
  it needs only about 40 recordings.
- **Record the joins.** Sing consonant-vowel syllables ("ka", "ki", "lu"…) as whole recordings. This
  is how UTAU, the free singing synth, builds a voice from a person's own recordings. It sounds
  smoother, but it needs a few hundred recordings.

Running example: "kaa-lu-mi" played from single phonemes sounds stitched; played from the syllables
"ka", "lu", "mi" it sounds sung.

**Layer 3 — two ways to play.** Built on Layer 2.

- **Kit mode.** Every sound has its own key or pad (Layer 1's table). You build words with your hands
  in real time.
- **Word mode.** You type a made-up word, such as `kaa lu mi nos`. Each key press plays the *next*
  syllable at that key's pitch. One hand only chooses the pitch; the word carries the sounds. Yamaha
  sold this as Pocket Miku (2014) and the Vocaloid Keyboard (2019).

Running example: type `kaa lu mi`, then play C3, E3, G3. You hear "kaa" on C, "lu" on E, "mi" on G.

---

## 2. What exists on this Mac (checked 2026-10-19)

- **Recording:** `audio/demo-tape` records from a phone or browser straight to S3. GarageBand is
  installed. No other music software and no audio plug-ins are installed.
- **MIDI:** `audio/looper` (Bloopsaphonics) already handles CoreMIDI input and a MIDI footswitch on
  the iPad. No USB MIDI device was plugged into the iMac when checked.
- **Disk:** 13 GB free. A 40-phoneme library at 48 kHz mono is about 10 MB, so it fits easily.

## 3. Cheapest build that can be assessed

```
 Demo Tape / mic ──▶ slicer script ──▶ phoneme library ──▶ instrument page ◀── MIDI controller
 (Brian sings)       (cut, trim,       (WAV + one JSON      (Web Audio +
                      find loop,        index)               Web MIDI, one
                      measure pitch)                         HTML file)
```

1. **Recording list.** About 40 phonemes for General American English: roughly 24 consonants and
   15 vowels. Sing each vowel and hum for 2 seconds at one comfortable note. Speak each stop three
   times. About 30 minutes.
2. **Slicer.** Cuts each take, trims silence, finds a loop point inside each held sound, and measures
   its pitch.
3. **Instrument page.** One self-contained HTML file in Chrome, using Web MIDI for the controller
   and Web Audio for sound. It needs no install.

**Trap to plan for:** a sampler changes pitch by playing the recording faster or slower, which also
moves the vowel's formants, so a voice shifted up more than about three semitones sounds like a
chipmunk. The fix is to sing each vowel at three or four pitches across your range and play the
nearest recording. That multiplies the vowel recordings by three or four.

## 4. Rubric

The decision this serves: **is a voice-of-Brian phoneme instrument something he will play?**

| # | Criterion | Metric | Ground truth | Tolerance | Judge |
|---|---|---|---|---|---|
| 1 | Every phoneme on the list is recorded | recorded ÷ listed | the recording list | 100% | numeric |
| 2 | Held vowels stay on pitch | pitch spread across the sustain | the note Brian aimed for | ≤ 15 cents | numeric |
| 3 | Loops join smoothly | how different the two crossfaded stretches are | identical stretches | ≤ −10 dB | numeric |
| 4 | It responds fast enough to play | key press → sound | — | ≤ 20 ms | numeric |
| 5 | A word played in word mode sounds like one word | Brian's rating, 1–5 | Brian's ear | ≥ 3 | human |
| 6 | Brian wants to keep playing it | Brian's rating, 1–5 | Brian | ≥ 4 | human |

Criteria 5 and 6 can only be judged by Brian listening. Until he rates them, they are unmeasured.

Rev 0.2 (2026-10-20): criterion 3 changed. The loop is now crossfaded, which removes the click by
construction, so the old "jump in level" metric could never fail. The new metric measures how much
the crossfade has to hide. The rubric lives in `assess/rubrics/`; run `assess run --no-judge`.
Criterion 7 (no synthetic takes) stops the test library from passing as Brian's voice.
