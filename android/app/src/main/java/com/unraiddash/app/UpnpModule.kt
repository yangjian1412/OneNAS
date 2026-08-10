package com.unraiddash.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.util.Log
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
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.Socket
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

  // NativeEventEmitter 需要这两个方法才能注册事件监听（bridgeless 下缺了会导致
  // JS 侧 new NativeEventEmitter(UpnpModule).addListener 静默失败，列表收不到流式事件）
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  companion object {
    private const val TAG = "UpnpModule"
  }

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

    // 顶层标签（deviceType / friendlyName / manufacturer / modelName / UDN / URLBase）
    firstTag(xml, "deviceType").takeIf { it.isNotEmpty() }?.let { result.putString("deviceType", it) }
    firstTag(xml, "friendlyName").takeIf { it.isNotEmpty() }?.let { result.putString("friendlyName", it) }
    firstTag(xml, "manufacturer").takeIf { it.isNotEmpty() }?.let { result.putString("manufacturer", it) }
    firstTag(xml, "modelName").takeIf { it.isNotEmpty() }?.let { result.putString("modelName", it) }
    firstTag(xml, "UDN").takeIf { it.isNotEmpty() }?.let { result.putString("udn", it) }
    val urlBaseRaw = firstTag(xml, "URLBase")
    val urlBase = urlBaseRaw.ifEmpty { locationUrl }
    result.putString("URLBase", urlBase)

    // 在每个 <service>...</service> 块里找 AVTransport 的 controlURL。
    // 用 (\s[^>]*)? 限定 service 后面只能接空白+属性，避免误匹配 <serviceList>、<serviceType>。
    val avControlUrls = Arguments.createArray()
    val serviceRe = Regex("<service(\\s[^>]*)?>(.*?)</service>", RegexOption.DOT_MATCHES_ALL)
    val controlRe = Regex("<controlURL(\\s[^>]*)?>(.*?)</controlURL>", RegexOption.DOT_MATCHES_ALL)
    serviceRe.findAll(xml).forEach { svcMatch ->
      val svc = svcMatch.groupValues[2]
      if (svc.contains("AVTransport")) {
        controlRe.find(svc)?.groupValues?.get(2)?.trim()?.takeIf { it.isNotEmpty() }?.let {
          avControlUrls.pushString(it)
        }
      }
    }

    val absControlUrls = Arguments.createArray()
    for (i in 0 until avControlUrls.size()) {
      val raw = avControlUrls.getString(i) ?: continue
      absControlUrls.pushString(joinUrl(urlBase, locationUrl, raw))
    }
    result.putArray("avTransportControlUrls", avControlUrls)
    result.putArray("avTransportControlUrlsAbsolute", absControlUrls)
    return result
  }

  /** 取第一个匹配标签的内部文本。DLNA description 结构固定，正则足够稳。 */
  private fun firstTag(xml: String, tag: String): String {
    val m = Regex("<$tag(\\s[^>]*)?>(.*?)</$tag>", RegexOption.DOT_MATCHES_ALL).find(xml)
    return m?.groupValues?.get(2)?.trim().orEmpty()
  }

  private fun joinUrl(urlBase: String?, locationUrl: String, rel: String): String {
    if (rel.startsWith("http://") || rel.startsWith("https://")) return rel
    // 无论 urlBase 还是 location 里都可能是完整文件路径（如 /MediaRenderer.xml），
    // controlURL 是相对 host 根的路径，必须取 scheme://host:port 作为 base，
    // 否则拼出 ".../MediaRenderer.xml/upnp/control/AVTransport" 必然 404。
    val baseStr = if (!urlBase.isNullOrBlank()) urlBase else locationUrl
    val u = try { URL(baseStr) } catch (_: Exception) { URL(locationUrl) }
    val portPart = if (u.port != -1) ":${u.port}" else ""
    val origin = "${u.protocol}://${u.host}$portPart"
    return if (rel.startsWith("/")) origin + rel else "$origin/$rel"
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
      // 关键：如果电视正在播放其他内容（Huey 等严格 DMR 不允许打断），
      // SetAV 会一直 402。先检查状态，PLAYING/PAUSED/TRANSITIONING 时先 Stop。
      try {
        val state = getTransportState(controlUrl)
        Log.d(TAG, "setAVTransportURI: pre-check TransportState=$state")
        if (state != null && state != "STOPPED" && state != "NO_MEDIA_PRESENT") {
          Log.d(TAG, "setAVTransportURI: state=$state, sending Stop first")
          stopSync(controlUrl)
          // 短暂等 Huey 处理 Stop（SOAP Stop 200 但内部状态切换需时）
          Thread.sleep(300)
        }
      } catch (e: Exception) {
        Log.w(TAG, "setAVTransportURI: pre-check Stop failed: ${e.message}")
      }
      soapCall(controlUrl, body, "SetAVTransportURI", promise)
    }
  }

  /** 同步 GetTransportInfo，返回 CurrentTransportState 字符串。失败返回 null。 */
  private fun getTransportState(controlUrl: String): String? {
    val body = (
      "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
      "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
      "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
      "<s:Body>" +
      "<u:GetTransportInfo xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
      "<InstanceID>0</InstanceID>" +
      "</u:GetTransportInfo>" +
      "</s:Body></s:Envelope>"
    )
    return try {
      val code = soapPost(controlUrl, body, "GetTransportInfo")
      if (code in 200..299) {
        val xml = lastSoapResponseBody
        val m = Regex("<CurrentTransportState>([^<]+)</CurrentTransportState>").find(xml ?: "")
        m?.groupValues?.get(1)
      } else null
    } catch (_: Exception) { null }
  }

  /** 同步 Stop。失败不抛异常。 */
  private fun stopSync(controlUrl: String) {
    val body = (
      "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
      "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
      "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
      "<s:Body>" +
      "<u:Stop xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
      "<InstanceID>0</InstanceID>" +
      "</u:Stop>" +
      "</s:Body></s:Envelope>"
    )
    try { soapPost(controlUrl, body, "Stop") } catch (_: Exception) {}
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
   *
   * 兼容性 / 健壮性：
   * - setReuseAddress(true)：与 Samsung SmartThings / 系统 SSDP 守护共存
   * - 多 ST 同时搜：ssdp:all + MediaRenderer:1 + upnp:rootdevice
   * - 响应 ST 放宽：除 MediaRenderer/AVTransport 外，upnp:rootdevice 也先收下，
   *   最终是不是 renderer 由拉完 description 看 deviceType 决定
   * - M-SEARCH 发 2 次（t=0、t=half），抗丢包
   * - 同时接收 NOTIFY（被动发现，TV 每 30~60s 主动广播 ssdp:alive）
   * - 拉 description 失败原因全打日志（cleartext / 超时 / HTTP code）
   */
  @ReactMethod
  fun discoverRenderers(timeoutMs: Double, promise: Promise) {
    executor.execute {
      val renderers = Arguments.createArray()
      // 流式 fetch：SSDP 收到新 location 立即异步拉 description + emit，
      // 不再"等 5s 收完包再批量 fetch"——那样即使事件机制通了，UI 也只能等满 5s。
      // renderersList 线程安全：fetch 任务在 pool 线程跑 emit+add，最后主线程统一 push。
      val renderersList = java.util.Collections.synchronizedList(mutableListOf<WritableMap>())
      val submittedLocations = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
      val pool = Executors.newFixedThreadPool(Math.max(2, Runtime.getRuntime().availableProcessors() - 1))
      val counters = java.util.concurrent.atomic.AtomicIntegerArray(3) // ok, skip, noRenderer
      var lock: WifiManager.MulticastLock? = null
      var mcastSock: MulticastSocket? = null
      var probeSock: DatagramSocket? = null
      try {
        // 1. SSDP 发现（多通道，最大化兼容各种设备）
        lock = acquireMulticastLock()
        val ni = pickMulticastInterface()
        Log.d(TAG, "discoverRenderers: start timeoutMs=$timeoutMs iface=${ni?.name ?: "<none>"}")
        val group = InetAddress.getByName("239.255.255.250")
        val groupEp = InetSocketAddress(group, 1900)
        val searchTargets = listOf(
          "ssdp:all",
          "urn:schemas-upnp-org:device:MediaRenderer:1",
          "upnp:rootdevice",
        )

        // Socket A：绑定源端口 1900 + 加入组播组，收 NOTIFY alive 与组播应答
        mcastSock = MulticastSocket(1900)
        try { mcastSock.setReuseAddress(true) } catch (_: Exception) {}
        mcastSock.soTimeout = 300
        mcastSock.timeToLive = 4
        try { mcastSock.broadcast = true } catch (_: Exception) {}
        try { mcastSock.receiveBufferSize = 1 shl 20 } catch (_: Exception) {} // 1MB，防响应风暴丢包
        if (ni != null) {
          try { mcastSock.networkInterface = ni } catch (_: Exception) {}
          try { mcastSock.joinGroup(groupEp, ni) } catch (_: Exception) {
            try { mcastSock.joinGroup(group) } catch (_: Exception) {}
          }
        } else {
          try { mcastSock.joinGroup(group) } catch (_: Exception) {}
        }

        // Socket B：临时源端口。部分设备的 SSDP 栈忽略/拒绝"源端口=1900"的请求，
        // 只回临时源端口的 M-SEARCH；这里同时也做广播 + 全子网单播扫描。
        probeSock = DatagramSocket()
        probeSock.soTimeout = 300
        try { probeSock.reuseAddress = true } catch (_: Exception) {}
        try { probeSock.broadcast = true } catch (_: Exception) {}
        try { probeSock.receiveBufferSize = 1 shl 20 } catch (_: Exception) {} // 1MB

        val locationMap = LinkedHashMap<String, WritableMap>()
        var rawResponses = 0
        var matchedResponses = 0

        // 真正做 HTTP GET + 解析 + emit 的逻辑。pool 线程里跑。
        fun fetchAndEmit(location: String) {
          Log.d(TAG, ">> fetch $location")
          try {
            val conn = URL(location).openConnection() as HttpURLConnection
            conn.connectTimeout = 6000
            conn.readTimeout = 6000
            conn.requestMethod = "GET"
            conn.setRequestProperty("User-Agent", "OneNAS/1.0 UPnP/1.0")
            val code = conn.responseCode
            val xml = conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
            conn.disconnect()
            val xmlHead = xml.take(80).replace("\n", "\\n").replace("\r", "\\r")
            Log.d(TAG, "   HTTP $code xmlLen=${xml.length} head=$xmlHead")
            if (code !in 200..299) {
              counters.incrementAndGet(1)
              return
            }
            val deviceType = firstTag(xml, "deviceType")
            val friendlyName = firstTag(xml, "friendlyName")
            val manufacturer = firstTag(xml, "manufacturer")
            val modelName = firstTag(xml, "modelName")
            val udn = firstTag(xml, "UDN")
            val urlBaseRaw = firstTag(xml, "URLBase")
            val urlBase = urlBaseRaw.ifEmpty { location }
            val serviceRe = Regex("<service(\\s[^>]*)?>(.*?)</service>", RegexOption.DOT_MATCHES_ALL)
            val services = serviceRe.findAll(xml).toList()
            Log.d(TAG, "   parse: deviceType=$deviceType urlBase=$urlBase services=${services.size}")
            val avCtrl = mutableListOf<String>()
            for (m in services) {
              val svc = m.groupValues[2]
              if (svc.contains("AVTransport")) {
                Regex("<controlURL(\\s[^>]*)?>(.*?)</controlURL>", RegexOption.DOT_MATCHES_ALL)
                  .find(svc)?.groupValues?.get(2)?.trim()?.takeIf { it.isNotEmpty() }?.let { avCtrl.add(it) }
              }
            }
            Log.d(TAG, "   avCtrl=$avCtrl")
            if (!deviceType.contains("MediaRenderer")) {
              counters.incrementAndGet(2)
              Log.d(TAG, "   skip: not MediaRenderer")
              return
            }
            if (avCtrl.isEmpty()) {
              counters.incrementAndGet(1)
              Log.w(TAG, "   skip: no AVTransport controlURL")
              return
            }
            if (!avCtrl[0].startsWith("/") || avCtrl[0].contains("_urn") || avCtrl[0].contains("urn:")) {
              counters.incrementAndGet(1)
              Log.w(TAG, "   skip: placeholder controlURL $avCtrl")
              return
            }
            val controlUrl = joinUrl(urlBase, location, avCtrl[0])
            // emit 流式事件（让 JS 立刻显示这个设备）
            emitRenderer(buildRendererMap(location, friendlyName, manufacturer, modelName, udn, controlUrl))
            // 同时放进线程安全的 list，最后主线程批量 push 进 renderers 兜底数组
            renderersList.add(buildRendererMap(location, friendlyName, manufacturer, modelName, udn, controlUrl))
            counters.incrementAndGet(0)
            Log.d(TAG, "   + renderer $friendlyName ($location)")
          } catch (e: Exception) {
            counters.incrementAndGet(1)
            Log.w(TAG, "   FAIL: ${e.javaClass.simpleName} ${e.message}")
          }
        }

        // 收到新 location 立即异步拉 description + emit（真正的流式）。
        // 同 location 不重复提交。
        fun submitFetch(location: String) {
          if (!submittedLocations.add(location)) return
          pool.submit { fetchAndEmit(location) }
        }

        fun handlePacket(rawText: String, from: String) {
          rawResponses++
          val firstLine = rawText.lineSequence().firstOrNull() ?: ""
          val isNotify = firstLine.startsWith("NOTIFY")
          val headers = parseHttpHeaders(rawText)
          val st = headers["ST"] ?: headers["Nt"] ?: ""
          val nts = headers["NTS"] ?: ""
          val location = headers["LOCATION"] ?: headers["Location"]
          val usn = headers["USN"] ?: headers["Usn"] ?: ""
          Log.d(TAG, "  pkt from=$from st=$st loc=${location ?: "-"} ${if (isNotify) "NOTIFY($nts)" else "MSEARCH"}")
          if (isNotify && !nts.contains("ssdp:alive", ignoreCase = true)) return
          if (location == null || !location.startsWith("http")) {
            Log.d(TAG, "? ${if (isNotify) "NOTIFY" else "M-SEARCH"} from=$from st=$st (no http LOCATION)")
            return
          }
          // 只要局域网内的 description，过滤公网垃圾（如路由器 LinkEase 外网地址）
          if (!isLocalUrl(location)) {
            Log.d(TAG, "! from=$from st=$st loc=$location (non-local, skip)")
            return
          }
          // 不再按 ST 白名单过滤：任何带 http LOCATION 的响应都收下，
          // 是不是 renderer 由拉取 description 后的 deviceType 决定。
          // 很多电视/投影的原生端点 ST 是厂商自定义值，白名单会静默漏掉。
          val udn = usn.substringBefore("::")
          val key = "$location|$udn"
          val isDeviceLevel = st.contains("upnp:rootdevice", ignoreCase = true) ||
                              st.contains("device:MediaRenderer", ignoreCase = true)
          val existing = locationMap[key]
          if (existing == null) {
            matchedResponses++
            val entry = Arguments.createMap()
            entry.putString("location", location)
            entry.putString("st", st)
            entry.putString("usn", usn)
            entry.putString("udn", udn)
            entry.putString("via", if (isNotify) "notify" else "msearch")
            entry.putString("from", from)
            entry.putBoolean("deviceLevel", isDeviceLevel)
            locationMap[key] = entry
            Log.d(TAG, "+ renderer via=${if (isNotify) "NOTIFY" else "M-SEARCH"} from=$from st=$st loc=$location deviceLevel=$isDeviceLevel")
            // 立即流式 fetch（不等 5s 收完包）
            submitFetch(location)
          } else if (isDeviceLevel && !existing.getBoolean("deviceLevel")) {
            existing.putString("st", st)
            existing.putString("usn", usn)
            existing.putString("via", if (isNotify) "notify" else "msearch")
            existing.putString("from", from)
            existing.putBoolean("deviceLevel", true)
            Log.d(TAG, "* upgrade to device-level from=$from st=$st loc=$location")
          } else {
            Log.d(TAG, "= dup from=$from st=$st loc=$location")
          }
        }

        fun sendMulticastRound() {
          for (st in searchTargets) {
            sendMSearch(mcastSock!!, group, st) // 源端口 1900 组播
            sendMSearch(probeSock!!, group, st) // 临时源端口组播
          }
          // 广播（255.255.255.255 + 子网广播），只发 ssdp:all
          // probeSock 已 setBroadcast(true)，可命中"不回组播、只回广播"的设备
          val msg = msearchBytes("ssdp:all")
          val bcast = listOfNotNull(
            runCatching { InetAddress.getByName("255.255.255.255") }.getOrNull(),
            ni?.let { runCatching {
              val v4 = it.inetAddresses.toList().firstOrNull { a -> a.address.size == 4 && !a.isLoopbackAddress }
              v4?.address?.let { b -> InetAddress.getByAddress(byteArrayOf(b[0], b[1], b[2], 255.toByte())) }
            }.getOrNull() },
          )
          for (t in bcast) {
            try { probeSock!!.send(DatagramPacket(msg, msg.size, t, 1900)) } catch (_: Exception) {}
          }
        }

        // 全子网单播扫描放后台线程：逐 IP 发 M-SEARCH，不阻塞主发现循环的接收。
        // 直接发 254 个包会因 ARP 解析阻塞秒级，导致期间组播响应挤爆小缓冲区被丢。
        val unicastThread = Thread {
          val targets = buildProbeTargets(ni) // 含 255.255.255.255 + 子网广播 + .1-.254
          val msg = msearchBytes("ssdp:all")
          var sent = 0
          for (t in targets) {
            if (t.isLoopbackAddress) continue
            try {
              probeSock!!.send(DatagramPacket(msg, msg.size, t, 1900))
              sent++
            } catch (_: Exception) {}
          }
          Log.d(TAG, "unicast scan sent $sent probes")
        }
        unicastThread.isDaemon = true
        unicastThread.start()

        val deadline = System.currentTimeMillis() + timeoutMs.toLong()
        val halfMs = (timeoutMs.toLong() / 2).coerceAtLeast(1500L)
        sendMulticastRound()
        var nextResendAt = System.currentTimeMillis() + halfMs
        while (System.currentTimeMillis() < deadline) {
          if (System.currentTimeMillis() >= nextResendAt) {
            sendMulticastRound()
            nextResendAt = deadline + 1
          }
          try {
            val buf = ByteArray(8192)
            val pkt = DatagramPacket(buf, buf.size)
            mcastSock!!.receive(pkt)
            handlePacket(String(buf, 0, pkt.length, Charsets.UTF_8), pkt.address?.hostAddress ?: "?")
          } catch (_: java.net.SocketTimeoutException) {
          }
          try {
            val buf = ByteArray(8192)
            val pkt = DatagramPacket(buf, buf.size)
            probeSock!!.receive(pkt)
            handlePacket(String(buf, 0, pkt.length, Charsets.UTF_8), pkt.address?.hostAddress ?: "?")
          } catch (_: java.net.SocketTimeoutException) {
          }
        }
        Log.d(TAG, "SSDP done: raw=$rawResponses matched=$matchedResponses unique=${locationMap.size}")
        locationMap.forEach { (k, e) ->
          Log.d(TAG, "  map[$k] loc=${e.getString("location")} udn=${e.getString("udn")} st=${e.getString("st")} devLvl=${e.getBoolean("deviceLevel")}")
        }
        try { mcastSock?.close() } catch (_: Exception) {}
        try { probeSock?.close() } catch (_: Exception) {}

// 2. 端口扫描兜底：Sony 等电视 DLNA server 在跑但不响应 SSDP M-SEARCH
        //    （组播/广播/单播全不答）。对 SSDP 已发现的 host 额外 TCP 探测常见
        //    DLNA 端口，抓到 MediaRenderer 描述就立即流式 fetch。
        val hosts = LinkedHashSet<String>()
        for (e in locationMap.values) {
          val loc = e.getString("location") ?: continue
          val h = runCatching { URL(loc).host }.getOrNull()
          if (!h.isNullOrEmpty()) hosts.add(h)
        }
        portScanAndMerge(hosts.toList(), { submittedLocations.contains(it) }, { submitFetch(it) })

        // 3. 等 pool 中所有 fetch 任务结束（SSDP 期间已流式 emit 设备）。
        //    端口扫描的 fetch 也已通过 submitFetch 进入 pool，一起等。
        //    给最多 8s 兜底，避免个别卡死的 fetch 永远挂着。
        pool.shutdown()
        try { pool.awaitTermination(8, java.util.concurrent.TimeUnit.SECONDS) } catch (_: Exception) {}

        // 4. 把 renderersList 同步复制到 renderers 数组（JS promise.resolve 兜底用）
        synchronized(renderersList) {
          for (m in renderersList) renderers.pushMap(m)
        }
        Log.d(TAG, "renderers: ${counters.get(0)} ok, ${counters.get(1)} skipped, ${counters.get(2)} skipped(not MediaRenderer) [streamed]")
        // 通知 JS 全部结束
        emitDone()
        promise.resolve(renderers)
      } catch (e: Exception) {
        val msg = e.message ?: "discovery failed"
        Log.w(TAG, "discoverRenderers error: $msg", e)
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

  private fun msearchBytes(st: String): ByteArray = (
    "M-SEARCH * HTTP/1.1\r\n" +
    "HOST: 239.255.255.250:1900\r\n" +
    "MAN: \"ssdp:discover\"\r\n" +
    "MX: 2\r\n" +
    "ST: $st\r\n\r\n"
  ).toByteArray()

  private fun sendMSearch(socket: DatagramSocket, group: InetAddress, st: String) {
    try {
      val msg = msearchBytes(st)
      socket.send(DatagramPacket(msg, msg.size, group, 1900))
      Log.d(TAG, "M-SEARCH sent (ST=$st)")
    } catch (e: Exception) {
      Log.w(TAG, "M-SEARCH send failed (ST=$st): ${e.javaClass.simpleName} ${e.message}")
    }
  }

  /**
   * 组播地址 + 广播地址 + 本子网全部主机（/24 单播扫描）。
   * 单播 M-SEARCH 能发现"只应答单播、不参加组播"的电视/投影。
   */
  private fun buildProbeTargets(ni: NetworkInterface?): List<InetAddress> {
    val list = mutableListOf<InetAddress>()
    try { list.add(InetAddress.getByName("255.255.255.255")) } catch (_: Exception) {}
    if (ni == null) return list
    val v4 = try {
      ni.inetAddresses.toList().firstOrNull { it.address.size == 4 && !it.isLoopbackAddress }
    } catch (_: Exception) {
      null
    } ?: return list
    val b = v4.address
    try { list.add(InetAddress.getByAddress(byteArrayOf(b[0], b[1], b[2], 255.toByte()))) } catch (_: Exception) {}
    for (i in 1..254) {
      try { list.add(InetAddress.getByAddress(byteArrayOf(b[0], b[1], b[2], i.toByte()))) } catch (_: Exception) {}
    }
    return list
  }

  /**
   * 端口扫描兜底：部分电视（如 Sony 52323）的 DLNA server 活着但拒绝响应 SSDP M-SEARCH。
   * 对 SSDP 已发现的 host，额外探测常见 DLNA 端口 + 常见 device description 路径，
   * 抓到 MediaRenderer 描述就回调 onFound(location)，让调用方决定如何处理（流式 fetch）。
   */
  private fun portScanAndMerge(
    hosts: List<String>,
    isAlreadyKnown: (String) -> Boolean,
    onFound: (String) -> Unit,
  ) {
    if (hosts.isEmpty()) {
      Log.d(TAG, "port-scan: no hosts to probe")
      return
    }
    val dlnaPorts = intArrayOf(52323, 8008, 36667, 5001, 9000, 8060, 1400, 8191, 49152, 8080)
    val descPaths = arrayOf("/MediaRenderer.xml", "/description.xml", "/rootDesc.xml", "/device.xml")
    Log.d(TAG, "port-scan hosts=$hosts ports=${dlnaPorts.toList()}")
    val scanPool = Executors.newFixedThreadPool(Math.min(8, hosts.size * dlnaPorts.size))
    val futures = mutableListOf<java.util.concurrent.Future<*>>()
    for (host in hosts) {
      for (port in dlnaPorts) {
        futures.add(scanPool.submit {
          if (!tcpOpen(host, port)) return@submit
          Log.d(TAG, "  port-scan $host:$port OPEN")
          for (p in descPaths) {
            val loc = "http://$host:$port$p"
            if (isAlreadyKnown(loc)) continue
            try {
              val conn = URL(loc).openConnection() as HttpURLConnection
              conn.connectTimeout = 3000
              conn.readTimeout = 3000
              conn.requestMethod = "GET"
              conn.setRequestProperty("User-Agent", "OneNAS/1.0 UPnP/1.0")
              val code = conn.responseCode
              val xml = conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
              conn.disconnect()
              if (code !in 200..299) continue
              val deviceType = firstTag(xml, "deviceType")
              if (!deviceType.contains("MediaRenderer")) continue
              Log.d(TAG, "+ renderer via=PORT-SCAN from=$host loc=$loc")
              onFound(loc)
              break // 一个端口找到 renderer 即可
            } catch (_: Exception) {
            }
          }
        })
      }
    }
    futures.forEach { it.get() }
    scanPool.shutdown()
  }

  private fun tcpOpen(host: String, port: Int): Boolean {
    return try {
      Socket().use { s -> s.connect(InetSocketAddress(host, port), 500); true }
    } catch (_: Exception) {
      false
    }
  }

  /** 只接受局域网/内网地址的 description URL，过滤路由器广播出来的公网 LinkEase 之类。 */
  private fun isLocalUrl(location: String): Boolean {
    return try {
      val u = URL(location)
      val host = u.host
      if (host.isBlank()) return false
      val parts = host.split(".")
      if (parts.size != 4 || parts.any { it.toIntOrNull() == null }) return true // 主机名放行
      val a = parts[0].toInt()
      val b = parts[1].toInt()
      a == 127 || a == 10 || (a == 172 && b in 16..31) || a == 192
    } catch (_: Exception) {
      false
    }
  }

  /**
   * 取一个能发组播的接口：
   * 1) 优先取 ConnectivityManager.activeNetwork 对应的接口（最可靠：当前活跃链路）
   * 2) 没有活跃网络时退回启发式：wlan* > eth* > 任意可用
   * Android 上发组播必须显式绑定接口，否则 sendto 会 EPERM。
   */
  private fun pickMulticastInterface(): NetworkInterface? {
    val activeIf = pickActiveNetworkInterface()
    if (activeIf != null) {
      Log.d(TAG, "pickMulticastInterface: active network → ${activeIf.name}")
      return activeIf
    }
    val all = try {
      NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
    } catch (_: Exception) {
      emptyList()
    }
    val picked = all.firstOrNull { ni ->
        isUsableMulticastIf(ni) && ni.name?.startsWith("wlan") == true
      } ?: all.firstOrNull { ni ->
        isUsableMulticastIf(ni) && ni.name?.startsWith("eth") == true
      } ?: all.firstOrNull { isUsableMulticastIf(it) }
    Log.d(TAG, "pickMulticastInterface: fallback → ${picked?.name ?: "<none>"}")
    return picked
  }

  /**
   * 从 ConnectivityManager 拿当前活跃网络（WiFi 或以太网），再解析它绑定的 NetworkInterface。
   * 这是"我现在能不能发组播"的最权威依据。
   */
  private fun pickActiveNetworkInterface(): NetworkInterface? {
    return try {
      val cm = reactContext.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val activeNet: Network? = cm.activeNetwork
      if (activeNet == null) {
        Log.d(TAG, "pickActiveNetworkInterface: no active network")
        return null
      }
      val caps = cm.getNetworkCapabilities(activeNet)
      val hasInternet = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
      val isWifi = caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
      val isEth = caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true
      Log.d(TAG, "pickActiveNetworkInterface: net=$activeNet internet=$hasInternet wifi=$isWifi eth=$isEth")
      val lp: LinkProperties? = cm.getLinkProperties(activeNet)
      val ifName = lp?.interfaceName ?: return null
      val ni = NetworkInterface.getByName(ifName)
      if (ni == null) {
        Log.w(TAG, "pickActiveNetworkInterface: NI '$ifName' not found")
        return null
      }
      if (!isUsableMulticastIf(ni)) {
        Log.w(TAG, "pickActiveNetworkInterface: '$ifName' not usable (down/no multicast/no v4)")
        return null
      }
      ni
    } catch (e: Exception) {
      Log.w(TAG, "pickActiveNetworkInterface error: ${e.message}")
      null
    }
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
    // 关键 headers（来自 WMP 抓包对比）：Cache-Control/Pragma no-cache、Connection 大写 Close、
    // Microsoft-DLNA User-Agent、FriendlyName.DLNA.ORG 客户端标识。
    // Sony Huey Sample DMR 严格要求 FriendlyName.DLNA.ORG，否则 SetAV 返回 402。
    conn.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"")
    conn.setRequestProperty("Content-Length", body.toByteArray(Charsets.UTF_8).size.toString())
    conn.setRequestProperty("Cache-Control", "no-cache")
    conn.setRequestProperty("Pragma", "no-cache")
    conn.setRequestProperty("Connection", "Close")
    conn.setRequestProperty("User-Agent", "Microsoft-Windows/10.0 UPnP/1.0 Microsoft-DLNA DLNADOC/1.50")
    conn.setRequestProperty("FriendlyName.DLNA.ORG", "MAGI")
    conn.setRequestProperty("SOAPAction", "\"urn:schemas-upnp-org:service:AVTransport:1#$action\"")
    val os: OutputStream = conn.outputStream
    os.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    os.flush()
    val code = conn.responseCode
    val stream = try { conn.inputStream } catch (_: Exception) { conn.errorStream }
    val text = stream?.use { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText() } ?: ""
    lastSoapResponseBody = text
    // 完整 dump SOAP 请求/响应（排查 SetAV 500/402 用）
    Log.d(TAG, "--- SOAP $action ---")
    Log.d(TAG, "POST $controlUrl")
    Log.d(TAG, "  Content-Type: text/xml; charset=\"utf-8\"")
    Log.d(TAG, "  SOAPAction: \"urn:schemas-upnp-org:service:AVTransport:1#$action\"")
    Log.d(TAG, "  Body (len=${body.length}): $body")
    Log.d(TAG, "<<< HTTP $code <<<")
    Log.d(TAG, "  Body (len=${text.length}): $text")
    conn.disconnect()
    return code
  }

  private fun extractFirst(xml: String, tag: String): String? {
    val pattern = Pattern.compile("<$tag>(.*?)</$tag>", Pattern.DOTALL)
    val m = pattern.matcher(xml)
    return if (m.find()) m.group(1).trim() else null
  }

  /**
   * 深度感知的元素文本读取。XmlPullParser.nextText() 在元素有子元素时会静默吞掉
   * START_TAG 直到首个 END_TAG，对 serviceList/service/root 这种容器元素是错的。
   * 这里手动跟踪深度：START_TAG 增、END_TAG 减、TEXT 累加。
   */
  private fun readElementText(parser: XmlPullParser): String {
    if (parser.eventType != XmlPullParser.START_TAG) return ""
    val sb = StringBuilder()
    var depth = 1
    while (depth > 0) {
      val ev = parser.next()
      when (ev) {
        XmlPullParser.START_TAG -> depth++
        XmlPullParser.TEXT, XmlPullParser.CDSECT -> sb.append(parser.text ?: "")
        XmlPullParser.END_TAG -> depth--
        XmlPullParser.END_DOCUMENT -> return sb.toString()
        else -> { /* skip COMMENT / ENTITY_REF / etc. */ }
      }
    }
    return sb.toString()
  }

  private fun buildRendererMap(
    location: String,
    friendlyName: String,
    manufacturer: String,
    modelName: String,
    udn: String,
    controlUrl: String,
  ): WritableMap {
    val m = Arguments.createMap()
    m.putString("location", location)
    m.putString("friendlyName", friendlyName.ifEmpty { location })
    m.putString("manufacturer", manufacturer)
    m.putString("modelName", modelName)
    m.putString("udn", udn)
    m.putString("controlUrl", controlUrl)
    return m
  }

  /**
   * 推一个 renderer 到 JS（DeviceEventEmitter），让 CastDeviceListModal 实时显示。
   * 用 emitDeviceEvent：bridgeless 下 getJSModule(RCTDeviceEventEmitter) 可能收不到。
   */
  private fun emitRenderer(renderer: WritableMap) {
    try {
      reactContext.emitDeviceEvent("upnpRenderer", renderer)
    } catch (e: Exception) {
      Log.w(TAG, "emitRenderer FAIL: ${e.javaClass.simpleName} ${e.message}")
    }
  }

  private fun emitDone() {
    try {
      reactContext.emitDeviceEvent("upnpDone", null)
    } catch (e: Exception) {
      Log.w(TAG, "emitDone FAIL: ${e.javaClass.simpleName} ${e.message}")
    }
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
    if (cached != null && cached.isHeld) {
      Log.d(TAG, "acquireMulticastLock: reuse held=$tag")
      return cached
    }
    val wm = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val lock = wm.createMulticastLock(tag)
    // 非引用计数：acquire/release 成对即可；多次并发发现共享同一把锁。
    lock.setReferenceCounted(false)
    try {
      lock.acquire()
      Log.d(TAG, "acquireMulticastLock: acquired $tag")
    } catch (e: Exception) {
      Log.w(TAG, "acquireMulticastLock failed: ${e.message}")
      throw e
    }
    multicastLocks[tag] = lock
    return lock
  }

  private fun releaseMulticastLock(lock: WifiManager.MulticastLock) {
    try {
      if (lock.isHeld) {
        lock.release()
        Log.d(TAG, "releaseMulticastLock: released")
      }
    } catch (e: Exception) {
      Log.w(TAG, "releaseMulticastLock error: ${e.message}")
    }
    multicastLocks.entries.removeAll { it.value === lock }
  }
}