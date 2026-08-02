package com.unraiddash.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

class DownloadManagerModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private class Task {
    @Volatile var status = "pending"
    @Volatile var bytesDownloaded = 0L
    @Volatile var totalBytes = 0L
    @Volatile var uri = ""
    @Volatile var reason = ""
    @Volatile var cancelled = false
  }

  private val nextId = AtomicLong(1)
  private val tasks = ConcurrentHashMap<Long, Task>()
  private val executor = Executors.newCachedThreadPool()

  override fun getName() = "DownloadManagerModule"

  @ReactMethod
  fun isExternalStorageManager(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager())
  }

  @ReactMethod
  fun openAllFilesAccessSettings() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }
  }

  @ReactMethod
  fun enqueueDownload(url: String, fileName: String, authToken: String, promise: Promise) {
    val id = nextId.getAndIncrement()
    val task = Task()
    tasks[id] = task
    executor.execute { download(id, task, url, fileName, "X-Auth", authToken) }
    promise.resolve(id.toDouble())
  }

  @ReactMethod
  fun enqueueDownloadWithHeader(url: String, fileName: String, headerName: String, headerValue: String, promise: Promise) {
    val id = nextId.getAndIncrement()
    val task = Task()
    tasks[id] = task
    executor.execute { download(id, task, url, fileName, headerName, headerValue) }
    promise.resolve(id.toDouble())
  }

  private fun download(id: Long, task: Task, url: String, fileName: String, headerName: String, headerValue: String) {
    var connection: HttpURLConnection? = null
    val safeName = fileName.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "download" }
    val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "One NAS")
    val target = File(directory, safeName)
    val partial = File(directory, "$safeName.part")
    try {
      if (!directory.exists() && !directory.mkdirs()) throw IllegalStateException("Cannot create download directory")
      connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = 120000
      connection.readTimeout = 120000
      connection.setRequestProperty(headerName, headerValue)
      connection.connect()
      val responseCode = connection.responseCode
      if (responseCode !in 200..299) throw IllegalStateException("HTTP $responseCode")

      task.status = "running"
      task.totalBytes = connection.contentLengthLong
      BufferedInputStream(connection.inputStream).use { input ->
        FileOutputStream(partial, false).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            if (task.cancelled || Thread.currentThread().isInterrupted) throw InterruptedException()
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            task.bytesDownloaded += count
          }
        }
      }
      if (target.exists()) target.delete()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Files.move(partial.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
      } else if (!partial.renameTo(target)) {
        throw IllegalStateException("Cannot finalize download")
      }
      task.uri = Uri.fromFile(target).toString()
      task.status = "successful"
    } catch (_: InterruptedException) {
      partial.delete()
      task.status = "failed"
      task.reason = "Cancelled"
    } catch (error: Exception) {
      partial.delete()
      task.status = "failed"
      task.reason = error.message ?: error.javaClass.simpleName
    } finally {
      connection?.disconnect()
      if (task.cancelled) tasks.remove(id)
    }
  }

  @ReactMethod
  fun queryProgress(downloadId: Double, promise: Promise) {
    val task = tasks[downloadId.toLong()]
    if (task == null) {
      val missing = WritableNativeMap()
      missing.putInt("bytesDownloaded", 0)
      missing.putInt("totalBytes", 0)
      missing.putString("status", "unknown")
      missing.putString("uri", "")
      missing.putString("reason", "Task not found")
      promise.resolve(missing)
      return
    }
    val result = WritableNativeMap()
    result.putDouble("bytesDownloaded", task.bytesDownloaded.toDouble())
    result.putDouble("totalBytes", task.totalBytes.toDouble())
    result.putString("status", task.status)
    result.putString("uri", task.uri)
    result.putString("reason", task.reason)
    promise.resolve(result)
  }

  @ReactMethod
  fun cancelDownload(downloadId: Double) {
    tasks[downloadId.toLong()]?.cancelled = true
  }

  @ReactMethod
  fun removeDownload(downloadId: Double) {
    tasks[downloadId.toLong()]?.cancelled = true
    tasks.remove(downloadId.toLong())
  }
}
