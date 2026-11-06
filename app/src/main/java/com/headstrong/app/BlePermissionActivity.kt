package com.headstrong.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

/** Asks Android for Bluetooth access (Nearby devices) when the athlete pairs a scale. Then reports back. */
class BlePermissionActivity : ComponentActivity() {
    private val request =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            ScaleBridge.sendStatus()
            finish()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        HealthConnectBridge.init(this)
        if (intent?.data?.host == "app-settings") {
            // Android won't ask again after a refusal, so this is the only way back.
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            finish()
            return
        }
        try {
            request.launch(ScaleBridge.requiredPermissions())
        } catch (_: Exception) {
            ScaleBridge.sendStatus()
            finish()
        }
    }
}
