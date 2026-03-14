export enum ServarrAction {
  DELETE,
  UNMONITOR_DELETE_ALL,
  UNMONITOR_DELETE_EXISTING,
  UNMONITOR,
  DO_NOTHING,
  // season-only: delete the season, then delete the show if it is empty.
  // Ended shows delete immediately; continuing shows require no remaining Seerr season requests.
  DELETE_SHOW_IF_EMPTY,
  // season-only: unmonitor the season, then unmonitor the show if it is ended and has no monitored seasons left.
  UNMONITOR_SHOW_IF_EMPTY,
}
