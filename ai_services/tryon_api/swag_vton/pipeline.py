# swag_vton/pipeline.py
import torch
from fashn_vton import TryOnPipeline
from PIL import Image, ImageOps

VALID_CATEGORIES = ["tops", "bottoms", "one-pieces"]
VALID_GARMENT_PHOTO_TYPES = ["model", "flat-lay"]

def resolve_category(garment_image: Image.Image, category: str) -> str:
    """If auto, default to tops since classifier is unreliable with drawable images."""
    if category == "auto" or category not in VALID_CATEGORIES:
        # Simple heuristic: check image aspect ratio
        w, h = garment_image.size
        ratio = h / w
        if ratio > 1.3:
            return "tops"      # tall image = likely a top
        elif ratio < 0.9:
            return "bottoms"   # wide image = likely bottoms
        else:
            return "tops"      # default fallback
    return category

def resolve_garment_photo_type(garment_photo_type: str) -> str:
    if garment_photo_type in VALID_GARMENT_PHOTO_TYPES:
        return garment_photo_type
    return "flat-lay"

class SwagVTON:
    def __init__(self, weights_dir="./weights"):
        print("🔄 Loading SWAG VTON model...")
        self.pipeline = TryOnPipeline(weights_dir=weights_dir)
        print("✅ SWAG VTON ready on RTX 4060!")

    def run(
        self,
        person_image: Image.Image,
        garment_image: Image.Image,
        category: str = "auto",
        garment_photo_type: str = "flat-lay",
    ) -> Image.Image:

        # Clear VRAM before each run
        torch.cuda.empty_cache()

        # Keep original proportions; the underlying pipeline does aspect-preserving
        # resize/pad. Fixed resizing here can make long pants look like shorts.
        person_image  = self._preprocess(person_image)
        garment_image = self._preprocess(garment_image)

        # Resolve category — never pass None to pipeline
        resolved = resolve_category(garment_image, category)
        resolved_photo_type = resolve_garment_photo_type(garment_photo_type)
        print(
            f"🏷️ Category requested: '{category}' → resolved: '{resolved}' | "
            f"garment photo type: '{resolved_photo_type}'"
        )

        # Run the try-on
        with torch.inference_mode():
            result = self.pipeline(
                person_image=person_image,
                garment_image=garment_image,
                category=resolved,
                garment_photo_type=resolved_photo_type,
            )

        # Clear VRAM after run
        torch.cuda.empty_cache()

        return result.images[0]

    def _preprocess(self, image: Image.Image) -> Image.Image:
        return ImageOps.exif_transpose(image).convert("RGB")
