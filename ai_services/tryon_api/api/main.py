# api/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io, base64, os, sys

# This makes sure Python can find swag_vton from the root folder
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from swag_vton.pipeline import SwagVTON

app = FastAPI(
    title="SWAG Virtual Try-On API",
    description="Custom VTON API by rardlouis, powered by fashn-vton-1.5",
    version="1.0.0"
)

# Allow Android app to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model ONCE when server starts
print("🔄 Starting SWAG VTON API...")
vton = SwagVTON(weights_dir="./weights")

# Preset garments folder
PRESET_DIR = "./presets"


# ───────────────────────────────────────────
# ROUTE 1: User uploads BOTH images
# ───────────────────────────────────────────
@app.post("/v1/tryon/upload")
async def tryon_upload(
    person_image: UploadFile = File(...),
    garment_image: UploadFile = File(...),
    category: str = Form(default="auto"),
    garment_photo_type: str = Form(default="flat-lay")
):
    try:
        person_bytes  = await person_image.read()
        garment_bytes = await garment_image.read()

        # Debug — print sizes on server side
        print(f"👤 Person image size: {len(person_bytes)} bytes")
        print(f"👕 Garment image size: {len(garment_bytes)} bytes")

        if len(person_bytes) == 0:
            raise HTTPException(status_code=400, detail="Person image is empty!")
        if len(garment_bytes) == 0:
            raise HTTPException(status_code=400, detail="Garment image is empty!")

        person  = Image.open(io.BytesIO(person_bytes))
        garment = Image.open(io.BytesIO(garment_bytes))

        print(f"👤 Person size: {person.size}")
        print(f"👕 Garment size: {garment.size}")

        output = vton.run(
            person,
            garment,
            category=category,
            garment_photo_type=garment_photo_type,
        )

        if output is None:
            raise HTTPException(status_code=500, detail="Pipeline returned None!")

        buf = io.BytesIO()
        output.save(buf, format="JPEG", quality=90)
        b64 = base64.b64encode(buf.getvalue()).decode()

        return JSONResponse({
            "status": "success",
            "image": f"data:image/jpeg;base64,{b64}"
        })

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()  # Full error in PowerShell!
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────────────────────────
# ROUTE 2: User photo + preset garment
# ───────────────────────────────────────────
@app.post("/v1/tryon/preset")
async def tryon_preset(
    person_image: UploadFile = File(...),
    garment_id: str = Form(...),
    category: str = Form(default="auto"),
    garment_photo_type: str = Form(default="flat-lay")
):
    garment_path = os.path.join(PRESET_DIR, f"{garment_id}.jpg")
    if not os.path.exists(garment_path):
        raise HTTPException(
            status_code=404,
            detail=f"Preset garment '{garment_id}' not found"
        )

    try:
        person = Image.open(io.BytesIO(await person_image.read()))
        garment = Image.open(garment_path)

        output = vton.run(
            person,
            garment,
            category=category,
            garment_photo_type=garment_photo_type,
        )

        buf = io.BytesIO()
        output.save(buf, format="JPEG", quality=90)
        b64 = base64.b64encode(buf.getvalue()).decode()

        return JSONResponse({
            "status": "success",
            "image": f"data:image/jpeg;base64,{b64}"
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────────────────────────
# ROUTE 3: List all preset garments
# ───────────────────────────────────────────
@app.get("/v1/garments")
def list_garments():
    if not os.path.exists(PRESET_DIR):
        return {"garments": []}
    files = [f.replace(".jpg", "") for f in os.listdir(PRESET_DIR) if f.endswith(".jpg")]
    return {"garments": files}


# ───────────────────────────────────────────
# Health check
# ───────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "api": "SWAG Virtual Try-On",
        "version": "1.0.0",
        "author": "rardlouis"
    }
