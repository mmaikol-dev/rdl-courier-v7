"use client";

import * as React from "react";
import { Field, fieldSurface, setNativeValue, useFieldIds, useShake, type FieldSize } from "./field";
import { EASE_OUT, INTERACTION_FOCUS, interactionIcon, useInteractionReducedMotion } from "./ui-interaction-motion";

/* ─────────────────────────────────────────────────────────
 * INPUT: a one-line field
 *
 *   rest     a hairline pill; hover darkens the line
 *   focus    the line turns to the ring with a 3px halo
 *   typing   a clear button folds in once there is text and
 *            folds away when it's gone (it hands focus back)
 *   error    the line turns red, the hint gives way to the
 *            error and the field shakes once
 * ───────────────────────────────────────────────────────── */

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** Shows red and replaces the hint. */
  error?: React.ReactNode;
  /** An icon or text before the value. */
  leading?: React.ReactNode;
  /** An icon, text or button after the value. */
  trailing?: React.ReactNode;
  /** A button that empties the field once it has text. */
  clearable?: boolean;
  /** 28px or 36px tall. */
  size?: FieldSize;
  /** Called with the new text on every change. */
  onValueChange?: (value: string) => void;
  ref?: React.Ref<HTMLInputElement>;
  /** Class for the outer column. */
  className?: string;
  /** Class for the input element itself. */
  inputClassName?: string;
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Input({
  label,
  hint,
  error,
  leading,
  trailing,
  clearable,
  size = "md",
  onValueChange,
  ref,
  id,
  className = "",
  inputClassName = "",
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  ...props
}: InputProps) {
  const reduced = useInteractionReducedMotion();
  const ids = useFieldIds(id);
  const inner = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : text;
  const shakeRef = useShake<HTMLDivElement>(!!error);
  const sm = size === "sm";
  const showClear = !!clearable && current.length > 0 && !disabled;

  const setRefs = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.RefObject<HTMLInputElement | null>).current = el;
  };

  const describedBy = [hint && !error ? ids.hint : null, error ? ids.error : null].filter(Boolean).join(" ") || undefined;

  return (
    <Field id={ids.id} label={label} hint={hint} error={error} required={required} className={className}>
      <div ref={shakeRef} className={`${fieldSurface({ invalid: !!error, disabled })} ${sm ? "h-7 text-[16px] sm:text-[12.5px]" : "h-9 text-[16px] sm:text-[13.5px]"}`}>
        {leading && <span className={`flex shrink-0 items-center text-muted-foreground ${sm ? "pl-2.5" : "pl-3.5"} [&_svg]:size-3.5`}>{leading}</span>}
        <input
          ref={setRefs}
          id={ids.id}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            if (value === undefined) setText(e.target.value);
            onChange?.(e);
            onValueChange?.(e.target.value);
          }}
          className={`h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70 ${leading ? "pl-2" : sm ? "pl-3" : "pl-4"} ${trailing || clearable ? "pr-1" : sm ? "pr-3" : "pr-4"} ${inputClassName}`}
          {...props}
        />
        {clearable && (
          // The clear button folds its own width open, so the text never jumps.
          <span
            className="grid shrink-0"
            style={{ gridTemplateColumns: showClear ? "1fr" : "0fr", transition: reduced ? "none" : `grid-template-columns 320ms ${EASE_OUT}` }}
          >
            <span className="min-w-0 overflow-hidden">
              <button
                type="button"
                tabIndex={showClear ? 0 : -1}
                aria-hidden={!showClear}
                aria-label="Clear"
                onClick={() => {
                  if (!inner.current) return;
                  setNativeValue(inner.current, "");
                  inner.current.focus();
                }}
                className={`mr-1 flex items-center justify-center rounded-full text-muted-foreground cursor-pointer hover:bg-accent hover:text-foreground ${sm ? "size-5" : "size-7"} ${INTERACTION_FOCUS}`}
                style={interactionIcon(showClear, reduced)}
              >
                <ClearIcon />
              </button>
            </span>
          </span>
        )}
        {trailing && <span className={`flex shrink-0 items-center text-muted-foreground ${sm ? "pr-1" : "pr-1.5"} [&_svg]:size-3.5`}>{trailing}</span>}
      </div>
    </Field>
  );
}

export default Input;
