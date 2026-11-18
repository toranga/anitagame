package com.toranga.dontdie

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File

/** Serves the one downloaded APK to the package installer. */
class UpdateFileProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    override fun getType(uri: Uri): String = "application/vnd.android.package-archive"

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        val file = fileFor(context ?: return null, uri) ?: return null
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun query(uri: Uri, proj: Array<out String>?, sel: String?, args: Array<out String>?, sort: String?): Cursor? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, sel: String?, args: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, sel: String?, args: Array<out String>?): Int = 0

    companion object {
        fun uriFor(context: Context, file: File): Uri {
            return Uri.parse("content://${context.packageName}.fileprovider/update/${file.name}")
        }

        fun fileFor(context: Context, uri: Uri): File? {
            if (uri.lastPathSegment != "update.apk") return null
            val name = "update.apk"
            val candidates = listOfNotNull(
                context.externalCacheDir?.let { File(it, name) },
                File(context.cacheDir, name),
            )
            return candidates.firstOrNull { it.isFile }
        }
    }
}
