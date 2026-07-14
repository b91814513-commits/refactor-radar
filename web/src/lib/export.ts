import type { AnalysisResult } from "./types";
import type { TranslationKey } from "./i18n";

type T = (key: TranslationKey) => string;

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportJSON(result: AnalysisResult) {
  const content = JSON.stringify(result, null, 2);
  downloadBlob(content, `refactor-radar-${result.analysisId}.json`, "application/json");
}

export function exportCSV(result: AnalysisResult, t: T) {
  const header = `${t("export.csv.id")},${t("export.csv.type")},${t("export.csv.severity")},${t("export.csv.confidence")},${t("export.csv.score")},${t("export.csv.files")},${t("export.csv.summary")}\n`;
  const rows = result.issues.map((issue) => {
    const fields = [
      csvEscape(issue.id),
      csvEscape(issue.issueType),
      csvEscape(issue.severity),
      csvEscape(issue.confidence),
      issue.priorityScore.toFixed(1),
      csvEscape(issue.files.join("; ")),
      csvEscape(issue.summary),
    ];
    return fields.join(",");
  });
  downloadBlob(header + rows.join("\n"), `refactor-radar-${result.analysisId}.csv`, "text/csv");
}

export function exportMarkdown(result: AnalysisResult, t: T) {
  const lines: string[] = [];
  lines.push(`# Refactor Radar Analysis Report`);
  lines.push(``);
  lines.push(`- **${t("export.md.repository")}**: ${result.repoPath}`);
  lines.push(`- **${t("export.md.analyzedAt")}**: ${result.summary.analyzedAt}`);
  lines.push(`- **${t("export.md.files")}**: ${result.summary.fileCount}`);
  lines.push(`- **${t("export.md.modules")}**: ${result.summary.moduleCount}`);
  lines.push(`- **${t("export.md.issues")}**: ${result.summary.issueCount} (${result.summary.highPriorityCount} ${t("export.md.highPriority")})`);
  lines.push(``);
  lines.push(`## ${t("export.md.issuesSection")}`);
  lines.push(``);
  lines.push(`| # | ${t("export.csv.type")} | ${t("export.csv.severity")} | ${t("export.csv.score")} | ${t("export.csv.files")} | ${t("export.csv.summary")} |`);
  lines.push(`|---|------|----------|-------|-------|---------|`);

  result.issues.forEach((issue, i) => {
    lines.push(
      `| ${i + 1} | ${issue.issueType} | ${issue.severity} | ${issue.priorityScore.toFixed(1)} | ${mdEscape(issue.files.join(", "))} | ${mdEscape(issue.summary)} |`
    );
  });

  lines.push(``);
  lines.push(`## ${t("export.md.details")}`);
  lines.push(``);

  result.issues.forEach((issue) => {
    lines.push(`### ${issue.title}`);
    lines.push(``);
    lines.push(`- **${t("export.csv.type")}**: ${issue.issueType}`);
    lines.push(`- **${t("export.csv.severity")}**: ${issue.severity} | **${t("export.csv.confidence")}**: ${issue.confidence}`);
    lines.push(`- **${t("export.csv.score")}**: ${issue.priorityScore.toFixed(1)}`);
    lines.push(``);
    lines.push(issue.summary);
    lines.push(``);

    if (issue.evidence.length > 0) {
      lines.push(`**${t("export.md.evidence")}:**`);
      issue.evidence.forEach((e) => {
        lines.push(`- ${e.label}: ${e.detail}`);
      });
      lines.push(``);
    }

    if (issue.suggestedActions.length > 0) {
      lines.push(`**${t("export.md.suggestedActions")}:**`);
      issue.suggestedActions.forEach((a) => {
        lines.push(`- **${a.title}**: ${a.detail}`);
      });
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
  });

  downloadBlob(lines.join("\n"), `refactor-radar-${result.analysisId}.md`, "text/markdown");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function mdEscape(value: string): string {
  return value.replace(/\|/g, "\\|");
}
