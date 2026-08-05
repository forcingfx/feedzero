/** Type surface for scripts/resolve-image-version.mjs. */

export interface ImageVersionInputs {
  /** Explicit version from a reusable-workflow call; empty when absent. */
  input: string;
  /** GITHUB_REF_NAME — a `v`-prefixed tag or a branch name. */
  refName: string;
  pkgVersion: string;
}

export interface ResolvedImageVersion {
  ok: boolean;
  version: string;
  /** Major.minor, for the floating image tag. */
  minor: string;
  reason: string;
}

export function resolveImageVersion(
  params: ImageVersionInputs,
): ResolvedImageVersion;
