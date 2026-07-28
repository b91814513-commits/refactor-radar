import { logInfo } from "../core/logger";

export function complexProcessor(a: string, b: string, c: string, d: string, e: string) {
  let result = "";
  if (a.length > 0) {
    if (b.length > 0) {
      if (c.length > 0) {
        if (d.length > 0) {
          if (e.length > 0) {
            result = a + b + c + d + e;
          } else {
            result = a + b + c + d;
          }
        } else {
          result = a + b + c;
        }
      } else {
        result = a + b;
      }
    } else {
      result = a;
    }
  }

  for (let i = 0; i < result.length; i++) {
    if (result[i] === "a") {
      result = result.replace("a", "A");
    } else if (result[i] === "b") {
      result = result.replace("b", "B");
    } else if (result[i] === "c") {
      result = result.replace("c", "C");
    }
  }

  switch (result[0]) {
    case "A":
      result = "alpha:" + result;
      break;
    case "B":
      result = "beta:" + result;
      break;
    case "C":
      result = "gamma:" + result;
      break;
    default:
      result = "unknown:" + result;
      break;
  }

  try {
    logInfo(result);
  } catch (err) {
    console.error(err);
  }

  return result;
}

export function simpleHelper(x: string) {
  return x.trim().toLowerCase();
}
