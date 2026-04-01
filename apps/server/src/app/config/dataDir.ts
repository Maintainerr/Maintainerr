import path from 'path';

const DEFAULT_PRODUCTION_DATA_DIR = '/opt/data';

export const productionDataDir =
  process.env.DATA_DIR?.trim() || DEFAULT_PRODUCTION_DATA_DIR;

export const dataDir =
  process.env.NODE_ENV === 'production'
    ? productionDataDir
    : path.join(__dirname, '../../../../data');

export const databasePath =
  process.env.NODE_ENV === 'production'
    ? path.join(productionDataDir, 'maintainerr.sqlite')
    : '../../data/maintainerr.sqlite';
