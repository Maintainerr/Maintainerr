/**
 * Read-only view of the reporting schedule, separate from the stored setting.
 *
 * `forcedOff` reflects the TELEMETRY=off environment variable, which overrides
 * whatever is saved. Without it the settings page would show the toggle on and
 * confirm a save while the server sent nothing.
 */
export interface TelemetryStatus {
  /** TELEMETRY=off is set, so nothing is sent whatever the stored setting says. */
  forcedOff: boolean
  /** ISO timestamp of the next weekly report, null when reporting is off. */
  nextSendAtWeekly: string | null
  /**
   * ISO timestamp of the next report that also carries the detail block. Known
   * ahead of time because the draw is seeded from the install and the week
   * rather than being a fresh coin flip.
   */
  nextSendAtRich: string | null
}
