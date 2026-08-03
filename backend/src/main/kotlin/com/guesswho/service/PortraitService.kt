package com.guesswho.service

import java.awt.Color
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO
import kotlin.math.min

/**
 * Turns an uploaded photo into a stylized "Guess Who" portrait.
 *
 * This is a placeholder for the real AI pipeline described in the product
 * spec (background removal, identity-preserving feature exaggeration, a
 * consistent illustration style). Wiring in an actual image-generation model
 * is future work; for now this applies a deterministic, dependency-free
 * duotone/posterize filter so every character on a board shares one visual
 * style. The requested feature checklist is stored on the character and
 * rendered by the client, not baked into the pixels.
 */
object PortraitService {
    private const val PORTRAIT_SIZE = 480

    // A single duotone pair used across every portrait, so the whole app
    // reads as one consistent illustration style.
    private val SHADOW = Color(0x1F, 0x2A, 0x44)
    private val HIGHLIGHT = Color(0xF4, 0xE9, 0xD8)

    fun stylize(sourceBytes: ByteArray): ByteArray {
        val source = ImageIO.read(sourceBytes.inputStream())
            ?: error("Could not decode uploaded image")

        val squared = centerCropToSquare(source)
        val resized = scaleTo(squared, PORTRAIT_SIZE)
        val duotone = applyDuotone(resized)

        val out = java.io.ByteArrayOutputStream()
        ImageIO.write(duotone, "png", out)
        return out.toByteArray()
    }

    /** Just normalizes the source photo (square crop, capped size) for storage/display. */
    fun normalize(sourceBytes: ByteArray): ByteArray {
        val source = ImageIO.read(sourceBytes.inputStream())
            ?: error("Could not decode uploaded image")
        val squared = centerCropToSquare(source)
        val resized = scaleTo(squared, PORTRAIT_SIZE)

        val out = java.io.ByteArrayOutputStream()
        ImageIO.write(resized, "png", out)
        return out.toByteArray()
    }

    private fun centerCropToSquare(image: BufferedImage): BufferedImage {
        val size = min(image.width, image.height)
        val x = (image.width - size) / 2
        val y = (image.height - size) / 2
        return image.getSubimage(x, y, size, size)
    }

    private fun scaleTo(image: BufferedImage, size: Int): BufferedImage {
        val out = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
        val g: Graphics2D = out.createGraphics()
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
        g.drawImage(image, 0, 0, size, size, null)
        g.dispose()
        return out
    }

    private fun applyDuotone(image: BufferedImage): BufferedImage {
        val out = BufferedImage(image.width, image.height, BufferedImage.TYPE_INT_ARGB)
        val levels = 5
        for (py in 0 until image.height) {
            for (px in 0 until image.width) {
                val argb = image.getRGB(px, py)
                val a = (argb shr 24) and 0xFF
                val r = (argb shr 16) and 0xFF
                val gr = (argb shr 8) and 0xFF
                val b = argb and 0xFF
                val luminance = (0.299 * r + 0.587 * gr + 0.114 * b) / 255.0
                val posterized = (Math.round(luminance * (levels - 1)) / (levels - 1).toDouble())
                out.setRGB(px, py, blend(SHADOW, HIGHLIGHT, posterized, a))
            }
        }
        return out
    }

    private fun blend(shadow: Color, highlight: Color, t: Double, alpha: Int): Int {
        val r = (shadow.red + (highlight.red - shadow.red) * t).toInt().coerceIn(0, 255)
        val g = (shadow.green + (highlight.green - shadow.green) * t).toInt().coerceIn(0, 255)
        val b = (shadow.blue + (highlight.blue - shadow.blue) * t).toInt().coerceIn(0, 255)
        return (alpha shl 24) or (r shl 16) or (g shl 8) or b
    }
}
