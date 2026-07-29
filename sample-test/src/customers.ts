// 循环依赖示例：customers.ts <-> orders.ts -> CircularDependency
import { describeOrder, type Order } from "./orders";
import { formatCustomerName } from "./utils";

export function getCustomerLabel(customerId: string): string {
  return `customer-${customerId}`;
}

export function customerSummary(order: Order, first: string, last: string): string {
  return `${formatCustomerName(first, last)}: ${describeOrder(order)}`;
}
