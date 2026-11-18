package com.toranga.dontdie

/**
 * The small JSON file at the site root. A newer versionCode means the
 * installed app should offer the APK named in "apk".
 */
data class RemoteVersion(
    val versionCode: Int,
    val versionName: String,
    val apk: String,
    val notes: String,
)

object VersionManifest {
    fun isNewer(remoteCode: Int, installedCode: Int): Boolean = remoteCode > installedCode

    fun parse(json: String): RemoteVersion? {
        val code = numberField(json, "versionCode")?.toIntOrNull() ?: return null
        val apk = stringField(json, "apk") ?: return null
        if (!apk.startsWith("https://") && !apk.startsWith("http://")) return null
        return RemoteVersion(
            versionCode = code,
            versionName = stringField(json, "versionName") ?: "",
            apk = apk,
            notes = stringField(json, "notes") ?: "",
        )
    }

    fun withCacheBust(url: String, nowMs: Long): String {
        val join = if (url.contains("?")) "&" else "?"
        return url + join + "t=" + nowMs
    }

    private fun stringField(json: String, name: String): String? {
        val raw = rawField(json, name) ?: return null
        if (raw.length < 2 || raw.first() != '"' || raw.last() != '"') return null
        return raw.substring(1, raw.length - 1)
    }

    private fun numberField(json: String, name: String): String? {
        val raw = rawField(json, name) ?: return null
        if (raw.isEmpty() || raw.first() == '"') return null
        return raw
    }

    private fun rawField(json: String, name: String): String? {
        val key = "\"$name\""
        val keyAt = json.indexOf(key)
        if (keyAt < 0) return null
        val colon = json.indexOf(':', keyAt + key.length)
        if (colon < 0) return null
        var i = colon + 1
        while (i < json.length && json[i].isWhitespace()) i++
        if (i >= json.length) return null
        if (json[i] == '"') {
            val end = json.indexOf('"', i + 1)
            if (end < 0) return null
            return json.substring(i, end + 1)
        }
        val end = json.indexOfAny(charArrayOf(',', '}', '\n', '\r'), i)
        val slice = if (end < 0) json.substring(i) else json.substring(i, end)
        return slice.trim()
    }
}
