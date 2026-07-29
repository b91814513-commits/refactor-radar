// 大文件示例：超过 45 行 + 超过 5 个函数 -> LargeModule
import { clamp } from "./utils";

export function sum(values: number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return sum(values) / values.length;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function variance(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = average(values);
  const squared = values.map((value) => (value - mean) ** 2);
  return sum(squared) / values.length;
}

export function standardDeviation(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return values.map(() => 0);
  }
  return values.map((value) => (value - min) / (max - min));
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const rank = clamp(p, 0, 100) / 100;
  const index = Math.round(rank * (sorted.length - 1));
  return sorted[index];
}
