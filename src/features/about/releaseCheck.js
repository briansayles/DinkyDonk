const latestReleaseUrl =
  "https://api.github.com/repos/briansayles/DinkyDonk/releases/latest";

export const releasesPageUrl =
  "https://github.com/briansayles/DinkyDonk/releases";

function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    throw new Error(`Invalid version: ${version}`);
  }
  const numbers = match.slice(1, 4).map(Number);
  if (!numbers.every(Number.isSafeInteger)) {
    throw new Error(`Invalid version: ${version}`);
  }
  return { numbers, prerelease: Boolean(match[4]) };
}

export async function checkForNewRelease(currentVersion, signal) {
  const current = parseVersion(currentVersion);
  const response = await fetch(latestReleaseUrl, { signal });
  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status}`);
  }
  const release = await response.json();
  if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string") {
    throw new Error("GitHub returned an invalid release.");
  }
  const tag = /^(?:app-|DinkyDonk-)?v(.+)$/i.exec(release.tag_name);
  if (!tag) {
    throw new Error(`Unrecognized release tag: ${release.tag_name}`);
  }
  const latest = parseVersion(tag[1]);
  if (latest.prerelease) {
    throw new Error(`Latest release is a prerelease: ${release.tag_name}`);
  }
  for (let index = 0; index < latest.numbers.length; index += 1) {
    if (latest.numbers[index] !== current.numbers[index]) {
      return latest.numbers[index] > current.numbers[index] ? tag[1] : null;
    }
  }
  return current.prerelease ? tag[1] : null;
}
