package com.unraiddash.app.navidromelyrics

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.RemoteViews
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.unraiddash.app.R
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import kotlin.math.max
import kotlin.math.min

class NavidromeLyricsModule(private val reactCtx: ReactApplicationContext) : ReactContextBaseJavaModule(reactCtx) {

  override fun getName() = "NavidromeLyricsModule"

  // ===================== Desktop overlay =====================
  private var windowManager: WindowManager? = null
  private var desktopView: View? = null
  private var prevView: TextView? = null
  private var currentView: TextView? = null
  private var nextView: TextView? = null
  private var next2View: TextView? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var desktopConfig: DesktopConfig = DesktopConfig()
  private var initialY: Int = 0
  private var initialTouchY: Float = 0f
  private var lastReportedY: Int = -1

  private data class DesktopConfig(
    var fontSize: Int = 24,
    var rgb: Int = Color.WHITE,
    var bgAlpha: Int = 70,
    var textAlpha: Int = 100,
    var alignment: Int = 1,
    var lineCount: Int = 2,
    var positionY: Int = 0,
    var lockScreenEnabled: Boolean = false,
  )

  @ReactMethod
  fun showDesktopLyrics(prev: String?, current: String?, next1: String?, next2: String?, config: ReadableMap?) {
    try {
      applyDesktopConfig(config)
      if (desktopView == null) {
        createDesktopOverlay()
      }
      updateDesktopLyrics(prev, current, next1, next2)
    } catch (e: Exception) {
      android.util.Log.e("NavidromeLyrics", "showDesktopLyrics failed", e)
    }
  }

  @ReactMethod
  fun updateDesktopLyrics(prev: String?, current: String?, next1: String?, next2: String?) {
    val root = desktopView as? LinearLayout ?: return
    val cfg = desktopConfig
    val nightMode = reactCtx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    val isDark = nightMode == Configuration.UI_MODE_NIGHT_YES
    val baseBg = if (isDark) Color.BLACK else Color.WHITE
    val bgColor = Color.argb(
      min(255, max(0, cfg.bgAlpha * 255 / 100)),
      Color.red(baseBg), Color.green(baseBg), Color.blue(baseBg)
    )
    root.setBackgroundColor(bgColor)

    val textAlphaByte = min(255, max(0, cfg.textAlpha * 255 / 100))
    val fullColor = Color.argb(textAlphaByte, Color.red(cfg.rgb), Color.green(cfg.rgb), Color.blue(cfg.rgb))
    val dimColor = Color.argb(textAlphaByte / 2, Color.red(cfg.rgb), Color.green(cfg.rgb), Color.blue(cfg.rgb))
    val dim2Color = Color.argb(textAlphaByte / 3, Color.red(cfg.rgb), Color.green(cfg.rgb), Color.blue(cfg.rgb))

    val gravity = when (cfg.alignment) {
      0 -> Gravity.START
      2 -> Gravity.END
      else -> Gravity.CENTER_HORIZONTAL
    }
    root.gravity = gravity

    fun apply(v: TextView?, text: String?, color: Int, sizeSp: Float, visible: Boolean) {
      v?.apply {
        this.text = text ?: ""
        this.setTextColor(color)
        this.textSize = sizeSp
        this.visibility = if (visible && !text.isNullOrEmpty()) View.VISIBLE else View.GONE
      }
    }

    val baseSize = cfg.fontSize.toFloat()
    apply(prevView, prev, dimColor, baseSize * 0.7f, cfg.lineCount >= 3)
    apply(currentView, current, fullColor, baseSize, !current.isNullOrEmpty())
    apply(nextView, next1, dimColor, baseSize * 0.7f, cfg.lineCount >= 2 && !next1.isNullOrEmpty())
    apply(next2View, next2, dim2Color, baseSize * 0.6f, cfg.lineCount >= 4 && !next2.isNullOrEmpty())
  }

  @ReactMethod
  fun hideDesktopLyrics() {
    try {
      desktopView?.let { windowManager?.removeView(it) }
    } catch (_: Exception) {}
    desktopView = null
    prevView = null
    currentView = null
    nextView = null
    next2View = null
    layoutParams = null
    windowManager = null
    lastReportedY = -1
  }

  @ReactMethod
  fun setDesktopLyricsPosition(yFromTop: Int) {
    val lp = layoutParams ?: return
    lp.y = max(0, yFromTop)
    try { windowManager?.updateViewLayout(desktopView, lp) } catch (_: Exception) {}
  }

  @SuppressLint("InflateParams", "ClickableViewAccessibility")
  private fun createDesktopOverlay() {
    val ctx: Context = reactCtx.applicationContext
    if (!android.provider.Settings.canDrawOverlays(ctx)) {
      android.util.Log.w("NavidromeLyrics", "Overlay permission not granted")
      return
    }
    windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val inflater = LayoutInflater.from(ctx)
    val root = inflater.inflate(R.layout.desktop_lyrics_overlay, null) as LinearLayout
    desktopView = root
    prevView = root.findViewById(R.id.desktop_lyrics_prev)
    currentView = root.findViewById(R.id.desktop_lyrics_current)
    nextView = root.findViewById(R.id.desktop_lyrics_next)
    next2View = root.findViewById(R.id.desktop_lyrics_next2)

    val screenHeight = ctx.resources.displayMetrics.heightPixels
    val savedY = if (desktopConfig.positionY > 0) screenHeight - desktopConfig.positionY else 0
    val yPosition = max(0, savedY)

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val flags = if (desktopConfig.lockScreenEnabled) {
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
    } else {
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
    }
    val lp = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      flags,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      y = yPosition
    }
    layoutParams = lp
    attachTouchListener(root)
    try {
      windowManager?.addView(root, lp)
    } catch (e: Exception) {
      android.util.Log.e("NavidromeLyrics", "addView failed", e)
    }
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun attachTouchListener(view: View) {
    view.setOnTouchListener { _, event ->
      val lp = layoutParams ?: return@setOnTouchListener false
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialY = lp.y
          initialTouchY = event.rawY
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val delta = (event.rawY - initialTouchY).toInt()
          lp.y = max(0, initialY + delta)
          try { windowManager?.updateViewLayout(view, lp) } catch (_: Exception) {}
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          try {
            val screenHeight = reactCtx.resources.displayMetrics.heightPixels
            val fromBottom = screenHeight - lp.y
            if (fromBottom != lastReportedY) {
              lastReportedY = fromBottom
              sendLyricsPositionEvent(fromBottom)
            }
          } catch (_: Exception) {}
          view.performClick()
          true
        }
        else -> false
      }
    }
  }

  private fun sendLyricsPositionEvent(yFromBottom: Int) {
    reactCtx.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("NavidromeLyrics/positionChanged", yFromBottom)
  }

  private fun applyDesktopConfig(config: ReadableMap?) {
    if (config == null) return
    val c = desktopConfig
    if (config.hasKey("fontSize")) c.fontSize = config.getInt("fontSize")
    if (config.hasKey("rgb")) c.rgb = config.getInt("rgb")
    if (config.hasKey("bgAlpha")) c.bgAlpha = config.getInt("bgAlpha")
    if (config.hasKey("textAlpha")) c.textAlpha = config.getInt("textAlpha")
    if (config.hasKey("alignment")) c.alignment = config.getInt("alignment")
    if (config.hasKey("lineCount")) c.lineCount = config.getInt("lineCount")
    if (config.hasKey("positionY")) c.positionY = config.getInt("positionY")
    if (config.hasKey("lockScreenEnabled")) c.lockScreenEnabled = config.getBoolean("lockScreenEnabled")
    desktopConfig = c
  }

  // ===================== Lyrics notification =====================
  private val lyricsChannelId = "navidrome_lyrics_channel"
  private val lyricsChannelName = "Navidrome Lyrics"
  private val lyricsNotificationId = 1001

  private fun ensureChannel(notifMgr: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (notifMgr.getNotificationChannel(lyricsChannelId) != null) return
    val channel = NotificationChannel(lyricsChannelId, lyricsChannelName, NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Song lyrics display"
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    notifMgr.createNotificationChannel(channel)
  }

  @ReactMethod
  fun showLyricsNotification(
    prev: String?,
    current: String?,
    next1: String?,
    next2: String?,
    title: String?,
    artist: String?,
    lineCount: Int,
  ) {
    try {
      val ctx: Context = reactCtx.applicationContext
      val notifMgr = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureChannel(notifMgr)

      // Adaptive color: light mode (day) → black text on light bg,
      // dark mode (night) → white text on dark bg
      val nightMode = ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
      val isDark = nightMode == Configuration.UI_MODE_NIGHT_YES
      val fgColor = if (isDark) Color.WHITE else Color.BLACK
      val dimColor = if (isDark) 0x80FFFFFF.toInt() else 0x80000000.toInt()
      val dim2Color = if (isDark) 0x50FFFFFF.toInt() else 0x50000000.toInt()

      val remoteViews = RemoteViews(ctx.packageName, R.layout.notification_lyrics_small)

      // Set texts and colors. All rows stay visible (fixed height in XML) so notification
      // height doesn't change when a row is empty — empty rows just show nothing.
      remoteViews.setTextViewText(R.id.notification_lyrics_prev, prev ?: "")
      remoteViews.setTextColor(R.id.notification_lyrics_prev, dimColor)
      remoteViews.setTextViewText(R.id.notification_lyrics_current, current ?: "")
      remoteViews.setTextColor(R.id.notification_lyrics_current, fgColor)
      remoteViews.setTextViewText(R.id.notification_lyrics_next1, next1 ?: "")
      remoteViews.setTextColor(R.id.notification_lyrics_next1, dimColor)
      remoteViews.setTextViewText(R.id.notification_lyrics_next2, next2 ?: "")
      remoteViews.setTextColor(R.id.notification_lyrics_next2, dim2Color)

      // Don't change visibility — fixed-height rows keep notification size stable
      remoteViews.setViewVisibility(R.id.notification_lyrics_prev, View.VISIBLE)
      remoteViews.setViewVisibility(R.id.notification_lyrics_current, View.VISIBLE)
      remoteViews.setViewVisibility(R.id.notification_lyrics_next1, View.VISIBLE)
      remoteViews.setViewVisibility(R.id.notification_lyrics_next2, View.VISIBLE)

      val launchIntent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        ?: Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val pi = PendingIntent.getActivity(
        ctx, 0, launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val visibility = NotificationCompat.VISIBILITY_PUBLIC

      val builder = NotificationCompat.Builder(ctx, lyricsChannelId)
        .setSmallIcon(android.R.drawable.stat_notify_chat)
        .setContentTitle(title ?: "Navidrome")
        .setContentText(current ?: "")
        .setContentIntent(pi)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(visibility)
        .setCustomContentView(remoteViews)
        .setOngoing(true)

      val notification = builder.build()
      notifMgr.notify(lyricsNotificationId, notification)
    } catch (e: Exception) {
      android.util.Log.e("NavidromeLyrics", "showLyricsNotification failed", e)
    }
  }

  @ReactMethod
  fun cancelLyricsNotification() {
    try {
      val ctx: Context = reactCtx.applicationContext
      val notifMgr = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notifMgr.cancel(lyricsNotificationId)
    } catch (_: Exception) {}
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}