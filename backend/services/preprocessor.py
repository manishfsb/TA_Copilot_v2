import cv2
import numpy as np
from PIL import Image
from pathlib import Path
import pdf2image
import tempfile
import os

def pdf_to_images(pdf_path: str) -> list[np.ndarray]:
    pages = pdf2image.convert_from_path(pdf_path, dpi=200)
    return [np.array(page) for page in pages]

def preprocess_image(image: np.ndarray) -> np.ndarray:
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    else:
        gray = image

    # Deskew
    gray = _deskew(gray)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    # Adaptive threshold to handle uneven lighting / pencil vs pen
    binary = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 21, 10
    )

    return binary

def _deskew(gray: np.ndarray) -> np.ndarray:
    coords = np.column_stack(np.where(gray < 128))
    if len(coords) < 10:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 0.5:
        return gray
    h, w = gray.shape
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

def image_to_png_bytes(image: np.ndarray) -> bytes:
    pil_image = Image.fromarray(image)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        pil_image.save(tmp.name, format="PNG")
        tmp_path = tmp.name
    with open(tmp_path, "rb") as f:
        data = f.read()
    os.unlink(tmp_path)
    return data

def prepare_submission(file_path: str) -> list[bytes]:
    """Convert a PDF or image submission into a list of preprocessed PNG bytes."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        raw_pages = pdf_to_images(file_path)
    elif suffix in {".jpg", ".jpeg", ".png", ".webp"}:
        img = cv2.imread(file_path)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        raw_pages = [img_rgb]
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    return [image_to_png_bytes(preprocess_image(page)) for page in raw_pages]
