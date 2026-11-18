"""
Free, local, OpenAI-compatible speech-to-text for the server-side STT path.

    python -m venv .whisper
    .whisper/bin/pip install faster-whisper "av<16" fastapi uvicorn python-multipart
    .whisper/bin/python scripts/local-whisper-server.py            # http://127.0.0.1:8001/v1

    STT_PROVIDER=whisper-local pnpm dev

Implements just POST /v1/audio/transcriptions (multipart: file, model, prompt,
language) with the `{"text": ...}` response shape that /api/transcribe expects.
Runs on CPU with int8 weights; `base.en` transcribed the 22 s sample in under a second
on an 8-core CPU.
"""

import os
import tempfile

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "base.en")
app = FastAPI()
_models: dict[str, WhisperModel] = {}


def get_model(name: str) -> WhisperModel:
    if name not in _models:
        _models[name] = WhisperModel(name, device="cpu", compute_type="int8")
    return _models[name]


@app.post("/v1/audio/transcriptions")
async def transcriptions(
    file: UploadFile = File(...),
    model: str = Form(MODEL),
    prompt: str | None = Form(None),
    language: str | None = Form(None),
):
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp.flush()
        segments, _ = get_model(model or MODEL).transcribe(
            tmp.name, initial_prompt=prompt, language=language or None, vad_filter=True
        )
        text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text}


if __name__ == "__main__":
    get_model(MODEL)  # download/load once at startup
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8001")))
