import tensorflow as tf
import os

DATA_DIR = "dataset"

try:
    # Load the dataset parameters just to see the names
    train_ds = tf.keras.preprocessing.image_dataset_from_directory(
        DATA_DIR,
        image_size=(128, 128),
        batch_size=32
    )
    
    class_names = train_ds.class_names
    print("\n" + "="*40)
    print(f"🔎 CLASS MAPPING FOUND:")
    print(f"   Class 0 (Low Score)  = {class_names[0]}")
    print(f"   Class 1 (High Score) = {class_names[1]}")
    print("="*40 + "\n")

except Exception as e:
    print("Error:", e)