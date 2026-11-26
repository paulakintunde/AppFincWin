// 10.1-25 (SCN-01, D-13; UI-SPEC section 4): "Scan a receipt" from Add. Capture (photo, image file or scan), then the phone
// reads it and the review opens; only "Add this line" creates anything (one line, its parts and the receipt). The picked
// files are cache copies this flow owns: they are deleted whenever the flow ends (done, cancelled, dragged away or
// unmounted) and when the user takes another photo (T-10.1-25-01). The outbox keeps its own copies of a confirmed receipt.
import React, { useEffect, useRef, useState } from 'react';
import type { LocalReceiptFile } from '@/services/receipts/types';
import { useRecordContext } from '../useRecordContext';
import { CaptureChooser } from './CaptureChooser';
import { ScanSheet } from './ScanSheet';
import { discardFiles } from './scanFiles';

export interface ScanEntryFlowProps {
  visible: boolean;
  onClose(): void;
}

export function ScanEntryFlow(props: ScanEntryFlowProps) {
  if (!props.visible) return null;
  return <FlowBody onClose={props.onClose} />;
}

type Stage = { at: 'choose' } | { at: 'between' } | { at: 'scan'; images: LocalReceiptFile[] };

function FlowBody({ onClose }: { onClose(): void }) {
  const rc = useRecordContext();
  const [stage, setStage] = useState<Stage>({ at: 'choose' });
  const owned = useRef<string[]>([]);
  const frame = useRef<number | null>(null);

  const release = () => {
    discardFiles(owned.current);
    owned.current = [];
  };
  // Whatever ends the flow, nothing picked stays behind.
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      discardFiles(owned.current);
      owned.current = [];
    },
    [],
  );

  // One sheet closes before the next opens (02.3 Pattern 4): never two Modals swapping in the same frame.
  const next = (to: Stage) => {
    setStage({ at: 'between' });
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setStage(to);
    });
  };

  const picked = (images: LocalReceiptFile[]) => {
    owned.current = images.map((f) => f.uri);
    next({ at: 'scan', images });
  };

  const retake = () => {
    release();
    next({ at: 'choose' });
  };

  const householdId = rc.householdId;
  return (
    <>
      <CaptureChooser visible={stage.at === 'choose'} onClose={onClose} onPicked={picked} />
      {householdId !== null ? (
        <ScanSheet
          visible={stage.at === 'scan'}
          mode="new"
          householdId={householdId}
          images={stage.at === 'scan' ? stage.images : []}
          onClose={onClose}
          onDone={() => onClose()}
          onRetake={retake}
        />
      ) : null}
    </>
  );
}
