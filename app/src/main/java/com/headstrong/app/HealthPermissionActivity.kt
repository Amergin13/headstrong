package com.headstrong.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.PermissionController

/** Shows Health Connect's own permission screen; the athlete decides there. Then reports back. */
class HealthPermissionActivity : ComponentActivity() {
    private val requestPermissions: ActivityResultLauncher<Set<String>> =
        registerForActivityResult(PermissionController.createRequestPermissionResultContract()) {
            HealthConnectBridge.sendStatus()
            finish()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestPermissions.launch(HealthConnectBridge.READ_PERMISSIONS)
    }
}
