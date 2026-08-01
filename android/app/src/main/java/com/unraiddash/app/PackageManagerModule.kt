package com.unraiddash.app

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray

class PackageManagerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "PackageManagerModule"

  @ReactMethod
  fun queryMarketApps(promise: Promise) {
    try {
      val pm: PackageManager = reactApplicationContext.packageManager
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=test"))
      @Suppress("DEPRECATION")
      val activities = pm.queryIntentActivities(intent, 0)
      val packages = LinkedHashSet<String>()
      for (info in activities) {
        val pkg = info.activityInfo?.packageName ?: continue
        packages.add(pkg)
      }
      val result = WritableNativeArray()
      for (pkg in packages) result.pushString(pkg)
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("QUERY_MARKET_FAILED", e.message ?: "unknown", e)
    }
  }

  @ReactMethod
  fun launchApp(packageName: String, className: String, promise: Promise) {
    try {
      val pm = reactApplicationContext.packageManager
      val launchIntent = pm.getLaunchIntentForPackage(packageName)
      if (launchIntent != null) {
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(launchIntent)
        promise.resolve(true)
        return
      }
      android.util.Log.w("PackageManager", "getLaunchIntentForPackage returned null, trying manual intent")
      val intent = Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
        setClassName(packageName, className)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      android.util.Log.e("PackageManager", "launchApp failed: ${e.message}", e)
      promise.reject("LAUNCH_FAILED", e.message ?: "unknown", e)
    }
  }

  @ReactMethod
  fun isOverlayGranted(promise: Promise) {
    try {
      promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
    } catch (e: Exception) {
      promise.reject("OVERLAY_CHECK_FAILED", e.message ?: "unknown", e)
    }
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactApplicationContext.packageName}")
      )
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OVERLAY_SETTINGS_FAILED", e.message ?: "unknown", e)
    }
  }

  @ReactMethod
  fun isNotificationPermissionGranted(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.resolve(true)
        return
      }
      val granted = ContextCompat.checkSelfPermission(
        reactApplicationContext, Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED
      promise.resolve(granted)
    } catch (e: Exception) {
      promise.reject("NOTIF_CHECK_FAILED", e.message ?: "unknown", e)
    }
  }

  @ReactMethod
  fun openAppNotificationSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        intent.putExtra(Settings.EXTRA_CHANNEL_ID, "default")
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("NOTIF_SETTINGS_FAILED", e.message ?: "unknown", e)
    }
  }
}