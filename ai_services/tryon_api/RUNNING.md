# SWAG Try On AI Service

This folder is the copied FastAPI virtual try-on service used by `afro-app`.
It is intentionally kept separate from the NestJS API in `swag_api`.

## Start locally

From this folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

Health check:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

Public phone access still needs a tunnel, for example:

```powershell
ngrok http 8000
```

Then set `EXPO_PUBLIC_TRYON_API_BASE_URL` in `afro-app` to the ngrok URL.

## Important folders

- `api/main.py` - FastAPI endpoints, including `POST /v1/tryon/upload`.
- `swag_vton/pipeline.py` - model wrapper and preprocessing.
- `weights/` - copied model weights.

Do not delete `weights/` unless your team is ready to download the model again.
