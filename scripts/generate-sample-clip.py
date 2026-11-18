"""Generate the bundled sample field note (audio + word-timed transcript).

Uses the free edge-tts neural voices, then mixes in low-level job-site noise with
ffmpeg so the waveform looks like a real recording. Run once; outputs are committed.

    python3 -m venv .venv && .venv/bin/pip install edge-tts
    .venv/bin/python scripts/generate-sample-clip.py
"""
import asyncio, json, subprocess, pathlib
import edge_tts

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "samples"
TEXT = (
    "Uh, hey, it's Mike on the Riverside job. So, the rebar delivery showed up late again, "
    "we're like two days behind on slab rebar, and the pour in Area B is gonna slip with it. "
    "Electrician's crew didn't show this morning, so electrical rough-in is three days behind. "
    "Oh, and plumbing can't start until the HVAC ductwork is in, they're fighting for the same ceiling space. "
    "Roofing's fine, no delay there."
)

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    com = edge_tts.Communicate(TEXT, "en-US-BrianNeural", rate="+8%", boundary="WordBoundary")
    audio = bytearray()
    words = []
    async for chunk in com.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            words.append({
                "w": chunk["text"],
                "t": round(chunk["offset"] / 1e7, 3),
                "d": round(chunk["duration"] / 1e7, 3),
            })
    raw = OUT / "_voice.mp3"
    raw.write_bytes(bytes(audio))
    # Mix with brown noise (wind / distant machinery) at a low level.
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
        "-f", "lavfi", "-i", "anoisesrc=color=brown:amplitude=0.05:seed=7",
        "-filter_complex", "[1:a]volume=0.55[n];[0:a][n]amix=inputs=2:duration=first:normalize=0,highpass=f=80",
        "-ar", "44100", "-ac", "1", "-b:a", "96k", str(OUT / "field-note-riverside.mp3"),
    ], check=True)
    raw.unlink()
    (OUT / "field-note-riverside.json").write_text(json.dumps({"text": TEXT, "words": words}, indent=1))
    print(len(words), "words")

asyncio.run(main())
