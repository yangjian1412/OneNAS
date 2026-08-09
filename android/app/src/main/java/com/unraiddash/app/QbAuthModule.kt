package com.unraiddash.app

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * qBittorrent 鉴权模块。
 *
 * 背景：React Native Android 的 XMLHttpRequest / fetch 都不会把 Set-Cookie 头暴露给 JS 层
 * （与浏览器安全模型一致：JS 不能读 Set-Cookie，只能由 cookie jar 自动处理）。但 RN 没有内置
 * cookie jar，所以登录 qB 时 extractSid(headers) 永远拿到 null，表现为 "no SID cookie"。
 *
 * 解决：用 OkHttp 直接发请求，**把全部响应头（含 Set-Cookie）原封不动回给 JS**，
 * 由 JS 端 extractSid 取出 SID 并缓存，后续请求用 Cookie 头带回去。
 * 整个过程不依赖 RN 的 XHR/fetch，也不需要 cookie jar。
 */
class QbAuthModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "QbAuthModule"

  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(15, TimeUnit.SECONDS)
      .writeTimeout(15, TimeUnit.SECONDS)
      .followRedirects(true)
      .followSslRedirects(true)
      .retryOnConnectionFailure(true)
      .build()
  }

  @ReactMethod
  fun request(
    url: String,
    method: String,
    headers: ReadableMap?,
    body: String?,
    promise: Promise,
  ) {
    try {
      val rb = Request.Builder().url(url)
      val headerMap = headers?.toHashMap() ?: HashMap<String, Any>()
      for ((k, v) in headerMap) {
        try {
          rb.addHeader(k, v.toString())
        } catch (_: Exception) { /* skip invalid header name */ }
      }

      val methodUpper = method.uppercase()
      val rb2: Request.Builder = when {
        body != null && methodUpper in arrayOf("POST", "PUT", "PATCH") -> {
          val mediaType = (headerMap["Content-Type"]?.toString() ?: "application/x-www-form-urlencoded").toMediaType()
          rb.method(methodUpper, body.toRequestBody(mediaType))
        }
        methodUpper == "POST" || methodUpper == "PUT" || methodUpper == "PATCH" -> {
          rb.method(methodUpper, "".toRequestBody("application/octet-stream".toMediaType()))
        }
        else -> rb.method(methodUpper, null)
      }

      client.newCall(rb2.build()).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
          promise.reject("QB_NET", e.message ?: "network error", e)
        }

        override fun onResponse(call: Call, response: Response) {
          try {
            val respHeaders = Arguments.createMap()
            // 把全部响应头都返回（含 Set-Cookie），用小写 key 方便 JS 端按 set-cookie 取
            for (name in response.headers.names()) {
              respHeaders.putString(name.lowercase(), response.header(name) ?: "")
            }
            val respBody = response.body?.string() ?: ""
            val result = Arguments.createMap()
            result.putInt("status", response.code)
            result.putString("body", respBody)
            result.putMap("headers", respHeaders)
            result.putBoolean("ok", response.code in 200..299)
            promise.resolve(result)
          } catch (e: Exception) {
            promise.reject("QB_RESP", e.message ?: "response parse error", e)
          }
        }
      })
    } catch (e: Exception) {
      promise.reject("QB_REQ", e.message ?: "request build error", e)
    }
  }
}