import { createRequire } from 'node:module';
import * as path from 'node:path';

// Resolve TypeORM from the current workspace (e.g. apps/server), not /tools.
const workspaceRequire = createRequire(path.join(process.cwd(), 'package.json'));
workspaceRequire('typeorm/cli.js');
