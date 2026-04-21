import type {
  HitlModificationItem,
  HitlOverlayInsight,
  HitlPromptItem,
  HitlRootCauseItem,
  HitlTaskAnalysisSummary,
} from "./types";

type LabelFn = (value: string | null) => string | null;

function normalizeNullableText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.toLowerCase() === "nan" || text.toLowerCase() === "null") return null;
  return text;
}

function parseLooseJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  const text = normalizeNullableText(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asRecord(item)).filter(Boolean) as Array<Record<string, unknown>>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeNullableText(item)).filter(Boolean) as string[];
}

function splitCommentToBlocks(comment: string): string[] {
  const normalized = comment
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];
  const byParagraph = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (byParagraph.length > 1) return byParagraph;
  return normalized
    .split(/(?<=[。！？；])\s+(?=(?:\d+[).、]|[一二三四五六七八九十]+[、.]))/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCommentToSentences(comment: string): string[] {
  return comment
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, " ")
    .split(/(?<=[。！？；;])\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferTaskAnalysisSection(sentence: string): {
  key: string;
  title: string;
  tone: "summary" | "problem" | "evidence" | "root_cause" | "suggestion" | "other";
} {
  const text = sentence.trim();
  if (!text) {
    return { key: "other", title: "补充说明", tone: "other" };
  }
  if (/^(核心问题|结论|总体来看|整体来看|整体结论|核实结论|质检结论|本 case|该 case)/.test(text)) {
    return { key: "summary", title: "结论摘要", tone: "summary" };
  }
  if (/(问题出在|错误在于|存在多处问题|存在两个严重问题|存在三个|严重问题|主要问题|轻微问题|误判|误拦截|拦截失效)/.test(text)) {
    return { key: "problem", title: "关键问题", tone: "problem" };
  }
  if (/(人工标注|人工确认|图商|官网|官方网站|证据|质检|QC|日志\[|日志 \[|高德|百度|腾讯)/i.test(text)) {
    return { key: "evidence", title: "证据与表现", tone: "evidence" };
  }
  if (/(根本原因|本质|原因是|导致|未能|没有|遗漏|缺失|未处理|未识别|未区分)/.test(text)) {
    return { key: "root_cause", title: "根因判断", tone: "root_cause" };
  }
  if (/(建议|应当|应该|需要|可考虑|后续|优化|放宽|增加|补齐)/.test(text)) {
    return { key: "suggestion", title: "优化建议", tone: "suggestion" };
  }
  return { key: "other", title: "补充说明", tone: "other" };
}

function buildTaskAnalysisSections(comment: string): Array<{
  key: string;
  title: string;
  tone: "summary" | "problem" | "evidence" | "root_cause" | "suggestion" | "other";
  content: string;
}> {
  const normalized = normalizeNullableText(comment);
  if (!normalized) return [];

  const sentences = splitCommentToSentences(normalized);
  if (sentences.length === 0) return [];

  const sections: Array<{
    key: string;
    title: string;
    tone: "summary" | "problem" | "evidence" | "root_cause" | "suggestion" | "other";
    content: string;
  }> = [];

  for (const sentence of sentences) {
    const meta = inferTaskAnalysisSection(sentence);
    const prev = sections[sections.length - 1];
    if (prev && prev.key === meta.key) {
      prev.content = `${prev.content} ${sentence}`.trim();
      continue;
    }
    sections.push({
      ...meta,
      content: sentence,
    });
  }

  if (sections.length === 1 && sections[0].key !== "summary") {
    sections.unshift({
      key: "summary",
      title: "结论摘要",
      tone: "summary",
      content: sentences.slice(0, Math.min(2, sentences.length)).join(" ").trim(),
    });
  }

  return sections;
}

function getClusterIssueType(cluster: Record<string, unknown>): string {
  const tags = asRecord(cluster.tags);
  return asStringArray(tags?.issue_observations)[0] ?? "unknown";
}

function getClusterJudgmentDimensions(cluster: Record<string, unknown>): string[] {
  const tags = asRecord(cluster.tags);
  return asStringArray(tags?.judgment_dimensions);
}

function getClusterSkillTypes(cluster: Record<string, unknown>): string[] {
  const modifications = asRecordArray(cluster.modifications);
  const skillSet = new Set<string>();
  for (const item of modifications) {
    const skill = normalizeNullableText(item.target_skill);
    if (skill) skillSet.add(skill);
  }
  return [...skillSet];
}

function buildClusterSummary(clusters: Array<Record<string, unknown>>): string | null {
  const sorted = [...clusters].sort((a, b) => Number(b.frequency ?? 0) - Number(a.frequency ?? 0));
  if (sorted.length === 0) return null;
  const top = sorted.slice(0, 3).map((cluster) => {
    const issueType = getClusterIssueType(cluster);
    const count = Number(cluster.frequency ?? 0);
    return `${issueType}${count > 0 ? `(${count})` : ""}`;
  });
  return `${sorted.length} 个问题簇，高频问题：${top.join("、")}`;
}

export function buildIterationSummaryFromOverlayDraft(overlayDraftRaw: unknown): string | null {
  const overlayDraft = asRecord(parseLooseJson(overlayDraftRaw));
  if (!overlayDraft) return null;
  const clusters = asRecordArray(overlayDraft.clusters);
  if (clusters.length > 0) {
    return buildClusterSummary(clusters);
  }
  return normalizeNullableText(overlayDraft.summary);
}

export function parseOverlayDetail(
  batchId: string,
  overlayDraftRaw: unknown,
  getIssueTypeLabel: LabelFn,
  getSkillTypeLabel: LabelFn,
): {
  summary: string | null;
  rootCauses: HitlRootCauseItem[];
  overlayInsight: HitlOverlayInsight;
} {
  const overlayDraft = asRecord(parseLooseJson(overlayDraftRaw));
  if (!overlayDraft) {
    return {
      summary: null,
      rootCauses: [],
      overlayInsight: { rootCauseAnalysis: null, learnablePatterns: [], skillImpact: [] },
    };
  }

  const clusters = asRecordArray(overlayDraft.clusters);
  if (clusters.length > 0) {
    const rootCauses: HitlRootCauseItem[] = clusters.map((cluster) => {
      const issueType = getClusterIssueType(cluster);
      const skills = getClusterSkillTypes(cluster);
      const mainSkill = skills[0] ?? "unknown";
      const clusterId = normalizeNullableText(cluster.cluster_id);
      const suggestionItems = asRecordArray(cluster.modifications).map((item) => ({
        action: normalizeNullableText(item.action),
        description: normalizeNullableText(item.description),
        before: normalizeNullableText(item.before),
        after: normalizeNullableText(item.after),
        targetFile: normalizeNullableText(item.target_file),
        targetSkill: normalizeNullableText(item.target_skill),
        expectedEffect: normalizeNullableText(item.expected_effect),
        clusterId,
      }));
      return {
        issueType,
        issueTypeLabel: getIssueTypeLabel(issueType) ?? issueType,
        count: Number(cluster.frequency ?? 0),
        skillType: mainSkill,
        skillTypeLabel: getSkillTypeLabel(mainSkill) ?? mainSkill,
        summary: normalizeNullableText(cluster.description),
        detailUrl: `/hitl-iterations/${encodeURIComponent(batchId)}/issues/${encodeURIComponent(issueType)}/tasks`,
        clusterId,
        severity: normalizeNullableText(cluster.severity),
        judgmentDimensions: getClusterJudgmentDimensions(cluster),
        representativeCases: asStringArray(cluster.representative_cases),
        modifications: suggestionItems,
      };
    });

    const skillImpactMap = new Map<string, string[]>();
    for (const cluster of clusters) {
      const clusterDescription = normalizeNullableText(cluster.description);
      for (const modification of asRecordArray(cluster.modifications)) {
        const skillType = normalizeNullableText(modification.target_skill);
        if (!skillType) continue;
        const segments = skillImpactMap.get(skillType) ?? [];
        const modDesc = normalizeNullableText(modification.description);
        const effect = normalizeNullableText(modification.expected_effect);
        const parts = [clusterDescription, modDesc, effect].filter(Boolean) as string[];
        if (parts.length > 0) segments.push(parts.join("；"));
        skillImpactMap.set(skillType, segments);
      }
    }

    const topClusterSummary = clusters
      .slice()
      .sort((a, b) => Number(b.frequency ?? 0) - Number(a.frequency ?? 0))
      .slice(0, 3)
      .map((cluster) => normalizeNullableText(cluster.description))
      .filter(Boolean)
      .join("；");
    const rootCauseAnalysis =
      normalizeNullableText(overlayDraft.root_cause_analysis) ??
      (topClusterSummary || null);

    return {
      summary: buildClusterSummary(clusters),
      rootCauses,
      overlayInsight: {
        rootCauseAnalysis,
        learnablePatterns: clusters
          .map((cluster) => {
            const issueType = getClusterIssueType(cluster);
            return {
              issueType,
              issueTypeLabel: getIssueTypeLabel(issueType) ?? issueType,
              pattern: normalizeNullableText(cluster.description) ?? "",
              count: Number(cluster.frequency ?? 0),
            };
          })
          .filter((item) => item.pattern),
        skillImpact: [...skillImpactMap.entries()].map(([skillType, segments]) => ({
          skillType,
          skillTypeLabel: getSkillTypeLabel(skillType) ?? skillType,
          impactSummary: Array.from(new Set(segments)).join("；"),
        })),
      },
    };
  }

  const issueDistribution = asRecordArray(overlayDraft.issue_distribution);
  const learnablePatternRaw = Array.isArray(overlayDraft.learnable_patterns)
    ? overlayDraft.learnable_patterns as unknown[]
    : [];
  const skillImpactDraft = asRecord(overlayDraft.skill_impact) ?? {};
  const rootCauseSummary =
    normalizeNullableText(overlayDraft.root_cause_analysis) ?? normalizeNullableText(overlayDraft.learnable_patterns);
  return {
    summary: normalizeNullableText(overlayDraft.summary),
    rootCauses: issueDistribution.map((item) => {
      const issueType = normalizeNullableText(item.issue_type) ?? "unknown";
      const skillType = normalizeNullableText(item.step) ?? "unknown";
      return {
        issueType,
        issueTypeLabel: getIssueTypeLabel(issueType) ?? issueType,
        count: Number(item.count ?? 0),
        skillType,
        skillTypeLabel: getSkillTypeLabel(skillType) ?? skillType,
        summary: rootCauseSummary,
        detailUrl: `/hitl-iterations/${encodeURIComponent(batchId)}/issues/${encodeURIComponent(issueType)}/tasks`,
      };
    }),
    overlayInsight: {
      rootCauseAnalysis: normalizeNullableText(overlayDraft.root_cause_analysis),
      learnablePatterns: learnablePatternRaw
        .map((item) => {
          const objectItem = asRecord(item);
          if (objectItem) {
            const issueType = normalizeNullableText(objectItem.issue_type) ?? "unknown";
            return {
              issueType,
              issueTypeLabel: getIssueTypeLabel(issueType) ?? issueType,
              pattern: normalizeNullableText(objectItem.pattern) ?? "",
              count: Number(objectItem.count ?? 0),
            };
          }
          const patternText = normalizeNullableText(item) ?? "";
          return {
            issueType: "unknown",
            issueTypeLabel: getIssueTypeLabel("unknown") ?? "unknown",
            pattern: patternText,
            count: 0,
          };
        })
        .filter((item) => item.pattern),
      skillImpact: Object.entries(skillImpactDraft)
        .map(([skillType, summary]) => {
          const textSummary = Array.isArray(summary)
            ? (summary.map((item) => normalizeNullableText(item)).filter(Boolean) as string[]).join("；")
            : normalizeNullableText(summary);
          return {
            skillType,
            skillTypeLabel: getSkillTypeLabel(skillType) ?? skillType,
            impactSummary: textSummary ?? "",
          };
        })
        .filter((item) => item.impactSummary),
    },
  };
}

export function parseModificationRows(
  rows: Array<Record<string, unknown>>,
  getSkillTypeLabel: LabelFn,
): HitlModificationItem[] {
  return rows.map((row) => {
    const targetSkill = normalizeNullableText(row.target_skill) ?? "unknown";
    const changesObj = asRecord(parseLooseJson(row.changes));
    const modificationEntries = asRecordArray(changesObj?.modifications);
    const modifiedFiles = Array.from(new Set(
      modificationEntries
        .map((item) => normalizeNullableText(item.target_file))
        .concat(asStringArray(changesObj?.modified_files))
        .concat(normalizeNullableText(row.modified_file) ?? [])
        .filter(Boolean),
    )) as string[];
    const changeSummary =
      normalizeNullableText(changesObj?.description) ??
      normalizeNullableText(changesObj?.summary);
    const clusterIds = Array.from(new Set(
      modificationEntries.map((item) => normalizeNullableText(item.cluster_id)).filter(Boolean),
    )) as string[];
    return {
      targetSkill,
      targetSkillLabel: getSkillTypeLabel(targetSkill) ?? targetSkill,
      changeSummary,
      modifiedFiles,
      status: normalizeNullableText(row.status),
      createdAt: normalizeNullableText(row.created_at),
      clusterIds,
      errorMessage: normalizeNullableText(changesObj?.error),
      modifications: modificationEntries.map((item) => ({
        action: normalizeNullableText(item.action),
        clusterId: normalizeNullableText(item.cluster_id),
        description: normalizeNullableText(item.description),
        targetFile: normalizeNullableText(item.target_file),
        targetSkill: normalizeNullableText(item.target_skill),
        expectedEffect: normalizeNullableText(item.expected_effect),
      })),
    };
  });
}

export function resolveIssueModelAnalysis(
  issueType: string,
  overlayDraftRaw: unknown,
  promptItems: HitlPromptItem[],
): {
  skillType: string | null;
  summary: string | null;
  rootCause: Record<string, unknown> | null;
  prompts: HitlPromptItem[];
} {
  const overlayDraft = asRecord(parseLooseJson(overlayDraftRaw));
  if (!overlayDraft) {
    return { skillType: null, summary: null, rootCause: null, prompts: promptItems };
  }

  const clusters = asRecordArray(overlayDraft.clusters);
  if (clusters.length > 0) {
    const matchedCluster = clusters.find((cluster) => {
      const tags = asRecord(cluster.tags);
      const issueTags = asStringArray(tags?.issue_observations).map((item) => item.toLowerCase());
      const judgmentTags = asStringArray(tags?.judgment_dimensions).map((item) => item.toLowerCase());
      const target = issueType.toLowerCase();
      return issueTags.includes(target) || judgmentTags.includes(target);
    }) ?? null;
    const skillType = matchedCluster ? getClusterSkillTypes(matchedCluster)[0] ?? null : null;
    const filteredPrompts = promptItems.filter((item) => {
      if (skillType && item.skillKey.toLowerCase().includes(skillType.toLowerCase())) return true;
      return item.content.toLowerCase().includes(issueType.toLowerCase());
    });
    return {
      skillType,
      summary:
        normalizeNullableText(overlayDraft.root_cause_analysis) ??
        normalizeNullableText(matchedCluster?.description) ??
        buildClusterSummary(clusters),
      rootCause: matchedCluster,
      prompts: filteredPrompts.length > 0 ? filteredPrompts : promptItems,
    };
  }

  const issueDistribution = asRecordArray(overlayDraft.issue_distribution);
  const issueDistributionItem = issueDistribution.find(
    (item) => normalizeNullableText(item.issue_type)?.toLowerCase() === issueType.toLowerCase(),
  ) ?? null;
  const skillType = normalizeNullableText(issueDistributionItem?.step);
  const filteredPrompts = promptItems.filter((item) => {
    if (skillType && item.skillKey.toLowerCase().includes(skillType.toLowerCase())) return true;
    return item.content.toLowerCase().includes(issueType.toLowerCase());
  });
  return {
    skillType,
    summary: normalizeNullableText(overlayDraft.root_cause_analysis) ?? normalizeNullableText(overlayDraft.summary),
    rootCause: issueDistributionItem,
    prompts: filteredPrompts.length > 0 ? filteredPrompts : promptItems,
  };
}

export function parseTaskAnalysisSummary(taskAnalysisRow: Record<string, unknown> | null | undefined): HitlTaskAnalysisSummary | null {
  if (!taskAnalysisRow) return null;
  const analysisComment = normalizeNullableText(taskAnalysisRow.analysis_comment);
  const overallVerdict = normalizeNullableText(taskAnalysisRow.overall_verdict);
  const createdAt = normalizeNullableText(taskAnalysisRow.created_at);
  if (!analysisComment && !overallVerdict && !createdAt) return null;
  return {
    analysisComment,
    analysisCommentBlocks: analysisComment ? splitCommentToBlocks(analysisComment) : [],
    analysisSections: analysisComment ? buildTaskAnalysisSections(analysisComment) : [],
    overallVerdict,
    createdAt,
  };
}
