"""
Temporary manual driver — run grading pipeline on a single image and dump
segmentation + CAM outputs as PNG files in the calling directory.

Usage:
    python test_grading_driver.py path/to/image.jpg

Not wired into the service; delete when done testing.
"""
import json
import os
import sys
from pathlib import Path

# Config requires DB_* env vars to construct; they're unused by the grading
# pipeline itself, so stub them out rather than touching local.settings.json.
for k, v in {
    "DB_USER": "x", "DB_PASSWORD": "x", "DB_HOST": "x", "DB_NAME": "x",
}.items():
    os.environ.setdefault(k, v)

sys.path.insert(0, str(Path(__file__).parent))

from shared.ml_models import analyse  # noqa: E402


def main():
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <image_path>")
        sys.exit(1)

    img_path = Path(sys.argv[1])
    image_bytes = img_path.read_bytes()

    result = analyse(image_bytes)

    if not result["detection"]["detected"]:
        print("detection failed:", result["detection"]["reasons"])
        print("metrics:", result["detection"]["metrics"])
        sys.exit(1)

    out_dir = Path.cwd()
    for name, png_bytes in result["images"].items():
        out_path = out_dir / f"{img_path.stem}_{name}.png"
        out_path.write_bytes(png_bytes)
        print("wrote", out_path)

    print(json.dumps(result["grading"], indent=2))


if __name__ == "__main__":
    main()
