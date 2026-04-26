#!/usr/bin/env node

import { previewReleasePost, submitReleasePost } from './reddit-release-lib.mjs';

const HELP_TEXT = `Usage: node tools/reddit-release-post.mjs [options]

Options:
  --dry-run                 Build and validate the release post without submitting it
  --release-tag <tag>       GitHub release tag to post
  --repo <owner/name>       GitHub repository, defaults to GITHUB_REPOSITORY
  --subreddit <name>        Target subreddit, defaults to REDDIT_SUBREDDIT
  --kind <self|link>        Submit a self post or link post
  --title-template <text>   Title template with {{releaseTag}}, {{repoName}}, {{releaseUrl}}
  --body-template <text>    Body template with {{releaseBody}}, {{marker}}, {{releaseUrl}}
  --allow-repost            Allow reposting when a matching recent post already exists
  --help                    Show this message
`;

const parseArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (['dry-run', 'allow-repost', 'help'].includes(key)) {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
};

const mapArgsToOverrides = (args) => ({
  repo: args.repo,
  releaseTag: args['release-tag'],
  subreddit: args.subreddit,
  kind: args.kind,
  titleTemplate: args['title-template'],
  bodyTemplate: args['body-template'],
  dryRun: args['dry-run'],
  allowRepost: args['allow-repost'],
});

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const overrides = mapArgsToOverrides(args);
  const result = args['dry-run'] ? await previewReleasePost(overrides) : await submitReleasePost(overrides);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});