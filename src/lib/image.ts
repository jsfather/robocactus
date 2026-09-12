const WEBP_CONVERTIBLE_TYPES = new Set(['image/jpeg', 'image/png'])

/**
 * Encode JPEG/PNG uploads as WebP before they leave the browser. Animated GIFs
 * are intentionally preserved so converting them does not discard animation.
 * The object path
 * and original filename stay unchanged so existing database references remain
 * valid; storage metadata records the actual image/webp content type.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (typeof window === 'undefined' || !WEBP_CONVERTIBLE_TYPES.has(file.type) || typeof createImageBitmap !== 'function') return file

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
    if (!blob) return file
    return new File([blob], file.name, { type: 'image/webp', lastModified: file.lastModified })
  } catch {
    // Codec/canvas support varies. Keep the original upload if conversion is
    // unavailable so registration and admin workflows never break.
    return file
  } finally {
    bitmap?.close()
  }
}
