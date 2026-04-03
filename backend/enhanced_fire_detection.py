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

import numpy as np
from PIL import Image
import cv2


def detect_smoke_pattern(image_pil):
    """
    Detect smoke plumes - strong indicator of fire
    Returns True if smoke-like patterns detected
    """
    img_hsv = np.array(image_pil.convert("HSV"))
    H, S, V = img_hsv[:, :, 0], img_hsv[:, :, 1], img_hsv[:, :, 2]
    
    # Smoke = low saturation (gray/white) + medium-high brightness
    smoke_mask = (S < 40) & (V > 100) & (V < 220)
    
    total_pixels = img_hsv.shape[0] * img_hsv.shape[1]
    smoke_ratio = np.count_nonzero(smoke_mask) / total_pixels
    
    # Check if smoke is concentrated in upper portion (rises from fire)
    if smoke_ratio > 0.05:  # At least 5% smoke pixels
        upper_half_idx = img_hsv.shape[0] // 2
        smoke_in_upper = np.count_nonzero(smoke_mask[:upper_half_idx, :])
        total_smoke = np.count_nonzero(smoke_mask)
        
        if total_smoke > 0:
            upper_ratio = smoke_in_upper / total_smoke
            # If >40% of smoke in upper half, likely rising from fire
            return upper_ratio > 0.4
    
    return False


def is_night_scene(image_pil):
    """
    Detect if image is taken at night
    Night fires have different visual characteristics
    """
    img_hsv = np.array(image_pil.convert("HSV"))
    V = img_hsv[:, :, 2]
    
    avg_brightness = np.mean(V)
    
    # Night = low average brightness but with bright spots (fire/lights)
    has_bright_spots = np.count_nonzero(V > 150) > (V.size * 0.05)
    
    # If avg brightness < 90 and has bright spots, it's night
    return avg_brightness < 90 and has_bright_spots


def analyze_fire_characteristics_balanced(image_pil):
    """
    CORRECTED: Balanced multi-stage fire detection
    Works for both day and night fires while rejecting autumn leaves/sunsets
    """
    
    img_rgb = np.array(image_pil.convert("RGB"))
    img_hsv = np.array(image_pil.convert("HSV"))
    
    H, S, V = img_hsv[:, :, 0], img_hsv[:, :, 1], img_hsv[:, :, 2]
    R, G, B = img_rgb[:, :, 0], img_rgb[:, :, 1], img_rgb[:, :, 2]
    
    # === STAGE 1: Color Analysis (Relaxed for night fires) ===
    # Fire mask with more permissive saturation
    fire_color_mask = (H < 30) & (S > 80) & (V > 120)  # Relaxed: was >115 & >150
    red_dominance = (R > G + 10) & (R > B + 10)  # Relaxed: was +15
    fire_mask = fire_color_mask & red_dominance
    
    fire_pixel_count = np.count_nonzero(fire_mask)
    total_pixels = img_rgb.shape[0] * img_rgb.shape[1]
    fire_ratio = fire_pixel_count / total_pixels
    
    # === STAGE 2: Texture Analysis (Relaxed threshold) ===
    img_gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    kernel_size = 15
    mean = cv2.blur(img_gray, (kernel_size, kernel_size))
    mean_sq = cv2.blur(img_gray ** 2, (kernel_size, kernel_size))
    variance = mean_sq - (mean ** 2)
    std_dev = np.sqrt(np.abs(variance))
    
    avg_texture_variance = np.mean(std_dev)
    has_fire_texture = avg_texture_variance > 20  # Was 30, now 20 (relaxed)
    
    # === STAGE 3: Brightness Distribution (Relaxed) ===
    brightness_std = np.std(V)
    has_brightness_variation = brightness_std > 30  # Was 40, now 30 (relaxed)
    
    # === STAGE 4: Spatial Clustering ===
    has_fire_clustering = False
    significant_clusters = 0
    if fire_pixel_count > 0:
        fire_mask_uint8 = fire_mask.astype(np.uint8) * 255
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(fire_mask_uint8, connectivity=8)
        
        # Count clusters larger than 50 pixels (was 100, now relaxed)
        significant_clusters = sum(1 for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > 50)
        has_fire_clustering = 1 <= significant_clusters <= 8  # Was 1-5, now 1-8 (more permissive)
    
    # === STAGE 5: Saturation (CONDITIONAL - Key Fix!) ===
    avg_saturation = np.mean(S)
    
    # Accept different saturation levels based on context
    if avg_saturation > 80:  # Was 100, now 80
        high_saturation = True
    elif avg_saturation > 60 and fire_ratio > 0.15:  # NEW: Conditional for smoky fires
        high_saturation = True
    else:
        high_saturation = False
    
    # === NEW STAGE 6: Smoke Detection ===
    has_smoke = detect_smoke_pattern(image_pil)
    
    # === NEW STAGE 7: Night Detection ===
    is_night = is_night_scene(image_pil)
    
    # === ENHANCED SCORING SYSTEM ===
    score = 0
    reasons = []
    
    if fire_ratio > 0.01:
        score += 1
        reasons.append(f"Fire-colored pixels: {fire_ratio*100:.1f}%")
    
    if has_fire_texture:
        score += 2  # Strong indicator
        reasons.append(f"Irregular texture (variance: {avg_texture_variance:.1f})")
    
    if has_brightness_variation:
        score += 1
        reasons.append(f"Brightness variation: {brightness_std:.1f}")
    
    if has_fire_clustering:
        score += 3  # INCREASED from 2 to 3 - most reliable for night fires
        reasons.append(f"Fire clustering: {significant_clusters} clusters")
    
    if high_saturation:
        score += 1
        reasons.append(f"Adequate saturation: {avg_saturation:.1f}")
    
    if has_smoke:
        score += 2  # NEW: Strong fire indicator
        reasons.append("Smoke plume detected")
    
    if is_night and fire_ratio > 0.15:
        score += 1  # NEW: Bonus for night fire pattern
        reasons.append("Night fire pattern")
    
    # === MULTI-TIER DECISION LOGIC ===
    # High confidence fire (score 6+)
    if score >= 6:
        is_likely_fire = True
        confidence_level = "HIGH"
    
    # Moderate confidence (score 3-5) - send to ML
    elif score >= 3:
        is_likely_fire = True
        confidence_level = "MODERATE"
    
    # Special override: Strong clustering + smoke = fire regardless of score
    elif has_fire_clustering and has_smoke:
        is_likely_fire = True
        confidence_level = "OVERRIDE - Clustering + Smoke"
        score = max(score, 5)  # Boost score
    
    # Special override: High fire pixel ratio + clustering
    elif fire_ratio > 0.25 and has_fire_clustering:
        is_likely_fire = True
        confidence_level = "OVERRIDE - Large Fire Area"
        score = max(score, 5)
    
    else:
        is_likely_fire = False
        confidence_level = "NOT FIRE"
    
    return {
        'fire_pixel_ratio': fire_ratio,
        'has_fire_texture': has_fire_texture,
        'texture_variance': avg_texture_variance,
        'brightness_variation': brightness_std,
        'has_clustering': has_fire_clustering,
        'num_clusters': significant_clusters,
        'saturation': avg_saturation,
        'has_smoke': has_smoke,
        'is_night': is_night,
        'total_score': score,
        'max_score': 13,
        'confidence_level': confidence_level,
        'reasons': reasons,
        'is_likely_fire': is_likely_fire
    }


def predict_fire_balanced(model, image_pil, debug=False):
    """
    CORRECTED: Balanced fire prediction for day/night fires
    
    Args:
        model: Trained TensorFlow model
        image_pil: PIL Image object
        debug: If True, print detailed analysis
    
    Returns:
        dict with result, confidence, and analysis details
    """
    
    # Stage 1: Enhanced pre-filter with balanced thresholds
    analysis = analyze_fire_characteristics_balanced(image_pil)
    
    if debug:
        print("\n" + "="*60)
        print("BALANCED FIRE DETECTION ANALYSIS")
        print("="*60)
        print(f"Fire pixel ratio: {analysis['fire_pixel_ratio']*100:.2f}%")
        print(f"Texture variance: {analysis['texture_variance']:.1f} (threshold: 20)")
        print(f"Brightness variation: {analysis['brightness_variation']:.1f} (threshold: 30)")
        print(f"Saturation: {analysis['saturation']:.1f} (threshold: 80+)")
        print(f"Clustering: {analysis['has_clustering']} ({analysis['num_clusters']} clusters)")
        print(f"Smoke detected: {analysis['has_smoke']}")
        print(f"Night scene: {analysis['is_night']}")
        print(f"Total score: {analysis['total_score']}/{analysis['max_score']}")
        print(f"Confidence level: {analysis['confidence_level']}")
        print("\nReasons:")
        for reason in analysis['reasons']:
            print(f"  ✓ {reason}")
    
    # If pre-filter strongly rejects (score < 3 and no special conditions)
    if not analysis['is_likely_fire']:
        if debug:
            print("\n❌ Pre-filter: Not fire")
            print("="*60)
        return {
            'result': 'Safe',
            'severity': 'None',
            'confidence': f"{(1 - analysis['fire_pixel_ratio']) * 100:.2f}%",
            'analysis': analysis,
            'reason': 'Pre-filter rejected (natural scene, not fire)'
        }
    
    # Stage 2: ML Model Prediction (for moderate/high confidence cases)
    img_arr = np.array(image_pil.resize((128, 128)))
    img_arr = np.expand_dims(img_arr, axis=0) / 255.0
    ml_score = float(model.predict(img_arr, verbose=0)[0][0])
    
    # Adaptive ML threshold based on pre-filter confidence
    if analysis['confidence_level'] == "HIGH":
        ml_threshold = 0.4  # Relaxed - trust pre-filter
    elif analysis['confidence_level'].startswith("OVERRIDE"):
        ml_threshold = 0.5  # Even more relaxed
    else:  # MODERATE
        ml_threshold = 0.3  # Standard threshold
    
    # Combined confidence calculation
    prefilter_confidence = analysis['total_score'] / analysis['max_score']
    ml_confidence = 1 - ml_score
    
    # Weight based on confidence level
    if analysis['confidence_level'] == "HIGH":
        combined_confidence = prefilter_confidence * 0.7 + ml_confidence * 0.3
    else:
        combined_confidence = prefilter_confidence * 0.5 + ml_confidence * 0.5
    
    if debug:
        print(f"\n🤖 ML Model Score: {ml_confidence*100:.2f}%")
        print(f"📊 Pre-filter Confidence: {prefilter_confidence*100:.2f}%")
        print(f"📊 Combined Confidence: {combined_confidence*100:.2f}%")
        print(f"🎯 ML Threshold: {ml_threshold}")
        print("="*60)
    
    # Final decision: Pre-filter says likely fire AND ML agrees (or override conditions)
    if ml_score < ml_threshold:
        return {
            'result': 'FIRE DETECTED',
            'severity': 'Critical',
            'confidence': f"{combined_confidence*100:.2f}%",
            'analysis': analysis,
            'ml_score': f"{ml_confidence*100:.2f}%",
            'prefilter_score': f"{analysis['total_score']}/{analysis['max_score']}",
            'reason': f"Both pre-filter ({analysis['confidence_level']}) and ML model detected fire"
        }
    elif analysis['confidence_level'].startswith("OVERRIDE"):
        # Override cases: Trust pre-filter even if ML is uncertain
        return {
            'result': 'FIRE DETECTED',
            'severity': 'Critical',
            'confidence': f"{prefilter_confidence*100:.2f}%",
            'analysis': analysis,
            'ml_score': f"{ml_confidence*100:.2f}%",
            'prefilter_score': f"{analysis['total_score']}/{analysis['max_score']}",
            'reason': f"Pre-filter override: {analysis['confidence_level']}"
        }
    else:
        return {
            'result': 'Safe',
            'severity': 'None',
            'confidence': f"{(1 - combined_confidence)*100:.2f}%",
            'analysis': analysis,
            'ml_score': f"{ml_confidence*100:.2f}%",
            'prefilter_score': f"{analysis['total_score']}/{analysis['max_score']}",
            'reason': 'ML model suggests false positive (ambiguous case)'
        }


# Example usage:
if __name__ == "__main__":
    import tensorflow as tf
    from PIL import Image
    
    # Load model
    try:
        model = tf.keras.models.load_model('models/fire_model_enhanced.h5')
    except:
        model = tf.keras.models.load_model('models/fire_model.h5')
    
    # Test with problem images
    print("\n" + "="*60)
    print("TESTING BALANCED FIRE DETECTION")
    print("="*60)
    
    test_cases = [
        ('nofire_0061.jpg', 'Should be: Safe (autumn leaves)'),
        ('nofire_0062.jpg', 'Should be: Safe (red tree)'),
        ('nofire_0001.jpg', 'Should be: Safe (sunset)'),
        ('fire_0001.jpg', 'Should be: FIRE (night wildfire)'),
        ('fire_0003.jpg', 'Should be: FIRE (smoky fire)'),
        ('fire_0004.jpg', 'Should be: FIRE (multiple fronts)'),
    ]
    
    for img_path, expected in test_cases:
        print(f"\n{'='*60}")
        print(f"Testing: {img_path}")
        print(f"Expected: {expected}")
        print('='*60)
        
        try:
            img = Image.open(img_path)
            result = predict_fire_balanced(model, img, debug=True)
            
            print(f"\n{'='*60}")
            print(f"FINAL RESULT: {result['result']}")
            print(f"Confidence: {result['confidence']}")
            print(f"Reason: {result['reason']}")
            print('='*60)
            
        except FileNotFoundError:
            print(f"File not found: {img_path}")
        except Exception as e:
            print(f"Error: {e}")