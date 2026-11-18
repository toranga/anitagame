package com.toranga.dontdie

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionManifestTest {
    @Test
    fun parsesThePublishedManifest() {
        val json = """
            {"versionCode": 4, "versionName": "1.3", "apk": "https://toranga.github.io/anitagame/DontDie.apk", "notes": "In-app updates."}
        """.trimIndent()
        val parsed = VersionManifest.parse(json)
        assertEquals(4, parsed?.versionCode)
        assertEquals("1.3", parsed?.versionName)
        assertEquals("https://toranga.github.io/anitagame/DontDie.apk", parsed?.apk)
        assertEquals("In-app updates.", parsed?.notes)
    }

    @Test
    fun rejectsAManifestWithoutAnApkAddress() {
        assertNull(VersionManifest.parse("""{"versionCode": 4, "notes": "hi"}"""))
        assertNull(VersionManifest.parse("""{"versionCode": 4, "apk": "not a url"}"""))
    }

    @Test
    fun newerCodeOffersAnUpdate() {
        assertTrue(VersionManifest.isNewer(4, 3))
        assertFalse(VersionManifest.isNewer(3, 3))
        assertFalse(VersionManifest.isNewer(2, 3))
    }

    @Test
    fun cacheBustKeepsTheOriginalQuery() {
        assertEquals(
            "https://toranga.github.io/anitagame/version.json?t=9",
            VersionManifest.withCacheBust("https://toranga.github.io/anitagame/version.json", 9),
        )
        assertTrue(VersionManifest.withCacheBust("https://example.test/version.json?x=1", 2).endsWith("&t=2"))
    }
}
