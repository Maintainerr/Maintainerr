import { readFileSync } from 'node:fs';
import { createFider } from './fider-shared.mjs';

const {
  FIDER_HOST,
  FIDER_API_KEY,
  GITHUB_TOKEN,
  DRY_RUN = 'false',
  // Optional override if you ever move CODEOWNERS or want a different source.
  CODEOWNERS_PATH = '.github/CODEOWNERS',
  // Subject + message can be tweaked without touching the script.
  INVITE_SUBJECT = "You're invited to Maintainerr feature requests",
  INVITE_MESSAGE = `Hi,

You've been invited to join the Maintainerr feature-request board (Fider) because you're listed in the project's CODEOWNERS.

Click here to accept: %invite%

— automated`,
} = process.env;

const dryRun = DRY_RUN === 'true';
const log = (msg) => process.stderr.write(`[fider-invite] ${msg}\n`);

const requireEnv = () => {
  const missing = [];
  if (!FIDER_HOST) missing.push('FIDER_HOST');
  if (!FIDER_API_KEY) missing.push('FIDER_API_KEY');
  if (!GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);
};

const fider = createFider({ host: FIDER_HOST, apiKey: FIDER_API_KEY });

const ghApi = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${path} → ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.json();
};

// CODEOWNERS lines look like "<pattern> @user1 @user2 @org/team". Extract the
// individual @user handles (skip @org/team — those are GitHub teams, not
// people we can email-invite).
const parseCodeowners = () => {
  const text = readFileSync(CODEOWNERS_PATH, 'utf8');
  const users = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    for (const match of line.matchAll(/@([a-zA-Z0-9][a-zA-Z0-9-]{0,38})\b(?!\/)/g)) {
      users.add(match[1]);
    }
  }
  return [...users];
};

const main = async () => {
  requireEnv();
  log(`dryRun=${dryRun}`);

  const codeowners = parseCodeowners();
  if (codeowners.length === 0) {
    log('no individual CODEOWNERS found; nothing to invite');
    return;
  }
  log(`CODEOWNERS users: ${codeowners.join(', ')}`);

  // Look up each CODEOWNER's public GitHub email. Users with private email
  // visibility return null; we can't invite them automatically and skip.
  const emails = [];
  const skipped = [];
  for (const username of codeowners) {
    try {
      const info = await ghApi(`/users/${username}`);
      if (info.email) {
        emails.push({ username, email: info.email });
      } else {
        skipped.push(`${username} (no public email)`);
      }
    } catch (err) {
      skipped.push(`${username} (lookup failed: ${err.message})`);
    }
  }
  if (skipped.length > 0) {
    log(`skipped: ${skipped.join('; ')}`);
  }
  if (emails.length === 0) {
    log('no invitable emails resolved; nothing to do');
    return;
  }

  // Skip CODEOWNERS who are already Collaborator (role=2) or Administrator
  // (role=1) on Fider — they're fully onboarded. Visitors and people not in
  // Fider at all still get an invite. Fider doesn't expose user email
  // through the public users endpoint, so we match on display-name
  // (case-insensitive); a false negative is just a re-sent invite.
  let onboardedNames = new Set();
  try {
    const users = await fider('/api/v1/users');
    if (Array.isArray(users)) {
      onboardedNames = new Set(
        users
          .filter((u) => u && (u.role === 1 || u.role === 2 || u.role === 'administrator' || u.role === 'collaborator'))
          .map((u) => (u.name || '').toLowerCase())
          .filter(Boolean),
      );
    }
    log(`Fider has ${onboardedNames.size} Collaborator/Administrator(s)`);
  } catch (err) {
    log(`could not fetch Fider users (${err.message}); will invite without de-dupe`);
  }

  const toInvite = emails.filter(({ username }) => !onboardedNames.has(username.toLowerCase()));
  if (toInvite.length === 0) {
    log('all CODEOWNERS are already Collaborator/Administrator on Fider; nothing to invite');
    return;
  }

  log(`will invite ${toInvite.length}: ${toInvite.map((e) => `${e.username}<${e.email}>`).join(', ')}`);
  if (dryRun) {
    log('[dry-run] not sending invitations');
    return;
  }

  await fider('/api/v1/invitations/send', {
    method: 'POST',
    body: JSON.stringify({
      recipients: toInvite.map((e) => e.email),
      subject: INVITE_SUBJECT,
      message: INVITE_MESSAGE,
    }),
  });
  log(`sent ${toInvite.length} invitation(s)`);
};

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(1);
});
