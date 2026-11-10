import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Settings layout primitives (audit 2026-Q4, round 2, rule 2).
 *
 * A settings page is a list of rows under a few headings: label and
 * description on the left, the control on the right, a hairline between
 * rows. No card per setting; the card stack made every preference look
 * like an announcement and tripled the page height on a phone.
 */

export function SettingsGroup({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("space-y-1", className)}>
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function SettingRow({
  label,
  description,
  htmlFor,
  children,
  stacked = false,
  className,
  ...rest
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Id of the control, when the label should focus it. */
  htmlFor?: string;
  children?: React.ReactNode;
  /** Put the control under the text instead of beside it (wide controls). */
  stacked?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  const Label = htmlFor ? "label" : "p";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-3",
        !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
      {...rest}
    >
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={htmlFor} className="text-sm">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="shrink-0 self-start sm:self-auto">{children}</div>}
    </div>
  );
}

/**
 * Single-choice control: a row of toggle buttons. `role="group"` with
 * the setting's name lets a screen reader (and a test) tell one
 * "Medium" from another.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-md border border-border overflow-hidden w-fit">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
            value === option.value
              ? "bg-foreground text-background font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
