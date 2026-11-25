'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { TextMorph } from './text-morph';
import { EASE_OUT, INTERACTION_FOCUS } from './ui-interaction-motion';
import { WORKFLOW_STATUS } from './workflow-status';
import type { WorkflowNode } from './workflow-types';

export function WorkflowInspector({ node, onClose, reduced, id }: { node?: WorkflowNode; onClose: () => void; reduced: boolean; id: string }) {
  const [kept, setKept] = React.useState(node);
  if (node && kept !== node) setKept(node);
  const displayed = node ?? kept;
  const content = React.useRef<HTMLDivElement>(null);
  const measure = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState(0);
  const hasDisplayed = Boolean(displayed);
  React.useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight((previous) => (previous === el.offsetHeight ? previous : el.offsetHeight)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasDisplayed]);
  React.useLayoutEffect(() => {
    const el = content.current;
    if (!el || !node || reduced) return;
    const animation = el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE_OUT });
    return () => animation.cancel();
  }, [node, reduced]);
  return <div id={id} aria-hidden={!node || undefined} inert={!node} className="overflow-hidden" style={{ height: node ? height : 0, transition: reduced ? 'none' : `height 380ms ${EASE_OUT}` }}>
      {displayed && <div ref={measure} className="border-t border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[13px] font-medium"><TextMorph>{displayed.title}</TextMorph></p><p className={`mt-0.5 text-[12px] ${displayed.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}><TextMorph>{WORKFLOW_STATUS[displayed.status ?? 'idle']}</TextMorph></p></div>
          <button type="button" aria-label="Close node details" onClick={onClose} className={`cursor-pointer flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${INTERACTION_FOCUS}`}><X className="size-3.5" aria-hidden="true" /></button>
        </div>
        <div ref={content} className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{displayed.detail}</div>
      </div>}
  </div>;
}
