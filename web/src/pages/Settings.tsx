import { useCallback, useEffect, useState } from "react";

import { useLocale } from "../lib/i18n";

interface AnalysisConfig {
  lineCount: number;
  functionCount: number;
  fanIn: number;
  fanOut: number;
  longParameterList: number;
  deepNesting: number;
  godFunction: number;
  rules: {
    largeModule: boolean;
    dependencyHotspot: boolean;
    circularDependency: boolean;
    duplicationCandidate: boolean;
    longParameterList: boolean;
    deepNesting: boolean;
    godFunction: boolean;
  };
}

const DEFAULTS: AnalysisConfig = {
  lineCount: 45,
  functionCount: 5,
  fanIn: 2,
  fanOut: 4,
  longParameterList: 4,
  deepNesting: 4,
  godFunction: 10,
  rules: {
    largeModule: true,
    dependencyHotspot: true,
    circularDependency: true,
    duplicationCandidate: true,
    longParameterList: true,
    deepNesting: true,
    godFunction: true,
  },
};

const SETTINGS_KEY = "refactor-radar-settings";

function loadSettings(): AnalysisConfig {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

export function getStoredSettings(): AnalysisConfig {
  return loadSettings();
}

export function Settings() {
  const { t } = useLocale();
  const [config, setConfig] = useState<AnalysisConfig>(loadSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  const handleSave = useCallback(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
    setSaved(true);
  }, [config]);

  const handleReset = useCallback(() => {
    setConfig({ ...DEFAULTS });
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULTS));
    setSaved(true);
  }, []);

  function updateThreshold(key: keyof Pick<AnalysisConfig, "lineCount" | "functionCount" | "fanIn" | "fanOut" | "longParameterList" | "deepNesting" | "godFunction">, value: number) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRule(key: keyof AnalysisConfig["rules"]) {
    setConfig((prev) => ({
      ...prev,
      rules: { ...prev.rules, [key]: !prev.rules[key] },
    }));
  }

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="settings-header">
        <p className="section-kicker">{t("settings.title")}</p>
        <h1 id="settings-title">{t("settings.title")}</h1>
        <p>{t("settings.desc")}</p>
      </div>

      <div className="settings-section">
        <h2>{t("settings.thresholds")}</h2>

        <div className="settings-field">
          <label>
            <span>{t("settings.lineCount")}</span>
            <input
              type="range"
              min={10}
              max={200}
              value={config.lineCount}
              onChange={(e) => updateThreshold("lineCount", Number(e.target.value))}
            />
            <output>{config.lineCount}</output>
          </label>
        </div>

        <div className="settings-field">
          <label>
            <span>{t("settings.functionCount")}</span>
            <input
              type="range"
              min={1}
              max={30}
              value={config.functionCount}
              onChange={(e) => updateThreshold("functionCount", Number(e.target.value))}
            />
            <output>{config.functionCount}</output>
          </label>
        </div>

        <div className="settings-field">
          <label>
            <span>{t("settings.fanIn")}</span>
            <input
              type="range"
              min={1}
              max={10}
              value={config.fanIn}
              onChange={(e) => updateThreshold("fanIn", Number(e.target.value))}
            />
            <output>{config.fanIn}</output>
          </label>
        </div>

        <div className="settings-field">
          <label>
            <span>{t("settings.fanOut")}</span>
            <input
              type="range"
              min={1}
              max={15}
              value={config.fanOut}
              onChange={(e) => updateThreshold("fanOut", Number(e.target.value))}
            />
            <output>{config.fanOut}</output>
          </label>
        </div>

        <div className="settings-field">
          <label>
            <span>{t("settings.longParameterList")}</span>
            <input
              type="range"
              min={1}
              max={10}
              value={config.longParameterList}
              onChange={(e) => updateThreshold("longParameterList", Number(e.target.value))}
            />
            <output>{config.longParameterList}</output>
          </label>
        </div>

        <div className="settings-field">
          <label>
            <span>{t("settings.deepNesting")}</span>
            <input
              type="range"
              min={1}
              max={10}
              value={config.deepNesting}
              onChange={(e) => updateThreshold("deepNesting", Number(e.target.value))}
            />
            <output>{config.deepNesting}</output>
          </label>
        </div>

        <div className="settings-field">
          <label>
            <span>{t("settings.godFunction")}</span>
            <input
              type="range"
              min={1}
              max={30}
              value={config.godFunction}
              onChange={(e) => updateThreshold("godFunction", Number(e.target.value))}
            />
            <output>{config.godFunction}</output>
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2>{t("settings.rules")}</h2>

        <div className="settings-toggle">
          <label>
            <input
              type="checkbox"
              checked={config.rules.largeModule}
              onChange={() => toggleRule("largeModule")}
            />
            <span>{t("settings.ruleLargeModule")}</span>
          </label>
        </div>

        <div className="settings-toggle">
          <label>
            <input
              type="checkbox"
              checked={config.rules.dependencyHotspot}
              onChange={() => toggleRule("dependencyHotspot")}
            />
            <span>{t("settings.ruleDependencyHotspot")}</span>
          </label>
        </div>

        <div className="settings-toggle">
          <label>
            <input
              type="checkbox"
              checked={config.rules.circularDependency}
              onChange={() => toggleRule("circularDependency")}
            />
            <span>{t("settings.ruleCircularDependency")}</span>
          </label>
        </div>

        <div className="settings-toggle">
          <label>
            <input
              type="checkbox"
              checked={config.rules.duplicationCandidate}
              onChange={() => toggleRule("duplicationCandidate")}
            />
            <span>{t("settings.ruleDuplicationCandidate")}</span>
          </label>
        </div>

        <div className="settings-toggle">
          <label>
            <input
              type="checkbox"
              checked={config.rules.longParameterList}
              onChange={() => toggleRule("longParameterList")}
            />
            <span>{t("settings.ruleLongParameterList")}</span>
          </label>
        </div>

        <div className="settings-toggle">
          <label>
            <input
              type="checkbox"
              checked={config.rules.deepNesting}
              onChange={() => toggleRule("deepNesting")}
            />
            <span>{t("settings.ruleDeepNesting")}</span>
          </label>
        </div>

        <div className="settings-toggle">
          <label>
            <input
              type="checkbox"
              checked={config.rules.godFunction}
              onChange={() => toggleRule("godFunction")}
            />
            <span>{t("settings.ruleGodFunction")}</span>
          </label>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn-primary" onClick={handleSave}>
          {t("settings.save")}
        </button>
        <button className="settings-reset-btn" onClick={handleReset}>
          {t("settings.reset")}
        </button>
        {saved && <span className="settings-saved">{t("settings.saved")}</span>}
      </div>
    </section>
  );
}
