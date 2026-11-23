/**
 * Phase 10 copy (10-04), UI-SPEC sections 1-12. system.* namespace; top-level lock.* and importCsv.* already exist.
 * Draft unless a key is in EXACT_SYSTEM_KEYS (src/i18n/copyStatus.ts); owner wording sign-off before the freeze. Declarative, never advice.
 */
import { alerts } from './alerts';
import { appLock } from './appLock';
import { archive } from './archive';
import { ownData } from './ownData';
import { push } from './push';
import { queue } from './queue';
import { reviewer } from './reviewer';
import { security } from './security';

export const system = { appLock, security, alerts, push, archive, ownData, queue, reviewer };
