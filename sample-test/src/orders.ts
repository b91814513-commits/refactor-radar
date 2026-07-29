// 循环依赖示例：orders.ts <-> customers.ts -> CircularDependency
import { getCustomerLabel } from "./customers";
import { formatUserName } from "./utils";

export interface Order {
  id: string;
  customerId: string;
  amount: number;
}

export function describeOrder(order: Order): string {
  return `Order ${order.id} for ${getCustomerLabel(order.customerId)}`;
}

export function orderOwner(first: string, last: string): string {
  return formatUserName(first, last);
}
