// 依赖热点（fan-in 高）+ 重复代码示例
// formatUserName 和 formatCustomerName 函数体几乎完全相同 -> DuplicationCandidate

export function formatUserName(first: string, last: string) {
  const trimmedFirst = first.trim();
  const trimmedLast = last.trim();
  if (!trimmedFirst && !trimmedLast) {
    return "anonymous";
  }
  const combined = `${trimmedFirst} ${trimmedLast}`.trim();
  return combined.toLowerCase().replace(/\s+/g, " ");
}

export function formatCustomerName(first: string, last: string) {
  const trimmedFirst = first.trim();
  const trimmedLast = last.trim();
  if (!trimmedFirst && !trimmedLast) {
    return "anonymous";
  }
  const combined = `${trimmedFirst} ${trimmedLast}`.trim();
  return combined.toLowerCase().replace(/\s+/g, " ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
