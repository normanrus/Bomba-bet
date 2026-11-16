package com.bombabet.app

import java.io.BufferedOutputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

/**
 * A minimal real HTTP/1.1 server on a loopback port, built on plain sockets so
 * it is available to the Android unit-test compile classpath.
 *
 * Tests exercise the actual OkHttp / Retrofit / kotlinx-serialization stack
 * against this server; nothing in the code under test is stubbed.
 */
class TestHttpServer {

    data class Recorded(val method: String, val path: String, val body: String, val auth: String?)

    data class Response(val status: Int, val json: String)

    private val server = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    private val pool = Executors.newCachedThreadPool { r -> Thread(r, "test-http").apply { isDaemon = true } }
    private val handlers = HashMap<String, (Recorded) -> Response>()

    val recorded = CopyOnWriteArrayList<Recorded>()

    fun on(method: String, path: String, handler: (Recorded) -> Response) {
        handlers["$method $path"] = handler
    }

    /** Convenience for handlers that ignore the request. */
    fun on(method: String, path: String, status: Int, json: String) {
        on(method, path) { Response(status, json) }
    }

    fun start(): String {
        pool.submit {
            while (!server.isClosed) {
                val socket = try {
                    server.accept()
                } catch (_: Exception) {
                    return@submit
                }
                pool.submit { serve(socket) }
            }
        }
        return "http://127.0.0.1:${server.localPort}"
    }

    fun stop() {
        runCatching { server.close() }
        pool.shutdownNow()
    }

    private fun serve(socket: Socket) {
        socket.use {
            it.soTimeout = 5000
            val input = it.getInputStream()
            val request = readRequest(input) ?: return
            recorded += request

            val handler = handlers["${request.method} ${request.path}"]
            val response = if (handler == null) {
                Response(
                    404,
                    """{"error":{"code":"not_found","message":"нет обработчика ${request.method} ${request.path}"}}""",
                )
            } else {
                runCatching { handler(request) }.getOrElse { err ->
                    Response(500, """{"error":{"code":"test_error","message":"${err.message}"}}""")
                }
            }
            writeResponse(it, response)
        }
    }

    private fun readRequest(input: InputStream): Recorded? {
        val head = readHead(input) ?: return null
        val lines = head.split("\r\n")
        if (lines.isEmpty()) return null
        val parts = lines[0].split(" ")
        if (parts.size < 2) return null

        var contentLength = 0
        var auth: String? = null
        for (line in lines.drop(1)) {
            val idx = line.indexOf(':')
            if (idx <= 0) continue
            val name = line.substring(0, idx).trim().lowercase()
            val value = line.substring(idx + 1).trim()
            when (name) {
                "content-length" -> contentLength = value.toIntOrNull() ?: 0
                "authorization" -> auth = value
            }
        }

        val body = if (contentLength > 0) {
            val buf = ByteArray(contentLength)
            var read = 0
            while (read < contentLength) {
                val n = input.read(buf, read, contentLength - read)
                if (n < 0) break
                read += n
            }
            String(buf, 0, read, StandardCharsets.UTF_8)
        } else ""

        return Recorded(parts[0], parts[1].substringBefore('?'), body, auth)
    }

    private fun readHead(input: InputStream): String? {
        val buffer = StringBuilder()
        var last4 = 0
        while (true) {
            val b = input.read()
            if (b < 0) return if (buffer.isEmpty()) null else buffer.toString()
            buffer.append(b.toChar())
            last4 = (last4 shl 8) or b
            if (last4 == 0x0D0A0D0A) return buffer.toString().removeSuffix("\r\n\r\n")
        }
    }

    private fun writeResponse(socket: Socket, response: Response) {
        val body = response.json.toByteArray(StandardCharsets.UTF_8)
        val out = BufferedOutputStream(socket.getOutputStream())
        val head = buildString {
            append("HTTP/1.1 ${response.status} ${statusText(response.status)}\r\n")
            append("Content-Type: application/json; charset=utf-8\r\n")
            append("Content-Length: ${body.size}\r\n")
            append("Connection: close\r\n")
            append("\r\n")
        }
        out.write(head.toByteArray(StandardCharsets.UTF_8))
        out.write(body)
        out.flush()
    }

    private fun statusText(status: Int) = when (status) {
        200 -> "OK"
        201 -> "Created"
        400 -> "Bad Request"
        401 -> "Unauthorized"
        403 -> "Forbidden"
        404 -> "Not Found"
        409 -> "Conflict"
        429 -> "Too Many Requests"
        500 -> "Internal Server Error"
        else -> "Status"
    }

    companion object {
        /** Loads a JSON fixture from `src/test/resources`. */
        fun fixture(name: String): String =
            TestHttpServer::class.java.classLoader!!.getResourceAsStream(name)!!
                .readBytes().toString(StandardCharsets.UTF_8)
    }
}
