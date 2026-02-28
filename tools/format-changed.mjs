import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const supportedExtensions = new Set([
  '.css',
  '.cjs',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.mjs',
  '.scss',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

const workspaceDirs = ['apps/ui', 'apps/server', 'packages/contracts'];

const getGitLines = (args) =>
  execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);

const changedFiles = new Set(
  getGitLines(['status', '--porcelain=v1', '--untracked-files=all']).flatMap(
    (line) => {
      const statusCode = line.slice(0, 2);
      if (statusCode.includes('D')) {
        return [];
      }

      const rawPath = line.slice(3);
      const normalizedPath = rawPath.includes(' -> ')
        ? rawPath.split(' -> ').at(-1)
        : rawPath;

      return normalizedPath ? [normalizedPath] : [];
    },
  ),
);

const formatTargetsByWorkspace = new Map();

for (const file of changedFiles) {
  const extension = path.extname(file).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    continue;
  }

  const workspaceDir = workspaceDirs.find(
    (dir) => file === dir || file.startsWith(`${dir}/`),
  );
  if (!workspaceDir) {
    continue;
  }

  const workspaceRelativePath = path
    .relative(workspaceDir, file)
    .split(path.sep)
    .join('/');
  if (!workspaceRelativePath || workspaceRelativePath.startsWith('..')) {
    continue;
  }

  if (!existsSync(path.join(repoRoot, file))) {
    continue;
  }

  const targets = formatTargetsByWorkspace.get(workspaceDir) ?? [];
  targets.push(workspaceRelativePath);
  formatTargetsByWorkspace.set(workspaceDir, targets);
}

if (formatTargetsByWorkspace.size === 0) {
  console.log('No changed formatter-supported files found in workspaces.');
  process.exit(0);
}

for (const workspaceDir of workspaceDirs) {
  const targets = formatTargetsByWorkspace.get(workspaceDir);
  if (!targets?.length) {
    continue;
  }

  const workspacePackageJson = JSON.parse(
    readFileSync(path.join(repoRoot, workspaceDir, 'package.json'), 'utf8'),
  );
  const formatScript = workspacePackageJson.scripts?.format;
  if (typeof formatScript !== 'string' || !formatScript.startsWith('prettier ')) {
    throw new Error(`Unsupported format script in ${workspaceDir}/package.json`);
  }

  const prettierArgs = formatScript
    .slice('prettier '.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const trailingDotIndex = prettierArgs.lastIndexOf('.');
  const baseArgs =
    trailingDotIndex === -1
      ? prettierArgs
      : prettierArgs.filter((arg, index) => index !== trailingDotIndex);

  console.log(`Formatting changed files in ${workspaceDir}`);

  const command = process.platform === 'win32' ? 'cmd.exe' : 'yarn';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'yarn', '--cwd', workspaceDir, 'prettier', ...baseArgs, ...targets]
      : ['--cwd', workspaceDir, 'prettier', ...baseArgs, ...targets];

  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
