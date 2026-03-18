import { UploadCloud } from "lucide-react";

interface UploadPanelProps {
  label?: string;
  onSelect: (file: File | null) => void;
}

export function UploadPanel({ label = "选择日志文件", onSelect }: UploadPanelProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100">
      <UploadCloud className="h-4 w-4" />
      {label}
      <input
        type="file"
        className="hidden"
        accept=".log,.txt,.ndjson,.json"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

