"use client";

/** Theme toggle. Icons and label are SSR-stable: only CSS decides visibility. */

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      // Static label: next-themes returns `undefined` during SSR, so any theme
      // derived attribute would mismatch on hydration.
      aria-label="Toggle light and dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden size-4 dark:inline-block" aria-hidden />
      <Moon className="inline-block size-4 dark:hidden" aria-hidden />
    </Button>
  );
}
