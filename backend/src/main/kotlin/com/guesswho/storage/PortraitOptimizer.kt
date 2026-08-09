package com.guesswho.storage

import java.awt.Color
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam

private const val PORTRAIT_MAX_DIMENSION = 640
private const val JPEG_QUALITY = 0.85f

/**
 * Downscales and re-encodes an image as JPEG before it's stored, so callers aren't re-fetching
 * a full-resolution PNG (routinely ~1MB) on every view over a mobile connection. [maxDimension]
 * defaults to the generated-portrait size (head-and-shoulders crops on a plain solid background,
 * see the prompt in Gemini.kt); the photo bank passes a larger value since a bank photo is also
 * future `generatePortrait()` input, not just a thumbnail. JPEG's lossy compression and lack of
 * alpha channel aren't a visible tradeoff for either use. Fails open: bytes ImageIO can't decode
 * are stored as-is rather than dropped.
 */
fun optimizePortrait(bytes: ByteArray, mimeType: String, maxDimension: Int = PORTRAIT_MAX_DIMENSION): StoredPortrait {
    val source = ImageIO.read(ByteArrayInputStream(bytes)) ?: return StoredPortrait(bytes, mimeType)

    val scale = (maxDimension.toDouble() / maxOf(source.width, source.height)).coerceAtMost(1.0)
    val targetWidth = (source.width * scale).toInt().coerceAtLeast(1)
    val targetHeight = (source.height * scale).toInt().coerceAtLeast(1)

    val resized = BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB)
    val graphics = resized.createGraphics()
    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
    graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
    // Gemini's PNGs are opaque already, but flatten onto white in case a source image carries an
    // alpha channel — JPEG has none, and an unflattened alpha paints as black instead.
    graphics.color = Color.WHITE
    graphics.fillRect(0, 0, targetWidth, targetHeight)
    graphics.drawImage(source, 0, 0, targetWidth, targetHeight, null)
    graphics.dispose()

    val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
    val writeParam = writer.defaultWriteParam.apply {
        compressionMode = ImageWriteParam.MODE_EXPLICIT
        compressionQuality = JPEG_QUALITY
    }

    val output = ByteArrayOutputStream()
    ImageIO.createImageOutputStream(output).use { imageOutputStream ->
        writer.output = imageOutputStream
        writer.write(null, IIOImage(resized, null, null), writeParam)
    }
    writer.dispose()

    return StoredPortrait(output.toByteArray(), "image/jpeg")
}
