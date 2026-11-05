/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.headstrong.app;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsSession;

import com.google.androidbrowserhelper.trusted.TwaLauncher;

import java.lang.reflect.Field;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        HealthConnectBridge.INSTANCE.init(this);
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    /**
     * Same checks as the library's default callback, plus the Health Connect message channel.
     */
    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        return new HealthConnectBridge.Callback(this::findSession);
    }

    /**
     * The launcher keeps its Custom Tabs session in private fields with no getter, so it is read by
     * reflection (field names are kept in release builds by proguard-rules.pro).
     */
    private CustomTabsSession findSession() {
        try {
            Field launcherField = com.google.androidbrowserhelper.trusted.LauncherActivity.class.getDeclaredField("mTwaLauncher");
            launcherField.setAccessible(true);
            Object launcher = launcherField.get(this);
            if (launcher == null) return null;
            Field sessionField = TwaLauncher.class.getDeclaredField("mSession");
            sessionField.setAccessible(true);
            return (CustomTabsSession) sessionField.get(launcher);
        } catch (Exception e) {
            Log.w("TreiseHealthConnect", "Could not find the TWA session", e);
            return null;
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch url.
        Uri uri = super.getLaunchingUrl();
        if (uri != null && uri.getScheme() == null) {
            String path = uri.toString();
            return Uri.parse("https://treise.vercel.app" + (path.startsWith("/") ? path : "/" + path));
        }
        return uri;
    }
}
