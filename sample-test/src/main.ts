// 高扇出示例：import 超过 4 个内部模块 -> DependencyHotspot (fan-out)
import { appConfig } from "./config";
import { customerSummary } from "./customers";
import { describeOrder } from "./orders";
import { average, sum } from "./stats";
import { formatUserName } from "./utils";

const order = { id: "1001", customerId: "c-1", amount: 42 };

export function run(): void {
  console.log(appConfig.name);
  console.log(formatUserName("Ada", "Lovelace"));
  console.log(describeOrder(order));
  console.log(customerSummary(order, "Grace", "Hopper"));
  console.log(sum([1, 2, 3]), average([1, 2, 3]));
}

run();
