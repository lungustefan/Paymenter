# How to publish a release (easy steps)

The release archive (`paymenter.tar.gz`) is built by GitHub Actions, not on your computer. Releases are cut from `master`.

## One time setup
1. Go to **Settings -> Actions -> General**, make sure Actions are enabled and
   "Workflow permissions" is set to **Read and write permissions**. Save.

## Every release
1. Open the **Actions** tab, pick **Release** in the left list, click **Run workflow**.
2. Branch: `master`. Version: for example `v2.0.0-alpha.5` (no spaces). Click the green button.
   - Names containing `alpha`, `beta` or `rc` are marked as pre-releases.
   - The version must be new: the run creates the branch `release/<version>` and fails if it already exists.
3. Wait about 5-10 minutes until the run is green.
4. Open **Releases**: a **draft** release is there with `paymenter.tar.gz` and `checksum.txt`. Click **Edit -> Publish release**.

## Installing / updating from the archive
Download links: `https://github.com/lungustefan/Paymenter/releases/download/<version>/paymenter.tar.gz`
(`/releases/latest` ignores pre-releases, so it does not work while only alphas exist).
- New install: extract into an empty folder, then follow "Installation" in the README (the archive is pre-built).
- Update: `bash update.sh` in the install folder (newest release, pre-releases included), or `bash update.sh --version=<version>`.
