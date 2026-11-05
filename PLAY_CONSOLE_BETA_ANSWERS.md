# Play Console answers for the Treise private beta

Worked out from the code (version 1.1.0: active days, Strava, Health Connect). If the code changes what leaves the phone, update this and `public/privacy.html` together.

## What actually leaves the phone

| Data | Where it goes | Stored off the phone? |
| --- | --- | --- |
| Workouts, sets, bodyweight, measurements, coach chats | Nowhere. Saved in the phone's browser storage only. | No |
| Fitbit / Whoop access token, then HRV, resting HR, sleep, steps, recovery, workout strain | Phone → Treise's Vercel functions (`api/fitbit`, `api/whoop`) → Fitbit / Whoop → back to the phone. Only if the athlete connects a wearable. | No (functions keep nothing; Vercel request logs hold IP addresses) |
| Google sign-in: name, email, photo | Comes from Google straight to the phone (Google Identity Services in the page). Never sent to Treise's servers. | No |
| Active days logged by hand | Nowhere. Saved on the phone. | No |
| Strava activities (type, name, start time, moving time, distance, average heart rate) | Phone → Treise's Vercel functions (`api/strava`) → Strava → back to the phone. Only if the athlete connects Strava. | No |
| Health Connect exercise sessions (type, title, start and end time) | Read on the phone by the Treise Android app and passed to the web app on the same phone. Never sent to a server. | No |
| Optional coach model download | Phone downloads files from huggingface.co. Sends none of the athlete's data. | No |

## Data safety form

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS only).
- **Do you provide a way for users to request that their data is deleted?** Yes: in the app, Program → Settings → Data Backup & Privacy → Delete All Data.

Declare as **collected** (not shared):

- **Health and fitness → Health info** and **Fitness info** (HRV, resting heart rate, sleep, steps, recovery, workout strain, and workouts from Fitbit, Whoop and Strava: type, time, length, distance, average heart rate)
  - Processed ephemerally: **Yes**
  - Required or optional: **Optional** (only when a wearable or Strava is connected)
  - Purpose: **App functionality**

Do **not** declare:

- Workout logs, bodyweight and measurements: they never leave the device, so they aren't "collected" under Play's definition.
- Name, email and photo from Google sign-in: they stay on the device.

**Shared with third parties:** No. Fitbit and Whoop are where the athlete's own data comes from, at their request. Play's guidance treats that as not sharing.

## Health apps declaration

- **Category:** Fitness (activity and training tracking). Not a medical device, no diagnosis.
- **Health Connect permissions:** `READ_EXERCISE` only. Purpose: count the athlete's workouts (rides, runs, walks, classes) as the plan's weekly active day. Read on the device, last 30 days, after the athlete allows it; never sent to a server. Not collected under the Data safety definition, because it doesn't leave the phone.
- **Limited Use:** the privacy policy states that use of Health Connect data follows the Health Connect Permissions policy, including Limited Use.
- **Privacy policy URL:** https://treise.vercel.app/privacy.html
- The policy includes the non-medical disclaimer (section 4).

## App content (other sections)

- **Ads:** No ads.
- **Target audience:** 18+ (strength training loads; avoids the Families policy).
- **Account creation:** None in Treise's backend. Google sign-in only personalises the profile on the device, so no account deletion URL is needed. If Play asks anyway, give the privacy policy URL.
- **Government, financial, news:** No.

## Closed testing track

1. Testing → Closed testing → Create track (or use "Alpha").
2. Build and upload version 1.1.0 (code 13) with `./gradlew bundleRelease` (see PLAY_STORE_RELEASE_GUIDE.md §3.3). It adds the Health Connect bridge and needs Android 8 or later.
3. Testers: add an email list, then share the opt-in link with testers.
4. A new personal developer account must run a closed test with at least 12 testers for 14 days before it can apply for production.

## Still to check before inviting testers

- [ ] Forwarding set up for `privacy@treise.app`, and a test email arrives
- [ ] Whoop sign-in and sync on the Pixel
- [ ] Fitbit sign-in and sync on the Pixel
- [ ] AI coach answers on the Pixel (Download, then ask a question)
- [ ] RENPHO scale pairing (optional for the beta)
- [ ] Strava: create the API app, set `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` in Vercel, raise athlete capacity to 10, connect on the Pixel
- [ ] Health Connect: submit the declaration, install 1.1.0 from the testing track, turn it on in Activity apps, log a ride in Health Connect (or Google Fit / Samsung Health) and check it appears
