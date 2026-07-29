interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  count?: number;
}

export function Skeleton({ className = "", width, height, count = 1 }: SkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <>
      {items.map((i) => (
        <div
          key={i}
          className={`skeleton ${className}`}
          style={{ width, height }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export function ChartSkeleton() {
  return (
    <div className="skeleton-chart">
      <Skeleton width="100%" height={200} />
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={48} className="skeleton-row" />
      ))}
    </div>
  );
}
