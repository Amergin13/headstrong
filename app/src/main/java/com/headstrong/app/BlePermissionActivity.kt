package com.headstrong.app

import android.os.Bundle
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
        request.launch(ScaleBridge.requiredPermissions())
    }
}
