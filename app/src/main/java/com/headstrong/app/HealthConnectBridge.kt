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
import androidx.health.connect.client.records.ExerciseSessionRecord
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

/**
 * Health Connect for the Treise web app.
 *
 * A web page can't read Health Connect, so this app reads exercise sessions natively and passes
 * them to the page over Chrome's Trusted Web Activity message channel (Chrome 115+). The page's
 * side is src/services/healthConnectBridge.ts; the message format is documented there.
 *
 * Only ExerciseSessionRecord is read (type, start, end, title), only after the athlete allows it in
 * Health Connect, and only when the page asks. Nothing is stored or sent anywhere else.
 */
object HealthConnectBridge {
    private const val TAG = "TreiseHealthConnect"

    /** The web app's origin. Digital Asset Links (use_as_origin) lets the app speak as this origin. */
    val ORIGIN: Uri = Uri.parse("https://treise.vercel.app")

    val READ_PERMISSIONS: Set<String> = setOf(HealthPermission.getReadPermission(ExerciseSessionRecord::class))

    /** Health Connect only lets an app read 30 days back without the history permission. */
    private val MAX_LOOKBACK: Duration = Duration.ofDays(29)

    private lateinit var appContext: Context
    private var session: CustomTabsSession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    /** Called with the launcher's session once the TWA is showing. */
    fun attachSession(newSession: CustomTabsSession) {
        if (session === newSession) return
        session = newSession
        // The message channel needs the app to be allowed to use the site's origin.
        newSession.validateRelationship(CustomTabsService.RELATION_USE_AS_ORIGIN, ORIGIN, null)
    }

    /** Opens the message channel after each page load (a reload gives the page a new channel). */
    fun onPageLoaded() {
        val s = session ?: return
        val ok = s.requestPostMessageChannel(ORIGIN, ORIGIN, Bundle())
        if (!ok) Log.w(TAG, "Could not request the message channel")
    }

    fun onChannelReady() {
        post(JSONObject().put("type", "hello").put("version", 1))
    }

    fun onMessage(message: String) {
        val msg = try {
            JSONObject(message)
        } catch (e: Exception) {
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
        }
    }

    private fun isAvailable(): Boolean =
        HealthConnectClient.getSdkStatus(appContext) == HealthConnectClient.SDK_AVAILABLE

    /** Tells the page whether Health Connect is usable and whether Treise may read workouts. */
    fun sendStatus() {
        scope.launch {
            val available = isAvailable()
            val granted = if (available) {
                try {
                    val client = HealthConnectClient.getOrCreate(appContext)
                    withContext(Dispatchers.IO) {
                        client.permissionController.getGrantedPermissions().containsAll(READ_PERMISSIONS)
                    }
                } catch (e: Exception) {
                    false
                }
            } else {
                false
            }
            post(JSONObject().put("type", "status").put("available", available).put("granted", granted))
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
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "strength"
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

        override fun onMessageChannelReady(extras: Bundle?) {
            onChannelReady()
        }

        override fun onPostMessage(message: String, extras: Bundle?) {
            onMessage(message)
        }
    }
}
