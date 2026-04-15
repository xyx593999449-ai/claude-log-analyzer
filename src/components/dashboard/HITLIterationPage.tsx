import { Bot, FlaskConical, GitBranch, ShieldCheck } from "lucide-react";

const FLOW_STEPS = [
  {
    title: "人工反馈结果池",
    description: "聚合来自业务侧的高价值样本与反馈标签，形成本轮迭代输入。",
    icon: Bot,
  },
  {
    title: "双 Skill 问题分析",
    description: "分别审视核实 Skill 与质检 Skill 的问题分布、证据归因与风险。",
    icon: FlaskConical,
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
    </section>
  );
}
