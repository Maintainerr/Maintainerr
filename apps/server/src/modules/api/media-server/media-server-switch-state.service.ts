import { Injectable } from '@nestjs/common';

/**
 * Holds the "a media server switch is in progress" flag.
 *
 * Extracted so the read side (MediaServerFactory, which rejects requests during
 * the switch window) and the write side (MediaServerSwitchService, which owns
 * the switch flow) can share the flag without depending on each other. That
 * removes the only remaining MediaServerFactory <-> MediaServerSwitchService
 * circular dependency. This holder deliberately injects nothing.
 */
@Injectable()
export class MediaServerSwitchState {
  private switching = false;

  isSwitching(): boolean {
    return this.switching;
  }

  setSwitching(switching: boolean): void {
    this.switching = switching;
  }
}
