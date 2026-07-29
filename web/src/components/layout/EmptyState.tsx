import { Boxes, CopyCheck, Layers, ListOrdered, Network, RefreshCcw, ScanSearch, Zap, type LucideIcon } from "lucide-react";

import { useLocale, type TranslationKey } from "../../lib/i18n";

const FEATURES: { icon: LucideIcon; key: TranslationKey }[] = [
  { icon: Boxes, key: "empty.featureLargeModule" },
  { icon: Network, key: "empty.featureHotspot" },
  { icon: RefreshCcw, key: "empty.featureCycle" },
  { icon: CopyCheck, key: "empty.featureDuplication" },
  { icon: ListOrdered, key: "empty.featureLongParameterList" },
  { icon: Layers, key: "empty.featureDeepNesting" },
  { icon: Zap, key: "empty.featureGodFunction" },
];

export function EmptyState() {
  const { t } = useLocale();

  return (
    <div className="empty-state">
      <div className="empty-state-heading">
        <span className="empty-state-icon" aria-hidden="true"><ScanSearch size={22} /></span>
        <div>
          <h3 className="empty-state-title">{t("empty.title")}</h3>
          <p className="empty-state-hint">{t("empty.hint")}</p>
        </div>
      </div>

      <div className="empty-features">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
          <div key={feature.key} className="empty-feature">
              <span className="empty-feature-icon" aria-hidden="true"><Icon size={17} /></span>
              <span className="empty-feature-text">{t(feature.key)}</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}
