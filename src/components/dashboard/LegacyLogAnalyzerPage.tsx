import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { AnalysisLayout } from "../legacy/AnalysisLayout";
import { LegacyLogViewer } from "../legacy/LegacyLogViewer";
import { UploadPanel } from "../legacy/UploadPanel";

export function LegacyLogAnalyzerPage() {
  const [logContent, setLogContent] = useState("");
  const [filename, setFilename] = useState("");

  async function onFileChange(file: File | null): Promise<void> {
    if (!file) return;
    const text = await file.text();
    setLogContent(text.replace(/^\uFEFF/, ""));
    setFilename(file.name);
  }

  return (
    <AnalysisLayout
      title="日志分析"
      subtitle="单文件模式"
      actions={<UploadPanel label="上传日志" onSelect={onFileChange} />}
    >
      {logContent ? (
        <LegacyLogViewer title={filename ? `日志分析 · ${filename}` : "日志分析"} rawLog={logContent} />
      ) : (
        <div className="rounded-[28px] border border-slate-200 bg-white/84 p-10 text-center text-slate-500 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <ArrowLeftRight className="mx-auto mb-3 h-6 w-6 text-slate-400" />
          上传日志后开始分析
        </div>
      )}
    </AnalysisLayout>
  );
}
