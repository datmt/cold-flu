import type { StepType } from "@/lib/types";
import { parseCurl } from "@/lib/executor/curl-parser";

export const DEFAULT_TRANSFORM_CODE = `// context.env, context.steps.StepName.body, .status, .headers
// Return an object or string — it becomes this step's output body

return {
  result: "edit me"
};`;

export const DEFAULT_CONDITION_CODE = `// Return true or false to control which branch runs.
// context.env and context.steps.StepName are available.
// Example: return context.steps.GetUser.status === 200;

return true;`;

export function extractMethodFromCurl(curlTemplate: string): string {
  try {
    return parseCurl(curlTemplate).method;
  } catch {
    return "GET";
  }
}

export function getNodeType(stepType: StepType): "curlNode" | "transformNode" | "conditionNode" {
  if (stepType === "transform") return "transformNode";
  if (stepType === "condition") return "conditionNode";
  return "curlNode";
}
