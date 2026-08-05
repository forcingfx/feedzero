/** Type surface for scripts/ship/verify-deploy.mjs. */

export interface HealthSnapshot {
  ok: boolean;
  /** Short SHA the deployment reports, or "unknown". */
  commit: string;
}

export interface DeployVerdict {
  live: boolean;
  reason: string;
}

export function isDeployLive(params: {
  /** null when health could not be fetched. */
  health: HealthSnapshot | null;
  /** Full SHA of the commit that must be live. */
  targetCommit: string;
}): DeployVerdict;
