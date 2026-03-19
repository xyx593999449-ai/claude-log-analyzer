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
    <div className="dashboard-shell min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-[rgba(246,242,234,0.84)] backdrop-blur-xl">
        <div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="inline-flex items-center gap-3 font-display text-3xl font-semibold text-slate-950">
                <span className="rounded-2xl bg-slate-950 p-2 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                  <Braces className="h-5 w-5" />
                </span>
                {title}
              </h1>
              {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            {actions ? <div>{actions}</div> : null}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
              <Clock3 className="h-3.5 w-3.5 text-teal-700" />
              执行轨迹
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
              <Wrench className="h-3.5 w-3.5 text-cyan-700" />
              工具分析
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
              <GitBranch className="h-3.5 w-3.5 text-amber-700" />
              Token 成本
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1480px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
