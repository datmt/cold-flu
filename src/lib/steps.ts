import type { StepType } from "@/lib/types";

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
  const match = curlTemplate.match(/(?:-X|--request)\s+(\w+)/i);
  return match?.[1]?.toUpperCase() ?? "GET";
}

export function getNodeType(stepType: StepType): "curlNode" | "transformNode" | "conditionNode" {
  if (stepType === "transform") return "transformNode";
  if (stepType === "condition") return "conditionNode";
  return "curlNode";
}
