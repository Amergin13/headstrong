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

const fig = (px: number) => `calc(${px} * var(--f))`;
/** Strava's brand orange, as its guidelines require for "Connect with Strava". */
const STRAVA_ORANGE = "#FC5200";

interface ActivityConnectionsModalProps {
  profile: UserProfile;
  hcStatus: HealthConnectStatus;
  onConnectStrava: () => Promise<boolean>;
  onDisconnectStrava: () => void;
  onSetHealthConnect: (on: boolean) => void;
  onRequestHealthConnectPermission: () => void;
  onOpenWatchSync: () => void;
  onClose: () => void;
}

/**
 * Where active days come from automatically: Health Connect (in the Android app) and a connected
 * Fitbit / Pixel Watch or Whoop. (Strava is off for the beta.) Each row says plainly whether it is on.
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
  useEffect(() => {
    if (STRAVA_ENABLED)
      getStravaConfig().then((c) => setStravaAvailable(c.configured));
  }, []);

  const watchName = profile.whoopConnected
    ? "Whoop"
    : profile.fitbitConnected
      ? "Fitbit / Pixel Watch"
      : null;
  const hcOn = Boolean(profile.healthConnectActivities && hcStatus.granted);

  const row: React.CSSProperties = {
    paddingTop: fig(28),
    borderTop: "1px solid rgba(255,255,255,0.08)",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-apps-title"
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        className="wk-card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col"
        style={{ gap: fig(28) }}
      >
        <div
          className="flex items-start justify-between"
          style={{ gap: fig(24) }}
        >
          <div>
            <h3
              id="activity-apps-title"
              className="wk-h1"
              style={{ lineHeight: 1.21 }}
            >
              Activity apps
            </h3>
            <p className="wk-body" style={{ marginTop: fig(12) }}>
              Rides, runs, walks and classes of 20 minutes or more are added as
              active days automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white shrink-0"
            style={{ background: "var(--wk-raised)" }}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Strava: off for the beta (see STRAVA_ENABLED) */}
        {STRAVA_ENABLED && (
          <section style={row} aria-labelledby="strava-row">
            <div
              className="flex items-center justify-between"
              style={{ gap: fig(16) }}
            >
              <h4 id="strava-row" className="wk-label">
                Strava
              </h4>
              <span className="wk-pill">
                {profile.stravaConnected ? "Connected" : "Not connected"}
              </span>
            </div>
            {profile.stravaConnected ? (
              <>
                <p className="wk-body" style={{ marginTop: fig(12) }}>
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
                  className="wk-button"
                  style={{
                    marginTop: fig(20),
                    background: "var(--wk-raised)",
                    color: "#fff",
                  }}
                >
                  Disconnect Strava
                </button>
              </>
            ) : stravaAvailable === false ? (
              <p className="wk-body" style={{ marginTop: fig(12) }}>
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
                  className="w-full font-bold"
                  style={{
                    marginTop: fig(20),
                    height: 48,
                    borderRadius: 6,
                    background: STRAVA_ORANGE,
                    color: "#fff",
                    fontSize: 15,
                  }}
                >
                  Connect with Strava
                </button>
                {stravaError && (
                  <p className="wk-body" style={{ marginTop: fig(12) }}>
                    {stravaError}
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {/* Health Connect: only inside the Android app */}
        <section style={row} aria-labelledby="hc-row">
          <div
            className="flex items-center justify-between"
            style={{ gap: fig(16) }}
          >
            <h4 id="hc-row" className="wk-label">
              Health Connect
            </h4>
            <span className="wk-pill">{hcOn ? "On" : "Off"}</span>
          </div>
          {!hcStatus.bridge ? (
            <p className="wk-body" style={{ marginTop: fig(12) }}>
              Available in the Treise app from Google Play on Android. It reads
              workouts from apps like Samsung Health, Google Fit and Garmin.
            </p>
          ) : !hcStatus.available ? (
            <p className="wk-body" style={{ marginTop: fig(12) }}>
              Health Connect isn't set up on this phone. Install it from Google
              Play, then come back here.
            </p>
          ) : (
            <>
              <p className="wk-body" style={{ marginTop: fig(12) }}>
                Treise reads your exercise sessions (type, start time and
                length) from Health Connect. Nothing else.
              </p>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("medium");
                  if (hcOn) {
                    onSetHealthConnect(false);
                  } else {
                    onSetHealthConnect(true);
                    if (!hcStatus.granted) onRequestHealthConnectPermission();
                  }
                }}
                className="wk-button"
                style={{
                  marginTop: fig(20),
                  background: hcOn ? "var(--wk-raised)" : "var(--wk-accent)",
                  color: hcOn ? "#fff" : "#13181C",
                }}
              >
                {hcOn
                  ? "Turn off Health Connect"
                  : hcStatus.granted
                    ? "Turn on Health Connect"
                    : "Allow access in Health Connect"}
              </button>
            </>
          )}
        </section>

        {/* Watch */}
        <section style={row} aria-labelledby="watch-row">
          <div
            className="flex items-center justify-between"
            style={{ gap: fig(16) }}
          >
            <h4 id="watch-row" className="wk-label">
              Watch
            </h4>
            <span className="wk-pill">
              {watchName ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="wk-body" style={{ marginTop: fig(12) }}>
            {watchName
              ? `Workouts recorded on your ${watchName} count as active days.`
              : "Connect a Fitbit, Pixel Watch or Whoop and its recorded workouts count as active days."}
          </p>
          {!watchName && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                onClose();
                onOpenWatchSync();
              }}
              className="wk-button"
              style={{
                marginTop: fig(20),
                background: "var(--wk-raised)",
                color: "#fff",
              }}
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
