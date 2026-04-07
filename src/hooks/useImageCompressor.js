import Compressor from 'compressorjs'

/**
 * Compress a file to WebP using compressorjs.
 * Returns a Blob.
 */
function compress(file, options) {
  return new Promise((resolve, reject) => {
    new Compressor(file, {
      ...options,
      mimeType: 'image/webp',
      success: resolve,
      error:   reject
    })
  })
}

/**
 * Returns { compressed: Blob, thumbnail: Blob }
 * - Full image: max 800px, 60% quality (~40–80 KB)
 * - Thumbnail:  max 200px, 40% quality (~5–15 KB)
 */
export async function compressProofImage(file) {
  const [compressed, thumbnail] = await Promise.all([
    compress(file, { quality: 0.6, maxWidth: 800, maxHeight: 800 }),
    compress(file, { quality: 0.4, maxWidth: 200, maxHeight: 200 })
  ])
  return { compressed, thumbnail }
}
