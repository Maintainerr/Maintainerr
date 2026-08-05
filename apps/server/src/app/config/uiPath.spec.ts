import * as fs from 'fs';
import path from 'path';
import { resolveUiRootPath, servedUiPath } from './uiPath';

jest.mock('fs', () => ({ existsSync: jest.fn() }));

describe('resolveUiRootPath', () => {
  const bundled = '/opt/app/apps/server/dist/ui';

  it('serves the staged copy once start.sh has written its index.html', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    expect(resolveUiRootPath(bundled)).toBe(servedUiPath);
    expect(fs.existsSync).toHaveBeenCalledWith(
      path.join(servedUiPath, 'index.html'),
    );
  });

  it('falls back to the bundle when nothing is staged', () => {
    // Keys off index.html rather than the directory: a failed copy leaves the
    // directory behind, and serving that would 404 every asset.
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    expect(resolveUiRootPath(bundled)).toBe(bundled);
  });
});
