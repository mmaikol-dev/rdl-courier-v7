"use client";

import * as React from "react";
import { Field, useFieldIds } from "./field";
import { PillSelect, type PillOption, type PillSelectProps } from "./pill-select";

/* ─────────────────────────────────────────────────────────
 * SELECT: a choice from a list, never the browser's dropdown
 *
 *   open     the pill grows into its list (size and corners ease)
 *            from the edge it lines up with; upward when there's
 *            no room below; long lists scroll
 *   pick     the list folds back into the pill and the label
 *            morphs to the choice, which carries a drawn check
 *   keys     arrows glide a highlight, typing finds an option,
 *            Enter picks, Escape folds it back
 *
 * The list lives in a portal, so no toolbar, card or scroller
 * clips it. Labelled and hinted like every other field.
 * ───────────────────────────────────────────────────────── */

export type SelectOption = PillOption;

export interface SelectProps extends Omit<PillSelectProps, "label" | "value" | "onValueChange"> {
  /** Shown above; also the accessible name. */
  label: string;
  /** Hide the label visually (it stays the accessible name). */
  hideLabel?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string) => void;
  id?: string;
}

export function Select({ label, hideLabel, hint, error, value, defaultValue = null, onValueChange, id, className = "", block = true, size = "md", ...props }: SelectProps) {
  const ids = useFieldIds(id);
  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const current = value !== undefined ? value : own;
  return (
    <Field id={ids.id} label={hideLabel ? undefined : label} hint={hint} error={error} className={className}>
      <PillSelect
        {...props}
        block={block}
        size={size}
        label={label}
        value={current}
        onValueChange={(v) => {
          if (value === undefined) setOwn(v);
          onValueChange?.(v);
        }}
      />
    </Field>
  );
}

export default Select;
