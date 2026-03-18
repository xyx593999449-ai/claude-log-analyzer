import type { ReactNode } from "react";
import { Braces, Clock3, GitBranch, Wrench } from "lucide-react";

interface AnalysisLayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AnalysisLayout({ title, subtitle, actions, children }: AnalysisLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="inline-flex items-center gap-2 text-xl font-semibold text-slate-900">
                <span className="rounded-md bg-violet-100 p-1 text-violet-700">
                  <Braces className="h-4 w-4" />
                </span>
                {title}
              </h1>
              {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            {actions ? <div>{actions}</div> : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
            <span className="inline-flex items-center gap-1 text-violet-700">
              <Clock3 className="h-4 w-4" />
              Agent 执行流程
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Wrench className="h-4 w-4" />
              工具调用分析
            </span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <GitBranch className="h-4 w-4" />
              Token & 成本分析
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

