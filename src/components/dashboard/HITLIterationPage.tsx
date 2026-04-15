import { Bot, FlaskConical, GitBranch, Microscope, Rocket, ShieldCheck } from "lucide-react";
import type { HITLIterationBatchStatus } from "../../lib/dashboardTypes";

const FLOW_STEPS = [
  {
    title: "人工反馈结果池",
    description: "聚合来自业务侧的高价值样本与反馈标签，形成本轮迭代输入。",
    icon: Bot,
  },
  {
    title: "LLM 分析",
    description: "基于反馈样本进行日志聚类、原因归纳与问题分层，产出初始分析结论。",
    icon: Microscope,
  },
  {
    title: "双 Skill 建议",
    description: "分别沉淀核实 Skill 与质检 Skill 的改动建议、收益预估与风险提示。",
    icon: FlaskConical,
  },
  {
    title: "候选版本",
    description: "汇总双 Skill 基线与候选版本，明确能力变更范围与回归关注点。",
    icon: Rocket,
  },
  {
    title: "联合回归验证",
    description: "基于候选版本执行统一回归，评估双链路分项结果与整体稳定性。",
    icon: GitBranch,
  },
  {
    title: "发布结论",
    description: "沉淀本轮是否发布、发布范围与后续观察点。",
    icon: ShieldCheck,
  },
];

const STATUS_LABEL_MAP: Record<HITLIterationBatchStatus, string> = {
  analysis_in_progress: "分析进行中",
  suggestions_ready: "建议已产出",
  candidate_versions_ready: "候选版本就绪",
  joint_regression_running: "联合回归进行中",
  decision_completed: "发布结论已确认",
};

const STATUS_TONE_MAP: Record<HITLIterationBatchStatus, string> = {
  analysis_in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  suggestions_ready: "border-cyan-200 bg-cyan-50 text-cyan-700",
  candidate_versions_ready: "border-indigo-200 bg-indigo-50 text-indigo-700",
  joint_regression_running: "border-sky-200 bg-sky-50 text-sky-700",
  decision_completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const ITERATION_OVERVIEW = {
  iterationBatchId: "ITER-2026-04-15-POI-042",
  timeRangeLabel: "2026-04-08 10:00 ~ 2026-04-15 15:30",
  sampleCount: 284,
  status: "suggestions_ready" as HITLIterationBatchStatus,
};

export function HITLIterationPage() {
  return (
    <section className="space-y-6 text-slate-900">
      <div className="rounded-[32px] border border-white/70 bg-white/85 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">HITL Skill Iteration</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">HITL 迭代运营页</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          该页面用于承载大 POI 核实场景下的双 Skill 迭代闭环，目前已完成路由与导航入口接入，后续将逐步补齐总览、分析、候选版本与联合回归模块。
        </p>
      </div>

      <article className="rounded-[28px] border border-white/70 bg-white/84 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">迭代批次总览</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">迭代批次标识</div>
            <div className="mt-2 font-mono text-sm font-semibold text-slate-900">{ITERATION_OVERVIEW.iterationBatchId}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">时间范围</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{ITERATION_OVERVIEW.timeRangeLabel}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">样本量</div>
            <div className="mt-2 font-mono text-lg font-semibold text-slate-900">{ITERATION_OVERVIEW.sampleCount} 条</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">当前状态</div>
            <div className="mt-2">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_TONE_MAP[ITERATION_OVERVIEW.status]}`}
              >
                {STATUS_LABEL_MAP[ITERATION_OVERVIEW.status]}
              </span>
            </div>
          </div>
        </div>
      </article>

      <article className="rounded-[28px] border border-white/70 bg-white/84 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">HITL 闭环流程骨架</div>
        <p className="mt-2 text-sm text-slate-600">覆盖人工反馈结果池、LLM 分析、双 Skill 建议、候选版本、联合回归和发布结论六个环节。</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FLOW_STEPS.map((step) => (
            <article
              key={step.title}
              className="rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                <step.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
