# How to publish a release (easy steps)

The release archive (`paymenter.tar.gz`) is built by GitHub Actions, not on your computer.

## One time setup
1. Open https://github.com/lungustefan/Paymenter/pull/1 and click **Merge pull request**.
   (`release/v1.5.9` now contains the Next.js rewrite and the release workflow.)
2. Go to **Settings -> Branches** and change the **default branch** to `release/v1.5.9`.
   (GitHub only shows the "Run workflow" button for workflows that exist on the default branch. `master` is the old PHP code, so it does not have it.)
3. Go to **Settings -> Actions -> General**, make sure Actions are enabled and
   "Workflow permissions" is set to **Read and write permissions**. Save.

## Every release
1. Open the **Actions** tab, pick **Release** in the left list, click **Run workflow**.
2. Branch: `release/v1.5.9`. Version: for example `v2.0.0-alpha.1` (no spaces). Click the green button.
   - Names containing `alpha`, `beta` or `rc` are marked as pre-releases.
   - Do **not** use `v1.5.9`: the branch `release/v1.5.9` already exists and the run would fail.
3. Wait about 5-10 minutes until the run is green.
4. Open **Releases**: a **draft** release is there with `paymenter.tar.gz` and `checksum.txt`. Click **Edit -> Publish release**.

## Installing from the archive
```bash
curl -L https://github.com/lungustefan/Paymenter/releases/latest/download/paymenter.tar.gz | tar -xz
```
then follow "Installation" in the README (the archive already contains the build, skip `pnpm build`).
(`latest` ignores pre-releases: for an alpha use the download link on the release page.)
