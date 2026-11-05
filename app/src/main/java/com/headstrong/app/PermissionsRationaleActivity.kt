package com.headstrong.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * Health Connect opens this when the athlete asks why Treise wants their data. It shows the same
 * privacy policy as the Play Store listing.
 */
class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri = Uri.parse("https://treise.vercel.app/privacy.html")
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
        }
        finish()
    }
}
