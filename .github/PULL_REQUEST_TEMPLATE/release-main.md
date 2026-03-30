## Summary

Promotes the current `development` branch state to `main` for release.

## Notes

- `development` is the source branch for ongoing work.
- `main` is the stable release branch.
- This PR should be squash-merged.
- Create or update this PR with `./release.sh prepare-pr`.
- When the PR is approved, release automation continues automatically.
- Approval triggers `Release 2 - Queue Push PR To Main`.
- `Release 2.5 - Execute Push PR To Main` reloads the PR state, confirms the approving CODEOWNER still has an active approval, waits for non-release checks to finish, then continues the remaining release steps.
- The remaining release steps are: squash-merge into `main`, sync back branches, and run `Release 4 - Build Main`.
- If checks or branch protection still block the merge, release automation comments on this PR with the blocker.
- If the flow succeeds, release automation posts a final summary comment with the merge, sync-back, and build results.
- The manual release workflow starts only after the post-merge sync-back is complete.
- Trigger the final release from `main` with `REF=main ./release.sh release`.

## Test Plan

- [ ] Run `./release.sh prepare-pr`
- [ ] Review the changed files and commit list in this PR
- [ ] Approve this PR to trigger `Release 2 - Queue Push PR To Main` and `Release 2.5 - Execute Push PR To Main`
- [ ] Confirm the PR was squash-merged into `main`, sync-back completed, and `Release 4 - Build Main` finished
- [ ] Run `REF=main ./release.sh release`
