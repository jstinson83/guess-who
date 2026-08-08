package com.guesswho.storage

import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PortraitOptimizerTest {

    private fun pngOf(width: Int, height: Int): ByteArray {
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val graphics = image.createGraphics()
        graphics.fillRect(0, 0, width, height)
        graphics.dispose()
        val output = ByteArrayOutputStream()
        ImageIO.write(image, "png", output)
        return output.toByteArray()
    }

    @Test
    fun `downscales an oversized image and re-encodes as jpeg`() {
        val result = optimizePortrait(pngOf(2000, 1500), "image/png")

        assertEquals("image/jpeg", result.contentType)
        val decoded = ImageIO.read(ByteArrayInputStream(result.bytes))
        assertTrue(decoded.width <= 640 && decoded.height <= 640)
        // Aspect ratio preserved.
        assertEquals(2000.0 / 1500.0, decoded.width.toDouble() / decoded.height.toDouble(), 0.01)
    }

    @Test
    fun `leaves an already-small image at its original dimensions`() {
        val result = optimizePortrait(pngOf(300, 300), "image/png")

        val decoded = ImageIO.read(ByteArrayInputStream(result.bytes))
        assertEquals(300, decoded.width)
        assertEquals(300, decoded.height)
        assertEquals("image/jpeg", result.contentType)
    }

    @Test
    fun `fails open on bytes it cannot decode as an image`() {
        val garbage = byteArrayOf(1, 2, 3, 4)

        val result = optimizePortrait(garbage, "image/png")

        assertEquals(garbage, result.bytes)
        assertEquals("image/png", result.contentType)
    }
}
