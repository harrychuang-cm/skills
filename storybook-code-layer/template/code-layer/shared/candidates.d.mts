export type RebindTargetLike = { source: string; rootless?: boolean; duplicate: boolean; resolution: string };
export function isRebindTarget(token: RebindTargetLike | null | undefined): boolean;
export function rebindTargets<T extends RebindTargetLike>(tokens: Iterable<T>): T[];
