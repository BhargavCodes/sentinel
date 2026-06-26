# train_model.py
"""
Sentinel Fire Detection — Transfer Learning with MobileNetV2
v3.0  (upgraded from v2)

Key changes vs. the previous version
--------------------------------------
1. Resolution: 128×128  →  224×224
   MobileNetV2 was pre-trained on 224×224 ImageNet images.  Matching that
   native resolution lets the feature extractor see fine smoke wisps, thin
   flame edges, and cloud-vs-smoke gradients that were lost in the smaller
   input.  This is the single biggest accuracy lever.

2. Aggressive augmentation — zoom + shear added
   zoom_range=0.2  and  shear_range=0.15  force the model to learn from
   texture patterns at different scales and perspectives, not just the dominant
   orange/red colour blob that trips it up on sunsets.

3. Class-weight balancing via sklearn
   Hard negatives (sunsets, autumn leaves) are being injected into the
   'nofire' class.  If the classes are now imbalanced, training without
   weighting would bias the model toward whichever class is larger.
   sklearn.utils.class_weight.compute_class_weight('balanced', ...) derives
   inverse-frequency weights automatically from the actual class distribution
   in the training fold, requiring no manual tuning.

4. Fine-tuning stage (new)
   After the frozen head converges, the top 40 layers of MobileNetV2 are
   unfrozen and trained with a 10x lower learning rate.  This lets the
   backbone specialise its upper feature maps for fire/smoke texture rather
   than staying locked to generic ImageNet representations.

5. Native Keras format
   Models are saved as  .keras  (recommended for TF >= 2.12) in addition to
   the legacy  .h5  for backward compatibility with any older load paths.
"""

# train_model.py
"""
Sentinel Fire Detection — Transfer Learning with MobileNetV2
v4.0 — preprocess_input alignment + clean val pipeline

Key changes vs v3.0
--------------------
1. Uses tensorflow.keras.applications.mobilenet_v2.preprocess_input for BOTH
   training and validation instead of rescale=1/255. MobileNetV2 was trained
   with inputs scaled to [-1, 1] (preprocess_input does this internally), not
   [0, 1]. Mismatched preprocessing between training and inference is one of
   the most common causes of silent accuracy loss / false negatives in
   transfer-learning pipelines, so this version makes it the single source
   of truth — main.py and enhanced_fire_detection.py must use the exact same
   function at inference time (see accompanying files).
2. Validation/holdout data uses NO augmentation. Augmenting validation data
   makes your val metrics noisy and unrepresentative of real-world inference
   — validation must see only resize + preprocess_input, nothing else.
3. Everything else (224x224 input, class weighting, two-phase fine-tuning,
   .keras + .h5 export) is preserved from v3.0.
"""

import numpy as np
import os

import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from tensorflow.keras.layers import Dense, Dropout, GlobalAveragePooling2D
from tensorflow.keras.models import Model
from tensorflow.keras.optimizers import Adam
from sklearn.utils.class_weight import compute_class_weight

# =============================================================================
# CONFIGURATION
# =============================================================================

DATA_DIR        = "dataset"
IMG_SIZE        = (224, 224)   # MobileNetV2 native optimal resolution
BATCH_SIZE      = 32
EPOCHS_HEAD     = 20            # frozen-backbone phase
EPOCHS_FINETUNE = 10            # unfrozen fine-tune phase

print("Fire Detection — MobileNetV2 Transfer Learning v4.0")
print(f"    Input resolution : {IMG_SIZE}")
print(f"    Dataset directory: {DATA_DIR}")
print(f"    Preprocessing    : tensorflow.keras.applications.mobilenet_v2.preprocess_input")

# =============================================================================
# DATA LOADING
# =============================================================================
# IMPORTANT: preprocess_input scales pixels to [-1, 1] and must be used as the
# `preprocessing_function` (NOT rescale=1/255 — the two are mutually
# exclusive ways of normalising pixels, and mixing them silently corrupts the
# input distribution the backbone expects).

train_datagen = tf.keras.preprocessing.image.ImageDataGenerator(
    preprocessing_function = preprocess_input,
    rotation_range     = 20,
    width_shift_range   = 0.2,
    height_shift_range  = 0.2,
    horizontal_flip    = True,
    brightness_range   = [0.75, 1.25],
    zoom_range         = 0.2,
    shear_range        = 0.15,
    fill_mode          = "reflect",
    validation_split   = 0.2,
)

# A SEPARATE generator for validation — preprocess_input only, NO augmentation.
# Using the same `train_datagen` object for both subsets (as in v3.0) is
# convenient but means val images still get rotation/zoom/shear/shift applied,
# which is incorrect: validation must reflect true inference conditions.
val_datagen = tf.keras.preprocessing.image.ImageDataGenerator(
    preprocessing_function = preprocess_input,
    validation_split        = 0.2,
)

print("\nLoading dataset...")
train_ds = train_datagen.flow_from_directory(
    DATA_DIR,
    target_size = IMG_SIZE,
    batch_size  = BATCH_SIZE,
    class_mode  = "binary",
    subset      = "training",
    shuffle     = True,
    seed        = 42,
)

val_ds = val_datagen.flow_from_directory(
    DATA_DIR,
    target_size = IMG_SIZE,
    batch_size  = BATCH_SIZE,
    class_mode  = "binary",
    subset      = "validation",
    shuffle     = False,
    seed        = 42,
)

print(f"\n    Training samples  : {train_ds.samples}")
print(f"    Validation samples: {val_ds.samples}")
print(f"    Class mapping     : {train_ds.class_indices}")
# IMPORTANT: class_indices is typically {'fire': 0, 'nofire': 1} (alphabetical).
# main.py's predict_fire endpoint interprets a LOW model output (sigmoid -> 0)
# as fire and HIGH output as no-fire, via: ml_score < ml_threshold.
# If your folder names sort differently, verify this with check_classes.py.

# =============================================================================
# CLASS WEIGHT CALCULATION
# =============================================================================

train_labels        = train_ds.classes
class_weight_array  = compute_class_weight(
    class_weight = "balanced",
    classes      = np.unique(train_labels),
    y            = train_labels,
)
class_weight_dict = {int(i): float(w) for i, w in enumerate(class_weight_array)}

print(f"\nComputed class weights: {class_weight_dict}")

# =============================================================================
# MODEL ARCHITECTURE
# =============================================================================

print("\nBuilding MobileNetV2 + custom head...")

base_model = MobileNetV2(
    weights     = "imagenet",
    include_top = False,
    input_shape = (*IMG_SIZE, 3),
)
base_model.trainable = False

x      = base_model.output
x      = GlobalAveragePooling2D()(x)
x      = Dense(256, activation="relu")(x)
x      = Dropout(0.4)(x)
x      = Dense(64,  activation="relu")(x)
x      = Dropout(0.2)(x)
output = Dense(1, activation="sigmoid")(x)

model = Model(inputs=base_model.input, outputs=output)

model.compile(
    optimizer = Adam(learning_rate=1e-4),
    loss      = "binary_crossentropy",
    metrics   = [
        "accuracy",
        tf.keras.metrics.Precision(name="precision"),
        tf.keras.metrics.Recall(name="recall"),
        tf.keras.metrics.AUC(name="auc"),
    ],
)
print(f"    Total parameters     : {model.count_params():,}")

# =============================================================================
# PHASE 1 — TRAIN THE HEAD (backbone frozen)
# =============================================================================

os.makedirs("models", exist_ok=True)

callbacks_phase1 = [
    EarlyStopping(
        monitor              = "val_auc",
        patience             = 6,
        restore_best_weights = True,
        mode                 = "max",
        verbose              = 1,
    ),
    ReduceLROnPlateau(
        monitor  = "val_loss",
        factor   = 0.3,
        patience = 3,
        min_lr   = 1e-7,
        verbose  = 1,
    ),
    ModelCheckpoint(
        filepath       = "models/fire_model_best_phase1.keras",
        monitor        = "val_auc",
        save_best_only = True,
        mode           = "max",
        verbose        = 1,
    ),
]

print(f"\nPhase 1 — Training classification head (backbone frozen, {EPOCHS_HEAD} epochs max)...")
history_phase1 = model.fit(
    train_ds,
    validation_data = val_ds,
    epochs          = EPOCHS_HEAD,
    callbacks       = callbacks_phase1,
    class_weight    = class_weight_dict,
    verbose         = 1,
)

# =============================================================================
# PHASE 2 — FINE-TUNING (unfreeze top-40 backbone layers)
# =============================================================================

print("\nPhase 2 — Fine-tuning top-40 backbone layers...")

base_model.trainable = True
for layer in base_model.layers[:-40]:
    layer.trainable = False

trainable_after = sum(1 for layer in model.layers if layer.trainable)
print(f"    Trainable layers after unfreezing: {trainable_after}/{len(model.layers)}")

model.compile(
    optimizer = Adam(learning_rate=1e-5),
    loss      = "binary_crossentropy",
    metrics   = [
        "accuracy",
        tf.keras.metrics.Precision(name="precision"),
        tf.keras.metrics.Recall(name="recall"),
        tf.keras.metrics.AUC(name="auc"),
    ],
)

callbacks_phase2 = [
    EarlyStopping(
        monitor              = "val_auc",
        patience             = 5,
        restore_best_weights = True,
        mode                 = "max",
        verbose              = 1,
    ),
    ReduceLROnPlateau(
        monitor  = "val_loss",
        factor   = 0.3,
        patience = 2,
        min_lr   = 1e-8,
        verbose  = 1,
    ),
    ModelCheckpoint(
        filepath       = "models/fire_model_enhanced.keras",
        monitor        = "val_auc",
        save_best_only = True,
        mode           = "max",
        verbose        = 1,
    ),
]

history_phase2 = model.fit(
    train_ds,
    validation_data = val_ds,
    epochs          = EPOCHS_FINETUNE,
    callbacks       = callbacks_phase2,
    class_weight    = class_weight_dict,
    verbose         = 1,
)

# =============================================================================
# SAVE FINAL MODEL — both formats for compatibility
# =============================================================================

model.save("models/fire_model_enhanced.keras")
model.save("models/fire_model_enhanced.h5")

print("\nTraining complete.")
print("    Saved: models/fire_model_enhanced.keras")
print("    Saved: models/fire_model_enhanced.h5")

# =============================================================================
# QUICK VALIDATION SUMMARY
# =============================================================================

val_results  = model.evaluate(val_ds, verbose=0)
metric_names = ["loss", "accuracy", "precision", "recall", "auc"]
print("\nFinal validation metrics:")
for name, val in zip(metric_names, val_results):
    print(f"    {name:<12}: {val:.4f}")

print("\n    Run 'python main.py' to start the Sentinel API server.")
print("    NOTE: Inference MUST use mobilenet_v2.preprocess_input, not /255.0.")
print("    See the MAIN.PY CHANGES section for the exact replacement.")