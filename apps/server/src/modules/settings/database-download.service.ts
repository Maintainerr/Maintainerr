import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { access, stat } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseDownloadService {
  constructor(private readonly dataSource: DataSource) {}

  async getDatabaseDownload(): Promise<{
    fileStream: ReturnType<typeof createReadStream>;
    fileName: string;
    fileSize: number;
  }> {
    const configuredPath = this.dataSource.options.database;

    if (typeof configuredPath !== 'string') {
      throw new InternalServerErrorException(
        'Database download is only supported for file-based databases',
      );
    }

    const databasePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);

    try {
      await access(databasePath, constants.R_OK);
    } catch {
      throw new NotFoundException('Database file not found');
    }

    const databaseStats = await stat(databasePath);
    const fileDate = new Date().toISOString().slice(0, 10);

    return {
      fileStream: createReadStream(databasePath),
      fileName: `maintainerr-${fileDate}.sqlite`,
      fileSize: databaseStats.size,
    };
  }
}
