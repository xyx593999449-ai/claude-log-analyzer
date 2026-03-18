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
      title="日志分析页"
      subtitle="支持单文件快速解析，展示 Timeline / ToolAnalysis / TokenAnalysis / RawLog"
      actions={<UploadPanel label="选择日志文件" onSelect={onFileChange} />}
    >
      {logContent ? (
        <LegacyLogViewer title={`日志解析结果 ${filename ? `(${filename})` : ""}`} rawLog={logContent} />
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">
          <ArrowLeftRight className="mx-auto mb-3 h-5 w-5" />
          上传一份日志文件后即可查看解析详情
        </div>
      )}
    </AnalysisLayout>
  );
}

