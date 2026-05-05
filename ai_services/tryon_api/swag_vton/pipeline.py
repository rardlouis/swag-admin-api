# swag_vton/pipeline.py
import torch
from fashn_vton import TryOnPipeline
from PIL import Image

VALID_CATEGORIES = ["tops", "bottoms", "one-pieces"]

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

class SwagVTON:
    def __init__(self, weights_dir="./weights"):
        print("🔄 Loading SWAG VTON model...")
        self.pipeline = TryOnPipeline(weights_dir=weights_dir)
        print("✅ SWAG VTON ready on RTX 4060!")

    def run(
        self,
        person_image: Image.Image,
        garment_image: Image.Image,
        category: str = "auto"
    ) -> Image.Image:

        # Clear VRAM before each run
        torch.cuda.empty_cache()

        # Preprocess both images
        person_image  = self._preprocess(person_image)
        garment_image = self._preprocess(garment_image)

        # Resolve category — never pass None to pipeline
        resolved = resolve_category(garment_image, category)
        print(f"🏷️ Category requested: '{category}' → resolved: '{resolved}'")

        # Run the try-on
        with torch.inference_mode():
            result = self.pipeline(
                person_image=person_image,
                garment_image=garment_image,
                category=resolved,
            )

        # Clear VRAM after run
        torch.cuda.empty_cache()

        return result.images[0]

    def _preprocess(self, image: Image.Image) -> Image.Image:
        return image.convert("RGB").resize((576, 864))