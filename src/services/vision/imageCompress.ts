/**
 * Image compression utility for vision pipeline.
 *
 * Resizes to max 768px on the longest side and compresses to JPEG ~0.65.
 * Returns the compressed file URI and its raw bytes (ArrayBuffer) for
 * binary upload to R2.
 *
 * Uses expo-image-manipulator which works in Expo Go.
 * Reads file bytes via the new expo-file-system File API (SDK 54+).
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { File as ExpoFile } from 'expo-file-system';

const MAX_SIDE = 768;
const JPEG_QUALITY = 0.65;

export interface CompressedImage {
  /** Local file URI of the compressed JPEG */
  uri: string;
  /** Raw bytes ready for PUT upload to R2 */
  buffer: ArrayBuffer;
}

/**
 * Compress a local image URI → { uri, buffer }.
 *
 * 1. Resize so longest side <= 768 px.
 * 2. JPEG compress at quality 0.65.
 * 3. Read file as ArrayBuffer.
 */
export async function compressImage(uri: string): Promise<CompressedImage> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_SIDE } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  const file = new ExpoFile(manipulated.uri);
  const buffer = await file.arrayBuffer();

  return { uri: manipulated.uri, buffer };
}
