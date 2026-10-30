// 05.3-40 (DSV-06, UI-SPEC "Layer cards and question blocks"): the layer cards of the Check screen, mounted through
// CheckScreen's renderLayers slot. Each shows in canonical order when the engine's layer list (Purchase.layers) asks for it,
// and rises in on first reveal (RiseIn). The polite "{layer} questions added" announcement is made once by CheckScreen from
// the same layer list, so it is not repeated here. A layer that no longer shows is only hidden: its stored answers stay (I43).
// 05.3-42: the value (L2), major-asset (L6) and very-large (L7) cards are stored only (D-18) and sit in canonical order.
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import type { CheckV2, Evaluation, Layer } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { RiseIn } from '@/features/decide/ui/RiseIn';
import { useRecordContext } from '@/features/record/useRecordContext';
import { space } from '@/theme/layout';
import { layerVisibility } from '../model/layerVisibility';
import type { PrefillSeries } from '../model/costPrefill';
import { ItemCostsCard, costsPresetOf } from './ItemCostsCard';
import { MajorAssetCard } from './MajorAssetCard';
import { PaymentPlanCard } from './PaymentPlanCard';
import { PurposeBlock } from './PurposeBlock';
import { ValueCard } from './ValueCard';
import { VeryLargeCard } from './VeryLargeCard';

export interface LayerStackProps {
  check: CheckV2;
  evaluation: Evaluation | null;
  edit(next: CheckV2): void;
  checkId: string;
  readOnly?: boolean;
}

const NO_LAYERS: readonly Layer[] = [];
const NO_SERIES: readonly PrefillSeries[] = [];

export function LayerStack({ check, evaluation, edit, checkId, readOnly = false }: LayerStackProps): React.JSX.Element {
  const rc = useRecordContext();
  const seriesRows = useRecurringSeries(rc.householdId ?? undefined).data;
  const categories = useCategoryLookup(rc.userId ?? undefined);

  const prefillSeries = useMemo<readonly PrefillSeries[]>(() => {
    if (seriesRows === undefined) return NO_SERIES;
    return seriesRows
      .filter((s) => s.deleted_at === null && s.end_date === null)
      .map((s) => ({
        id: s.id,
        name: s.name,
        amount: minorUnits(s.amount),
        categoryKey: s.category_id === null ? null : (categories.byId.get(s.category_id)?.builtin_key ?? null),
        freq: s.freq,
      }));
  }, [seriesRows, categories.byId]);

  const layers = evaluation?.purchase?.layers ?? evaluation?.result.layers ?? NO_LAYERS;
  const band = evaluation?.purchase?.band ?? evaluation?.result.band ?? null;
  const vis = layerVisibility({ layers, band, payMode: check.pay.mode, purpose: check.purpose });

  return (
    <View style={styles.stack}>
      {vis.purpose ? (
        <RiseIn key="purpose">
          <PurposeBlock check={check} edit={edit} readOnly={readOnly} />
        </RiseIn>
      ) : null}
      {vis.value ? (
        <RiseIn key="value">
          <ValueCard check={check} edit={edit} currency={rc.homeCurrency} readOnly={readOnly} />
        </RiseIn>
      ) : null}
      {vis.plan && check.pay.mode === 'plan' ? (
        <RiseIn key="plan">
          <PaymentPlanCard check={check} evaluation={evaluation} edit={edit} checkId={checkId} currency={rc.homeCurrency} readOnly={readOnly} />
        </RiseIn>
      ) : null}
      {vis.costs && costsPresetOf(check) !== null ? (
        <RiseIn key="costs">
          <ItemCostsCard check={check} edit={edit} currency={rc.homeCurrency} prefillSeries={prefillSeries} readOnly={readOnly} />
        </RiseIn>
      ) : null}
      {vis.major ? (
        <RiseIn key="major">
          <MajorAssetCard check={check} edit={edit} currency={rc.homeCurrency} readOnly={readOnly} />
        </RiseIn>
      ) : null}
      {vis.veryLarge ? (
        <RiseIn key="veryLarge">
          <VeryLargeCard check={check} edit={edit} currency={rc.homeCurrency} stagedRequired={vis.staged} readOnly={readOnly} />
        </RiseIn>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
});
