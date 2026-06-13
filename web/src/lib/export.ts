import type { AnalysisResult } from "./types";

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

export function exportCSV(result: AnalysisResult) {
  const header = "id,type,severity,confidence,score,files,summary\n";
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

export function exportMarkdown(result: AnalysisResult) {
  const lines: string[] = [];
  lines.push(`# Refactor Radar Analysis Report`);
  lines.push(``);
  lines.push(`- **Repository**: ${result.repoPath}`);
  lines.push(`- **Analyzed at**: ${result.summary.analyzedAt}`);
  lines.push(`- **Files**: ${result.summary.fileCount}`);
  lines.push(`- **Modules**: ${result.summary.moduleCount}`);
  lines.push(`- **Issues**: ${result.summary.issueCount} (${result.summary.highPriorityCount} high priority)`);
  lines.push(``);
  lines.push(`## Issues`);
  lines.push(``);
  lines.push(`| # | Type | Severity | Score | Files | Summary |`);
  lines.push(`|---|------|----------|-------|-------|---------|`);

  result.issues.forEach((issue, i) => {
    lines.push(
      `| ${i + 1} | ${issue.issueType} | ${issue.severity} | ${issue.priorityScore.toFixed(1)} | ${issue.files.join(", ")} | ${issue.summary} |`
    );
  });

  lines.push(``);
  lines.push(`## Details`);
  lines.push(``);

  result.issues.forEach((issue) => {
    lines.push(`### ${issue.title}`);
    lines.push(``);
    lines.push(`- **Type**: ${issue.issueType}`);
    lines.push(`- **Severity**: ${issue.severity} | **Confidence**: ${issue.confidence}`);
    lines.push(`- **Priority Score**: ${issue.priorityScore.toFixed(1)}`);
    lines.push(``);
    lines.push(issue.summary);
    lines.push(``);

    if (issue.evidence.length > 0) {
      lines.push(`**Evidence:**`);
      issue.evidence.forEach((e) => {
        lines.push(`- ${e.label}: ${e.detail}`);
      });
      lines.push(``);
    }

    if (issue.suggestedActions.length > 0) {
      lines.push(`**Suggested actions:**`);
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
