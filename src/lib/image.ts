/**
 * Downscale a camera photo to a JPEG no larger than `maxSide` px. Phone photos are
 * 3–8 MB; this keeps a job with dozens of sheets in memory (and later uploads) small
 * while staying sharp enough to read print text and handwriting.
 */
export async function downscalePhoto(file: Blob, maxSide = 2400, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))), "image/jpeg", quality),
  );
  return { blob, width, height };
}
