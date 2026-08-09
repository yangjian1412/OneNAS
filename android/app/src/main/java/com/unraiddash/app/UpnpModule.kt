package com.unraiddash.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.DatagramPacket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.SocketAddress
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.regex.Pattern
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory

/**
 * 原生 UPnP / DLNA 客户端模块。
 *
 * 手机与电视同 LAN 时，UDP multicast SSDP M-SEARCH 直接发现电视，
 * 通过 SOAP 调电视 AVTransport 服务做 SetAVTransportURI / Play / Pause / Stop / Seek，
 * 进度通过 SOAP GetPositionInfo 轮询。**完全不依赖 Jellyfin / Emby 服务端 DLNA server。**
 *
 * 流 URL 由 JS 侧从 Jellyfin 构造（api_key 作为 query 参数），电视通过公网/Lucky 反代直连 Jellyfin 拉流。
 */
class UpnpModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "UpnpModule"

  private val executor = Executors.newCachedThreadPool()
  private val multicastLocks = ConcurrentHashMap<String, WifiManager.MulticastLock>()

  // ------------------------------------------------------------------
  // SSDP / Discovery
  // ------------------------------------------------------------------

  @ReactMethod
  fun discoverDevices(timeoutMs: Double, promise: Promise) {
    executor.execute {
      val results = Arguments.createArray()
      var socket: MulticastSocket? = null
      var lock: WifiManager.MulticastLock? = null
      var joinedGroup: SocketAddress? = null
      var joinedIf: NetworkInterface? = null
      try {
        lock = acquireMulticastLock()
        val ni = pickMulticastInterface()
        val group = InetAddress.getByName("239.255.255.250")
        val groupEp = InetSocketAddress(group, 1900)
        socket = MulticastSocket(1900)
        socket.soTimeout = 500
        socket.timeToLive = 4
        if (ni != null) {
          try { socket.networkInterface = ni } catch (_: Exception) {}
          try {
            socket.joinGroup(groupEp, ni)
            joinedGroup = groupEp
            joinedIf = ni
          } catch (_: Exception) {
            socket.joinGroup(group)
          }
        } else {
          socket.joinGroup(group)
        }
        try {
          // M-SEARCH 请求：搜所有 UPnP 设备
          val msg = (
            "M-SEARCH * HTTP/1.1\r\n" +
            "HOST: 239.255.255.250:1900\r\n" +
            "MAN: \"ssdp:discover\"\r\n" +
            "MX: 2\r\n" +
            "ST: ssdp:all\r\n\r\n"
          ).toByteArray()
          socket.send(DatagramPacket(msg, msg.size, group, 1900))

          // 收集响应直到超时
          val deadline = System.currentTimeMillis() + timeoutMs.toLong()
          val seen = HashSet<String>()
          while (System.currentTimeMillis() < deadline) {
            val buf = ByteArray(2048)
            try {
              val pkt = DatagramPacket(buf, buf.size)
              socket.receive(pkt)
              val text = String(buf, 0, pkt.length, Charsets.UTF_8)
              val headers = parseHttpHeaders(text)
              val location = headers["LOCATION"] ?: headers["Location"]
              val st = headers["ST"] ?: headers["st"]
              val usn = headers["USN"] ?: headers["usn"]
              if (location != null && st != null && seen.add("$location|$usn")) {
                val entry = Arguments.createMap()
                entry.putString("location", location)
                entry.putString("st", st)
                entry.putString("usn", usn ?: "")
                entry.putString("source", pkt.address.hostAddress ?: "")
                results.pushMap(entry)
              }
            } catch (_: java.net.SocketTimeoutException) {
              // 周期性检查 deadline
            }
          }
        } finally {
          if (joinedGroup != null && joinedIf != null) {
            try { socket?.leaveGroup(joinedGroup, joinedIf) } catch (_: Exception) {}
          } else {
            try { socket?.leaveGroup(group) } catch (_: Exception) {}
          }
          socket?.close()
        }
        promise.resolve(results)
      } catch (e: Exception) {
        promise.reject("SSDP_ERROR", e.message ?: "SSDP discovery failed", e)
      } finally {
        if (lock != null) releaseMulticastLock(lock)
      }
    }
  }

  private fun parseHttpHeaders(raw: String): Map<String, String> {
    val map = HashMap<String, String>()
    // 跳过状态行
    val lines = raw.split("\r\n")
    for (i in 1 until lines.size) {
      val line = lines[i]
      if (line.isEmpty()) break
      val idx = line.indexOf(':')
      if (idx > 0) {
        val k = line.substring(0, idx).trim().uppercase()
        val v = line.substring(idx + 1).trim()
        map[k] = v
      }
    }
    return map
  }

  @ReactMethod
  fun getDeviceDescription(locationUrl: String, promise: Promise) {
    executor.execute {
      try {
        val conn = URL(locationUrl).openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.requestMethod = "GET"
        conn.setRequestProperty("User-Agent", "OneNAS/1.0 UPnP/1.0")
        val code = conn.responseCode
        if (code !in 200..299) {
          promise.reject("DESC_HTTP_ERROR", "HTTP $code")
          conn.disconnect()
          return@execute
        }
        val xml = conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
        conn.disconnect()
        val parsed = parseDeviceDescription(xml, locationUrl)
        promise.resolve(parsed)
      } catch (e: Exception) {
        promise.reject("DESC_ERROR", e.message ?: "fetch failed", e)
      }
    }
  }

  /**
   * 解析 UPnP device description XML，提取：
   *  - deviceType, friendlyName, manufacturer, modelName, UDN
   *  - AVTransport service 的 controlURL / eventSubURL / SCPDURL
   *  - RenderingControl service 的 controlURL（如有）
   */
  private fun parseDeviceDescription(xml: String, locationUrl: String): WritableMap {
    val result = Arguments.createMap()
    result.putString("location", locationUrl)
    var currentServiceType = ""
    var currentServiceId = ""
    var currentControlUrl = ""
    var currentScpdUrl = ""
    var currentEventSubUrl = ""
    val avControlUrls = Arguments.createArray()
    val avEventSubUrls = Arguments.createArray()

    fun flushService() {
      if (currentServiceType.contains("AVTransport")) {
        if (currentControlUrl.isNotEmpty()) avControlUrls.pushString(currentControlUrl)
        if (currentEventSubUrl.isNotEmpty()) avEventSubUrls.pushString(currentEventSubUrl)
      }
      currentServiceType = ""
      currentServiceId = ""
      currentControlUrl = ""
      currentScpdUrl = ""
      currentEventSubUrl = ""
    }

    val factory = XmlPullParserFactory.newInstance()
    factory.isNamespaceAware = false
    val parser = factory.newPullParser()
    parser.setInput(xml.reader())
    var event = parser.eventType
    var deviceDepth = 0
    while (event != XmlPullParser.END_DOCUMENT) {
      when (event) {
        XmlPullParser.START_TAG -> {
          val tag = parser.name
          when (tag) {
            "device" -> {
              deviceDepth++
              if (deviceDepth == 1) {
                // 顶层 device：清空 service 缓存
              }
            }
            "service" -> {
              currentServiceType = ""
              currentServiceId = ""
              currentControlUrl = ""
              currentScpdUrl = ""
              currentEventSubUrl = ""
            }
            else -> {
              val text = try { parser.nextText().trim() } catch (_: Exception) { "" }
              if (text.isNotEmpty()) {
                when (tag) {
                  "deviceType" -> if (deviceDepth >= 1) result.putString("deviceType", text)
                  "friendlyName" -> if (deviceDepth >= 1) result.putString("friendlyName", text)
                  "manufacturer" -> if (deviceDepth >= 1) result.putString("manufacturer", text)
                  "modelName" -> if (deviceDepth >= 1) result.putString("modelName", text)
                  "modelNumber" -> if (deviceDepth >= 1) result.putString("modelNumber", text)
                  "UDN" -> if (deviceDepth >= 1) result.putString("udn", text)
                  "URLBase" -> if (!result.hasKey("URLBase")) result.putString("URLBase", text)
                  "serviceType" -> currentServiceType = text
                  "serviceId" -> currentServiceId = text
                  "controlURL" -> currentControlUrl = text
                  "SCPDURL" -> currentScpdUrl = text
                  "eventSubURL" -> currentEventSubUrl = text
                }
              }
            }
          }
        }
        XmlPullParser.END_TAG -> {
          val tag = parser.name
          if (tag == "service") {
            flushService()
          } else if (tag == "device") {
            deviceDepth--
          }
        }
      }
      event = parser.next()
    }

    result.putArray("avTransportControlUrls", avControlUrls)
    result.putArray("avTransportEventSubUrls", avEventSubUrls)

    // 拼接绝对 URL：URLBase + controlURL
    val urlBase = if (result.hasKey("URLBase")) result.getString("URLBase") else null
    val absControlUrls = Arguments.createArray()
    for (i in 0 until avControlUrls.size()) {
      val raw = avControlUrls.getString(i) ?: continue
      absControlUrls.pushString(joinUrl(urlBase, locationUrl, raw))
    }
    result.putArray("avTransportControlUrlsAbsolute", absControlUrls)
    return result
  }

  private fun joinUrl(urlBase: String?, locationUrl: String, rel: String): String {
    if (rel.startsWith("http://") || rel.startsWith("https://")) return rel
    val baseStr = if (!urlBase.isNullOrBlank()) {
      urlBase
    } else {
      val u = URL(locationUrl)
      val portPart = if (u.port != -1) ":${u.port}" else ""
      "${u.protocol}://${u.host}$portPart"
    }
    val base = baseStr.trimEnd('/')
    return if (rel.startsWith("/")) base + rel else "$base/$rel"
  }

  // ------------------------------------------------------------------
  // SOAP / AVTransport control
  // ------------------------------------------------------------------

  private fun controlUrlOf(desc: WritableMap): String {
    val arr = desc.getArray("avTransportControlUrlsAbsolute")
    val url = arr?.getString(0)
    if (!url.isNullOrEmpty()) return url
    throw IllegalStateException("设备描述中找不到 AVTransport controlURL")
  }

  @ReactMethod
  fun setAVTransportURI(controlUrl: String, currentUri: String, metadataXml: String?, promise: Promise) {
    executor.execute {
      val meta = metadataXml ?: ""
      val body = (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
        "<s:Body>" +
        "<u:SetAVTransportURI xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
        "<InstanceID>0</InstanceID>" +
        "<CurrentURI>${escapeXml(currentUri)}</CurrentURI>" +
        "<CurrentURIMetadata>${escapeXml(meta)}</CurrentURIMetadata>" +
        "</u:SetAVTransportURI>" +
        "</s:Body></s:Envelope>"
      )
      soapCall(controlUrl, body, "SetAVTransportURI", promise)
    }
  }

  @ReactMethod
  fun play(controlUrl: String, promise: Promise) {
    executor.execute {
      val body = (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
        "<s:Body>" +
        "<u:Play xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
        "<InstanceID>0</InstanceID><Speed>1</Speed>" +
        "</u:Play></s:Body></s:Envelope>"
      )
      soapCall(controlUrl, body, "Play", promise)
    }
  }

  @ReactMethod
  fun pause(controlUrl: String, promise: Promise) {
    executor.execute {
      val body = (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
        "<s:Body>" +
        "<u:Pause xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
        "<InstanceID>0</InstanceID>" +
        "</u:Pause></s:Body></s:Envelope>"
      )
      soapCall(controlUrl, body, "Pause", promise)
    }
  }

  @ReactMethod
  fun stop(controlUrl: String, promise: Promise) {
    executor.execute {
      val body = (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
        "<s:Body>" +
        "<u:Stop xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
        "<InstanceID>0</InstanceID>" +
        "</u:Stop></s:Body></s:Envelope>"
      )
      soapCall(controlUrl, body, "Stop", promise)
    }
  }

  /**
   * 跳转到绝对时间（秒）。SOAP 中转 REL_TIME 格式 `H:MM:SS`。
   */
  @ReactMethod
  fun seek(controlUrl: String, targetSeconds: Double, promise: Promise) {
    executor.execute {
      val total = targetSeconds.toLong().coerceAtLeast(0)
      val h = total / 3600
      val m = (total % 3600) / 60
      val s = total % 60
      val target = String.format("%d:%02d:%02d", h, m, s)
      val body = (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
        "<s:Body>" +
        "<u:Seek xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
        "<InstanceID>0</InstanceID><Unit>REL_TIME</Unit>" +
        "<Target>$target</Target>" +
        "</u:Seek></s:Body></s:Envelope>"
      )
      soapCall(controlUrl, body, "Seek", promise)
    }
  }

  @ReactMethod
  fun getTransportInfo(controlUrl: String, promise: Promise) {
    executor.execute {
      val body = (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
        "<s:Body>" +
        "<u:GetTransportInfo xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
        "<InstanceID>0</InstanceID>" +
        "</u:GetTransportInfo></s:Body></s:Envelope>"
      )
      val responseXml = soapCallSync(controlUrl, body, "GetTransportInfo")
      val state = extractFirst(responseXml, "CurrentTransportState")
      val status = extractFirst(responseXml, "CurrentTransportStatus")
      val map = Arguments.createMap()
      map.putString("state", state ?: "STOPPED")
      map.putString("status", status ?: "OK")
      promise.resolve(map)
    }
  }

  @ReactMethod
  fun getPositionInfo(controlUrl: String, promise: Promise) {
    executor.execute {
      val body = (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
        "<s:Body>" +
        "<u:GetPositionInfo xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
        "<InstanceID>0</InstanceID>" +
        "</u:GetPositionInfo></s:Body></s:Envelope>"
      )
      val responseXml = soapCallSync(controlUrl, body, "GetPositionInfo")
      val rel = extractFirst(responseXml, "RelTime") ?: "0:00:00"
      val dur = extractFirst(responseXml, "TrackDuration") ?: "0:00:00"
      val map = Arguments.createMap()
      map.putDouble("positionSeconds", parseHms(rel).toDouble())
      map.putDouble("durationSeconds", parseHms(dur).toDouble())
      map.putString("relTimeRaw", rel)
      map.putString("durationRaw", dur)
      promise.resolve(map)
    }
  }

  /**
   * 一次拿到 AVTransport control URL + 设备元信息（合并 discoverDevices + getDeviceDescription 的结果）。
   * JS 侧拿到这个再点投屏，避免后续再 GET description。
   *
   * Android 坑：MulticastSocket(1900) 不显式绑 interface 时，sendto 会 EPERM 拒绝。
   * 这里通过 ConnectivityManager 拿到当前活跃网络接口（一般是 wlan0），绑定后再 joinGroup。
   */
  @ReactMethod
  fun discoverRenderers(timeoutMs: Double, promise: Promise) {
    executor.execute {
      val renderers = Arguments.createArray()
      var socket: MulticastSocket? = null
      var lock: WifiManager.MulticastLock? = null
      var joinedGroup: SocketAddress? = null
      var joinedIf: NetworkInterface? = null
      try {
        // 1. SSDP 发现
        lock = acquireMulticastLock()
        val ni = pickMulticastInterface()
        val group = InetAddress.getByName("239.255.255.250")
        val groupEp = InetSocketAddress(group, 1900)
        socket = MulticastSocket(1900)
        socket.soTimeout = 500
        socket.timeToLive = 4
        if (ni != null) {
          try { socket.networkInterface = ni } catch (_: Exception) {}
          try {
            socket.joinGroup(groupEp, ni)
            joinedGroup = groupEp
            joinedIf = ni
          } catch (e: Exception) {
            // fallback 到旧 API
            socket.joinGroup(group)
            joinedGroup = null
            joinedIf = null
          }
        } else {
          socket.joinGroup(group)
          joinedGroup = null
          joinedIf = null
        }
        val locationMap = LinkedHashMap<String, WritableMap>()
        try {
          val msg = (
            "M-SEARCH * HTTP/1.1\r\n" +
            "HOST: 239.255.255.250:1900\r\n" +
            "MAN: \"ssdp:discover\"\r\n" +
            "MX: 2\r\n" +
            "ST: ssdp:all\r\n\r\n"
          ).toByteArray()
          socket.send(DatagramPacket(msg, msg.size, group, 1900))
          val deadline = System.currentTimeMillis() + timeoutMs.toLong()
          while (System.currentTimeMillis() < deadline) {
            val buf = ByteArray(2048)
            try {
              val pkt = DatagramPacket(buf, buf.size)
              socket.receive(pkt)
              val text = String(buf, 0, pkt.length, Charsets.UTF_8)
              val headers = parseHttpHeaders(text)
              val st = headers["ST"] ?: ""
              val location = headers["LOCATION"] ?: headers["Location"]
              if (location != null && st.contains("MediaRenderer")) {
                val entry = Arguments.createMap()
                entry.putString("location", location)
                locationMap[location] = entry
              }
            } catch (_: java.net.SocketTimeoutException) {}
          }
        } finally {
          if (joinedGroup != null && joinedIf != null) {
            try { socket.leaveGroup(joinedGroup, joinedIf) } catch (_: Exception) {}
          } else {
            try { socket.leaveGroup(group) } catch (_: Exception) {}
          }
          socket.close()
        }

        // 2. 拉每个 device description 提取 AVTransport controlURL
        for ((location, _) in locationMap) {
          try {
            val desc = getDeviceDescriptionSync(location)
            val avArr = desc.getArray("avTransportControlUrlsAbsolute")
            if (avArr == null || avArr.size() == 0) continue
            // 仅保留必要字段，避免对象过大
            val compact = Arguments.createMap()
            compact.putString("location", location)
            compact.putString("friendlyName", desc.getString("friendlyName") ?: location)
            compact.putString("manufacturer", desc.getString("manufacturer") ?: "")
            compact.putString("modelName", desc.getString("modelName") ?: "")
            compact.putString("udn", desc.getString("udn") ?: "")
            compact.putString("controlUrl", avArr.getString(0))
            renderers.pushMap(compact)
          } catch (_: Exception) {
            // skip 解析失败的设备
          }
        }
        promise.resolve(renderers)
      } catch (e: Exception) {
        val msg = e.message ?: "discovery failed"
        promise.reject(
          "UPNP_DISCOVER",
          if (msg.contains("EPERM") || msg.contains("Operation not permitted")) {
            "无法发送 UPnP 发现包，请确认 Wi-Fi 已连接且允许组播（$msg）"
          } else {
            msg
          },
          e
        )
      } finally {
        if (lock != null) releaseMulticastLock(lock)
      }
    }
  }

  /**
   * 取一个能发组播的接口：优先选活跃 WiFi，再退到任何可用接口。
   * Android 上发组播必须显式绑定接口，否则 sendto 会 EPERM。
   */
  private fun pickMulticastInterface(): NetworkInterface? {
    val all = try {
      NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
    } catch (_: Exception) {
      emptyList()
    }
    // 优先取名称带 wlan / 没有 down 标记且支持 multicast 的接口
    return all.firstOrNull { ni ->
      isUsableMulticastIf(ni) && ni.name?.startsWith("wlan") == true
    } ?: all.firstOrNull { ni ->
      isUsableMulticastIf(ni) && ni.name?.startsWith("eth") == true
    } ?: all.firstOrNull { isUsableMulticastIf(it) }
  }

  private fun isUsableMulticastIf(ni: NetworkInterface): Boolean {
    return try {
      ni.isUp && !ni.isLoopback && ni.supportsMulticast() &&
        ni.inetAddresses?.toList()?.any { !it.isLoopbackAddress && it.address.size == 4 } == true
    } catch (_: Exception) {
      false
    }
  }

  private fun getDeviceDescriptionSync(locationUrl: String): WritableMap {
    val conn = URL(locationUrl).openConnection() as HttpURLConnection
    conn.connectTimeout = 8000
    conn.readTimeout = 8000
    conn.requestMethod = "GET"
    val code = conn.responseCode
    if (code !in 200..299) {
      conn.disconnect()
      throw IllegalStateException("HTTP $code")
    }
    val xml = conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
    conn.disconnect()
    return parseDeviceDescription(xml, locationUrl)
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private fun soapCall(controlUrl: String, body: String, action: String, promise: Promise) {
    try {
      val code = soapPost(controlUrl, body, action)
      if (code in 200..299) promise.resolve(null)
      else promise.reject("SOAP_HTTP", "HTTP $code for $action")
    } catch (e: Exception) {
      promise.reject("SOAP_ERROR", e.message ?: "SOAP failed", e)
    }
  }

  private fun soapCallSync(controlUrl: String, body: String, action: String): String {
    val code = soapPost(controlUrl, body, action)
    if (code !in 200..299) throw IllegalStateException("SOAP HTTP $code for $action")
    return lastSoapResponseBody ?: ""
  }

  private var lastSoapResponseBody: String? = null

  private fun soapPost(controlUrl: String, body: String, action: String): Int {
    val conn = URL(controlUrl).openConnection() as HttpURLConnection
    conn.connectTimeout = 8000
    conn.readTimeout = 8000
    conn.requestMethod = "POST"
    conn.doOutput = true
    conn.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"")
    conn.setRequestProperty("Content-Length", body.toByteArray(Charsets.UTF_8).size.toString())
    conn.setRequestProperty("Connection", "close")
    conn.setRequestProperty("SOAPAction", "\"urn:schemas-upnp-org:service:AVTransport:1#$action\"")
    val os: OutputStream = conn.outputStream
    os.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    os.flush()
    val code = conn.responseCode
    val stream = try { conn.inputStream } catch (_: Exception) { conn.errorStream }
    val text = stream?.use { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText() } ?: ""
    lastSoapResponseBody = text
    conn.disconnect()
    return code
  }

  private fun extractFirst(xml: String, tag: String): String? {
    val pattern = Pattern.compile("<$tag>(.*?)</$tag>", Pattern.DOTALL)
    val m = pattern.matcher(xml)
    return if (m.find()) m.group(1).trim() else null
  }

  private fun parseHms(s: String): Long {
    val parts = s.trim().split(":")
    return try {
      when (parts.size) {
        3 -> parts[0].toLong() * 3600 + parts[1].toLong() * 60 + parts[2].toLong()
        2 -> parts[0].toLong() * 60 + parts[1].toLong()
        1 -> parts[0].toLong()
        else -> 0
      }
    } catch (_: Exception) { 0 }
  }

  private fun escapeXml(s: String): String =
    s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

  private fun acquireMulticastLock(): WifiManager.MulticastLock {
    val tag = "upnp:multicast"
    val cached = multicastLocks[tag]
    if (cached != null && cached.isHeld) return cached
    val wm = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val lock = wm.createMulticastLock(tag)
    lock.setReferenceCounted(false)
    lock.acquire()
    multicastLocks[tag] = lock
    return lock
  }

  private fun releaseMulticastLock(lock: WifiManager.MulticastLock) {
    try {
      if (lock.isHeld) lock.release()
    } catch (_: Exception) {}
    multicastLocks.entries.removeAll { it.value === lock }
  }
}