"use client";

/** Checkbox group for the resume sections the backend should rewrite. */

import { ALL_SECTIONS, SECTION_LABELS, type SectionKey } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SectionPickerProps {
  selected: SectionKey[];
  onChange: (selected: SectionKey[]) => void;
  disabled?: boolean;
}

export function SectionPicker({ selected, onChange, disabled }: SectionPickerProps) {
  const toggle = (section: SectionKey, checked: boolean): void => {
    if (checked) {
      // Preserve the canonical order.
      onChange([...ALL_SECTIONS.filter((key) => key === section || selected.includes(key))]);
      return;
    }
    onChange(selected.filter((key) => key !== section));
  };

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="text-sm font-medium">Sections to customize</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ALL_SECTIONS.map((section) => {
          const id = `section-${section}`;
          const checked = selected.includes(section);
          return (
            <div key={section} className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(value) => toggle(section, value === true)}
              />
              <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                {SECTION_LABELS[section]}
              </Label>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        At least one section is required. Untouched sections keep your original wording.
      </p>
    </fieldset>
  );
}
