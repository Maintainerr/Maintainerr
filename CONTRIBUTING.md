# Contributing to Maintainerr

All help is welcome and greatly appreciated! If you would like to contribute to the project, the following instructions should get you started...

## Development

### Quick Start with Dev Containers (Recommended)

The easiest way to start developing is using VS Code Dev Containers or GitHub Codespaces. This provides a pre-configured environment with all dependencies and tools ready to go.

**Prerequisites:**

- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

**Steps:**

1. Clone or fork the repository
2. Open in VS Code
3. Click "Reopen in Container" when prompted (or press F1 → "Dev Containers: Reopen in Container")
4. Wait for the container to build and dependencies to install (5-10 minutes first time)
5. Run `yarn dev` to start developing

For detailed information, see the [Dev Container README](.devcontainer/README.md).

**Using GitHub Codespaces:**

1. Click the "Code" button on GitHub
2. Select "Codespaces" → "Create codespace on main"
3. Wait for the environment to build
4. Start developing!

### Manual Setup (Alternative)

If you prefer to set up your development environment manually (specific to a Windows Development environment):

#### Tools Required

- HTML/TypeScript/JavaScript editor
- [VSCode](https://code.visualstudio.com/) is recommended. Upon opening the project, a few extensions will be automatically recommended for install.
- [NodeJS](https://nodejs.org/en/download/) (Node 20.x or higher)
- [Git](https://git-scm.com/downloads)

#### Getting Started

1. [Fork](https://help.github.com/articles/fork-a-repo/) the repository to your own GitHub account and [clone](https://help.github.com/articles/cloning-a-repository/) the fork to your local device:

   ```bash
   git clone https://github.com/YOUR_USERNAME/Maintainerr.git
   cd Maintainerr/
   ```

2. Add the remote `upstream`:

   ```bash
   git remote add upstream https://github.com/Maintainerr/Maintainerr.git
   ```

3. Create a new branch:

   ```bash
   git checkout -b <YOUR_NEW_BRANCH_NAME> main
   ```

   - It is recommended to give your branch a meaningful name, relevant to the feature or fix you are working on.
     - Good examples:
       - `docs-docker-setup`
       - `feat-new-system`
       - `fix-title-cards`
       - `ci-improve-build`
     - Bad examples:
       - `bug`
       - `docs`
       - `feature`
       - `fix`
       - `patch`

4. Activate the correct Yarn version. (_Note: In order to run `corepack enable`, you will need to be running cmd or PowerShell as an Administrator._)

   ```bash
   corepack install
   corepack enable
   ```

5. Install dependencies

   ```bash
   yarn
   ```

6. As of Maintainerr v2.0, the project looks to ensure you have read/write permissions on the `data` directory. This `data` directory does not exist when you first clone your fork. Before running the below commands, create a folder inside of your main Maintainerr directory named `data`, and ensure it has full permissions to the `Everyone` user.

   ```bash
   example ->  C:\Users\You\Documents\GitRepos\Maintainerr\data
   ```

7. Run the development command

   ```bash
   yarn dev
   ```

   - If the build fails with PowerShell, try to use cmd instead.

8. Make your code changes/improvements and test that they work as intended.
   - Be sure to follow both the [code](#contributing-code) and [UI text](#ui-text-style) guidelines.
   - Should you need to update your fork (from any recent ORIGIN changes), you can do so by rebasing from `upstream`:

     ```bash
     git fetch upstream
     git rebase upstream/main
     git push origin BRANCH_NAME -f
     ```

### Contributing Code

- If you are taking on an existing bug or feature ticket, please comment on the [issue](https://github.com/Maintainerr/Maintainerr/issues) to avoid multiple people working on the same thing.
- If you have a major change or large feature to contribute, reach out via [Discussions](https://github.com/Maintainerr/Maintainerr/discussions) or our [Discord server](https://discord.gg/WP4ZW2QYwk) first to align on design and approach! It'll save us all time, as the review will be quicker, and we will have more context about your change, allowing us to guide you in the right direction.
  - You can create a "draft" pull request early to get feedback on your work.
- Large PRs (>500 lines changed, excluding tests) should be split into smaller, manageable parts by stacking your PRs sequentially. This approach makes the review process significantly easier when done in order.
- Each PR should target one major meaningful change, which allows us to review independent changes separately, rather than having everything blocked on a single review.
- All commits **must** follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  - Pull requests with commits not following this standard will **not** be merged.
- Please make meaningful commits, or squash them prior to opening a pull request.
  - Do not squash commits once people have begun reviewing your changes.
- Always rebase your commit to the latest `main` branch. Do **not** merge `main` into your branch.
- It is your responsibility to keep your branch up-to-date. Your work will **not** be merged unless it is rebased off the latest `main` branch.
- Your code **must** be formatted correctly.
  - We use Prettier to format our code base. It is recommended to have the Prettier extension installed in your editor and to format on save. Alternatively, you can run `yarn format` to format.
- Contributors should be prepared to explain their design decisions and trade-offs during review.

## Use of AI Tools

We allow the use of AI tools (e.g. ChatGPT, GitHub Copilot, Claude) as development aids, but not as a substitute for understanding.

By submitting a pull request, you confirm that:

- You understand the code you are submitting and can explain how it works
- You have reviewed any AI-assisted output for correctness, security, performance, and maintainability
- You have tested the change appropriately in the context of Maintainerr
- You take full responsibility for the contribution, regardless of how it was produced

Pull requests that appear to be largely unreviewed, low-effort, or misaligned with Maintainerr’s design and coding standards may be closed without detailed feedback.

### UI Text Style

When adding new UI text, please try to adhere to the following guidelines:

1. Be concise and clear, and use as few words as possible to make your point.
2. Use the Oxford comma where appropriate.
3. Use the appropriate Unicode characters for ellipses, arrows, and other special characters/symbols.
4. Capitalize proper nouns, such as Plex, Radarr, Sonarr, Telegram, Slack, Pushover, etc. Be sure to also use the official capitalization for any abbreviations; e.g., IMDb has a lowercase 'b', whereas TMDB and TheTVDB have a capital 'B'.
5. Title case headings, button text, and form labels. Note that verbs such as "is" should be capitalized, whereas prepositions like "from" should be lowercase (unless as the first or last word of the string, in which case they are also capitalized).
6. Capitalize the first word in validation error messages, dropdowns, and form "tips." These strings should not end in punctuation.
7. Ensure that toast notification strings are complete sentences ending in punctuation.
8. If an additional description or "tip" is required for a form field, it should be styled using the global CSS class `label-tip`.
9. In full sentences, abbreviations like "info" or "auto" should not be used in place of full words, unless referencing the name/label of a specific setting or option which has an abbreviation in its name.
10. Do your best to check for spelling errors and grammatical mistakes.
11. Do not misspell "Maintainerr."

## Attribution

This contribution guide was inspired by the [Overseerr](https://github.com/sct/overseerr) contribution guide.
