import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";

interface NewFolderFormProps {
  /** Called after the folder is created or the input is abandoned. */
  onDone: () => void;
}

/** Inline folder-name input: Enter creates, Escape or blur cancels. */
export function NewFolderForm({ onDone }: NewFolderFormProps) {
  const [name, setName] = useState("");
  const createFolder = useFeedStore((s) => s.createFolder);

  return (
    <form
      className="flex items-center gap-2 px-2 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) createFolder(name.trim());
        onDone();
      }}
    >
      <FolderPlus className="size-4 text-muted-foreground" />
      <input
        autoFocus
        placeholder="Folder name"
        className="flex-1 bg-transparent text-sm outline-none border-b border-primary min-w-0"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => { if (e.key === "Escape") onDone(); }}
      />
    </form>
  );
}
