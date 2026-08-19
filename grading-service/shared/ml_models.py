"""
ML model inference — SEGMENTATION and GRADING.

Port of the reference pipeline (embryo_inference_api.py). One forward pass
produces both outputs, so `analyse()` does the work in a single call and is
cached per image:

  analyse(image_bytes) -> {
    "images": {"exp": bytes, "icm": bytes, "te": bytes, "annotated": bytes},
    "grading": {"grade", "icm_inference", "te_inference", "exp_inference",
                "zona_pellucida", "blastocoel", "ai_score", ...},
  }

The architecture below must match training exactly — do not "clean it up".
"""
import hashlib
import logging
import os
import sys
import threading
from pathlib import Path
from typing import Dict, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import timm
import segmentation_models_pytorch as smp
import torchvision.transforms as T
import torchvision.transforms.functional as TF
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import config

logger = logging.getLogger(__name__)

IMG_SIZE = 384
SEG_SIZE = 256
FEAT_DIM = 17
NUM_EXP, NUM_ICM, NUM_TE = 3, 2, 2

EXP_INV = {0: "3", 1: "4", 2: "5"}
ICM_INV = {0: "A", 1: "B"}
TE_INV = {0: "A", 1: "B"}

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 0=bg 1=ZP 2=TE 3=Blastocoel 4=ICM
SEG_PALETTE = np.array([
    [30, 30, 30],
    [255, 210, 0],
    [0, 200, 255],
    [255, 0, 120],
    [0, 255, 90],
], dtype=np.uint8)

EXP_DESC = {
    "3": "early blastocyst — blastocoele fills less than half the embryo volume",
    "4": "full blastocyst — blastocoele completely fills the embryo",
    "5": "expanded blastocyst — blastocoele larger than embryo, zona thinning",
}
ICM_DESC = {
    "A": "prominent ICM, tightly packed with many cells — excellent potential",
    "B": "ICM present but loosely grouped, fewer cells — moderate potential",
    "C": "ICM difficult to discern — poor potential",
}
TE_DESC = {
    "A": "many cells forming a cohesive epithelial layer — excellent potential",
    "B": "few cells forming a loose epithelium — moderate potential",
    "C": "very few large cells — poor potential",
}
PROGNOSIS = {
    ("4", "A", "A"): "Excellent — highest implantation potential",
    ("4", "A", "B"): "Good — favorable implantation potential",
    ("4", "B", "A"): "Good — favorable implantation potential",
    ("5", "A", "A"): "Excellent — highest implantation potential",
    ("5", "A", "B"): "Good — favorable implantation potential",
    ("5", "B", "A"): "Good — favorable implantation potential",
    ("3", "A", "A"): "Good — developing, monitor closely",
    ("3", "A", "B"): "Fair — moderate implantation potential",
    ("3", "B", "A"): "Fair — moderate implantation potential",
    ("3", "B", "B"): "Fair — moderate implantation potential",
    ("4", "B", "B"): "Fair — moderate implantation potential",
    ("5", "B", "B"): "Fair — moderate implantation potential",
}
PROGNOSIS_TIER = {
    "Excellent — highest implantation potential": 3,
    "Good — favorable implantation potential": 2,
    "Good — developing, monitor closely": 2,
    "Fair — moderate implantation potential": 1,
}


# ── Architecture ──────────────────────────────────────────────────────────────

class ECABlock(nn.Module):
    def __init__(self, channels, k_size=3):
        super().__init__()
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.conv = nn.Conv1d(1, 1, kernel_size=k_size, padding=k_size // 2, bias=False)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        b, c, _, _ = x.shape
        y = self.avg_pool(x).view(b, 1, c)
        y = self.conv(y)
        y = self.sigmoid(y).view(b, c, 1, 1)
        return x * y.expand_as(x)


class SpatialAttentionGate(nn.Module):
    """Per-head spatial attention — learns which pixels matter for this head."""

    def __init__(self, in_channels, reduction=16):
        super().__init__()
        mid = max(in_channels // reduction, 32)
        self.gate = nn.Sequential(
            nn.Conv2d(in_channels, mid, kernel_size=1, bias=False),
            nn.BatchNorm2d(mid),
            nn.ReLU(inplace=True),
            nn.Conv2d(mid, 1, kernel_size=1, bias=False),
            nn.Sigmoid(),
        )

    def forward(self, x):
        return x * self.gate(x)


class GradingModel(nn.Module):
    def __init__(self, feat_dim, num_exp, num_icm, num_te):
        super().__init__()
        self.cnn = timm.create_model("densenet121", pretrained=False, num_classes=0, in_chans=4)
        cnn_out = self.cnn.num_features
        self.eca = ECABlock(cnn_out)
        self.gap = nn.AdaptiveAvgPool2d(1)

        self.attn_exp = SpatialAttentionGate(cnn_out)
        self.attn_icm = SpatialAttentionGate(cnn_out)
        self.attn_te = SpatialAttentionGate(cnn_out)

        self.feat_mlp = nn.Sequential(
            nn.Linear(feat_dim, 128), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(128, 128), nn.ReLU(),
        )
        fused = cnn_out + 128

        def _stream(out_cls):
            return nn.Sequential(
                nn.Linear(fused, 256), nn.BatchNorm1d(256), nn.ReLU(), nn.Dropout(0.25),
                nn.Linear(256, 128), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(0.1),
                nn.Linear(128, out_cls),
            )

        self.head_exp = _stream(num_exp)
        self.head_icm = _stream(num_icm)
        self.head_te = _stream(num_te)

    def _masked_pool(self, x_map, mask_ch):
        B, C, H, W = x_map.shape
        m = F.interpolate(mask_ch.expand(B, -1, -1, -1), size=(H, W), mode="bilinear", align_corners=False)
        weight = m.sum(dim=[2, 3], keepdim=True)
        empty = (weight < 1e-3).float()
        m = m * (1 - empty) + empty * torch.ones_like(m) / (H * W)
        weight = m.sum(dim=[2, 3], keepdim=True).clamp(min=1e-6)
        return ((x_map * m).sum(dim=[2, 3], keepdim=True) / weight).flatten(1)

    def forward(self, img, feats, mb=None, mi=None, mt=None):
        x_map = self.cnn.forward_features(img)
        x_map = self.eca(x_map)
        x_f = self.feat_mlp(feats)

        x_map_exp = self.attn_exp(x_map)
        x_map_icm = self.attn_icm(x_map)
        x_map_te = self.attn_te(x_map)

        if mb is not None:
            x_exp = self._masked_pool(x_map_exp, mb)
            x_icm = self._masked_pool(x_map_icm, mi)
            x_te = self._masked_pool(x_map_te, mt)
        else:
            x_exp = self.gap(x_map_exp).flatten(1)
            x_icm = self.gap(x_map_icm).flatten(1)
            x_te = self.gap(x_map_te).flatten(1)

        out_exp = self.head_exp(torch.cat([x_exp, x_f], dim=1))
        out_icm = self.head_icm(torch.cat([x_icm, x_f], dim=1))
        out_te = self.head_te(torch.cat([x_te, x_f], dim=1))
        return out_exp, out_icm, out_te


class HeadWrapper(nn.Module):
    """Wraps GradingModel so ScoreCAM can target a single head's logits."""

    def __init__(self, model, feats_tensor, head="exp"):
        super().__init__()
        self.model = model
        self.feats_const = feats_tensor
        self.head = head

    def forward(self, img):
        B = img.shape[0]
        mb = img[:, 1:2, :, :].float() / 255.0
        mi = img[:, 2:3, :, :].float() / 255.0
        mt = img[:, 3:4, :, :].float() / 255.0
        feats = self.feats_const.expand(B, -1)
        o_exp, o_icm, o_te = self.model(img, feats, mb=mb, mi=mi, mt=mt)
        return {"exp": o_exp, "icm": o_icm, "te": o_te}[self.head]


# ── Model loading ─────────────────────────────────────────────────────────────

_seg_transform = T.Compose([
    T.ToPILImage(),
    T.Resize((SEG_SIZE, SEG_SIZE)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_models_cache: Dict[str, object] = {}
_models_lock = threading.Lock()


def _resolve(path: str) -> str:
    """Model paths are relative to the function app root unless absolute."""
    return path if os.path.isabs(path) else str(Path(__file__).parent.parent / path)


def get_models():
    """Lazily load + cache both models. Safe to call on every request."""
    if "seg" in _models_cache and "grading" in _models_cache:
        return _models_cache["seg"], _models_cache["grading"]

    with _models_lock:
        if "seg" in _models_cache and "grading" in _models_cache:
            return _models_cache["seg"], _models_cache["grading"]

        seg_path = _resolve(config.SEG_MODEL_PATH)
        grading_path = _resolve(config.GRADING_MODEL_PATH)
        logger.info(f"Loading models onto {DEVICE}: {seg_path}, {grading_path}")

        seg_model = smp.UnetPlusPlus(encoder_name="resnet34", encoder_weights=None, in_channels=3, classes=5)
        seg_model.load_state_dict(torch.load(seg_path, map_location=DEVICE))
        seg_model.to(DEVICE).eval()

        grading_model = GradingModel(FEAT_DIM, NUM_EXP, NUM_ICM, NUM_TE)
        grading_model.load_state_dict(torch.load(grading_path, map_location=DEVICE))
        grading_model.to(DEVICE).eval()

        _models_cache["seg"] = seg_model
        _models_cache["grading"] = grading_model
        logger.info("Models loaded")
        return seg_model, grading_model


# ── Segmentation + feature extraction ─────────────────────────────────────────

def get_masks(img_bgr: np.ndarray, seg_model) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Returns icm_mask, te_mask, blastocoel_mask, zp_mask, class_map, conf_map."""
    h, w = img_bgr.shape[:2]
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    inp = _seg_transform(img_rgb).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        probs = torch.softmax(seg_model(inp).squeeze(0), dim=0).cpu().numpy()
    class_map = np.argmax(probs, axis=0).astype(np.uint8)
    conf_map = probs.max(axis=0)
    class_map = cv2.resize(class_map, (w, h), interpolation=cv2.INTER_NEAREST)
    conf_map = cv2.resize(conf_map, (w, h), interpolation=cv2.INTER_LINEAR)

    zp_mask = (class_map == 1).astype(np.uint8)
    te_mask = (class_map == 2).astype(np.uint8)
    blast_mask = (class_map == 3).astype(np.uint8)
    icm_mask = (class_map == 4).astype(np.uint8)
    return icm_mask, te_mask, blast_mask, zp_mask, class_map, conf_map


def detect_embryo(class_map: np.ndarray, conf_map: np.ndarray,
                  mi: np.ndarray, mt: np.ndarray, mb: np.ndarray, mz: np.ndarray) -> dict:
    """Structural sanity check on the segmentation output.

    The segmentation model has no reject class and was trained only on embryo
    crops, so it confidently hallucinates structure on any input. A real
    blastocyst segments as one large, round, dominant blob with ZP/TE/
    blastocoel all present; junk input segments as scattered speckle. This
    catches that without retraining anything.
    """
    if not config.DETECT_ENABLED:
        return {"detected": True, "reasons": [], "metrics": {}}

    total = class_map.size
    fg = (class_map != 0).astype(np.uint8)
    area_ratio = float(fg.sum()) / total
    reasons = []

    if not (config.DETECT_MIN_AREA <= area_ratio <= config.DETECT_MAX_AREA):
        reasons.append(f"embryo area {area_ratio:.1%} outside plausible range")

    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    blob_share, circularity = 0.0, 0.0
    if n > 1 and fg.sum() > 0:
        idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        blob_share = float(stats[idx, cv2.CC_STAT_AREA]) / float(fg.sum())
        blob = (labels == idx).astype(np.uint8)
        cnts, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            c = max(cnts, key=cv2.contourArea)
            a, p = cv2.contourArea(c), cv2.arcLength(c, True)
            if p > 0:
                circularity = (4 * np.pi * a) / (p * p)
    if blob_share < config.DETECT_MIN_BLOB_SHARE:
        reasons.append(f"segmentation fragmented (largest blob {blob_share:.1%})")
    if circularity < config.DETECT_MIN_CIRCULARITY:
        reasons.append(f"largest region not round (circularity {circularity:.2f})")

    for name, m in (("zona pellucida", mz), ("trophectoderm", mt), ("blastocoel", mb)):
        if m.sum() / total < 0.005:
            reasons.append(f"{name} not found")

    seg_confidence = float(conf_map[fg == 1].mean()) if fg.sum() else 0.0
    if seg_confidence < config.DETECT_MIN_SEG_CONF:
        reasons.append(f"low segmentation confidence ({seg_confidence:.2f})")

    return {
        "detected": not reasons,
        "reasons": reasons,
        "metrics": {
            "area_ratio": round(area_ratio, 4),
            "blob_share": round(blob_share, 4),
            "circularity": round(circularity, 3),
            "seg_confidence": round(seg_confidence, 4),
        },
    }


def _region_stats(mask, gray):
    area = mask.sum()
    total = gray.shape[0] * gray.shape[1]
    if area == 0:
        return 0.0, 0.0, 0.0, 0.0
    area_ratio = area / total
    vals = gray[mask == 1]
    mean_i, std_i = vals.mean(), vals.std()
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    circularity = 0.0
    if len(cnts) > 0:
        c = max(cnts, key=cv2.contourArea)
        a, p = cv2.contourArea(c), cv2.arcLength(c, True)
        if p > 0:
            circularity = (4 * np.pi * a) / (p * p)
    return area_ratio, mean_i, std_i, circularity


def extract_features(img_bgr, mi, mt, mb, mz) -> np.ndarray:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    ba, bm, bsd, bc = _region_stats(mb, gray)
    ia, im_, isd, ic = _region_stats(mi, gray)
    ta, tm, tsd, tc = _region_stats(mt, gray)

    icm_blast_ratio = ia / (ia + ba + 1e-6)
    te_blast_ratio = ta / (ta + ba + 1e-6)
    icm_te_ratio = ia / (ia + ta + 1e-6)
    zp_area = float(mz.sum()) / (gray.shape[0] * gray.shape[1])
    intensity_contrast = float(bm - im_) if ba > 0 and ia > 0 else 0.0

    feats = np.array([
        ba, bm, bsd, bc,
        ia, im_, isd, ic,
        ta, tm, tsd, tc,
        icm_blast_ratio, te_blast_ratio, icm_te_ratio,
        zp_area, intensity_contrast,
    ], dtype=np.float32)
    feats = np.nan_to_num(feats, nan=0.0, posinf=10.0, neginf=-10.0)
    return np.clip(feats, -10.0, 10.0).astype(np.float32)


def build_4ch_input(img_bgr, mi, mt, mb) -> Image.Image:
    """4-channel image: [gray, gray*blastocoel, gray*icm, gray*te] — matches training."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    gray_blast = (gray * mb).astype(np.uint8)
    gray_icm = (gray * mi).astype(np.uint8)
    gray_te = (gray * mt).astype(np.uint8)
    enhanced = np.stack([gray, gray_blast, gray_icm, gray_te], axis=-1).astype(np.uint8)
    return Image.fromarray(enhanced)


def grading_transform(img_pil: Image.Image) -> torch.Tensor:
    img_pil = TF.resize(img_pil, [IMG_SIZE, IMG_SIZE])
    t = TF.to_tensor(img_pil)
    mean = torch.tensor([0.485, 0.456, 0.406, 0.5]).view(4, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225, 0.5]).view(4, 1, 1)
    return (t - mean) / std


# ── ScoreCAM attention per head ───────────────────────────────────────────────

def run_scorecam(grading_model, img_4ch_tensor, feats_tensor, img_bgr_orig,
                 head="te", pred_class=None, batch_size=16) -> np.ndarray:
    """Returns an RGB uint8 overlay showing where the model looked for this head."""
    wrapper = HeadWrapper(grading_model, feats_tensor.unsqueeze(0), head).to(DEVICE).eval()
    target_layer = {
        "exp": wrapper.model.attn_exp.gate[0],
        "icm": wrapper.model.attn_icm.gate[0],
        "te": wrapper.model.attn_te.gate[0],
    }[head]

    img_in = img_4ch_tensor.unsqueeze(0).to(DEVICE)
    activations = {}
    handle = target_layer.register_forward_hook(lambda m, i, o: activations.update(value=o.detach()))
    with torch.no_grad():
        logits = wrapper(img_in)
        if pred_class is None:
            pred_class = logits.argmax(1).item()
    handle.remove()

    fmap = activations["value"][0]
    fmap_up = F.interpolate(fmap.unsqueeze(0), size=(IMG_SIZE, IMG_SIZE), mode="bilinear", align_corners=False)[0]
    fmin = fmap_up.flatten(1).min(dim=1, keepdim=True).values.unsqueeze(-1)
    fmax = fmap_up.flatten(1).max(dim=1, keepdim=True).values.unsqueeze(-1)
    norm_maps = (fmap_up - fmin) / (fmax - fmin).clamp(min=1e-6)

    base_img = img_in[0]
    scores = []
    with torch.no_grad():
        for i in range(0, norm_maps.shape[0], batch_size):
            masks = norm_maps[i:i + batch_size]
            b = masks.shape[0]
            masked = base_img.unsqueeze(0).expand(b, -1, -1, -1).clone()
            masked[:, 0:1, :, :] = base_img[0:1].unsqueeze(0) * masks.unsqueeze(1)
            out = wrapper(masked)
            scores.append(torch.softmax(out, dim=1)[:, pred_class].cpu())
    scores = torch.cat(scores)

    weights = torch.softmax(scores, dim=0).to(DEVICE)
    cam = F.relu((weights.view(-1, 1, 1) * norm_maps).sum(dim=0)).cpu().numpy()
    cam_min, cam_max = cam.min(), cam.max()
    if cam_max - cam_min > 1e-6:
        cam = (cam - cam_min) / (cam_max - cam_min)
    else:
        cam = np.zeros_like(cam)

    img_rgb = cv2.resize(cv2.cvtColor(img_bgr_orig, cv2.COLOR_BGR2RGB), (IMG_SIZE, IMG_SIZE)).astype(np.float32) / 255.0
    heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    image_weight = 0.5
    blended = (1 - image_weight) * heatmap + image_weight * img_rgb
    blended = blended / blended.max()
    return np.uint8(255 * blended)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _encode_png(img_rgb_uint8: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", cv2.cvtColor(img_rgb_uint8, cv2.COLOR_RGB2BGR))
    if not ok:
        raise RuntimeError("Failed to encode image to PNG")
    return buf.tobytes()


def describe_hatching(exp_grade: str) -> str:
    """Gardner expansion stage 5 is hatching and 6 is hatched; below 5 is enclosed."""
    try:
        stage = int(exp_grade)
        result = "Not Hatching"

        if stage == 5:
            result = "Hatching"
        elif stage >= 6:
            result = "Hatched"
        return result
    
    except (TypeError, ValueError):
        return "Not Hatching"


def describe_zona_pellucida(zp_mask: np.ndarray, embryo_area_px: int) -> str:
    if embryo_area_px <= 0:
        return "not assessable — no embryo area detected"
    pct = 100.0 * zp_mask.sum() / embryo_area_px
    if pct < 1:
        status = "not detected / fully hatched"
    elif pct < 6:
        status = "thin — consistent with hatching"
    elif pct < 16:
        status = "normal thickness"
    else:
        status = "thick / intact"
    return f"{status} ({pct:.1f}% of embryo area)"


def describe_blastocoel(blast_mask: np.ndarray, embryo_area_px: int, exp_grade: str) -> str:
    if embryo_area_px <= 0:
        return "not assessable — no embryo area detected"
    pct = 100.0 * blast_mask.sum() / embryo_area_px
    stage = {"3": "early expansion", "4": "fully expanded", "5": "over-expanded"}
    return f"{stage.get(exp_grade, 'expansion stage undetermined')} ({pct:.1f}% of embryo area)"


def compute_ai_score(pred_exp: str, pred_icm: str, pred_te: str,
                     conf_exp: float, conf_icm: float, conf_te: float) -> float:
    """Blends the Gardner-grade prognosis tier with model confidence into a 0-100
    score. Illustrative only — replace with the clinical team's validated formula."""
    tier = PROGNOSIS_TIER.get(PROGNOSIS.get((pred_exp, pred_icm, pred_te), ""), 0)
    base = {3: 92.0, 2: 78.0, 1: 60.0, 0: 45.0}[tier]
    avg_conf = (conf_exp + conf_icm + conf_te) / 3.0
    score = base * (0.7 + 0.3 * avg_conf)
    return round(min(100.0, max(0.0, score)), 1)


# ── Pipeline ──────────────────────────────────────────────────────────────────

_last: Dict[str, object] = {}
_last_lock = threading.Lock()


def analyse(image_bytes: bytes) -> dict:
    """
    Full pipeline for one image. Both the segmentation overlays and the grade
    come from the same forward pass, so the result is memoized on the image
    digest — a repeat call for the same image is free.
    """
    digest = hashlib.sha256(image_bytes).hexdigest()
    with _last_lock:
        if _last.get("digest") == digest:
            return _last["result"]  # type: ignore[return-value]

    seg_model, grading_model = get_models()

    img_bgr = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Could not decode input image")
    img_bgr = cv2.resize(img_bgr, (IMG_SIZE, IMG_SIZE))

    mi, mt, mb, mz, class_map, conf_map = get_masks(img_bgr, seg_model)
    detection = detect_embryo(class_map, conf_map, mi, mt, mb, mz)
    if not detection["detected"]:
        result = {"detection": detection, "grading": None, "images": {}}
        with _last_lock:
            _last["digest"] = digest
            _last["result"] = result
        return result

    embryo_area_px = int((class_map != 0).sum())

    pil_4ch = build_4ch_input(img_bgr, mi, mt, mb)
    feats_np = extract_features(img_bgr, mi, mt, mb, mz)
    img_t = grading_transform(pil_4ch).to(DEVICE)
    feats_t = torch.tensor(feats_np, dtype=torch.float32).to(DEVICE)

    mb_t = img_t[1:2].unsqueeze(0).float() / 255.0
    mi_t = img_t[2:3].unsqueeze(0).float() / 255.0
    mt_t = img_t[3:4].unsqueeze(0).float() / 255.0
    with torch.no_grad():
        o_exp, o_icm, o_te = grading_model(img_t.unsqueeze(0), feats_t.unsqueeze(0), mb=mb_t, mi=mi_t, mt=mt_t)

    exp_probs = torch.softmax(o_exp, dim=1)[0].cpu().numpy()
    icm_probs = torch.softmax(o_icm, dim=1)[0].cpu().numpy()
    te_probs = torch.softmax(o_te, dim=1)[0].cpu().numpy()
    i_exp, i_icm, i_te = int(exp_probs.argmax()), int(icm_probs.argmax()), int(te_probs.argmax())
    pred_exp, pred_icm, pred_te = EXP_INV[i_exp], ICM_INV[i_icm], TE_INV[i_te]
    conf_exp, conf_icm, conf_te = float(exp_probs[i_exp]), float(icm_probs[i_icm]), float(te_probs[i_te])

    exp_img = run_scorecam(grading_model, img_t, feats_t, img_bgr, head="exp", pred_class=i_exp)
    icm_img = run_scorecam(grading_model, img_t, feats_t, img_bgr, head="icm", pred_class=i_icm)
    te_img = run_scorecam(grading_model, img_t, feats_t, img_bgr, head="te", pred_class=i_te)

    seg_rgb = SEG_PALETTE[class_map]
    orig_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    annotated = np.uint8(0.5 * orig_rgb + 0.5 * seg_rgb)

    result = {
        "detection": detection,
        "images": {
            "exp": _encode_png(exp_img),
            "icm": _encode_png(icm_img),
            "te": _encode_png(te_img),
            "annotated": _encode_png(annotated),
        },
        "grading": {
            "grade": f"{pred_exp}{pred_icm}{pred_te}",
            "icm_inference": ICM_DESC.get(pred_icm, "unknown"),
            "te_inference": TE_DESC.get(pred_te, "unknown"),
            "exp_inference": EXP_DESC.get(pred_exp, "unknown"),
            "hatching": describe_hatching(pred_exp),
            "zona_pellucida": describe_zona_pellucida(mz, embryo_area_px),
            "blastocoel": describe_blastocoel(mb, embryo_area_px, pred_exp),
            "ai_score": compute_ai_score(pred_exp, pred_icm, pred_te, conf_exp, conf_icm, conf_te),
            "prognosis": PROGNOSIS.get((pred_exp, pred_icm, pred_te), "undetermined"),
            "confidence": {"exp": round(conf_exp, 4), "icm": round(conf_icm, 4), "te": round(conf_te, 4)},
        },
    }

    with _last_lock:
        _last["digest"] = digest
        _last["result"] = result
    return result
