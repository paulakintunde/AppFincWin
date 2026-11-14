/**
 * 06.2-04: the Activity calendar legend and its dot words. Owner plan: 12. Board source: L03.
 * 06.2-12: the spoken forms each day cell adds (spend band and bill due), the legend's group label and the day sheet's
 * close word.
 */
export const calendar = {
  under: 'Under {{amount}}',
  between: '{{low}} to {{high}}',
  over: 'Over {{amount}}',
  billDue: 'Bill due',
  spentUnderA11y: 'spent under {{amount}}',
  spentBetweenA11y: 'spent {{low}} to {{high}}',
  spentOverA11y: 'spent over {{amount}}',
  billDueA11y: 'bill due',
  legendA11y: 'Dot size shows what was spent that day',
  close: 'Close',
} as const;
