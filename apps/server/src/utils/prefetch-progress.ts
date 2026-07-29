/**
 * Progress reporting for the bulk prefetch sweeps that run before rule
 * evaluation (Plex watch history, Jellyfin watch history, Seerr requests).
 *
 * Each is a long sequence of sequential requests, so without output they look
 * like a hang - users reported a run "stuck" on the single start line, which is
 * what #3255 fixed on the Plex side. Every sweep reports the same way rather
 * than each growing its own counter.
 *
 * Logs only when a new 10% boundary is crossed, and never on the final unit, so
 * it cannot print a misleading partial percentage just before the caller's own
 * completion line. A sweep that finishes inside the first decile stays silent.
 */
export function createPrefetchProgressReporter(
  log: (message: string) => void,
  label: string,
  unit: string,
): (done: number, total: number) => void {
  let loggedDecile = 0;

  return (done, total) => {
    if (total <= 0 || done >= total) {
      return;
    }

    const decile = Math.floor((done / total) * 10) * 10;
    if (decile > loggedDecile) {
      loggedDecile = decile;
      log(`${label}: ${done} of ${total} ${unit} (${decile}%)...`);
    }
  };
}
