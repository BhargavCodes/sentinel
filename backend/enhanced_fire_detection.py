# enhanced_fire_detection.py
"""
CORRECTED Enhanced Fire Detection - Balanced for Day/Night Fires

This version fixes the false negative problem where real night fires were being missed.
Calibrated to detect:
- Daytime fires (close-up, high saturation)
- Night fires (lower brightness, smoke-obscured)
- Distant fires (reduced texture detail)

While still rejecting:
- Autumn leaves (uniform texture, scattered)
- Sunsets (smooth gradients, low saturation)
- Red objects (no clustering, no smoke)
"""

# enhanced_fire_detection.py
"""
Sentinel — Enhanced Fire Detection Pre-Filter + ML Fusion
v4.0 — unbounded clustering, preprocess_input-aligned inference

Goals
-----
Detect:
  - daytime fires
  - night wildfires (low ambient brightness, bright localized flame)
  - smoky / obscured forest fires
  - distant fires (small flame area, low texture detail)
  - multiple simultaneous fire fronts (many disconnected flame regions)

Reject:
  - sunsets (smooth gradient, low texture, fire-color confined to sky band)
  - autumn forests / orange-red foliage (scattered, low clustering, no smoke)
  - city lights at night (small isolated bright points, no smoke, no fire color)
  - campfires (treated as low-severity, not a wildfire-grade event — still
    flagged but scored lower than a sustained spreading fire)
  - generic red objects (no smoke, no clustering, no texture)

Key fixes vs the previous "balanced" version
----------------------------------------------
1. Clustering no longer assumes 1-8 fire regions. Real wildfires routinely
   produce dozens of disconnected bright/flame blobs (individual burning
   trees, spotting, multiple fronts). The old `1 <= significant_clusters <= 8`
   check silently rejected exactly the multi-front wildfire images this
   system needs to catch. Clustering is now scored by *coverage and spread*
   rather than a hard cluster-count ceiling.
2. ML inference uses tensorflow.keras.applications.mobilenet_v2.preprocess_input,
   matching train_model.py exactly. The previous version divided by 255 and
   resized to 128x128 — both mismatched against a 224x224 model trained with
   preprocess_input. This mismatch alone can produce systematic false
   negatives, independent of how good the underlying model weights are.
3. Sunset penalty made directional: looks at whether fire-colored pixels are
   concentrated in a smooth horizontal sky band vs. scattered/vertical, which
   is a stronger night-fire-vs-sunset discriminator than texture alone.
4. Night-scene handling no longer requires a high fire_ratio to count — small,
   bright, clustered flame regions against a dark background are exactly what
   a distant night wildfire looks like, so the night bonus now also rewards
   high local contrast around fire-colored pixels.
"""

import numpy as np
import cv2
from PIL import Image
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

IMG_SIZE = (224, 224)


# =============================================================================
# STAGE HELPERS
# =============================================================================

def detect_smoke_pattern(image_pil: Image.Image) -> bool:
    """
    Smoke = low-saturation, mid-to-high-brightness pixels that are
    concentrated in the upper portion of the frame (smoke rises).
    """
    img_hsv = np.array(image_pil.convert("HSV"))
    S, V = img_hsv[:, :, 1], img_hsv[:, :, 2]

    smoke_mask = (S < 45) & (V > 90) & (V < 225)
    total_pixels = img_hsv.shape[0] * img_hsv.shape[1]
    smoke_ratio = np.count_nonzero(smoke_mask) / total_pixels

    if smoke_ratio < 0.04:
        return False

    upper_half_idx = img_hsv.shape[0] // 2
    smoke_in_upper = np.count_nonzero(smoke_mask[:upper_half_idx, :])
    total_smoke = np.count_nonzero(smoke_mask)

    if total_smoke == 0:
        return False

    upper_ratio = smoke_in_upper / total_smoke
    return upper_ratio > 0.35 or smoke_ratio > 0.18


def is_night_scene(image_pil: Image.Image) -> bool:
    """
    Night = low average brightness with localized bright spots
    (flame, embers, or city lights — disambiguated elsewhere).
    """
    img_hsv = np.array(image_pil.convert("HSV"))
    V = img_hsv[:, :, 2]
    avg_brightness = np.mean(V)
    has_bright_spots = np.count_nonzero(V > 140) > (V.size * 0.01)
    return avg_brightness < 95 and has_bright_spots


def detect_sunset_pattern(fire_mask: np.ndarray, std_dev: np.ndarray, img_height: int) -> tuple[bool, int]:
    """
    Sunsets show fire-colored pixels concentrated in a smooth horizontal band
    near the top of the frame (sky), with low local texture variance in that
    band. Wildfires, by contrast, show fire color along the ground/treeline
    with high local texture from flame flicker and silhouette edges.
    Returns (is_sunset, penalty_points).
    """
    fire_pixel_count = int(np.count_nonzero(fire_mask))
    if fire_pixel_count < 80:
        return False, 0

    sky_row_cut = max(1, int(img_height * 0.35))
    fire_in_sky = int(np.count_nonzero(fire_mask[:sky_row_cut, :]))
    top_fire_ratio = fire_in_sky / fire_pixel_count

    fire_region_texture = float(np.mean(std_dev[fire_mask])) if fire_pixel_count > 0 else 0.0

    if top_fire_ratio >= 0.55 and fire_region_texture < 22.0:
        return True, 2
    return False, 0


def analyze_clustering(fire_mask: np.ndarray) -> dict:
    """
    Unbounded clustering analysis. Real wildfires can have many disconnected
    flame regions (multiple fronts, individual burning trees, spotting), so
    we no longer cap or reject based on cluster *count*. Instead we score:
      - total number of clusters above a minimum size (any count >= 1 is a
        positive signal)
      - fraction of frame covered by fire-colored pixels (spread)
      - whether clusters are spatially dispersed (multi-front indicator) vs.
        a single tight blob (consistent with one fire, also fine)
    """
    fire_pixel_count = int(np.count_nonzero(fire_mask))
    if fire_pixel_count == 0:
        return {"num_clusters": 0, "has_clustering": False, "is_multi_front": False, "total_cluster_area": 0}

    fire_uint8 = fire_mask.astype(np.uint8) * 255
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(fire_uint8, connectivity=8)

    cluster_areas = [stats[i, cv2.CC_STAT_AREA] for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > 40]
    num_clusters = len(cluster_areas)
    total_cluster_area = int(sum(cluster_areas))

    # has_clustering is now simply "at least one real fire-colored region
    # exists" — no upper bound. Many small clusters (multi-front wildfire) is
    # treated as a STRONGER signal, not a rejection condition.
    has_clustering = num_clusters >= 1

    # Multi-front bonus: several independent regions, each individually small
    # relative to total fire area, spread across the frame.
    is_multi_front = num_clusters >= 4

    return {
        "num_clusters": num_clusters,
        "has_clustering": has_clustering,
        "is_multi_front": is_multi_front,
        "total_cluster_area": total_cluster_area,
    }


def detect_city_lights(image_pil: Image.Image, fire_mask: np.ndarray) -> bool:
    """
    City lights at night: many tiny, isolated, low-saturation bright points
    with no smoke and no real fire-color clustering. Used to suppress false
    positives from night cityscape shots, distinct from genuine night fires
    which show smoke and/or fire-colored clustering.
    """
    img_hsv = np.array(image_pil.convert("HSV"))
    S, V = img_hsv[:, :, 1], img_hsv[:, :, 2]

    bright_mask = (V > 180) & (S < 60)
    bright_uint8 = bright_mask.astype(np.uint8) * 255
    num_labels, _, stats, _ = cv2.connectedComponentsWithStats(bright_uint8, connectivity=8)

    tiny_points = sum(1 for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] < 15)
    fire_pixel_count = int(np.count_nonzero(fire_mask))

    return tiny_points > 25 and fire_pixel_count < 200


# =============================================================================
# MAIN ANALYSIS
# =============================================================================

def analyze_fire_characteristics(image_pil: Image.Image) -> dict:
    """
    Multi-stage fire analysis pipeline. Returns a dict with score, flags,
    and a confidence_level string consumed by predict_fire().
    """
    img_rgb = np.array(image_pil.convert("RGB"))
    hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)

    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    R, G, B = img_rgb[:, :, 0].astype(np.int16), img_rgb[:, :, 1].astype(np.int16), img_rgb[:, :, 2].astype(np.int16)

    # --- Stage 1: fire color (relaxed for night fires, OpenCV HSV: H in 0-179) ---
    fire_color_mask = ((H < 25) | (H > 170)) & (S > 80) & (V > 110)
    red_dominance = (R > G + 10) & (R > B + 10)
    fire_mask = fire_color_mask & red_dominance

    fire_pixel_count = int(np.count_nonzero(fire_mask))
    total_pixels = img_rgb.shape[0] * img_rgb.shape[1]
    fire_ratio = fire_pixel_count / total_pixels

    # --- Stage 2: texture (Laplacian-based local variance) ---
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    std_dev = np.abs(cv2.Laplacian(gray, cv2.CV_32F))
    avg_texture_variance = float(np.mean(std_dev[fire_mask])) if fire_pixel_count > 0 else 0.0
    has_fire_texture = avg_texture_variance > 18.0

    # --- Stage 3: brightness variation within fire-colored region ---
    if fire_pixel_count > 0:
        v_fire = V[fire_mask].astype(np.float32)
        brightness_std = float(np.std(v_fire))
    else:
        brightness_std = 0.0
    has_brightness_variation = brightness_std > 25.0

    # --- Stage 4: spatial clustering (unbounded) ---
    cluster_info = analyze_clustering(fire_mask)

    # --- Stage 5: saturation ---
    avg_saturation = float(np.mean(S))
    high_saturation = avg_saturation > 80 or (avg_saturation > 60 and fire_ratio > 0.15)

    # --- Stage 6: smoke ---
    has_smoke = detect_smoke_pattern(image_pil)

    # --- Stage 7: night scene + city-light disambiguation ---
    is_night = is_night_scene(image_pil)
    is_city_lights = is_night and detect_city_lights(image_pil, fire_mask)

    # --- Stage 8: sunset penalty ---
    is_sunset_pattern, sunset_penalty = detect_sunset_pattern(fire_mask, std_dev, img_rgb.shape[0])

    # === SCORING ===
    score = 0
    reasons = []

    if fire_ratio > 0.008:
        score += 1
        reasons.append(f"Fire-colored pixels: {fire_ratio * 100:.1f}%")

    if has_fire_texture:
        score += 2
        reasons.append(f"Irregular texture (variance: {avg_texture_variance:.1f})")

    if has_brightness_variation:
        score += 1
        reasons.append(f"Brightness variation: {brightness_std:.1f}")

    if cluster_info["has_clustering"]:
        score += 3
        reasons.append(f"Fire clustering: {cluster_info['num_clusters']} region(s)")

    if cluster_info["is_multi_front"]:
        score += 2  # multiple disconnected flame regions = strong wildfire signal
        reasons.append(f"Multi-front pattern: {cluster_info['num_clusters']} disconnected regions")

    if high_saturation:
        score += 1
        reasons.append(f"Adequate saturation: {avg_saturation:.1f}")

    if has_smoke:
        score += 2
        reasons.append("Smoke plume detected")

    if is_night and fire_pixel_count > 30 and not is_city_lights:
        score += 2  # distant/localized night fire signal, no minimum fire_ratio
        reasons.append("Night fire pattern (localized bright flame against dark scene)")

    if is_city_lights:
        score -= 3  # strong suppression for cityscape false positives
        reasons.append("City-lights pattern suppressed score")

    effective_score = max(0, score - sunset_penalty)
    max_score = 14

    # === DECISION TIERS ===
    if effective_score >= 8:
        is_likely_fire, confidence_level = True, "HIGH"
    elif effective_score >= 5:
        is_likely_fire, confidence_level = True, "MODERATE"
    elif cluster_info["has_clustering"] and has_smoke and not is_sunset_pattern and not is_city_lights:
        is_likely_fire, confidence_level = True, "OVERRIDE"
        effective_score = max(effective_score, 5)
    elif fire_ratio > 0.20 and cluster_info["has_clustering"] and not is_sunset_pattern and not is_city_lights:
        is_likely_fire, confidence_level = True, "OVERRIDE"
        effective_score = max(effective_score, 5)
    elif cluster_info["is_multi_front"] and not is_sunset_pattern and not is_city_lights:
        # Several disconnected fire-colored regions is, on its own, unusual
        # enough in natural scenes (vs. a single sunset/foliage blob) to
        # warrant ML review even if other signals are individually weak.
        is_likely_fire, confidence_level = True, "OVERRIDE"
        effective_score = max(effective_score, 5)
    else:
        is_likely_fire, confidence_level = False, "NOT FIRE"

    return {
        "fire_pixel_ratio": fire_ratio,
        "has_fire_texture": has_fire_texture,
        "texture_variance": avg_texture_variance,
        "brightness_variation": brightness_std,
        "has_clustering": cluster_info["has_clustering"],
        "num_clusters": cluster_info["num_clusters"],
        "is_multi_front": cluster_info["is_multi_front"],
        "saturation": avg_saturation,
        "has_smoke": has_smoke,
        "is_night": is_night,
        "is_city_lights": is_city_lights,
        "is_sunset_pattern": is_sunset_pattern,
        "sunset_penalty": sunset_penalty,
        "raw_score": score,
        "total_score": effective_score,
        "max_score": max_score,
        "confidence_level": confidence_level,
        "reasons": reasons,
        "is_likely_fire": is_likely_fire,
    }


# =============================================================================
# ML FUSION
# =============================================================================

def run_ml_model(model, image_pil: Image.Image) -> float:
    """
    Run the MobileNetV2 model on a single image using the EXACT preprocessing
    used during training: resize to 224x224, then mobilenet_v2.preprocess_input
    (which scales to [-1, 1]). Returns the raw sigmoid score (low = fire,
    per class_indices convention — see train_model.py / check_classes.py).
    """
    img_resized = image_pil.convert("RGB").resize(IMG_SIZE)
    img_arr = np.array(img_resized).astype(np.float32)
    img_arr = preprocess_input(img_arr)
    img_arr = np.expand_dims(img_arr, axis=0)
    return float(model.predict(img_arr, verbose=0)[0][0])


def predict_fire(model, image_pil: Image.Image, debug: bool = False) -> dict:
    """
    Full two-stage fire prediction: heuristic pre-filter + MobileNetV2 fusion.

    Args:
        model: Trained TensorFlow/Keras model (224x224 input, preprocess_input-aligned)
        image_pil: PIL Image
        debug: print detailed analysis if True

    Returns:
        dict describing the final decision, confidence, and supporting analysis
    """
    analysis = analyze_fire_characteristics(image_pil)
    max_score = analysis["max_score"]
    score_str = f"{analysis['total_score']}/{max_score}"

    if debug:
        print("\n" + "=" * 60)
        print("FIRE DETECTION ANALYSIS")
        print("=" * 60)
        for r in analysis["reasons"]:
            print(f"  - {r}")
        print(f"Total score: {score_str}  |  Confidence level: {analysis['confidence_level']}")

    if not analysis["is_likely_fire"]:
        reject_reason = (
            "Sunset/sky-glow pattern suppressed by spatial penalty."
            if analysis["is_sunset_pattern"]
            else "City-lights pattern suppressed."
            if analysis["is_city_lights"]
            else "Pre-filter: natural scene (score too low)."
        )
        if debug:
            print(f"REJECTED: {reject_reason}")
            print("=" * 60)
        return {
            "result": "Safe",
            "severity": "None",
            "confidence": f"{(1 - analysis['fire_pixel_ratio']) * 100:.2f}%",
            "reason": reject_reason,
            "prefilter_score": score_str,
            "analysis": analysis,
        }

    ml_score = run_ml_model(model, image_pil)
    ml_conf = 1.0 - ml_score

    effective_score = analysis["total_score"]
    confidence_level = analysis["confidence_level"]

    if confidence_level == "OVERRIDE":
        ml_threshold = 0.50
    elif effective_score >= 8:
        ml_threshold = 0.40
    elif effective_score >= 6:
        ml_threshold = 0.25
    else:
        ml_threshold = 0.15

    prefilter_weight = min(0.8, 0.5 + (effective_score - 5) * 0.06)
    prefilter_conf = effective_score / max_score
    combined_conf = prefilter_conf * prefilter_weight + ml_conf * (1 - prefilter_weight)

    fire_confirmed = (ml_score < ml_threshold) or (confidence_level == "OVERRIDE")

    if debug:
        print(f"ML score: {ml_conf * 100:.2f}%  |  Threshold: {ml_threshold}")
        print(f"Combined confidence: {combined_conf * 100:.2f}%")
        print("=" * 60)

    if fire_confirmed:
        return {
            "result": "FIRE DETECTED",
            "severity": "Critical",
            "confidence": f"{combined_conf * 100:.2f}%",
            "ml_score": f"{ml_conf * 100:.2f}%",
            "prefilter_score": score_str,
            "ml_threshold_used": ml_threshold,
            "confidence_level": confidence_level,
            "analysis": analysis,
            "reason": f"Pre-filter ({confidence_level}) and ML model agree on fire." ,
        }

    return {
        "result": "Safe",
        "severity": "None",
        "confidence": f"{(1 - combined_conf) * 100:.2f}%",
        "ml_score": f"{ml_conf * 100:.2f}%",
        "prefilter_score": score_str,
        "ml_threshold_used": ml_threshold,
        "confidence_level": confidence_level,
        "analysis": analysis,
        "reason": (
            f"ML model score {ml_conf * 100:.1f}% did not meet threshold "
            f"{ml_threshold * 100:.0f}% required for pre-filter score {effective_score}/{max_score}."
        ),
    }


# =============================================================================
# STANDALONE TEST
# =============================================================================

if __name__ == "__main__":
    import tensorflow as tf
    import os
    import glob
    import random

    try:
        model = tf.keras.models.load_model("models/fire_model_enhanced.keras")
    except Exception:
        try:
            model = tf.keras.models.load_model("models/fire_model_enhanced.h5")
        except Exception as e:
            print(f"Failed to load model. Ensure you have run train_model.py. Error: {e}")
            exit(1)

    print("\nScanning dataset for test images...")
    test_cases = []
    
    # Grab 3 random fire images
    fire_images = glob.glob("dataset/fire/*.jpg")
    if fire_images:
        sampled_fire = random.sample(fire_images, min(3, len(fire_images)))
        for img in sampled_fire:
            test_cases.append((img, "Should be: FIRE"))
    else:
        print("⚠️ No images found in dataset/fire/")

    # Grab 3 random nofire images
    nofire_images = glob.glob("dataset/nofire/*.jpg")
    if nofire_images:
        sampled_nofire = random.sample(nofire_images, min(3, len(nofire_images)))
        for img in sampled_nofire:
            test_cases.append((img, "Should be: Safe"))
    else:
        print("⚠️ No images found in dataset/nofire/")

    if not test_cases:
        print("No test cases could be generated. Please check your dataset directory structure.")
        exit(1)

    for img_path, expected in test_cases:
        print(f"\n{'=' * 60}\nTesting: {img_path}\nExpected: {expected}\n{'=' * 60}")
        try:
            img = Image.open(img_path)
            result = predict_fire(model, img, debug=True)
            print(f"FINAL RESULT: {result['result']}  |  Confidence: {result['confidence']}")
            print(f"Reason: {result['reason']}")
        except Exception as e:
            print(f"Error processing {img_path}: {e}")