# fix-android-env.ps1 — Apply all Android environment fixes for Expo + RN builds in China

$root = $PSScriptRoot
$modules = Join-Path $root "node_modules"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

Write-Host "=== 1/4: Strip BOM from all .gradle / .kts files ==="
Get-ChildItem $modules -Recurse -Include "*.gradle","*.gradle.kts","*.kts" -ErrorAction SilentlyContinue | ForEach-Object {
  try { $bytes = [System.IO.File]::ReadAllBytes($_.FullName) } catch { return }
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $content = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    if ($content.Length -gt 0 -and $content[0] -eq [char]0xFEFF) { $content = $content.Substring(1) }
    [System.IO.File]::WriteAllText($_.FullName, $content, $utf8NoBom)
    Write-Host "  Stripped BOM: $($_.FullName | Resolve-Path -Relative)"
  }
}

Write-Host "=== 2/4: Ensure Aliyun mirrors in included builds ==="

# 2a: @react-native/gradle-plugin/settings.gradle.kts
$rnSettings = Join-Path $modules "@react-native\gradle-plugin\settings.gradle.kts"
$content = Get-Content $rnSettings -Raw -Encoding UTF8
if (-not ($content -match "aliyun")) {
  Write-Host "  Patching @react-native/gradle-plugin..."
  $newContent = @"
pluginManagement {
  repositories {
    maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
    maven { url = uri("https://maven.aliyun.com/repository/public") }
    maven { url = uri("https://maven.aliyun.com/repository/google") }
    mavenCentral()
    google()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
  repositories {
    maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
    maven { url = uri("https://maven.aliyun.com/repository/public") }
    maven { url = uri("https://maven.aliyun.com/repository/google") }
    mavenCentral()
    google()
    gradlePluginPortal()
  }
}
"@
  # Replace just the pluginManagement block and add dependencyResolutionManagement
  $content = $content -replace '(?s)pluginManagement \{.*?\n\}', $newContent
  [System.IO.File]::WriteAllText($rnSettings, $content, $utf8NoBom)
  Write-Host "    Done."
} else { Write-Host "  @react-native/gradle-plugin OK" }

# 2b: expo-gradle-plugin/settings.gradle.kts
$expoSettings = Join-Path $modules "expo-modules-autolinking\android\expo-gradle-plugin\settings.gradle.kts"
$content = Get-Content $expoSettings -Raw -Encoding UTF8
if (-not ($content -match "aliyun")) {
  Write-Host "  Patching expo-gradle-plugin..."
  $newContent = @"
pluginManagement {
  repositories {
    maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
    maven { url = uri("https://maven.aliyun.com/repository/public") }
    maven { url = uri("https://maven.aliyun.com/repository/google") }
    mavenCentral()
    google()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
  repositories {
    maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
    maven { url = uri("https://maven.aliyun.com/repository/public") }
    maven { url = uri("https://maven.aliyun.com/repository/google") }
    mavenCentral()
    google()
    gradlePluginPortal()
  }
}
"@
  $content = $content -replace '(?s)pluginManagement \{.*?\n\}', $newContent
  [System.IO.File]::WriteAllText($expoSettings, $content, $utf8NoBom)
  Write-Host "    Done."
} else { Write-Host "  expo-gradle-plugin OK" }

# 2c: expo-module-gradle-plugin/build.gradle.kts (repositories block)
$moduleBuild = Join-Path $modules "expo-modules-core\expo-module-gradle-plugin\build.gradle.kts"
$content = Get-Content $moduleBuild -Raw -Encoding UTF8
if (-not ($content -match "aliyun")) {
  Write-Host "  Patching expo-module-gradle-plugin/build.gradle.kts..."
  $mirrorLines = @(
    '  maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }'
    '  maven { url = uri("https://maven.aliyun.com/repository/public") }'
    '  maven { url = uri("https://maven.aliyun.com/repository/google") }'
  ) -join "`n"
  $content = $content -replace '(?s)(repositories \{$)', "`$1`n$mirrorLines"
  [System.IO.File]::WriteAllText($moduleBuild, $content, $utf8NoBom)
  Write-Host "    Done."
} else { Write-Host "  expo-module-gradle-plugin/build.gradle.kts OK" }

# 2d: expo-module-gradle-plugin/settings.gradle.kts (missing file)
$moduleSettings = Join-Path $modules "expo-modules-core\expo-module-gradle-plugin\settings.gradle.kts"
if (-not (Test-Path $moduleSettings)) {
  Write-Host "  Creating expo-module-gradle-plugin/settings.gradle.kts..."
  @"
pluginManagement {
  repositories {
    maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
    maven { url = uri("https://maven.aliyun.com/repository/public") }
    maven { url = uri("https://maven.aliyun.com/repository/google") }
    mavenCentral()
    google()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
  repositories {
    maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
    maven { url = uri("https://maven.aliyun.com/repository/public") }
    maven { url = uri("https://maven.aliyun.com/repository/google") }
    mavenCentral()
    google()
    gradlePluginPortal()
  }
}

rootProject.name = "expo-module-gradle-plugin"
"@ | Set-Content -LiteralPath $moduleSettings -NoNewline -Encoding UTF8
  Write-Host "    Done."
} else { Write-Host "  expo-module-gradle-plugin/settings.gradle.kts OK" }

Write-Host ""
Write-Host "=== 3/4: expo-audio lock-screen prev/next controls patch ==="

function Apply-ExpoAudioPatch {
  param($path, $marker, $old, $new)
  if (-not (Test-Path $path)) {
    Write-Host "  MISSING: $path"
    return
  }
  $old = $old -replace "`r`n", "`n"
  $new = $new -replace "`r`n", "`n"
  $c = Get-Content $path -Raw -Encoding UTF8
  $c = $c -replace "`r`n", "`n"
  if ($c.Contains($marker)) {
    Write-Host "  OK (already patched): $path"
    return
  }
  if (-not $c.Contains($old)) {
    Write-Host "  SKIP (pattern not found): $path"
    return
  }
  $c = $c.Replace($old, $new)
  [System.IO.File]::WriteAllText($path, $c, $utf8NoBom)
  Write-Host "  Patched: $path"
}

$audioSvcDir = Join-Path $modules "expo-audio\android\src\main\java\expo\modules\audio"

# 3a: AudioMediaSessionCallback.kt — keep prev/next media-item commands available
Apply-ExpoAudioPatch -path (Join-Path $audioSvcDir "service\AudioMediaSessionCallback.kt") -marker ".add(Player.COMMAND_SEEK_TO_PREVIOUS)" -old @'
            .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_FORWARD)
            .add(Player.COMMAND_SEEK_BACK)
            // Remove track navigation commands
            .remove(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
            .remove(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
            .remove(Player.COMMAND_SEEK_TO_PREVIOUS)
            .remove(Player.COMMAND_SEEK_TO_NEXT)
            .build()
'@ -new @'
            .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_FORWARD)
            .add(Player.COMMAND_SEEK_BACK)
            // Enable track navigation (previous/next) so lock-screen controls can show them.
            // SystemUI checks COMMAND_SEEK_TO_PREVIOUS/NEXT (non-media-item variants) to render the buttons.
            .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_TO_PREVIOUS)
            .add(Player.COMMAND_SEEK_TO_NEXT)
            .build()
'@

# 3b: MetadataInjectingPlayer.kt — command hook + always-available nav commands
Apply-ExpoAudioPatch -path (Join-Path $audioSvcDir "service\MetadataInjectingPlayer.kt") -marker "private val onMediaCommand" -old @'
internal class MetadataInjectingPlayer(
  player: Player
) : ForwardingPlayer(player) {
'@ -new @'
internal class MetadataInjectingPlayer(
  player: Player,
  private val onMediaCommand: ((String) -> Unit)? = null
) : ForwardingPlayer(player) {
'@

Apply-ExpoAudioPatch -path (Join-Path $audioSvcDir "service\MetadataInjectingPlayer.kt") -marker "override fun seekToPreviousMediaItem()" -old @'
  override fun getMediaMetadata(): MediaMetadata {
    val metadata = injectedMetadata
'@ -new @'
  override fun getAvailableCommands(): Player.Commands {
    return super.getAvailableCommands().buildUpon()
      .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
      .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
      .build()
  }

  // Report previous/next as available even though the underlying ExoPlayer holds a single
  // media item per track. SystemUI hides the prev/next buttons when hasPrevious/hasNext is
  // false (tempo-gai shows them because its real player carries the whole playlist).
  override fun hasPreviousMediaItem(): Boolean = true

  override fun hasNextMediaItem(): Boolean = true

  override fun seekToPreviousMediaItem() {
    // Intercept instead of forwarding: navigation is handled by the JS playback controller
    onMediaCommand?.invoke("previous")
  }

  override fun seekToNextMediaItem() {
    onMediaCommand?.invoke("next")
  }

  override fun seekToPrevious() {
    onMediaCommand?.invoke("previous")
  }

  override fun seekToNext() {
    onMediaCommand?.invoke("next")
  }

  override fun getMediaMetadata(): MediaMetadata {
    val metadata = injectedMetadata
'@

# 3c: AudioControlsService.kt — prev/next actions, buttons, notification actions, wiring
$svcFile = Join-Path $audioSvcDir "service\AudioControlsService.kt"

Apply-ExpoAudioPatch -path $svcFile -marker 'currentPlayer?.notifyMediaCommand("previous")' -old @'
        ACTION_SEEK_FORWARD -> currentPlayerRef.seekTo(currentPlayerRef.currentPosition + SEEK_INTERVAL_MS)
        ACTION_SEEK_BACKWARD -> currentPlayerRef.seekTo(currentPlayerRef.currentPosition - SEEK_INTERVAL_MS)
      }
'@ -new @'
        ACTION_SEEK_FORWARD -> currentPlayerRef.seekTo(currentPlayerRef.currentPosition + SEEK_INTERVAL_MS)
        ACTION_SEEK_BACKWARD -> currentPlayerRef.seekTo(currentPlayerRef.currentPosition - SEEK_INTERVAL_MS)
        ACTION_PREVIOUS -> currentPlayer?.notifyMediaCommand("previous")
        ACTION_NEXT -> currentPlayer?.notifyMediaCommand("next")
      }
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'getPlayModeIcon()' -old @'
    val style = MediaStyleNotificationHelper.MediaStyle(session)
'@ -new @'
    val style = MediaStyleNotificationHelper.MediaStyle(session)

    // Play order (expanded only), Previous, PlayPause, Next (compact), Lyrics (expanded only)
    val compactViewIndices = mutableListOf<Int>()
    var currentIndex = 0

    builder.addAction(
      NotificationCompat.Action(
        getPlayModeIcon(),
        "Play Mode",
        buildActionPendingIntent(ACTION_CYCLE_PLAY_MODE)
      )
    )
    currentIndex++

    compactViewIndices.add(currentIndex)
    builder.addAction(
      NotificationCompat.Action(
        androidx.media3.session.R.drawable.media3_icon_previous,
        "Previous",
        buildActionPendingIntent(ACTION_PREVIOUS)
      )
    )
    currentIndex++

    compactViewIndices.add(currentIndex)
    builder.addAction(
      NotificationCompat.Action(
        if (session.player.isPlaying) {
          androidx.media3.session.R.drawable.media3_icon_pause
        } else {
          androidx.media3.session.R.drawable.media3_icon_play
        },
        if (session.player.isPlaying) "Pause" else "Play",
        buildActionPendingIntent(if (session.player.isPlaying) ACTION_PAUSE else ACTION_PLAY)
      )
    )
    currentIndex++

    compactViewIndices.add(currentIndex)
    builder.addAction(
      NotificationCompat.Action(
        androidx.media3.session.R.drawable.media3_icon_next,
        "Next",
        buildActionPendingIntent(ACTION_NEXT)
      )
    )
    currentIndex++

    builder.addAction(
      NotificationCompat.Action(
        if (lyricsToggle) {
          androidx.media3.session.R.drawable.media3_icon_subtitles
        } else {
          androidx.media3.session.R.drawable.media3_icon_subtitles_off
        },
        "Lyrics",
        buildActionPendingIntent(ACTION_TOGGLE_LYRICS)
      )
    )

    style.setShowActionsInCompactView(*compactViewIndices.toIntArray())
'@

# 3c-A: Notification visibility=PUBLIC + diagnostic Log.d for buildNotification
Apply-ExpoAudioPatch -path $svcFile -marker 'setVisibility(NotificationCompat.VISIBILITY_PUBLIC)' -old @'
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(androidx.media3.session.R.drawable.media3_icon_circular_play)
'@ -new @'
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setSmallIcon(androidx.media3.session.R.drawable.media3_icon_circular_play)
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'buildNotification actions=' -old @'
    builder.setStyle(style)
    val n = builder.build()
    return n
'@ -new @'
    builder.setStyle(style)
    val n = builder.build()
    android.util.Log.d("AudioControlsService", "buildNotification actions=${n.actions.size} title=${n.extras?.getString(Notification.EXTRA_TITLE)}")
    return n
'@

# 3c-C: Play mode + lyrics toggle action constants and handlers
Apply-ExpoAudioPatch -path $svcFile -marker 'ACTION_CYCLE_PLAY_MODE' -old @'
    const val ACTION_NEXT = "expo.modules.audio.action.NEXT"

    const val SEEK_INTERVAL_MS = 10000L
'@ -new @'
    const val ACTION_NEXT = "expo.modules.audio.action.NEXT"
    const val ACTION_CYCLE_PLAY_MODE = "expo.modules.audio.action.CYCLE_PLAY_MODE"
    const val ACTION_TOGGLE_LYRICS = "expo.modules.audio.action.TOGGLE_LYRICS"

    const val SEEK_INTERVAL_MS = 10000L
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'currentPlayMode' -old @'
  var playbackListener: Player.Listener? = null
'@ -new @'
  var playbackListener: Player.Listener? = null
  var currentPlayMode: String = "list"
  var lyricsToggle: Boolean = false
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'getPlayModeIcon' -old @'
  fun updatePlayMode(mode: String) {
    currentPlayMode = mode
    postOrStartForegroundNotification(startInForeground = false)
  }
'@ -new @'
  private fun getPlayModeIcon(): Int {
    return when (currentPlayMode) {
      "list" -> androidx.media3.session.R.drawable.media3_icon_repeat_off
      "list-repeat" -> androidx.media3.session.R.drawable.media3_icon_repeat_all
      "single-repeat" -> androidx.media3.session.R.drawable.media3_icon_repeat_one
      "shuffle" -> androidx.media3.session.R.drawable.media3_icon_shuffle_on
      else -> androidx.media3.session.R.drawable.media3_icon_repeat_off
    }
  }

  fun updatePlayMode(mode: String) {
    currentPlayMode = mode
    postOrStartForegroundNotification(startInForeground = false)
  }
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'updatePlayMode(mode: String)' -old @'
  fun updateLyricsToggle(enabled: Boolean) {
    lyricsToggle = enabled
    postOrStartForegroundNotification(startInForeground = false)
  }
'@ -new @'
  fun updatePlayMode(mode: String) {
    currentPlayMode = mode
    postOrStartForegroundNotification(startInForeground = false)
  }

  fun updateLyricsToggle(enabled: Boolean) {
    lyricsToggle = enabled
    postOrStartForegroundNotification(startInForeground = false)
  }
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'ACTION_CYCLE_PLAY_MODE ->' -old @'
        ACTION_NEXT -> currentPlayer?.notifyMediaCommand("next")
      }
'@ -new @'
        ACTION_NEXT -> currentPlayer?.notifyMediaCommand("next")
        ACTION_CYCLE_PLAY_MODE -> currentPlayer?.notifyMediaCommand("cyclePlayMode")
        ACTION_TOGGLE_LYRICS -> currentPlayer?.notifyMediaCommand("toggleLyrics")
      }
'@

# 3c-D: AudioPlayer.kt — new methods for play mode + lyrics sync
$playerFile = Join-Path $audioSvcDir "AudioPlayer.kt"
Apply-ExpoAudioPatch -path $playerFile -marker 'updatePlayMode' -old @'
  internal fun notifyMediaCommand(command: String) {
    emit("mediaControl", command)
  }
'@ -new @'
  fun updatePlayMode(mode: String) {
    if (isActiveForLockScreen) {
      serviceConnection.playbackServiceBinder?.service?.updatePlayMode(mode)
    }
  }

  fun updateLyricsToggle(enabled: Boolean) {
    if (isActiveForLockScreen) {
      serviceConnection.playbackServiceBinder?.service?.updateLyricsToggle(enabled)
    }
  }

  internal fun notifyMediaCommand(command: String) {
    emit("mediaControl", command)
  }
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'setDisplayName("Previous")' -old @'
  private fun updateSessionCustomLayout(isPlaying: Boolean) {
    val session = mediaSession ?: return
    val mediaButtons = mutableListOf<CommandButton>()

    // Add seek backward button if enabled
    if (currentOptions?.showSeekBackward == true) {
      mediaButtons.add(
        CommandButton.Builder(CommandButton.ICON_SKIP_BACK_10)
          .setDisplayName("Seek Backward")
          .setEnabled(true)
          .setSessionCommand(SessionCommand(ACTION_SEEK_BACKWARD, Bundle.EMPTY))
          .setSlots(CommandButton.SLOT_BACK)
          .build()
      )
    }

    // Add play/pause button (always present)
    mediaButtons.add(
      CommandButton.Builder(if (isPlaying) CommandButton.ICON_PAUSE else CommandButton.ICON_PLAY)
        .setDisplayName(if (isPlaying) "Pause" else "Play")
        .setEnabled(true)
        .setPlayerCommand(Player.COMMAND_PLAY_PAUSE)
        .setSlots(CommandButton.SLOT_CENTRAL)
        .build()
    )

    // Add seek forward button if enabled
    if (currentOptions?.showSeekForward == true) {
      mediaButtons.add(
        CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_10)
          .setDisplayName("Seek Forward")
          .setEnabled(true)
          .setSessionCommand(SessionCommand(ACTION_SEEK_FORWARD, Bundle.EMPTY))
          .setSlots(CommandButton.SLOT_FORWARD)
          .build()
      )
    }

    session.setCustomLayout(mediaButtons)
    session.setMediaButtonPreferences(mediaButtons)
  }
'@ -new @'
  private fun updateSessionCustomLayout(isPlaying: Boolean) {
    val session = mediaSession ?: return
    val mediaButtons = mutableListOf<CommandButton>()

    // Add previous-track button
    mediaButtons.add(
      CommandButton.Builder(CommandButton.ICON_SKIP_BACK)
        .setDisplayName("Previous")
        .setEnabled(true)
        .setPlayerCommand(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
        .setSlots(CommandButton.SLOT_BACK)
        .build()
    )

    // Add seek backward button if enabled
    if (currentOptions?.showSeekBackward == true) {
      mediaButtons.add(
        CommandButton.Builder(CommandButton.ICON_SKIP_BACK_10)
          .setDisplayName("Seek Backward")
          .setEnabled(true)
          .setSessionCommand(SessionCommand(ACTION_SEEK_BACKWARD, Bundle.EMPTY))
          .setSlots(CommandButton.SLOT_BACK)
          .build()
      )
    }

    // Add play/pause button (always present)
    mediaButtons.add(
      CommandButton.Builder(if (isPlaying) CommandButton.ICON_PAUSE else CommandButton.ICON_PLAY)
        .setDisplayName(if (isPlaying) "Pause" else "Play")
        .setEnabled(true)
        .setPlayerCommand(Player.COMMAND_PLAY_PAUSE)
        .setSlots(CommandButton.SLOT_CENTRAL)
        .build()
    )

    // Add seek forward button if enabled
    if (currentOptions?.showSeekForward == true) {
      mediaButtons.add(
        CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_10)
          .setDisplayName("Seek Forward")
          .setEnabled(true)
          .setSessionCommand(SessionCommand(ACTION_SEEK_FORWARD, Bundle.EMPTY))
          .setSlots(CommandButton.SLOT_FORWARD)
          .build()
      )
    }

    // Add next-track button
    mediaButtons.add(
      CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD)
        .setDisplayName("Next")
        .setEnabled(true)
        .setPlayerCommand(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
        .setSlots(CommandButton.SLOT_FORWARD)
        .build()
    )

    session.setCustomLayout(mediaButtons)
    session.setMediaButtonPreferences(mediaButtons)
  }
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'player.notifyMediaCommand(command)' -old @'
        val sessionPlayer = MetadataInjectingPlayer(resolveSessionPlayer(player, options)).apply {
          updateMetadata(metadata)
        }
'@ -new @'
        val sessionPlayer = MetadataInjectingPlayer(resolveSessionPlayer(player, options)) { command ->
          player.notifyMediaCommand(command)
        }.apply {
          updateMetadata(metadata)
        }
'@

Apply-ExpoAudioPatch -path $svcFile -marker 'const val ACTION_NEXT =' -old @'
    const val ACTION_SEEK_FORWARD = "expo.modules.audio.action.SEEK_FORWARD"
    const val ACTION_SEEK_BACKWARD = "expo.modules.audio.action.SEEK_BACKWARD"
'@ -new @'
    const val ACTION_SEEK_FORWARD = "expo.modules.audio.action.SEEK_FORWARD"
    const val ACTION_SEEK_BACKWARD = "expo.modules.audio.action.SEEK_BACKWARD"

    const val ACTION_PREVIOUS = "expo.modules.audio.action.PREVIOUS"
    const val ACTION_NEXT = "expo.modules.audio.action.NEXT"
'@

# 3d: AudioPlayer.kt — emit mediaControl event to JS
Apply-ExpoAudioPatch -path (Join-Path $audioSvcDir "AudioPlayer.kt") -marker "fun notifyMediaCommand" -old @'
  fun clearLockScreenControls() {
    if (isActiveForLockScreen) {
      serviceConnection.playbackServiceBinder?.service?.unregisterPlayer()
    }
  }
'@ -new @'
  fun clearLockScreenControls() {
    if (isActiveForLockScreen) {
      serviceConnection.playbackServiceBinder?.service?.unregisterPlayer()
    }
  }

  internal fun notifyMediaCommand(command: String) {
    emit("mediaControl", command)
  }
'@

Write-Host ""
Write-Host "=== 4/4: All done ==="
Write-Host "Project root: $root"
Write-Host "Run 'npx expo run:android' or 'gradlew.bat app:assembleDebug' to build."
