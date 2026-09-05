/**
 * axios reads 0 as "no timeout". Every delete waits like this: Radarr, Sonarr,
 * Sportarr and Jellyfin remove the file before they answer, so the wait is the
 * disk's (#3673 measured 4m23s for one 31.6 GB file), and a client that gives
 * up records as failed a delete the server then finishes. A peer that has died
 * still fails the request: Node's agent arms TCP keepalive on every socket, so
 * the kernel reports it within seconds.
 */
export const NO_TIMEOUT = 0;
