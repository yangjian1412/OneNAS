# fix-android-env.ps1 — Apply all Android environment fixes for Expo + RN builds in China

$root = $PSScriptRoot
$modules = Join-Path $root "node_modules"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

Write-Host "=== 1/3: Strip BOM from all .gradle / .kts files ==="
Get-ChildItem $modules -Recurse -Include "*.gradle","*.gradle.kts","*.kts" -ErrorAction SilentlyContinue | ForEach-Object {
  try { $bytes = [System.IO.File]::ReadAllBytes($_.FullName) } catch { return }
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $content = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    if ($content.Length -gt 0 -and $content[0] -eq [char]0xFEFF) { $content = $content.Substring(1) }
    [System.IO.File]::WriteAllText($_.FullName, $content, $utf8NoBom)
    Write-Host "  Stripped BOM: $($_.FullName | Resolve-Path -Relative)"
  }
}

Write-Host "=== 2/3: Ensure Aliyun mirrors in included builds ==="

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
  $content = $content -replace '(?s)(repositories \{$)', "`$1
  maven { url = uri(\"https://maven.aliyun.com/repository/gradle-plugin\") }
  maven { url = uri(\"https://maven.aliyun.com/repository/public\") }
  maven { url = uri(\"https://maven.aliyun.com/repository/google\") }"
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
Write-Host "=== 3/3: All done ==="
Write-Host "Project root: $root"
Write-Host "Run 'npx expo run:android' or 'gradlew.bat app:assembleDebug' to build."
