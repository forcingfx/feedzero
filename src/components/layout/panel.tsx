import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";

interface PanelProps {
  children: ReactNode;
  className?: string;
}

export function Panel({ children, className }: PanelProps) {
  return (
    <div className={cn("panel", className)}>
      <ScrollArea className="h-full">{children}</ScrollArea>
    </div>
  );
}
