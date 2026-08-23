/**
 * Lives apart from both services: the task registers the job under this name
 * and the service looks it up to report the schedule, so putting it in either
 * one would make them import each other.
 */
export const TELEMETRY_TASK_NAME = 'Telemetry Ping';
