package com.toranga.dontdie

import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Blocking HTTP helpers. Call them off the main thread. Network failures
 * return null or false so the caller can stay quiet when the TV is offline.
 */
object UpdateClient {
    fun fetchManifest(manifestUrl: String, timeoutMs: Int = 8000): RemoteVersion? {
        val url = VersionManifest.withCacheBust(manifestUrl, System.currentTimeMillis())
        val body = getBytes(url, timeoutMs, maxBytes = 64 * 1024) ?: return null
        return VersionManifest.parse(body.toString(Charsets.UTF_8))
    }

    fun download(apkUrl: String, dest: File, timeoutMs: Int = 20000, onProgress: (Int) -> Unit): Boolean {
        var connection: HttpURLConnection? = null
        return try {
            connection = open(apkUrl, timeoutMs)
            if (connection.responseCode !in 200..299) return false
            val total = connection.contentLengthLong
            dest.parentFile?.mkdirs()
            connection.inputStream.use { input ->
                dest.outputStream().use { output ->
                    val buf = ByteArray(16 * 1024)
                    var readTotal = 0L
                    var lastPct = -1
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        readTotal += n
                        if (total > 0) {
                            val pct = ((readTotal * 100) / total).toInt().coerceIn(0, 100)
                            if (pct != lastPct) {
                                lastPct = pct
                                onProgress(pct)
                            }
                        }
                    }
                }
            }
            dest.length() > 1000
        } catch (_: Exception) {
            false
        } finally {
            connection?.disconnect()
        }
    }

    private fun getBytes(url: String, timeoutMs: Int, maxBytes: Int): ByteArray? {
        var connection: HttpURLConnection? = null
        return try {
            connection = open(url, timeoutMs)
            if (connection.responseCode !in 200..299) return null
            connection.inputStream.use { input ->
                val buf = ByteArray(4096)
                val out = java.io.ByteArrayOutputStream()
                while (out.size() < maxBytes) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                }
                out.toByteArray()
            }
        } catch (_: Exception) {
            null
        } finally {
            connection?.disconnect()
        }
    }

    private fun open(url: String, timeoutMs: Int): HttpURLConnection {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = timeoutMs
        connection.readTimeout = timeoutMs
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("Cache-Control", "no-cache")
        connection.connect()
        return connection
    }
}
