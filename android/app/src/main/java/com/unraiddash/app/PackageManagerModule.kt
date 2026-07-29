package com.unraiddash.app

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
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
}