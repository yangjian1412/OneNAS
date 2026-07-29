package com.unraiddash.app

import android.content.Context
import android.media.AudioManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemVolumeModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SystemVolume"

  private fun audioManager(): AudioManager? =
      reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  @ReactMethod
  fun getMaxVolume(promise: Promise) {
    try {
      val am = audioManager()
      if (am == null) {
        promise.reject("NO_AUDIO_MANAGER", "AudioManager unavailable")
        return
      }
      promise.resolve(am.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
    } catch (e: Exception) {
      promise.reject("ERROR", e.message ?: "unknown")
    }
  }

  @ReactMethod
  fun getCurrentVolume(promise: Promise) {
    try {
      val am = audioManager()
      if (am == null) {
        promise.reject("NO_AUDIO_MANAGER", "AudioManager unavailable")
        return
      }
      promise.resolve(am.getStreamVolume(AudioManager.STREAM_MUSIC))
    } catch (e: Exception) {
      promise.reject("ERROR", e.message ?: "unknown")
    }
  }

  @ReactMethod
  fun setVolume(value: Float, promise: Promise) {
    try {
      val am = audioManager()
      if (am == null) {
        promise.reject("NO_AUDIO_MANAGER", "AudioManager unavailable")
        return
      }
      val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      val target = (value.coerceIn(0f, 1f) * max).toInt().coerceIn(0, max)
      am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
      promise.resolve(target.toFloat() / max.toFloat())
    } catch (e: Exception) {
      promise.reject("ERROR", e.message ?: "unknown")
    }
  }
}