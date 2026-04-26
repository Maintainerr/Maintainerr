import { readFileSync } from 'node:fs';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const REDDIT_AUTH_BASE_URL = 'https://www.reddit.com';
const REDDIT_OAUTH_BASE_URL = 'https://oauth.reddit.com';
const DEFAULT_RELEASE_NOTES_MAX_CHARS = 8000;
const DEFAULT_RECENT_POST_LIMIT = 25;

const requiredEnv = (env, key) => {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const optionalValue = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
};

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
};

const parseInteger = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const buildUserAgent = (env) => {
  const explicit = optionalValue(env.REDDIT_USER_AGENT);
  if (explicit) {
    return explicit;
  }

  const username = optionalValue(env.REDDIT_USERNAME) ?? 'maintainerr';
  const appId = optionalValue(env.REDDIT_APP_ID) ?? 'maintainerr.release-bot';
  const version = optionalValue(env.REDDIT_APP_VERSION) ?? '0.1.0';
  const platform = optionalValue(env.REDDIT_APP_PLATFORM) ?? 'script';
  return `${platform}:${appId}:${version} (by /u/${username})`;
};

const withRawJson = (url) => {
  if (!url.searchParams.has('raw_json')) {
    url.searchParams.set('raw_json', '1');
  }
  return url;
};

const createHeaders = (headers) => {
  const normalized = new Headers(headers ?? {});
  if (!normalized.has('accept')) {
    normalized.set('accept', 'application/json');
  }
  return normalized;
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Expected JSON response from ${response.url}, received: ${text.slice(0, 400)}`,
    );
  }
};

const getRateLimit = (response) => ({
  used: response.headers.get('x-ratelimit-used'),
  remaining: response.headers.get('x-ratelimit-remaining'),
  resetSeconds: response.headers.get('x-ratelimit-reset'),
});

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: createHeaders(options.headers),
  });
  const json = await parseJsonResponse(response);

  if (!response.ok) {
    const details = json ? JSON.stringify(json) : response.statusText;
    throw new Error(`HTTP ${response.status} from ${url}: ${details}`);
  }

  return {
    json,
    rateLimit: getRateLimit(response),
  };
};

const readGithubEventRelease = (eventPath) => {
  const payload = JSON.parse(readFileSync(eventPath, 'utf8'));
  return payload.release ?? null;
};

const getGithubHeaders = (token) => {
  const headers = {
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
};

const resolveReleaseFromGithub = async ({ repo, tag, token }) => {
  const releaseUrl = new URL(
    `${GITHUB_API_BASE_URL}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
  );
  const { json } = await fetchJson(releaseUrl, {
    headers: getGithubHeaders(token),
  });
  return json;
};

const trimReleaseNotes = (body, maxChars) => {
  const normalized = (body ?? '').trim();
  if (!normalized) {
    return 'Release notes were not provided in the GitHub release payload.';
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars).trimEnd()}\n\n...`; 
};

const applyTemplate = (template, values) => {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.split(`{{${key}}}`).join(value ?? '');
  }
  return output;
};

const getRepoName = (repo) => {
  const slashIndex = repo.indexOf('/');
  return slashIndex >= 0 ? repo.slice(slashIndex + 1) : repo;
};

const createMarker = ({ repo, tag }) => `<!-- release-bot:${repo}:${tag} -->`;

const buildDefaultTitle = ({ release, repo }) => {
  const repoName = getRepoName(repo);
  const version = release.name?.trim() || release.tag_name;
  return `${repoName} ${version} is out`;
};

const buildDefaultBody = ({ release, repo, marker, maxChars }) => {
  const repoName = getRepoName(repo);
  const version = release.name?.trim() || release.tag_name;
  const notes = trimReleaseNotes(release.body, maxChars);

  return [
    `${repoName} ${version} has been released.`,
    '',
    notes,
    '',
    `Release page: ${release.html_url}`,
    marker,
  ].join('\n');
};

const createPostPayload = ({ release, repo, kind, titleTemplate, bodyTemplate, maxChars }) => {
  const marker = createMarker({ repo, tag: release.tag_name });
  const values = {
    releaseName: release.name?.trim() || release.tag_name,
    releaseTag: release.tag_name,
    repo,
    repoName: getRepoName(repo),
    releaseUrl: release.html_url,
    releaseBody: trimReleaseNotes(release.body, maxChars),
    marker,
  };

  const title = optionalValue(titleTemplate)
    ? applyTemplate(titleTemplate, values)
    : buildDefaultTitle({ release, repo });

  const body = kind === 'self'
    ? optionalValue(bodyTemplate)
      ? applyTemplate(bodyTemplate, values)
      : buildDefaultBody({ release, repo, marker, maxChars })
    : undefined;

  return {
    kind,
    title,
    body,
    url: kind === 'link' ? release.html_url : undefined,
    marker,
  };
};

const formatRedditJsonErrors = (json) => {
  const errors = json?.json?.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return undefined;
  }

  return errors
    .map((entry) => {
      if (!Array.isArray(entry)) {
        return String(entry);
      }
      return entry.filter(Boolean).join(': ');
    })
    .join('; ');
};

const createBasicAuthHeader = (clientId, clientSecret) => {
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${token}`;
};

const getScriptCredentials = (env, overrides) => ({
  clientId: overrides.clientId ?? requiredEnv(env, 'REDDIT_CLIENT_ID'),
  clientSecret: overrides.clientSecret ?? requiredEnv(env, 'REDDIT_CLIENT_SECRET'),
  username: overrides.username ?? requiredEnv(env, 'REDDIT_USERNAME'),
  password: overrides.password ?? requiredEnv(env, 'REDDIT_PASSWORD'),
  userAgent: overrides.userAgent ?? buildUserAgent(env),
});

const fetchRedditAccessToken = async (env, overrides = {}) => {
  const credentials = getScriptCredentials(env, overrides);
  const body = new URLSearchParams({
    grant_type: 'password',
    username: credentials.username,
    password: credentials.password,
  });

  const { json, rateLimit } = await fetchJson(`${REDDIT_AUTH_BASE_URL}/api/v1/access_token`, {
    method: 'POST',
    headers: {
      authorization: createBasicAuthHeader(credentials.clientId, credentials.clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': credentials.userAgent,
    },
    body,
  });

  if (!json?.access_token) {
    throw new Error(`Reddit token response did not include an access token: ${JSON.stringify(json)}`);
  }

  return {
    accessToken: json.access_token,
    rateLimit,
    userAgent: credentials.userAgent,
  };
};

const redditRequest = async ({ path, method = 'GET', token, userAgent, form, query }) => {
  const url = withRawJson(new URL(`${REDDIT_OAUTH_BASE_URL}${path}`));

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    authorization: `bearer ${token}`,
    'user-agent': userAgent,
  };

  const options = {
    method,
    headers,
  };

  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(form);
  }

  return fetchJson(url, options);
};

const getSubredditDetails = async ({ subreddit, token, userAgent }) => {
  const { json } = await redditRequest({
    path: `/r/${encodeURIComponent(subreddit)}/about.json`,
    token,
    userAgent,
  });
  return json?.data ?? null;
};

const listRecentPosts = async ({ subreddit, token, userAgent, limit }) => {
  const { json, rateLimit } = await redditRequest({
    path: `/r/${encodeURIComponent(subreddit)}/new.json`,
    token,
    userAgent,
    query: { limit },
  });

  const children = json?.data?.children ?? [];
  return {
    posts: children.map((item) => item.data).filter(Boolean),
    rateLimit,
  };
};

const findExistingPost = ({ posts, marker, title, releaseUrl }) => {
  for (const post of posts) {
    if (post.selftext?.includes(marker)) {
      return post;
    }
    if (post.url === releaseUrl) {
      return post;
    }
    if (post.title === title) {
      return post;
    }
  }

  return null;
};

const buildPermalink = (permalink) => {
  if (!permalink) {
    return undefined;
  }
  return `https://www.reddit.com${permalink}`;
};

export const resolveRuntimeOptions = ({ env = process.env, overrides = {} } = {}) => {
  const repo = overrides.repo ?? optionalValue(env.GITHUB_REPOSITORY);
  const releaseTag =
    overrides.releaseTag ??
    optionalValue(env.RELEASE_TAG) ??
    optionalValue(env.GITHUB_REF_NAME);

  return {
    repo,
    releaseTag,
    subreddit: overrides.subreddit ?? optionalValue(env.REDDIT_SUBREDDIT),
    kind: overrides.kind ?? optionalValue(env.REDDIT_POST_KIND) ?? 'self',
    titleTemplate: overrides.titleTemplate ?? env.REDDIT_POST_TITLE_TEMPLATE,
    bodyTemplate: overrides.bodyTemplate ?? env.REDDIT_POST_BODY_TEMPLATE,
    dryRun: overrides.dryRun ?? parseBoolean(env.DRY_RUN, false),
    allowRepost: overrides.allowRepost ?? parseBoolean(env.REDDIT_ALLOW_REPOST, false),
    maxReleaseNotesChars:
      overrides.maxReleaseNotesChars ??
      parseInteger(env.REDDIT_RELEASE_NOTES_MAX_CHARS, DEFAULT_RELEASE_NOTES_MAX_CHARS),
    flairId: overrides.flairId ?? optionalValue(env.REDDIT_POST_FLAIR_ID),
    flairText: overrides.flairText ?? optionalValue(env.REDDIT_POST_FLAIR_TEXT),
    nsfw: overrides.nsfw ?? parseBoolean(env.REDDIT_POST_NSFW, false),
    spoiler: overrides.spoiler ?? parseBoolean(env.REDDIT_POST_SPOILER, false),
    sendReplies: overrides.sendReplies ?? parseBoolean(env.REDDIT_POST_SEND_REPLIES, true),
    recentPostLimit:
      overrides.recentPostLimit ??
      parseInteger(env.REDDIT_RECENT_POST_LIMIT, DEFAULT_RECENT_POST_LIMIT),
    githubToken:
      overrides.githubToken ?? optionalValue(env.GITHUB_TOKEN) ?? optionalValue(env.GH_TOKEN),
    eventPath: overrides.eventPath ?? optionalValue(env.GITHUB_EVENT_PATH),
    env,
  };
};

export const resolveRelease = async (options) => {
  if (options.release && typeof options.release === 'object') {
    return options.release;
  }

  if (options.eventPath) {
    const releaseFromEvent = readGithubEventRelease(options.eventPath);
    if (releaseFromEvent) {
      return releaseFromEvent;
    }
  }

  if (!options.repo) {
    throw new Error('Unable to resolve a GitHub release without GITHUB_REPOSITORY or an explicit repo override.');
  }

  if (!options.releaseTag) {
    throw new Error('Unable to resolve a GitHub release without RELEASE_TAG, GITHUB_REF_NAME, or a release event payload.');
  }

  return resolveReleaseFromGithub({
    repo: options.repo,
    tag: options.releaseTag,
    token: options.githubToken,
  });
};

export const previewReleasePost = async (overrides = {}) => {
  const options = resolveRuntimeOptions({ overrides });
  if (!options.subreddit) {
    throw new Error('A subreddit is required. Set REDDIT_SUBREDDIT or pass a subreddit override.');
  }

  if (!['self', 'link'].includes(options.kind)) {
    throw new Error(`Unsupported REDDIT_POST_KIND: ${options.kind}`);
  }

  const release = await resolveRelease({ ...options, ...overrides });
  const redditAuth = await fetchRedditAccessToken(options.env, overrides);
  const subreddit = await getSubredditDetails({
    subreddit: options.subreddit,
    token: redditAuth.accessToken,
    userAgent: redditAuth.userAgent,
  });

  const post = createPostPayload({
    release,
    repo: options.repo,
    kind: options.kind,
    titleTemplate: options.titleTemplate,
    bodyTemplate: options.bodyTemplate,
    maxChars: options.maxReleaseNotesChars,
  });

  const recent = await listRecentPosts({
    subreddit: options.subreddit,
    token: redditAuth.accessToken,
    userAgent: redditAuth.userAgent,
    limit: options.recentPostLimit,
  });

  const existingPost = findExistingPost({
    posts: recent.posts,
    marker: post.marker,
    title: post.title,
    releaseUrl: release.html_url,
  });

  return {
    repo: options.repo,
    subreddit: options.subreddit,
    release: {
      tag: release.tag_name,
      name: release.name,
      url: release.html_url,
      prerelease: Boolean(release.prerelease),
      draft: Boolean(release.draft),
    },
    subredditDetails: subreddit
      ? {
          title: subreddit.title,
          subscribers: subreddit.subscribers,
          over18: subreddit.over18,
        }
      : undefined,
    post,
    duplicate: existingPost
      ? {
          title: existingPost.title,
          permalink: buildPermalink(existingPost.permalink),
          createdUtc: existingPost.created_utc,
        }
      : null,
    rateLimit: recent.rateLimit,
  };
};

export const submitReleasePost = async (overrides = {}) => {
  const preview = await previewReleasePost(overrides);
  const options = resolveRuntimeOptions({ overrides });

  if (preview.duplicate && !options.allowRepost) {
    return {
      status: 'skipped',
      reason: 'duplicate-release-post-detected',
      preview,
    };
  }

  if (options.dryRun) {
    return {
      status: 'dry-run',
      preview,
    };
  }

  const redditAuth = await fetchRedditAccessToken(options.env, overrides);
  const form = {
    api_type: 'json',
    kind: preview.post.kind,
    sr: preview.subreddit,
    title: preview.post.title,
    sendreplies: String(Boolean(options.sendReplies)),
    nsfw: String(Boolean(options.nsfw)),
    spoiler: String(Boolean(options.spoiler)),
    resubmit: String(Boolean(options.allowRepost)),
  };

  if (preview.post.kind === 'self') {
    form.text = preview.post.body ?? '';
  }

  if (preview.post.kind === 'link') {
    form.url = preview.post.url ?? preview.release.url;
  }

  if (options.flairId) {
    form.flair_id = options.flairId;
  }

  if (options.flairText) {
    form.flair_text = options.flairText;
  }

  const { json, rateLimit } = await redditRequest({
    path: '/api/submit',
    method: 'POST',
    token: redditAuth.accessToken,
    userAgent: redditAuth.userAgent,
    form,
  });

  const errorText = formatRedditJsonErrors(json);
  if (errorText) {
    throw new Error(`Reddit rejected the submission: ${errorText}`);
  }

  const recent = await listRecentPosts({
    subreddit: preview.subreddit,
    token: redditAuth.accessToken,
    userAgent: redditAuth.userAgent,
    limit: options.recentPostLimit,
  });

  const submittedPost = findExistingPost({
    posts: recent.posts,
    marker: preview.post.marker,
    title: preview.post.title,
    releaseUrl: preview.release.url,
  });

  return {
    status: 'posted',
    preview,
    submittedPost: submittedPost
      ? {
          title: submittedPost.title,
          permalink: buildPermalink(submittedPost.permalink),
          id: submittedPost.id,
        }
      : undefined,
    rateLimit,
  };
};