import { useState } from "react";
import { UploadCloud, FileSearch, Coins, Wrench } from "lucide-react";
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
        <div className="relative flex min-h-[400px] flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-slate-300 bg-slate-50/50 p-10 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50/50">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200">
            <UploadCloud className="h-10 w-10 text-indigo-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800">上传日志后开始深潜分析</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            支持拖拽上传单条执行日志或 Claude System Trace 日志。系统将为您展开会话级执行轨迹与精准 Token 消耗探测。
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-slate-100 min-w-[140px]">
              <FileSearch className="mb-2 h-6 w-6 text-emerald-500" />
              <span className="text-xs font-semibold text-slate-700">执行轨迹追溯</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-slate-100 min-w-[140px]">
              <Coins className="mb-2 h-6 w-6 text-amber-500" />
              <span className="text-xs font-semibold text-slate-700">Token 成本清算</span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-slate-100 min-w-[140px]">
              <Wrench className="mb-2 h-6 w-6 text-sky-500" />
              <span className="text-xs font-semibold text-slate-700">工具调用感知</span>
            </div>
          </div>
        </div>
      )}
    </AnalysisLayout>
  );
}
