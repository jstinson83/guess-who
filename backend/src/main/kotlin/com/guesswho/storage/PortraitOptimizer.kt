package com.guesswho.storage

import java.awt.Color
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam

private const val MAX_DIMENSION = 640
private const val JPEG_QUALITY = 0.85f

/**
 * Downscales and re-encodes a freshly generated portrait as JPEG before it's stored, so the
 * board UI isn't re-fetching Gemini's full-resolution PNG (routinely ~1MB) on every view over a
 * mobile connection. Portraits are head-and-shoulders crops on a plain solid background (see the
 * prompt in Gemini.kt), so JPEG's lossy compression and lack of alpha channel aren't a visible
 * tradeoff here. Fails open: bytes ImageIO can't decode are stored as-is rather than dropped.
 */
fun optimizePortrait(bytes: ByteArray, mimeType: String): StoredPortrait {
    val source = ImageIO.read(ByteArrayInputStream(bytes)) ?: return StoredPortrait(bytes, mimeType)

    val scale = (MAX_DIMENSION.toDouble() / maxOf(source.width, source.height)).coerceAtMost(1.0)
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
