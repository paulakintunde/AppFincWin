// 05-117 (D-95..D-99, UI-SPEC R17.2, R17.3, R17.8, R17.13 M1): the Decide tab root, dark card first.
//   lean header (no eyebrow or subtitle, the header sync line suppressed) -> the notice row (only with counted problems)
//   -> the dark card (HomeSummaryCard) -> 32 of space -> up to four quiet rows that open their own screens.
// Month details, the problems sheet, RoughFiguresSheet and ChangeSheet are hosted here. D-107 (supersedes D-98's removal):
// the FAB is back with its 'New check' action; the scroll content keeps its FAB_CLEARANCE bottom inset.
// D-107: the Judge-on choice (useJudgeOn) drives the card, Month details and every check; `choose` is shared by the dropdown
// on the card and the radio list in Month details.
// No pull-to-refresh on Decide (no refreshKeys).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useDecideChanges } from '@/data/queries/decide';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useChooseJudgeOn } from '../judgeOn/useChooseJudgeOn';
import { useJudgeOn } from '../judgeOn/judgeOnStore';
import { useResolveJudgeOnDefault } from '../judgeOn/useResolveJudgeOnDefault';
import { useT } from '@/i18n';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import { useRegisterFab } from '@/shell/fab/FabProvider';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { FAB_CLEARANCE } from '@/shell/fab/useShellPositions';
import { space } from '@/theme/layout';
import { loadHomeBasisSeen, markHomeBasisSeen } from '../hints/decideHints';
import { perfMark } from '../perf/perfMarks';
import { parseCheckInputs } from '../snapshot/checkInputs';
import type { CheckInputs } from '../snapshot/types';
import { ChangeSheet } from './ChangeSheet';
import { CHANGES_HREF, checkHref, LINES_HREF, openNewCheck, OPEN_HREF, PAST_HREF } from './checkHref';
import { homeCardModel, type HomeJudgeOn } from './homeCardModel';
import { HomeNoticeRow } from './HomeNoticeRow';
import { homeProblems, noticeRowModel } from './homeProblems';
import { HomeProblemsSheet } from './HomeProblemsSheet';
import { HomeRow } from './HomeRow';
import { changedOpenCount, linesSetCount, liveOpenChecks } from './homeRowsModel';
import { HomeSummaryCard } from './HomeSummaryCard';
import { MonthDetailsSheet } from './MonthDetailsSheet';
import { RoughFiguresSheet } from './RoughFiguresSheet';
import { useDecideHomeViewModel } from './useDecideHomeViewModel';
import { useSyncNow } from './useSyncNow';

/** R17.2: the gap between the card and the quiet rows. */
const CARD_TO_ROWS_GAP = 32;

interface HomeRowSpec {
  key: string;
  label: string;
  value?: string;
  secondLine?: string;
  onPress: () => void;
}

export function DecideHomeScreen() {
  const t = useT();
  const rc = useRecordContext();
  const vm = useDecideHomeViewModel();
  const { create } = useCreateCheck();
  const changes = useDecideChanges(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const sync = useSyncStatus();
  const now = useSyncNow(sync);
  const [roughOpen, setRoughOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);

  // D-107: the FAB returns on Decide home with its previous action.
  const fab = useMemo(
    () => ({
      label: t('decide.fab.label'),
      accessibilityLabel: t('decide.fab.a11y'),
      onPress: () => openNewCheck('buy'),
    }),
    [t]
  );
  useRegisterFab(fab);

  // D-95: the "Now from your logged months" label shows on the first visit after the switch only. The stored flag is read
  // once per visit; until it has been read the normal label shows (a returning user never sees a flash of the switch label).
  // `visitBasisSeen` is never updated by the write below, so the label holds for the rest of the visit.
  const [visitBasisSeen, setVisitBasisSeen] = useState<boolean | null>(null);
  const userId = rc.userId;
  const { judgeOn: storedJudgeOn, pendingDefault } = useJudgeOn(userId);
  // The update-time default switch resolves first (re-baselining the checks); the card waits for it.
  useResolveJudgeOnDefault(userId);
  const judgeOn = pendingDefault ? null : storedJudgeOn;
  const { choose } = useChooseJudgeOn(userId ?? '');
  const onChooseJudgeOn = useCallback(
    (v: HomeJudgeOn) => {
      if (userId !== null) choose(v);
    },
    [choose, userId]
  );
  useEffect(() => {
    if (userId === null) return undefined;
    let live = true;
    loadHomeBasisSeen(userId).then(
      (seen) => {
        if (live) setVisitBasisSeen(seen);
      },
      () => {
        if (live) setVisitBasisSeen(false);
      }
    );
    return () => {
      live = false;
    };
  }, [userId]);
  const homeBasisSeen = visitBasisSeen ?? true;

  const card = useMemo(
    () => homeCardModel(vm.source, vm.settings, { status: vm.status, homeBasisSeen, today: vm.today, judgeOn }),
    [vm.source, vm.settings, vm.status, homeBasisSeen, vm.today, judgeOn]
  );
  const markedRef = useRef(false);
  const shouldMark = card.state === 'figure' && card.markBasisSeen && visitBasisSeen === false;
  useEffect(() => {
    // Storage only; no setState here.
    if (!shouldMark || markedRef.current || userId === null) return;
    markedRef.current = true;
    markHomeBasisSeen(userId).catch(() => {});
  }, [shouldMark, userId]);

  // D-23: "Run the full check" saves the quick-check fields as a new check and opens it at step 2.
  const runFull = useCallback(
    (inputs: CheckInputs) => {
      if (rc.userId === null || rc.householdId === null) return;
      const id = Crypto.randomUUID();
      create({
        userId: rc.userId,
        id,
        householdId: rc.householdId,
        kind: 'buy',
        name: inputs.name,
        inputs: inputs as unknown as Record<string, unknown>,
        furthestStep: 2,
      });
      pushOnce(checkHref(id, { step: '2' }));
    },
    [create, rc.userId, rc.householdId]
  );

  const meta = vm.source !== null && vm.source.kind === 'logged' ? vm.source.meta : null;
  const sourcesNote =
    meta !== null
      ? t('decide.home.sources', {
          months: meta.fullMonths,
          lines: meta.expenseLinesThisMonth,
          debts: meta.debtCount,
          accounts: meta.accountCount,
        })
      : vm.source !== null && vm.source.kind === 'rough'
        ? t('decide.home.sourcesRough')
        : null;

  // D-96: the problems list, live; the notice row counts only what the card does not already show.
  const entries = useMemo(
    () =>
      homeProblems({
        source: vm.source,
        openChecks: liveOpenChecks(vm.openChecks).map((row) => ({
          inputs: parseCheckInputs(row.inputs, vm.today),
          isSample: row.is_sample,
        })),
        sync,
        today: vm.today,
        now,
      }),
    [vm.source, vm.openChecks, vm.today, sync, now]
  );
  const notice = noticeRowModel(entries);

  // R18.1: the sheet title is the constant term on every state; the basis sits in its first meta line.
  const detailsTitle = t('decide.home.monthDetails.title');

  // Quiet rows (R17.3).
  const openCount = liveOpenChecks(vm.openChecks).length;
  const changedCount = useMemo(() => changedOpenCount(vm.source, vm.openChecks, vm.today), [vm.source, vm.openChecks, vm.today]);
  const changeCount = (changes ?? []).length;
  const setCount = linesSetCount(vm.settings, vm.currency);
  const rows: HomeRowSpec[] = [];
  if (openCount > 0) {
    rows.push({
      key: 'open',
      label: t('decide.home.rows.open'),
      value: String(openCount),
      secondLine: changedCount > 0 ? t('decide.home.rows.openChanged', { count: changedCount }) : undefined,
      onPress: () => pushOnce(OPEN_HREF),
    });
  }
  rows.push(
    changeCount > 0
      ? { key: 'changes', label: t('decide.home.rows.changes'), value: String(changeCount), onPress: () => pushOnce(CHANGES_HREF) }
      : { key: 'changes', label: t('decide.home.rows.changesAdd'), onPress: () => setAddOpen(true) }
  );
  if (vm.decidedCount > 0) {
    rows.push({ key: 'past', label: t('decide.home.rows.past'), value: String(vm.decidedCount), onPress: () => pushOnce(PAST_HREF) });
  }
  rows.push({
    key: 'lines',
    label: t('decide.home.rows.lines'),
    value: setCount === 0 ? t('decide.home.rows.linesDefault') : t('decide.home.rows.linesSetSix', { count: setCount }),
    onPress: () => pushOnce(LINES_HREF),
  });

  // R17.2 budget probe: the bottoms of the card and the rows in scroll-content coordinates. No-ops unless EXPO_PUBLIC_PERF=1.
  const bodyY = useRef(0);
  const onBodyLayout = (e: LayoutChangeEvent) => {
    bodyY.current = e.nativeEvent.layout.y;
  };
  const onCardLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    perfMark('home.cardBottom', bodyY.current + y + height);
  };
  const onRowsLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    perfMark('home.rowsBottom', bodyY.current + y + height);
  };

  return (
    <TabRootScreen title={t('decide.home.header')} hideSyncLine>
      <View style={styles.body} onLayout={onBodyLayout}>
        <HomeNoticeRow model={notice} onPress={() => setProblemsOpen(true)} />
        <View testID="home-card-wrap" onLayout={onCardLayout}>
          <HomeSummaryCard
            source={vm.source}
            settings={vm.settings}
            status={vm.status}
            homeBasisSeen={homeBasisSeen}
            judgeOn={judgeOn}
            onChooseJudgeOn={onChooseJudgeOn}
            currency={vm.currency}
            today={vm.today}
            onOpenDetails={() => setDetailsOpen(true)}
            onAddRough={() => setRoughOpen(true)}
            onRetry={vm.retry}
            onRunFull={runFull}
          />
        </View>
        <View testID="home-rows" style={styles.rows} onLayout={onRowsLayout}>
          {rows.map((r, i) => (
            <HomeRow key={r.key} label={r.label} value={r.value} secondLine={r.secondLine} onPress={r.onPress} isLast={i === rows.length - 1} />
          ))}
        </View>
      </View>
      <MonthDetailsSheet
        visible={detailsOpen}
        title={detailsTitle}
        card={card}
        source={vm.source}
        settings={vm.settings}
        userId={rc.userId}
        whole={vm.whole}
        wholeA11y={vm.wholeA11y}
        today={vm.today}
        currency={vm.currency}
        sourcesNote={sourcesNote}
        onChooseJudgeOn={onChooseJudgeOn}
        onClose={() => setDetailsOpen(false)}
      />
      <HomeProblemsSheet
        entries={entries}
        visible={problemsOpen}
        onClose={() => setProblemsOpen(false)}
        source={vm.source}
        settings={vm.settings}
        userId={rc.userId}
        currency={vm.currency}
      />
      <ChangeSheet visible={addOpen} row={null} onClose={() => setAddOpen(false)} />
      <RoughFiguresSheet
        visible={roughOpen}
        userId={rc.userId}
        currency={vm.currency}
        settings={vm.settings}
        onClose={() => setRoughOpen(false)}
      />
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  // Walkthrough 2: on top of TabRootScreen's own FAB_CLEARANCE, so the last row and a tall open quick result scroll fully clear of the New check FAB.
  body: { paddingHorizontal: space.screenH, gap: space.groupGap, paddingBottom: FAB_CLEARANCE },
  rows: { marginTop: CARD_TO_ROWS_GAP - space.groupGap },
});
