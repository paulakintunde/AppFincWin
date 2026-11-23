/**
 * 10-13 (D-28, UI-SPEC section 7): the calm note for a long queue. A plain NoticeCard: no badge, no warning colour. At 400
 * it says how many changes are waiting; at 500 it gives the owner's sentence. Renders nothing below 400.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { NoticeCard } from '@/features/plans/components/NoticeCard';
import type { QueueCapState } from '@/data/sync/queueCap';

export function QueueNote({ queued, state, testID = 'queue-note' }: { queued: number; state: QueueCapState; testID?: string }) {
  const { t } = useTranslation();
  if (state === 'ok') return null;
  return (
    <NoticeCard
      testID={testID}
      title={t('system.queue.noteTitle', { count: queued })}
      body={state === 'blocked' ? t('system.queue.fullBody', { count: queued }) : t('system.queue.noteBody')}
    />
  );
}
