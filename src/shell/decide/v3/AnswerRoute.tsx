// 05.3-41 (DSV-07, DSV-08, DSV-13, DSV-15): the body of /decide/answer/[id], behind the v3 gate (D-04). The record provider
// supplies Record as bought / Plan it / Not buying to the record sheets (they may not import the writes themselves); the
// readiness provider supplies the readiness answers and Ask again (05.3-FIX-depcruise).
import React from 'react';
import { AnswerScreen } from '@/features/decide/v3/answer/AnswerScreen';
import { ReadinessAnswerProvider } from '../ReadinessAnswerProvider';
import { V3RecordProvider } from '../V3RecordProvider';
import { V3Gate } from './V3Gate';

export function AnswerRoute({ id }: { id: string }): React.JSX.Element {
  return (
    <V3Gate>
      <V3RecordProvider>
        <ReadinessAnswerProvider>
          <AnswerScreen id={id} />
        </ReadinessAnswerProvider>
      </V3RecordProvider>
    </V3Gate>
  );
}
