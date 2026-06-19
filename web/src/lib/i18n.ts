import { createContext, useContext } from "react";

export type Locale = "en" | "zh";

const translations = {
  // Hero
  "hero.eyebrow": { en: "Local-first repository analysis", zh: "本地优先的代码库分析" },
  "hero.lede": {
    en: "Find the most valuable refactor opportunities in a JS or TS repository before technical debt turns into architecture drift.",
    zh: "在技术债演变为架构偏移之前，找到 JS/TS 代码库中最值得优先重构的机会。",
  },
  "hero.issueTypes": { en: "Issue types", zh: "问题类型" },
  "hero.analysisMode": { en: "Analysis mode", zh: "分析模式" },
  "hero.staticFirst": { en: "Static-first", zh: "静态优先" },

  // Analyzer panel
  "analyzer.title": { en: "Analyze a repository", zh: "分析代码库" },
  "analyzer.desc": {
    en: "Point Refactor Radar at a local JS/TS project and rank the hotspots worth fixing first.",
    zh: "将 Refactor Radar 指向本地 JS/TS 项目，排列出最值得修复的热点。",
  },
  "analyzer.repoPath": { en: "Repository path", zh: "代码库路径" },
  "analyzer.placeholder": { en: "D:/work/my-app\u2026", zh: "D:/work/my-app\u2026" },
  "analyzer.analyze": { en: "Analyze Repository", zh: "开始分析" },
  "analyzer.analyzing": { en: "Analyzing\u2026", zh: "分析中\u2026" },
  "analyzer.ready": { en: "Ready", zh: "就绪" },
  "analyzer.errorEmpty": { en: "Enter a repository path.", zh: "请输入代码库路径。" },
  "analyzer.recent": { en: "Recent repositories", zh: "最近分析" },
  "analyzer.noRecent": { en: "No recent analyses yet.", zh: "暂无分析记录。" },

  // Phases
  "phase.discovery": { en: "Scanning repository", zh: "扫描代码库" },
  "phase.parsing": { en: "Parsing source files", zh: "解析源文件" },
  "phase.graphing": { en: "Building dependency graph", zh: "构建依赖图" },
  "phase.rules": { en: "Evaluating refactor rules", zh: "评估重构规则" },
  "phase.scoring": { en: "Ranking findings", zh: "排列发现" },
  "phase.done": { en: "Completed", zh: "已完成" },

  // Dashboard
  "dashboard.title": { en: "Top refactor opportunities", zh: "最佳重构机会" },
  "dashboard.desc": {
    en: "Evidence-backed issues sorted by priority, with deterministic signals ahead of narrative guidance.",
    zh: "基于证据的问题按优先级排序，确定性信号优先于叙述性指导。",
  },
  "dashboard.files": { en: "Files", zh: "文件" },
  "dashboard.modules": { en: "Modules", zh: "模块" },
  "dashboard.issues": { en: "Issues", zh: "问题" },
  "dashboard.highPriority": { en: "High priority", zh: "高优先级" },
  "dashboard.placeholder": {
    en: "Run an analysis to populate the dashboard.",
    zh: "运行分析以填充仪表板。",
  },

  // Filters
  "filter.all": { en: "All", zh: "全部" },
  "filter.large_module": { en: "Large Module", zh: "大模块" },
  "filter.dependency_hotspot": { en: "Dependency Hotspot", zh: "依赖热点" },
  "filter.circular_dependency": { en: "Circular Dependency", zh: "循环依赖" },
  "filter.duplication_candidate": { en: "Duplication Candidate", zh: "重复候选" },

  // Viz tabs
  "tab.overview": { en: "Overview", zh: "概览" },
  "tab.files": { en: "Files", zh: "文件" },
  "tab.priority": { en: "Priority", zh: "优先级" },
  "tab.graph": { en: "Dependency Graph", zh: "依赖图" },

  // Charts
  "chart.issueTypes": { en: "Issue Types", zh: "问题类型分布" },
  "chart.severityBreakdown": { en: "Severity Breakdown", zh: "严重度分布" },
  "chart.topFiles": { en: "Top Files by Metric", zh: "文件指标排行" },
  "chart.priorityRanking": { en: "Priority Ranking (Top 10)", zh: "优先级排行（前 10）" },
  "chart.dependencyGraph": { en: "Dependency Graph", zh: "依赖关系图" },
  "chart.noIssues": { en: "No issues to display.", zh: "暂无问题。" },
  "chart.noFiles": { en: "No files to display.", zh: "暂无文件。" },
  "chart.noGraph": { en: "No dependency relationships to visualize.", zh: "无可视化的依赖关系。" },
  "chart.hiddenNodes": { en: "+{count} hidden", zh: "+{count} 已隐藏" },
  "chart.loading": { en: "Loading\u2026", zh: "加载中\u2026" },
  "chart.issuesUnit": { en: "issues", zh: "个问题" },
  "chart.score": { en: "Score", zh: "得分" },

  // Metric buttons
  "metric.lines": { en: "Lines", zh: "行数" },
  "metric.functions": { en: "Functions", zh: "函数" },
  "metric.fanIn": { en: "Fan-In", zh: "扇入" },
  "metric.fanOut": { en: "Fan-Out", zh: "扇出" },

  // Severity
  "severity.high": { en: "High", zh: "高" },
  "severity.medium": { en: "Medium", zh: "中" },
  "severity.low": { en: "Low", zh: "低" },

  // Graph legend
  "legend.cyclic": { en: "Cyclic", zh: "循环" },
  "legend.hotspot": { en: "Hotspot", zh: "热点" },
  "legend.normal": { en: "Normal", zh: "正常" },

  // Issue detail
  "detail.priority": { en: "Priority", zh: "优先级" },
  "detail.evidence": { en: "Evidence", zh: "证据" },
  "detail.files": { en: "Files", zh: "相关文件" },
  "detail.suggested": { en: "Suggested refactor path", zh: "建议重构方向" },
  "detail.aiExplanation": { en: "AI explanation", zh: "AI 解释" },
  "detail.noSelected": { en: "No issue selected.", zh: "未选中问题。" },

  // Lang toggle
  "lang.toggle": { en: "\u4e2d\u6587", zh: "EN" },

  // Empty state
  "empty.title": { en: "Ready to scan", zh: "\u5f85\u626b\u63cf" },
  "empty.hint": {
    en: "Enter a JS/TS repository path and start analysis to see results here.",
    zh: "\u8f93\u5165 JS/TS \u4ee3\u7801\u5e93\u8def\u5f84\u5e76\u5f00\u59cb\u5206\u6790\uff0c\u7ed3\u679c\u5c06\u5728\u8fd9\u91cc\u5c55\u793a\u3002",
  },
  "empty.featureLargeModule": {
    en: "Detect oversized modules mixing responsibilities",
    zh: "\u68c0\u6d4b\u804c\u8d23\u6df7\u6742\u7684\u8fc7\u5927\u6a21\u5757",
  },
  "empty.featureHotspot": {
    en: "Identify dependency hotspots with high fan-in/fan-out",
    zh: "\u8bc6\u522b fan-in/fan-out \u8fc7\u9ad8\u7684\u4f9d\u8d56\u70ed\u70b9",
  },
  "empty.featureCycle": {
    en: "Find circular dependencies between modules",
    zh: "\u53d1\u73b0\u6a21\u5757\u95f4\u7684\u5faa\u73af\u4f9d\u8d56",
  },
  "empty.featureDuplication": {
    en: "Surface duplicate code candidates with evidence",
    zh: "\u6807\u8bb0\u91cd\u590d\u4ee3\u7801\u5019\u9009\u5e76\u63d0\u4f9b\u8bc1\u636e",
  },

  // Export
  "export.button": { en: "Export", zh: "\u5bfc\u51fa" },
  "export.json": { en: "Export JSON", zh: "\u5bfc\u51fa JSON" },
  "export.csv": { en: "Export CSV", zh: "\u5bfc\u51fa CSV" },
  "export.markdown": { en: "Export Markdown", zh: "\u5bfc\u51fa Markdown" },

  // History
  "history.title": { en: "Analysis history", zh: "\u5206\u6790\u5386\u53f2" },
  "history.empty": { en: "No analysis history yet.", zh: "\u6682\u65e0\u5206\u6790\u5386\u53f2\u3002" },
  "history.load": { en: "Load", zh: "\u52a0\u8f7d" },
  "history.issues": { en: "issues", zh: "\u4e2a\u95ee\u9898" },
  "history.highPriority": { en: "high priority", zh: "\u9ad8\u4f18\u5148\u7ea7" },
} as const;

export type TranslationKey = keyof typeof translations;

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => translations[key]?.en ?? key,
});

export function useLocale() {
  return useContext(LocaleContext);
}

export function createTranslator(locale: Locale): (key: TranslationKey) => string {
  return (key) => translations[key]?.[locale] ?? key;
}
