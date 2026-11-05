# The Health Connect bridge reads the Custom Tabs session that android-browser-helper's launcher
# keeps in private fields (there is no public getter). Keep their names in release builds.
-keepclassmembers class com.google.androidbrowserhelper.trusted.LauncherActivity {
    com.google.androidbrowserhelper.trusted.TwaLauncher mTwaLauncher;
}
-keepclassmembers class com.google.androidbrowserhelper.trusted.TwaLauncher {
    androidx.browser.customtabs.CustomTabsSession mSession;
}

# Health Connect references these annotations only at compile time.
-dontwarn javax.annotation.concurrent.GuardedBy
-dontwarn javax.annotation.concurrent.NotThreadSafe
