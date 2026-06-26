import tensorflow as tf
from sklearn.metrics import classification_report
import numpy as np

# UPDATE THIS PATH to your actual dataset folder. Use forward slashes.
DATA_DIR = "X:/Nerd/disaster_system/dataset"
IMG_SIZE = (224, 224)

# Removed the validation_split. We will evaluate all images found.
val_datagen = tf.keras.preprocessing.image.ImageDataGenerator(rescale=1.0/255)

val_ds = val_datagen.flow_from_directory(
    DATA_DIR,
    target_size=IMG_SIZE,
    batch_size=32,
    class_mode="binary",
    shuffle=False
)

# Load the saved model
model = tf.keras.models.load_model('models/fire_model_enhanced.keras')

# Get predictions
print("Running evaluation... this might take a minute...")
predictions = model.predict(val_ds)
y_pred = (predictions > 0.5).astype(int).flatten()
y_true = val_ds.classes

# Print the metrics
print("\n=== SENTINEL FIRE DETECTION METRICS ===")
print(classification_report(y_true, y_pred, target_names=val_ds.class_indices.keys(), digits=4))