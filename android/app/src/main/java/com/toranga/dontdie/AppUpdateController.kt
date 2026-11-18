package com.toranga.dontdie

import android.app.Activity
import android.app.Dialog
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.Window
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Checks version.json, and when a newer build is published downloads the APK
 * and hands it to the system installer. Network errors stay quiet.
 */
class AppUpdateController(private val activity: Activity) {
    private val io = Executors.newSingleThreadExecutor()
    private var offer: Dialog? = null
    private var progress: Dialog? = null
    private var remote: RemoteVersion? = null
    private var pendingApk: File? = null
    private var waitingForSources = false
    private val cancelDownload = AtomicBoolean(false)

    fun checkOnLaunch() {
        check(manual = false)
    }

    fun checkFromMenu() {
        check(manual = true)
    }

    fun onResume() {
        if (!waitingForSources) return
        waitingForSources = false
        val file = pendingApk ?: return
        if (canInstallPackages()) launchInstaller(file)
    }

    fun isShowing(): Boolean = offer?.isShowing == true || progress?.isShowing == true

    /** True when the controller key was used by the update dialog. */
    fun onKey(event: KeyEvent): Boolean {
        val dialog = when {
            offer?.isShowing == true -> offer
            progress?.isShowing == true -> progress
            else -> return false
        } ?: return false
        val down = event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0
        when (event.keyCode) {
            KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> {
                if (down) dismissAll()
                return true
            }
            KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                if (down) (dialog.currentFocus as? View)?.takeIf { it.isClickable }?.performClick()
                return true
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                if (down) dialog.currentFocus?.focusSearch(View.FOCUS_UP)?.requestFocus()
                return true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (down) dialog.currentFocus?.focusSearch(View.FOCUS_DOWN)?.requestFocus()
                return true
            }
        }
        return false
    }

    fun destroy() {
        cancelDownload.set(true)
        io.shutdownNow()
    }

    private fun check(manual: Boolean) {
        if (offer?.isShowing == true || progress?.isShowing == true) return
        val installed = installedVersion()
        io.execute {
            val found = try {
                UpdateClient.fetchManifest(BuildConfig.UPDATE_MANIFEST_URL)
            } catch (_: Exception) {
                null
            }
            activity.runOnUiThread {
                if (activity.isFinishing) return@runOnUiThread
                if (found == null) return@runOnUiThread
                if (!VersionManifest.isNewer(found.versionCode, installed)) {
                    if (manual) Toast.makeText(activity, "You're up to date", Toast.LENGTH_SHORT).show()
                    return@runOnUiThread
                }
                remote = found
                showOffer(found)
            }
        }
    }

    private fun showOffer(version: RemoteVersion) {
        dismissAll()
        val dialog = Dialog(activity)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setContentView(R.layout.dialog_update)
        dialog.setCancelable(true)
        val notes = dialog.findViewById<TextView>(R.id.update_notes)
        val line = listOf(version.versionName, version.notes).filter { it.isNotBlank() }.joinToString("\n")
        if (line.isBlank()) notes.visibility = View.GONE else notes.text = line
        val now = dialog.findViewById<Button>(R.id.update_now)
        val later = dialog.findViewById<Button>(R.id.update_later)
        now.setOnClickListener { startDownload(version) }
        later.setOnClickListener { dialog.dismiss() }
        dialog.setOnCancelListener { offer = null }
        dialog.show()
        now.requestFocus()
        offer = dialog
    }

    private fun startDownload(version: RemoteVersion) {
        offer?.dismiss()
        offer = null
        cancelDownload.set(false)
        val dialog = Dialog(activity)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setContentView(R.layout.dialog_progress)
        dialog.setCancelable(false)
        val bar = dialog.findViewById<ProgressBar>(R.id.progress_bar)
        val pct = dialog.findViewById<TextView>(R.id.progress_pct)
        dialog.show()
        progress = dialog
        val dest = File(activity.externalCacheDir ?: activity.cacheDir, "update.apk")
        io.execute {
            val ok = UpdateClient.download(version.apk, dest, onProgress = { value ->
                activity.runOnUiThread {
                    if (progress?.isShowing == true) {
                        bar.progress = value
                        pct.text = "$value%"
                    }
                }
            }) && !cancelDownload.get()
            activity.runOnUiThread {
                progress?.dismiss()
                progress = null
                if (!ok || !dest.isFile) {
                    if (!cancelDownload.get()) {
                        Toast.makeText(activity, "Couldn't download the update", Toast.LENGTH_SHORT).show()
                    }
                    return@runOnUiThread
                }
                pendingApk = dest
                if (canInstallPackages()) launchInstaller(dest)
                else askForUnknownSources()
            }
        }
    }

    private fun askForUnknownSources() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            pendingApk?.let { launchInstaller(it) }
            return
        }
        waitingForSources = true
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${activity.packageName}"),
        )
        try {
            activity.startActivity(intent)
        } catch (_: Exception) {
            waitingForSources = false
            Toast.makeText(activity, "Allow installs for Anita's Games, then try again", Toast.LENGTH_LONG).show()
        }
    }

    private fun canInstallPackages(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return activity.packageManager.canRequestPackageInstalls()
    }

    private fun launchInstaller(file: File) {
        val uri = UpdateFileProvider.uriFor(activity, file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            clipData = ClipData.newRawUri("", uri)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            intent.action = Intent.ACTION_INSTALL_PACKAGE
            intent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            intent.putExtra(Intent.EXTRA_RETURN_RESULT, false)
        }
        try {
            activity.startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(activity, "Couldn't open the installer", Toast.LENGTH_SHORT).show()
        }
    }

    private fun dismissAll() {
        cancelDownload.set(true)
        offer?.dismiss()
        progress?.dismiss()
        offer = null
        progress = null
    }

    private fun installedVersion(): Int {
        return try {
            val info = if (Build.VERSION.SDK_INT >= 33) {
                activity.packageManager.getPackageInfo(
                    activity.packageName,
                    android.content.pm.PackageManager.PackageInfoFlags.of(0),
                )
            } else {
                @Suppress("DEPRECATION")
                activity.packageManager.getPackageInfo(activity.packageName, 0)
            }
            if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else {
                @Suppress("DEPRECATION")
                info.versionCode
            }
        } catch (_: Exception) {
            BuildConfig.VERSION_CODE
        }
    }
}
