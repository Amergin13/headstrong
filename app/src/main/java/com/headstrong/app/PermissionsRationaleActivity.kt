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
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://treise.vercel.app/privacy.html")))
        finish()
    }
}
