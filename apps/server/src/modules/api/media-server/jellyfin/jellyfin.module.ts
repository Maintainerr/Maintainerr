import { forwardRef, Module } from '@nestjs/common';
import { SettingsModule } from '../../../settings/settings.module';
import { JellyfinService } from './jellyfin.service';

/**
 * Jellyfin Module
 *
 * Provides Jellyfin media server integration.
 * Uses the official @jellyfin/sdk for API communication.
 *
 * Usage:
 * ```typescript
 * // In a service or controller
 * constructor(private readonly jellyfinService: JellyfinService) {}
 *
 * async someMethod() {
 *   await this.jellyfinService.initialize();
 *   const libraries = await this.jellyfinService.getLibraries();
 * }
 * ```
 */
@Module({
  imports: [forwardRef(() => SettingsModule)],
  providers: [JellyfinService],
  exports: [JellyfinService],
})
export class JellyfinModule {}
