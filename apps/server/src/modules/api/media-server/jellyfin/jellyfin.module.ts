import { forwardRef, Module } from '@nestjs/common';
import { SettingsModule } from '../../../settings/settings.module';
import { JellyfinAdapterService } from './jellyfin-adapter.service';

/**
 * Jellyfin Module
 *
 * Provides Jellyfin media server integration.
 * Uses the official @jellyfin/sdk for API communication.
 *
 * Usage:
 * ```typescript
 * // In a service or controller
 * constructor(private readonly jellyfinAdapter: JellyfinAdapterService) {}
 *
 * async someMethod() {
 *   await this.jellyfinAdapter.initialize();
 *   const libraries = await this.jellyfinAdapter.getLibraries();
 * }
 * ```
 */
@Module({
  imports: [forwardRef(() => SettingsModule)],
  providers: [JellyfinAdapterService],
  exports: [JellyfinAdapterService],
})
export class JellyfinModule {}
