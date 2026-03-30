## Summary

Promotes the current `development` branch state to `main` for release.

## Notes

- `development` is the source branch for ongoing work.
- `main` is the stable release branch.
- This PR should be squash-merged.
- Create or update this PR with `./release.sh prepare-pr`.
- When the PR is approved, release automation continues automatically.
- Approval triggers the remaining release steps: squash-merge into `main`, sync back branches, and run `Release 4 - Build Main`.
- If sync-back needs to be rerun manually, run `./release.sh sync-back --dry-run` and then `./release.sh sync-back`.
- The manual release workflow starts only after the post-merge sync-back is complete.
- Trigger the final release from `main` with `REF=main ./release.sh release`.

## Test Plan

- [ ] Run `./release.sh prepare-pr`
- [ ] Review the changed files and commit list in this PR
- [ ] Approve this PR to continue release automation
- [ ] If sync-back needs to be rerun, run `./release.sh sync-back --dry-run`
- [ ] If sync-back needs to be rerun, run `./release.sh sync-back`
- [ ] Run `REF=main ./release.sh release`
