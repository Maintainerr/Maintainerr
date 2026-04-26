# Reddit Release Bot

This repository includes a GitHub Actions path for posting release announcements to Reddit:

- `.github/workflows/reddit_release_post.yml`: runs on `release.published` and can also be triggered manually.
- `tools/reddit-release-post.mjs`: workflow entry point.
- `tools/reddit-release-lib.mjs`: shared release lookup, duplicate detection, and Reddit submission logic.

## Reddit setup

Create the Reddit account and subreddit manually. For the bot app itself, create a Reddit OAuth app at `https://www.reddit.com/prefs/apps` and select the `script` app type. Reddit's script app flow is intended for a bot you run on infrastructure you control.

Recommended setup order:

1. Create and verify the Reddit account.
2. Create the subreddit.
3. Configure the subreddit so the bot account can post release announcements.
4. Create the Reddit `script` app for that account.
5. Add the Reddit credentials and subreddit name to GitHub.
6. Run the workflow once in `dry_run` mode.

### Subreddit

Yes, the next step is the subreddit.

Create a subreddit that the bot account controls, or at least one where it is explicitly allowed to post. For the default workflow behavior, the cleanest setup is:

- the bot account is a moderator of the subreddit
- text posts are allowed if you plan to keep `REDDIT_POST_KIND=self`
- the subreddit rules allow release announcement posts
- post flair is optional unless you want every release post tagged

If you require flair for submissions, note the flair template ID and set `REDDIT_POST_FLAIR_ID` in the workflow environment later.

### Reddit app

After the subreddit exists, open `https://www.reddit.com/prefs/apps` while logged into the bot account and create an app with these settings:

- app type: `script`
- name: anything descriptive, for example `Maintainerr Release Bot`
- redirect URI: any placeholder URI is fine for a script app, for example `http://localhost:8080`

Save the generated client ID and client secret. Those are the values used for `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`.

### GitHub configuration

Set these secrets in GitHub Actions before enabling the workflow:

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USERNAME`
- `REDDIT_PASSWORD`

Set this repository variable, or pass it as a manual workflow input:

- `REDDIT_SUBREDDIT`

If your subreddit requires flair, also set one or both of these environment values where you run the bot:

- `REDDIT_POST_FLAIR_ID`
- `REDDIT_POST_FLAIR_TEXT`

Use a descriptive Reddit user-agent. If you do not set `REDDIT_USER_AGENT`, the bot generates one from the configured username.

### First run

Once the subreddit and app are ready, run the workflow manually with `dry_run: true` first. That lets you confirm:

- the Reddit login works
- the subreddit name is correct
- the generated title/body look right
- duplicate detection behaves as expected

When the dry run looks correct, rerun without `dry_run` to publish the first post.

## Workflow inputs

The bot reads GitHub release information from one of these sources:

1. `GITHUB_EVENT_PATH` when running inside the release workflow
2. `RELEASE_TAG` plus `GITHUB_REPOSITORY`
3. Manual workflow inputs

Supported environment variables:

- `GITHUB_REPOSITORY`
- `GITHUB_TOKEN` or `GH_TOKEN`
- `RELEASE_TAG`
- `REDDIT_SUBREDDIT`
- `REDDIT_POST_KIND` as `self` or `link`
- `REDDIT_POST_TITLE_TEMPLATE`
- `REDDIT_POST_BODY_TEMPLATE`
- `REDDIT_ALLOW_REPOST`
- `REDDIT_RELEASE_NOTES_MAX_CHARS`
- `REDDIT_POST_NSFW`
- `REDDIT_POST_SPOILER`
- `REDDIT_POST_SEND_REPLIES`

Template placeholders:

- `{{releaseName}}`
- `{{releaseTag}}`
- `{{repo}}`
- `{{repoName}}`
- `{{releaseUrl}}`
- `{{releaseBody}}`
- `{{marker}}`

The default self-post body includes a hidden marker so reruns can detect duplicates in the subreddit's recent posts.

## GitHub Actions workflow

The workflow runs automatically on `release.published` and can also be triggered manually. Manual runs let you override:

- release tag
- subreddit
- post kind
- dry-run mode
- duplicate repost behavior

Start with `dry_run: true` until the bot account is approved in your subreddit and the formatting looks right.