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
import { PARTNER_COLORS } from "../../styles/semanticTokens";

const fig = (px: number) => `calc(${px} * var(--f))`;
/** Strava's brand orange, as its guidelines require for "Connect with Strava". */
const STRAVA_ORANGE = PARTNER_COLORS.strava;

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
    paddingTop: fig(28),
    borderTop: "1px solid rgba(255,255,255,0.08)",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-apps-title"
      className="wk fixed inset-0 z-50 flex items-end sm:items-center justify-center p-[calc(38*var(--f))] bg-black/80 backdrop-blur-sm"
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
                    color: "var(--color-text-primary)",
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
                    color: "var(--color-text-primary)",
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
              workouts and daily step counts from Google Pixel Watch, Fitbit, Samsung Health, Google Fit and Garmin.
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
                length) and daily step counts from Health Connect, including data from Fitbit, Pixel Watch, Samsung Health and Garmin. Nothing else.
              </p>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("medium");
                  if (hcOn) {
                    onSetHealthConnect(false);
                  } else {
                    onSetHealthConnect(true);
                    if ((!hcStatus.granted || !hcStatus.stepsGranted) && onRequestHealthConnectPermission() === false) setNeedsAppUpdate(true);
                  }
                }}
                className="wk-button"
                style={{
                  marginTop: fig(20),
                  background: hcOn ? "var(--wk-raised)" : "var(--wk-accent)",
                  color: hcOn ? "var(--color-text-primary)" : "var(--color-text-on-accent)",
                }}
              >
                {hcOn
                  ? "Turn off Health Connect"
                  : hcStatus.granted && hcStatus.stepsGranted
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
                  className="wk-button"
                  style={{
                    marginTop: fig(12),
                    background: "var(--wk-accent)",
                    color: "var(--color-text-on-accent)",
                  }}
                >
                  Allow daily steps in Health Connect
                </button>
              )}
              {needsAppUpdate && (
                <p className="wk-body" style={{ marginTop: fig(16) }}>
                  Update Treise from Google Play to allow this here. Or open Android Settings, then Health Connect, then App permissions, and allow Treise.
                </p>
              )}
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
              className="wk-button"
              style={{
                marginTop: fig(20),
                background: "var(--wk-raised)",
                color: "var(--color-text-primary)",
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
