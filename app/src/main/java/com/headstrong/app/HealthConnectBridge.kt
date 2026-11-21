package com.headstrong.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.browser.customtabs.CustomTabsCallback
import androidx.browser.customtabs.CustomTabsService
import androidx.browser.customtabs.CustomTabsSession
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import kotlin.math.roundToInt

/**
 * Health Connect for the Treise web app.
 *
 * A web page can't read Health Connect, so this app reads exercise sessions, daily steps,
 * sleep, heart rate, resting heart rate, HRV (RMSSD), bodyweight, and body fat natively and
 * passes them to the page over Chrome's Trusted Web Activity message channel (Chrome 115+).
 * Fitbit, Pixel Watch, Samsung Health, and Garmin all write into Android Health Connect, so
 * athlete data flows automatically through the OS hub without legacy cloud OAuth proxies.
 *
 * Strictly read-only, only after the athlete allows each permission in Health Connect, and
 * only when the page asks. Nothing is stored or sent anywhere else.
 */
object HealthConnectBridge {
    private const val TAG = "TreiseHealthConnect"

    /** The web app's origin. Digital Asset Links (use_as_origin) lets the app speak as this origin. */
    val ORIGIN: Uri = Uri.parse("https://treise.vercel.app")

    val EXERCISE_PERMISSION: String = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    val STEPS_PERMISSION: String = HealthPermission.getReadPermission(StepsRecord::class)
    val SLEEP_PERMISSION: String = HealthPermission.getReadPermission(SleepSessionRecord::class)
    val HEART_RATE_PERMISSION: String = HealthPermission.getReadPermission(HeartRateRecord::class)
    val RESTING_HR_PERMISSION: String = HealthPermission.getReadPermission(RestingHeartRateRecord::class)
    val HRV_PERMISSION: String = HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
    val WEIGHT_PERMISSION: String = HealthPermission.getReadPermission(WeightRecord::class)
    val HEIGHT_PERMISSION: String = HealthPermission.getReadPermission(HeightRecord::class)
    val BODY_FAT_PERMISSION: String = HealthPermission.getReadPermission(BodyFatRecord::class)

    val BIOMETRIC_PERMISSIONS: Set<String> = setOf(
        SLEEP_PERMISSION,
        HEART_RATE_PERMISSION,
        RESTING_HR_PERMISSION,
        HRV_PERMISSION,
        WEIGHT_PERMISSION,
        HEIGHT_PERMISSION,
        BODY_FAT_PERMISSION
    )

    val READ_PERMISSIONS: Set<String> = setOf(
        EXERCISE_PERMISSION,
        STEPS_PERMISSION
    ) + BIOMETRIC_PERMISSIONS

    /** Health Connect only lets an app read 30 days back without the history permission. */
    private val MAX_LOOKBACK: Duration = Duration.ofDays(29)

    private lateinit var appContext: Context
    private var session: CustomTabsSession? = null
    /** True once Chrome has confirmed (Digital Asset Links) that the app may speak as ORIGIN. */
    private var originValidated = false
    private var channelRequested = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    fun init(context: Context) {
        appContext = context.applicationContext
        ScaleBridge.init(context) { post(it) }
    }

    /** Called with the launcher's session once the TWA is showing. */
    fun attachSession(newSession: CustomTabsSession) {
        if (session === newSession) return
        session = newSession
        originValidated = false
        channelRequested = false
        // The message channel needs the app to be allowed to use the site's origin.
        newSession.validateRelationship(CustomTabsService.RELATION_USE_AS_ORIGIN, ORIGIN, null)
    }

    /**
     * Opens the message channel once the page has loaded and the origin is validated. Validation is
     * asynchronous, so whichever of the two happens last makes the request.
     */
    fun onPageLoaded() {
        // Each page load needs a fresh channel (a reload drops the old one).
        channelRequested = false
        ScaleBridge.reset()
        if (originValidated) requestChannel()
    }

    fun onOriginValidated(ok: Boolean) {
        originValidated = ok
        if (!ok) {
            Log.w(TAG, "Origin not validated; check use_as_origin in assetlinks.json")
            return
        }
        requestChannel()
    }

    private fun requestChannel() {
        val s = session ?: return
        if (channelRequested) return
        channelRequested = s.requestPostMessageChannel(ORIGIN, ORIGIN, Bundle())
        if (!channelRequested) Log.w(TAG, "Could not request the message channel")
    }

    fun onChannelReady() {
        post(JSONObject().put("type", "hello").put("version", 5)) // 2: scale; 3: permission screens; 4: read-steps; 5: read-biometrics
    }

    fun onMessage(message: String) {
        val msg = try {
            JSONObject(message)
        } catch (e: Exception) {
            return
        }
        if (msg.optString("type").startsWith("ble-")) {
            ScaleBridge.onMessage(msg)
            return
        }
        when (msg.optString("type")) {
            "status" -> sendStatus()
            "request-permission" -> {
                val intent = Intent(appContext, HealthPermissionActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                appContext.startActivity(intent)
            }
            "read-sessions" -> {
                val requestId = msg.optString("requestId")
                val since = try {
                    Instant.parse(msg.optString("since"))
                } catch (e: Exception) {
                    Instant.now().minus(Duration.ofDays(14))
                }
                scope.launch { readSessions(requestId, since) }
            }
            "read-steps" -> {
                val requestId = msg.optString("requestId")
                val since = try {
                    Instant.parse(msg.optString("since"))
                } catch (e: Exception) {
                    Instant.now().minus(Duration.ofDays(14))
                }
                scope.launch { readSteps(requestId, since) }
            }
            "read-biometrics" -> {
                val requestId = msg.optString("requestId")
                val since = try {
                    Instant.parse(msg.optString("since"))
                } catch (e: Exception) {
                    Instant.now().minus(Duration.ofDays(14))
                }
                scope.launch { readBiometrics(requestId, since) }
            }
        }
    }

    private fun isAvailable(): Boolean =
        HealthConnectClient.getSdkStatus(appContext) == HealthConnectClient.SDK_AVAILABLE

    /** Tells the page whether Health Connect is usable and which read-only permissions are granted. */
    fun sendStatus() {
        scope.launch {
            val available = isAvailable()
            val grantedPerms: Set<String> = if (available) {
                try {
                    val client = HealthConnectClient.getOrCreate(appContext)
                    withContext(Dispatchers.IO) {
                        client.permissionController.getGrantedPermissions()
                    }
                } catch (e: Exception) {
                    emptySet()
                }
            } else {
                emptySet()
            }
            val exerciseGranted = grantedPerms.contains(EXERCISE_PERMISSION)
            val stepsGranted = grantedPerms.contains(STEPS_PERMISSION)
            val biometricsGranted = BIOMETRIC_PERMISSIONS.any { grantedPerms.contains(it) }
            post(
                JSONObject()
                    .put("type", "status")
                    .put("available", available)
                    .put("granted", exerciseGranted)
                    .put("stepsGranted", stepsGranted)
                    .put("biometricsGranted", biometricsGranted)
                    .put("sleepGranted", grantedPerms.contains(SLEEP_PERMISSION))
                    .put("heartRateGranted", grantedPerms.contains(HEART_RATE_PERMISSION))
                    .put("restingHrGranted", grantedPerms.contains(RESTING_HR_PERMISSION))
                    .put("hrvGranted", grantedPerms.contains(HRV_PERMISSION))
                    .put("weightGranted", grantedPerms.contains(WEIGHT_PERMISSION))
                    .put("heightGranted", grantedPerms.contains(HEIGHT_PERMISSION))
                    .put("bodyFatGranted", grantedPerms.contains(BODY_FAT_PERMISSION))
            )
        }
    }

    private suspend fun readSessions(requestId: String, since: Instant) {
        val reply = JSONObject().put("type", "sessions").put("requestId", requestId)
        if (!isAvailable()) {
            post(reply.put("error", "Health Connect isn't available"))
            return
        }
        try {
            val client = HealthConnectClient.getOrCreate(appContext)
            val earliest = Instant.now().minus(MAX_LOOKBACK)
            val start = if (since.isBefore(earliest)) earliest else since
            val sessions = JSONArray()
            var pageToken: String? = null
            do {
                val response = withContext(Dispatchers.IO) {
                    client.readRecords(
                        ReadRecordsRequest(
                            recordType = ExerciseSessionRecord::class,
                            timeRangeFilter = TimeRangeFilter.after(start),
                            pageToken = pageToken
                        )
                    )
                }
                for (r in response.records) {
                    val minutes = Duration.between(r.startTime, r.endTime).toMinutes()
                    if (minutes <= 0) continue
                    sessions.put(
                        JSONObject()
                            .put("externalId", r.metadata.id)
                            .put("name", r.title ?: JSONObject.NULL)
                            .put("sportType", exerciseTypeName(r.exerciseType))
                            .put("startedAt", r.startTime.toString())
                            .put("minutes", minutes)
                    )
                }
                pageToken = response.pageToken
            } while (!pageToken.isNullOrEmpty())
            post(reply.put("sessions", sessions))
        } catch (e: SecurityException) {
            post(reply.put("error", "not-granted"))
        } catch (e: Exception) {
            Log.w(TAG, "Reading exercise sessions failed", e)
            post(reply.put("error", "read-failed"))
        }
    }

    /**
     * Reads Health Connect aggregated daily step totals (deduplicated across watch and phone
     * sources by Health Connect) from [since] until now, sliced by local calendar day.
     */
    private suspend fun readSteps(requestId: String, since: Instant) {
        val reply = JSONObject().put("type", "steps").put("requestId", requestId)
        if (!isAvailable()) {
            post(reply.put("error", "Health Connect isn't available"))
            return
        }
        try {
            val client = HealthConnectClient.getOrCreate(appContext)
            val zone = ZoneId.systemDefault()
            val now = LocalDateTime.now(zone)
            val earliest = now.toLocalDate().minusDays(29).atStartOfDay()
            val requestedStart = since.atZone(zone).toLocalDate().atStartOfDay()
            val start = when {
                requestedStart.isAfter(now) -> now.toLocalDate().atStartOfDay()
                requestedStart.isBefore(earliest) -> earliest
                else -> requestedStart
            }
            val buckets = withContext(Dispatchers.IO) {
                client.aggregateGroupByPeriod(
                    AggregateGroupByPeriodRequest(
                        metrics = setOf(StepsRecord.COUNT_TOTAL),
                        timeRangeFilter = TimeRangeFilter.between(start, now),
                        timeRangeSlicer = Period.ofDays(1)
                    )
                )
            }
            val days = JSONArray()
            for (bucket in buckets) {
                val count = bucket.result[StepsRecord.COUNT_TOTAL] ?: 0L
                if (count <= 0L) continue
                days.put(
                    JSONObject()
                        .put("date", bucket.startTime.toLocalDate().toString())
                        .put("steps", count)
                )
            }
            post(reply.put("days", days))
        } catch (e: SecurityException) {
            post(reply.put("error", "not-granted"))
        } catch (e: Exception) {
            Log.w(TAG, "Reading daily steps failed", e)
            post(reply.put("error", "read-failed"))
        }
    }

    /**
     * Reads Health Connect daily biometric metrics (sleep, resting HR, HRV RMSSD, heart rate,
     * bodyweight, and body fat) from [since] until now, aggregated per local calendar day.
     * Each record type is guarded independently so partial user permissions still sync cleanly.
     */
    private suspend fun readBiometrics(requestId: String, since: Instant) {
        val reply = JSONObject().put("type", "biometrics").put("requestId", requestId)
        if (!isAvailable()) {
            post(reply.put("error", "Health Connect isn't available"))
            return
        }
        try {
            val client = HealthConnectClient.getOrCreate(appContext)
            val granted = withContext(Dispatchers.IO) {
                client.permissionController.getGrantedPermissions()
            }
            val zone = ZoneId.systemDefault()
            val earliest = Instant.now().minus(MAX_LOOKBACK)
            val start = if (since.isBefore(earliest)) earliest else since
            val filter = TimeRangeFilter.after(start)

            val byDate = LinkedHashMap<String, JSONObject>()
            fun bucket(date: LocalDate): JSONObject {
                val key = date.toString()
                return byDate.getOrPut(key) { JSONObject().put("date", key) }
            }

            // 1. Sleep (attributed to wake date, summed across sessions)
            if (granted.contains(SLEEP_PERMISSION)) {
                try {
                    val sleepMinutesByDate = HashMap<String, Long>()
                    var pageToken: String? = null
                    do {
                        val res = withContext(Dispatchers.IO) {
                            client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, filter, pageToken = pageToken))
                        }
                        for (r in res.records) {
                            val mins = Duration.between(r.startTime, r.endTime).toMinutes()
                            if (mins <= 0) continue
                            val wakeDate = r.endTime.atZone(zone).toLocalDate().toString()
                            sleepMinutesByDate[wakeDate] = (sleepMinutesByDate[wakeDate] ?: 0L) + mins
                        }
                        pageToken = res.pageToken
                    } while (!pageToken.isNullOrEmpty())
                    for ((d, mins) in sleepMinutesByDate) {
                        val hours = (mins / 6.0).roundToInt() / 10.0
                        if (hours > 0.0) bucket(LocalDate.parse(d)).put("sleepHours", hours)
                    }
                } catch (_: SecurityException) {
                    // User declined sleep read
                }
            }

            // 2. Resting Heart Rate (latest bpm per day)
            if (granted.contains(RESTING_HR_PERMISSION)) {
                try {
                    val latestRhr = HashMap<String, Pair<Instant, Long>>()
                    var pageToken: String? = null
                    do {
                        val res = withContext(Dispatchers.IO) {
                            client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, filter, pageToken = pageToken))
                        }
                        for (r in res.records) {
                            if (r.beatsPerMinute <= 0L) continue
                            val d = r.time.atZone(zone).toLocalDate().toString()
                            val prev = latestRhr[d]
                            if (prev == null || r.time.isAfter(prev.first)) {
                                latestRhr[d] = Pair(r.time, r.beatsPerMinute)
                            }
                        }
                        pageToken = res.pageToken
                    } while (!pageToken.isNullOrEmpty())
                    for ((d, pair) in latestRhr) {
                        bucket(LocalDate.parse(d)).put("restingHr", pair.second)
                    }
                } catch (_: SecurityException) {
                    // User declined resting HR read
                }
            }

            // 3. Heart Rate Variability RMSSD (mean ms per day)
            if (granted.contains(HRV_PERMISSION)) {
                try {
                    val hrvSamples = HashMap<String, MutableList<Double>>()
                    var pageToken: String? = null
                    do {
                        val res = withContext(Dispatchers.IO) {
                            client.readRecords(ReadRecordsRequest(HeartRateVariabilityRmssdRecord::class, filter, pageToken = pageToken))
                        }
                        for (r in res.records) {
                            if (r.heartRateVariabilityMillis <= 0.0) continue
                            val d = r.time.atZone(zone).toLocalDate().toString()
                            hrvSamples.getOrPut(d) { mutableListOf() }.add(r.heartRateVariabilityMillis)
                        }
                        pageToken = res.pageToken
                    } while (!pageToken.isNullOrEmpty())
                    for ((d, list) in hrvSamples) {
                        if (list.isNotEmpty()) {
                            bucket(LocalDate.parse(d)).put("hrvRmssd", list.average().roundToInt())
                        }
                    }
                } catch (_: SecurityException) {
                    // User declined HRV read
                }
            }

            // 4. Heart Rate samples (daily peak & average bpm when workout/all-day HR is present)
            if (granted.contains(HEART_RATE_PERMISSION)) {
                try {
                    val hrStats = HashMap<String, Triple<Long, Long, Long>>() // sum, count, max
                    var pageToken: String? = null
                    do {
                        val res = withContext(Dispatchers.IO) {
                            client.readRecords(ReadRecordsRequest(HeartRateRecord::class, filter, pageToken = pageToken))
                        }
                        for (r in res.records) {
                            for (sample in r.samples) {
                                if (sample.beatsPerMinute <= 0L) continue
                                val d = sample.time.atZone(zone).toLocalDate().toString()
                                val prev = hrStats[d] ?: Triple(0L, 0L, 0L)
                                hrStats[d] = Triple(
                                    prev.first + sample.beatsPerMinute,
                                    prev.second + 1L,
                                    maxOf(prev.third, sample.beatsPerMinute)
                                )
                            }
                        }
                        pageToken = res.pageToken
                    } while (!pageToken.isNullOrEmpty())
                    for ((d, triple) in hrStats) {
                        if (triple.second > 0L) {
                            val obj = bucket(LocalDate.parse(d))
                            obj.put("avgDailyHr", (triple.first.toDouble() / triple.second).roundToInt())
                            obj.put("maxDailyHr", triple.third)
                        }
                    }
                } catch (_: SecurityException) {
                    // User declined heart rate read
                }
            }

            // 5. Bodyweight (latest kg per day)
            if (granted.contains(WEIGHT_PERMISSION)) {
                try {
                    val latestWeight = HashMap<String, Pair<Instant, Double>>()
                    var pageToken: String? = null
                    do {
                        val res = withContext(Dispatchers.IO) {
                            client.readRecords(ReadRecordsRequest(WeightRecord::class, filter, pageToken = pageToken))
                        }
                        for (r in res.records) {
                            val kg = r.weight.inKilograms
                            if (kg <= 0.0) continue
                            val d = r.time.atZone(zone).toLocalDate().toString()
                            val prev = latestWeight[d]
                            if (prev == null || r.time.isAfter(prev.first)) {
                                latestWeight[d] = Pair(r.time, kg)
                            }
                        }
                        pageToken = res.pageToken
                    } while (!pageToken.isNullOrEmpty())
                    for ((d, pair) in latestWeight) {
                        bucket(LocalDate.parse(d)).put("bodyweightKg", (pair.second * 10.0).roundToInt() / 10.0)
                    }
                } catch (_: SecurityException) {
                    // User declined weight read
                }
            }

            // 6. Body Fat percentage (latest % per day)
            if (granted.contains(BODY_FAT_PERMISSION)) {
                try {
                    val latestBf = HashMap<String, Pair<Instant, Double>>()
                    var pageToken: String? = null
                    do {
                        val res = withContext(Dispatchers.IO) {
                            client.readRecords(ReadRecordsRequest(BodyFatRecord::class, filter, pageToken = pageToken))
                        }
                        for (r in res.records) {
                            val pct = r.percentage.value
                            if (pct <= 0.0 || pct >= 75.0) continue
                            val d = r.time.atZone(zone).toLocalDate().toString()
                            val prev = latestBf[d]
                            if (prev == null || r.time.isAfter(prev.first)) {
                                latestBf[d] = Pair(r.time, pct)
                            }
                        }
                        pageToken = res.pageToken
                    } while (!pageToken.isNullOrEmpty())
                    for ((d, pair) in latestBf) {
                        bucket(LocalDate.parse(d)).put("bodyFatPct", (pair.second * 10.0).roundToInt() / 10.0)
                    }
                } catch (_: SecurityException) {
                    // User declined body fat read
                }
            }

            // 7. Height (latest cm per day, always scanning the full 29-day window since height is logged infrequently)
            var mostRecentHeight: Pair<Instant, Int>? = null
            if (granted.contains(HEIGHT_PERMISSION)) {
                try {
                    val heightFilter = TimeRangeFilter.after(earliest)
                    val latestHeight = HashMap<String, Pair<Instant, Double>>()
                    var pageToken: String? = null
                    do {
                        val res = withContext(Dispatchers.IO) {
                            client.readRecords(ReadRecordsRequest(HeightRecord::class, heightFilter, pageToken = pageToken))
                        }
                        for (r in res.records) {
                            val cm = r.height.inMeters * 100.0
                            if (cm < 100.0 || cm > 250.0) continue
                            val d = r.time.atZone(zone).toLocalDate().toString()
                            val prev = latestHeight[d]
                            if (prev == null || r.time.isAfter(prev.first)) {
                                latestHeight[d] = Pair(r.time, cm)
                            }
                            if (mostRecentHeight == null || r.time.isAfter(mostRecentHeight.first)) {
                                mostRecentHeight = Pair(r.time, cm.roundToInt())
                            }
                        }
                        pageToken = res.pageToken
                    } while (!pageToken.isNullOrEmpty())
                    for ((d, pair) in latestHeight) {
                        bucket(LocalDate.parse(d)).put("heightCm", pair.second.roundToInt())
                    }
                } catch (_: SecurityException) {
                    // User declined height read
                }
            }

            val days = JSONArray()
            for (d in byDate.keys.sorted()) {
                days.put(byDate[d])
            }
            if (mostRecentHeight != null) {
                reply.put("profile", JSONObject().put("heightCm", mostRecentHeight.second))
            }
            post(reply.put("days", days))
        } catch (e: SecurityException) {
            post(reply.put("error", "not-granted"))
        } catch (e: Exception) {
            Log.w(TAG, "Reading Health Connect biometrics failed", e)
            post(reply.put("error", "read-failed"))
        }
    }

    /** Names the web app classifies (see classifyActivity in src/engine/activeDays.ts). */
    private fun exerciseTypeName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING, ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "biking"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL, ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING, ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "rowing"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL, ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING,
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING,
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "strength"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA, ExerciseSessionRecord.EXERCISE_TYPE_PILATES,
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING, ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_BOXING, ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS -> "class"
        else -> "other"
    }

    private fun post(message: JSONObject) {
        val s = session ?: return
        val result = s.postMessage(message.toString(), null)
        if (result != CustomTabsService.RESULT_SUCCESS) Log.w(TAG, "postMessage failed: $result")
    }

    /**
     * Callback for the TWA session. Extends the library's QualityEnforcer so its checks still run,
     * and adds the message channel.
     */
    class Callback(private val onSessionNeeded: () -> CustomTabsSession?) :
        com.google.androidbrowserhelper.trusted.QualityEnforcer() {
        override fun onNavigationEvent(navigationEvent: Int, extras: Bundle?) {
            super.onNavigationEvent(navigationEvent, extras)
            if (navigationEvent == CustomTabsCallback.NAVIGATION_FINISHED) {
                onSessionNeeded()?.let { attachSession(it) }
                onPageLoaded()
            }
        }

        override fun onRelationshipValidationResult(relation: Int, requestedOrigin: Uri, result: Boolean, extras: Bundle?) {
            super.onRelationshipValidationResult(relation, requestedOrigin, result, extras)
            if (relation == CustomTabsService.RELATION_USE_AS_ORIGIN) onOriginValidated(result)
        }

        override fun onMessageChannelReady(extras: Bundle?) {
            onChannelReady()
        }

        override fun onPostMessage(message: String, extras: Bundle?) {
            onMessage(message)
        }
    }
}
