import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { UserProfile } from "../../engine/types";
import { HealthConnectStatus } from "../../services/healthConnectBridge";
import {
  STRAVA_ENABLED,
  getStravaConfig,
} from "../../services/activitySources";
import { triggerHaptic } from "../../utils/haptics";

interface ActivityConnectionsModalProps {
  profile: UserProfile;
  hcStatus: HealthConnectStatus;
  onConnectStrava: () => Promise<boolean>;
  onDisconnectStrava: () => void;
  onSetHealthConnect: (on: boolean) => void;
  /** False when the installed app is too old to open the permission screen. */
  onRequestHealthConnectPermission: () => boolean | void;
  onOpenWatchSync: () => void;
  onClose: () => void;
}

/**
 * Where active days come from automatically: Health Connect (in the Android app, covering
 * Fitbit, Pixel Watch, Samsung Health, Google Fit and Garmin) and a connected Whoop.
 * (Strava is off for the beta.) Each row says plainly whether it is on.
 */
export const ActivityConnectionsModal: React.FC<
  ActivityConnectionsModalProps
> = ({
  profile,
  hcStatus,
  onConnectStrava,
  onDisconnectStrava,
  onSetHealthConnect,
  onRequestHealthConnectPermission,
  onOpenWatchSync,
  onClose,
}) => {
  const [stravaAvailable, setStravaAvailable] = useState<boolean | null>(null);
  const [stravaError, setStravaError] = useState<string | null>(null);
  const [needsAppUpdate, setNeedsAppUpdate] = useState(false);
  useEffect(() => {
    if (STRAVA_ENABLED)
      getStravaConfig().then((c) => setStravaAvailable(c.configured));
  }, []);

  const watchName = profile.whoopConnected ? "Whoop" : null;
  const hcOn = Boolean(profile.healthConnectActivities && hcStatus.granted);

  const row: React.CSSProperties = {
    paddingTop: 16,
    borderTop: "1px solid var(--color-border-subtle)",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-apps-title"
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "var(--color-bg-scrim)" }}
    >
      <div className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3
              id="activity-apps-title"
              className="wk-h1"
            >
              Activity apps
            </h3>
            <p className="wk-body mt-2 max-w-prose">
              Rides, runs, walks and classes of 20 minutes or more are added as
              active days automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border border-[var(--color-border-strong)]"
            style={{ background: "var(--wk-raised)", color: "var(--color-text-secondary)" }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Strava: off for the beta (see STRAVA_ENABLED) */}
        {STRAVA_ENABLED && (
          <section style={row} aria-labelledby="strava-row">
            <div className="flex items-center justify-between gap-3">
              <h4 id="strava-row" className="wk-subhead">
                Strava
              </h4>
              <span className="wk-pill">
                {profile.stravaConnected ? "Connected" : "Not connected"}
              </span>
            </div>
            {profile.stravaConnected ? (
              <>
                <p className="wk-body mt-2 max-w-prose">
                  {profile.stravaAthleteFirstName
                    ? `Connected as ${profile.stravaAthleteFirstName}. `
                    : ""}
                  Your Strava activities count as active days.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    onDisconnectStrava();
                  }}
                  className="wk-btn-secondary w-full mt-3"
                >
                  Disconnect Strava
                </button>
              </>
            ) : stravaAvailable === false ? (
              <p className="wk-body mt-2 max-w-prose">
                Strava isn't available yet. It will appear here once it's
                switched on.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  disabled={stravaAvailable === null}
                  onClick={async () => {
                    triggerHaptic("medium");
                    setStravaError(null);
                    const started = await onConnectStrava();
                    if (!started) setStravaError("Strava isn't available yet.");
                  }}
                  className="wk-button mt-3"
                  style={{
                    background: "var(--color-action-primary-bg)",
                    color: "var(--color-action-primary-fg)",
                  }}
                >
                  Connect with Strava
                </button>
                {stravaError && (
                  <p className="wk-body mt-2 max-w-prose">
                    {stravaError}
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {/* Health Connect: only inside the Android app */}
        <section style={row} aria-labelledby="hc-row">
          <div className="flex items-center justify-between gap-3">
            <h4 id="hc-row" className="wk-subhead">
              Health Connect
            </h4>
            <span className="wk-pill">{hcOn ? "On" : "Off"}</span>
          </div>
          {!hcStatus.bridge ? (
            <p className="wk-body mt-2 max-w-prose">
              Available in the Treise app from Google Play on Android. It reads
              workouts, daily steps, sleep, heart rate, HRV, weight, and body fat from Google Pixel Watch, Fitbit, Samsung Health and Garmin automatically.
            </p>
          ) : !hcStatus.available ? (
            <p className="wk-body mt-2 max-w-prose">
              Health Connect isn't set up on this phone. Install it from Google
              Play, then come back here.
            </p>
          ) : (
            <>
              <p className="wk-body mt-2 max-w-prose">
                Treise reads only the health categories you allow (exercise sessions, daily steps, sleep, heart rate, resting HR, HRV, weight, and body fat) from Health Connect — including Fitbit, Pixel Watch, Samsung Health and Garmin. Strictly read-only.
              </p>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("medium");
                  if (hcOn) {
                    onSetHealthConnect(false);
                  } else {
                    onSetHealthConnect(true);
                    if ((!hcStatus.granted || !hcStatus.stepsGranted || !hcStatus.biometricsGranted) && onRequestHealthConnectPermission() === false) setNeedsAppUpdate(true);
                  }
                }}
                className="wk-button mt-3"
                style={{
                  background: hcOn ? "var(--color-action-secondary-bg)" : "var(--color-action-primary-bg)",
                  color: hcOn ? "var(--color-action-secondary-fg)" : "var(--color-action-primary-fg)",
                  border: hcOn ? "1px solid var(--color-border-strong)" : undefined,
                }}
              >
                {hcOn
                  ? "Turn off Health Connect"
                  : hcStatus.granted && hcStatus.stepsGranted && hcStatus.biometricsGranted
                    ? "Turn on Health Connect"
                    : "Allow access in Health Connect"}
              </button>
              {hcOn && !hcStatus.stepsGranted && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    if (onRequestHealthConnectPermission() === false) setNeedsAppUpdate(true);
                  }}
                  className="wk-button mt-3"
                  style={{
                    background: "var(--color-action-primary-bg)",
                    color: "var(--color-action-primary-fg)",
                  }}
                >
                  Allow daily steps in Health Connect
                </button>
              )}
              {needsAppUpdate && (
                <p className="wk-body mt-3 max-w-prose">
                  Update Treise from Google Play to allow this here. Or open Android Settings, then Health Connect, then App permissions, and allow Treise.
                </p>
              )}
            </>
          )}
        </section>

        {/* Watch */}
        <section style={row} aria-labelledby="watch-row">
          <div className="flex items-center justify-between gap-3">
            <h4 id="watch-row" className="wk-subhead">
              Watch
            </h4>
            <span className="wk-pill">
              {watchName ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="wk-body mt-2 max-w-prose">
            {watchName
              ? `Workouts recorded on your ${watchName} count as active days.`
              : "Connect a Whoop and its recorded workouts count as active days."}
          </p>
          {!watchName && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                onClose();
                onOpenWatchSync();
              }}
              className="wk-btn-secondary w-full mt-3"
            >
              Connect a watch
            </button>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
};
