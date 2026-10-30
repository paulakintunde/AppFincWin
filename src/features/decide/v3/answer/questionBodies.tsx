// 05.3-41 (D-07, D-08): which body answers which in-place question. The seven question codes (QUESTION_CODES) each have one;
// any other missing code is a list line in the needs-input card, never a question, so asking for its body is a bug.
import React from 'react';
import type { MissingCode } from '@/engine/decide/v3';
import { AccountUseBody } from '../ask/AccountUseBody';
import { PayArrivalBody } from '../ask/PayArrivalBody';
import { VolatileCoverBody } from '../ask/VolatileCoverBody';
import { ExpectedIncomeBody } from '../askMore/ExpectedIncomeBody';
import { IncomePatternBody } from '../askMore/IncomePatternBody';
import { UnexplainedBody } from '../askMore/UnexplainedBody';
import { UnspentBody } from '../askMore/UnspentBody';
import type { AskBodyProps } from '../model/ask';

export function renderQuestionBody(code: MissingCode, props: AskBodyProps): React.JSX.Element {
  switch (code) {
    case 'account_use_question':
      return <AccountUseBody {...props} />;
    case 'pay_arrival_question':
      return <PayArrivalBody {...props} />;
    case 'unspent_not_confirmed':
      return <UnspentBody {...props} />;
    case 'unexplained_money_question':
      return <UnexplainedBody {...props} />;
    case 'income_pattern_unconfirmed':
      return <IncomePatternBody {...props} />;
    case 'expected_income_needed':
      return <ExpectedIncomeBody {...props} />;
    case 'volatile_cover_question':
      return <VolatileCoverBody {...props} />;
    default:
      throw new RangeError(`no in-place body for ${code}`);
  }
}
