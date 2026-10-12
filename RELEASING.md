# How to publish a release (easy steps)

The release archive (`paymenter.tar.gz`) is built by GitHub Actions, not on your computer. Releases are cut from `master`.

## One time setup
1. Go to **Settings -> Actions -> General**, make sure Actions are enabled and
   "Workflow permissions" is set to **Read and write permissions**. Save.

## Every release
1. Open the **Actions** tab, pick **Release** in the left list, click **Run workflow**.
2. Branch: `master`. Version: for example `v2.0.0-alpha.4` (no spaces). Click the green button.
   - Names containing `alpha`, `beta` or `rc` are marked as pre-releases.
   - Use a version that was never released: the run creates the branch `release/<version>` and fails if it already exists (`v1.5.9`, `v2.0.0-alpha.1` to `v2.0.0-alpha.3` are taken).
3. Wait about 5-10 minutes until the run is green.
4. Open **Releases**: a **draft** release is there with `paymenter.tar.gz` and `checksum.txt`. Click **Edit -> Publish release**.

## Installing / updating from the archive
Download links: `https://github.com/lungustefan/Paymenter/releases/download/<version>/paymenter.tar.gz`
(`/releases/latest` ignores pre-releases, so it does not work while only alphas exist).
- New install: extract into an empty folder, then follow "Installation" in the README (the archive is pre-built).
- Update: `bash update.sh` in the install folder (newest release, pre-releases included), or `bash update.sh --version=<version>`.

## Docker image
The workflow **Docker** (`.github/workflows/docker.yaml`) builds `ghcr.io/lungustefan/paymenter` for linux/amd64 and linux/arm64 (one native runner per platform, merged into one tag):
- when you **publish** a release: the image gets the tag of the release (e.g. `v2.0.0-alpha.1`), and `latest` only if the release is not a pre-release;
- by hand (Actions > Docker > Run workflow, branch `master`): the image gets the tag `master` (used by `docker-compose.beta.yml`). It does not run on every push to master.

**One time, after the first image was pushed:** a new GitHub package is private, nobody can `docker pull` it until you make it public. Open your profile > **Packages** > **paymenter** > **Package settings** > **Change visibility** > **Public**. (If the package is not linked to this repository, use "Connect repository" on the same page.)
