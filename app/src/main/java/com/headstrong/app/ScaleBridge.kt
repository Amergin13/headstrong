package com.headstrong.app

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Bluetooth for the Renpho scale, in the Treise Android app.
 *
 * Chrome's Web Bluetooth forgets a device when the app restarts (getDevices() is still behind a
 * flag), so the app talks to the scale itself: pair once, then listen by address with no prompt.
 * It only moves bytes. The web page decides what they mean (src/services/renphoBluetooth.ts) and
 * remembers the scale (src/services/nativeScale.ts documents the messages). Readings go to the page
 * on this phone and nowhere else; nothing is stored here.
 */
@SuppressLint("MissingPermission") // Every Bluetooth call is behind hasPermission().
object ScaleBridge {
    private const val TAG = "TreiseScale"
    private const val SCAN_MS = 30_000L
    private const val OP_TIMEOUT_MS = 5_000L
    private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    /** Same names the web path offers in Chrome's device list. */
    private val SCALE_NAME = Regex("^(qn-scale|renpho|es-|es_|r-|yolanda)", RegexOption.IGNORE_CASE)
    private val SCALE_SERVICES = setOf(0xffe0, 0xfff0, 0xffb0, 0x181d, 0x181b).map { shortUuid(it) }.toSet()

    private val main = Handler(Looper.getMainLooper())
    private lateinit var context: Context
    private var send: (JSONObject) -> Unit = {}

    private var pairScan: ScanCallback? = null
    private var listenScan: ScanCallback? = null
    private var listeningId: String? = null
    private var gatt: BluetoothGatt? = null

    private class Op(val requestId: String, val start: (BluetoothGatt) -> Boolean)
    private val ops = ArrayDeque<Op>()
    private var current: Op? = null
    private val opTimeout = Runnable { finishOp(false) }

    private fun shortUuid(value: Int): UUID =
        UUID.fromString(String.format("0000%04x-0000-1000-8000-00805f9b34fb", value))

    fun init(appContext: Context, post: (JSONObject) -> Unit) {
        context = appContext.applicationContext
        send = post
    }

    /** A page load or reload: nothing on the old page is listening any more. */
    fun reset() {
        stopAll()
    }

    fun onMessage(msg: JSONObject) {
        when (msg.optString("type")) {
            "ble-status" -> sendStatus()
            "ble-request-permission" -> context.startActivity(
                Intent(context, BlePermissionActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            "ble-open-settings" -> context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            "ble-scan-start" -> startPairScan(msg.optBoolean("all"))
            "ble-scan-stop" -> stopPairScan(false)
            "ble-listen" -> listen(msg.optString("id"))
            "ble-stop" -> stopAll()
            "ble-notify" -> enqueueNotify(msg)
            "ble-write" -> enqueueWrite(msg)
        }
    }

    // ---------------------------------------------------------------- Status and permission

    private fun adapter(): BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    fun requiredPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            // Before Android 12 a Bluetooth scan requires the location permission.
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    private fun hasPermission(): Boolean = requiredPermissions().all {
        context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }

    fun sendStatus() {
        val adapter = adapter()
        val supported = adapter != null && context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
        send(
            JSONObject()
                .put("type", "ble-status")
                .put("supported", supported)
                .put("granted", hasPermission())
                .put("enabled", adapter?.isEnabled == true)
        )
    }

    // ---------------------------------------------------------------- Pairing: find nearby scales

    private fun startPairScan(showAll: Boolean) {
        stopPairScan(false)
        val scanner = adapter()?.takeIf { it.isEnabled && hasPermission() }?.bluetoothLeScanner
        if (scanner == null) {
            send(JSONObject().put("type", "ble-scan-ended").put("error", "unavailable"))
            return
        }
        val seen = HashSet<String>()
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val address = result.device.address
                val name = result.scanRecord?.deviceName ?: result.device.name
                val advertised = result.scanRecord?.serviceUuids?.map { it.uuid }.orEmpty()
                val looksLikeScale = (name != null && SCALE_NAME.containsMatchIn(name)) || advertised.any { it in SCALE_SERVICES }
                if (name.isNullOrBlank() && !looksLikeScale) return
                if (!showAll && !looksLikeScale) return
                if (seen.add(address)) {
                    main.post {
                        send(JSONObject().put("type", "ble-found").put("id", address).put("name", name ?: "Renpho scale"))
                    }
                }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.w(TAG, "Pair scan failed: $errorCode")
                main.post { stopPairScan(true) }
            }
        }
        pairScan = callback
        scanner.startScan(null, lowLatency(), callback)
        main.postDelayed(pairScanTimeout, SCAN_MS)
    }

    private val pairScanTimeout = Runnable { stopPairScan(true) }

    private fun stopPairScan(report: Boolean) {
        main.removeCallbacks(pairScanTimeout)
        pairScan?.let { cb ->
            try {
                adapter()?.bluetoothLeScanner?.stopScan(cb)
            } catch (e: Exception) {
                Log.w(TAG, "Stopping the pair scan failed", e)
            }
        }
        val wasScanning = pairScan != null
        pairScan = null
        if (report && wasScanning) send(JSONObject().put("type", "ble-scan-ended"))
    }

    private fun lowLatency(): ScanSettings =
        ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()

    // ---------------------------------------------------------------- Listening for the paired scale

    /** Waits for this scale to wake (it only advertises then), then connects. No prompt. */
    private fun listen(id: String) {
        stopAll()
        listeningId = id
        startListenScan()
    }

    private fun startListenScan() {
        val id = listeningId ?: return
        val adapter = adapter()
        val scanner = adapter?.takeIf { it.isEnabled && hasPermission() }?.bluetoothLeScanner
        if (scanner == null || !BluetoothAdapter.checkBluetoothAddress(id)) {
            listeningId = null
            send(JSONObject().put("type", "ble-listen-failed"))
            return
        }
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                main.post { if (listeningId == id && listenScan === this) connect(result.device) }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.w(TAG, "Listen scan failed: $errorCode")
                main.post {
                    if (listenScan === this) {
                        listenScan = null
                        listeningId = null
                        send(JSONObject().put("type", "ble-listen-failed"))
                    }
                }
            }
        }
        listenScan = callback
        val filter = ScanFilter.Builder().setDeviceAddress(id).build()
        scanner.startScan(listOf(filter), lowLatency(), callback)
    }

    private fun stopListenScan() {
        listenScan?.let { cb ->
            try {
                adapter()?.bluetoothLeScanner?.stopScan(cb)
            } catch (e: Exception) {
                Log.w(TAG, "Stopping the listen scan failed", e)
            }
        }
        listenScan = null
    }

    private fun connect(device: BluetoothDevice) {
        stopListenScan()
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    }

    private fun stopAll() {
        stopPairScan(false)
        stopListenScan()
        listeningId = null
        clearOps()
        gatt?.let {
            try {
                it.disconnect()
                it.close()
            } catch (e: Exception) {
                Log.w(TAG, "Closing the connection failed", e)
            }
        }
        gatt = null
    }

    // ---------------------------------------------------------------- Connection

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            main.post {
                if (g !== gatt) {
                    g.close()
                } else if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    g.discoverServices()
                } else {
                    connectionLost(g)
                }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            main.post {
                if (g !== gatt) return@post
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    connectionLost(g)
                } else {
                    send(
                        JSONObject()
                            .put("type", "ble-connected")
                            .put("id", g.device.address)
                            .put("name", g.device.name ?: JSONObject.NULL)
                            .put("services", describeServices(g))
                    )
                }
            }
        }

        override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            main.post { finishOp(status == BluetoothGatt.GATT_SUCCESS) }
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            main.post { finishOp(status == BluetoothGatt.GATT_SUCCESS) }
        }

        // Android 13 and later.
        override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            forwardValue(characteristic, value)
        }

        // Android 12 and earlier.
        @Deprecated("Replaced in Android 13")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            forwardValue(characteristic, characteristic.value ?: return)
        }
    }

    private fun forwardValue(characteristic: BluetoothGattCharacteristic, value: ByteArray) {
        val hex = value.joinToString("") { String.format("%02x", it) }
        val service = characteristic.service.uuid.toString()
        val char = characteristic.uuid.toString()
        main.post {
            send(JSONObject().put("type", "ble-value").put("service", service).put("char", char).put("hex", hex))
        }
    }

    /** The scale slept or the link dropped. The page starts listening again if it still wants to. */
    private fun connectionLost(g: BluetoothGatt) {
        clearOps()
        try {
            g.close()
        } catch (e: Exception) {
            Log.w(TAG, "Closing the connection failed", e)
        }
        gatt = null
        listeningId = null
        send(JSONObject().put("type", "ble-disconnected"))
    }

    private fun describeServices(g: BluetoothGatt): JSONArray {
        val services = JSONArray()
        for (service in g.services) {
            val chars = JSONArray()
            for (c in service.characteristics) {
                val p = c.properties
                chars.put(
                    JSONObject()
                        .put("uuid", c.uuid.toString())
                        .put("notify", p and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0)
                        .put("indicate", p and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0)
                        .put("write", p and BluetoothGattCharacteristic.PROPERTY_WRITE != 0)
                        .put("writeWithoutResponse", p and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
                )
            }
            services.put(JSONObject().put("uuid", service.uuid.toString()).put("chars", chars))
        }
        return services
    }

    // ---------------------------------------------------------------- One Bluetooth operation at a time

    private fun find(g: BluetoothGatt, msg: JSONObject): BluetoothGattCharacteristic? = try {
        g.getService(UUID.fromString(msg.optString("service")))
            ?.getCharacteristic(UUID.fromString(msg.optString("char")))
    } catch (e: IllegalArgumentException) {
        null
    }

    private fun enqueueNotify(msg: JSONObject) {
        ops.addLast(Op(msg.optString("requestId")) { g ->
            val c = find(g, msg) ?: return@Op false
            if (!g.setCharacteristicNotification(c, true)) return@Op false
            val cccd = c.getDescriptor(CCCD)
            if (cccd == null) {
                // No descriptor to write: notifications are already on, so nothing will call back.
                main.post { finishOp(true) }
                return@Op true
            }
            val value = if (c.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) {
                BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            } else {
                BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeDescriptor(cccd, value) == BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                cccd.value = value
                @Suppress("DEPRECATION")
                g.writeDescriptor(cccd)
            }
        })
        runNextOp()
    }

    private fun enqueueWrite(msg: JSONObject) {
        ops.addLast(Op(msg.optString("requestId")) { g ->
            val c = find(g, msg) ?: return@Op false
            val hex = msg.optString("hex")
            val bytes = ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
            val withResponse = msg.optBoolean("withResponse", true)
            val type = if (withResponse) {
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            } else {
                BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            }
            val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeCharacteristic(c, bytes, type) == BluetoothGatt.GATT_SUCCESS
            } else {
                @Suppress("DEPRECATION")
                c.value = bytes
                c.writeType = type
                @Suppress("DEPRECATION")
                g.writeCharacteristic(c)
            }
            started
        })
        runNextOp()
    }

    private fun runNextOp() {
        if (current != null) return
        val g = gatt
        val op = ops.removeFirstOrNull() ?: return
        if (g == null) {
            reply(op, false)
            runNextOp()
            return
        }
        current = op
        main.postDelayed(opTimeout, OP_TIMEOUT_MS)
        val started = try {
            op.start(g)
        } catch (e: Exception) {
            Log.w(TAG, "Bluetooth operation failed", e)
            false
        }
        if (!started) finishOp(false)
    }

    private fun finishOp(ok: Boolean) {
        main.removeCallbacks(opTimeout)
        val op = current ?: return
        current = null
        reply(op, ok)
        runNextOp()
    }

    private fun reply(op: Op, ok: Boolean) {
        send(JSONObject().put("type", "ble-op").put("requestId", op.requestId).put("ok", ok))
    }

    private fun clearOps() {
        main.removeCallbacks(opTimeout)
        current?.let { reply(it, false) }
        current = null
        while (true) {
            val op = ops.removeFirstOrNull() ?: break
            reply(op, false)
        }
    }
}
