import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ReviewInput {
  date: Date;
  todayBlocks: { id: string; name: string; type: "habit" | "goal" | "sleep"; status: string; durationMin: number; habitId?: string | null; goalId?: string | null }[];
  habits: { id: string; name: string; perWeek: number; durationMin: number; priority: number }[];
  goals: { id: string; name: string; totalEffortMin: number; completedMin: number; deadline: Date; priority: number }[];
}

export interface ReviewResult {
  summary: string;
  adjustments: {
    blockStatusUpdates?: { blockId: string; status: "done" | "skipped" | "partial" }[];
    goalPriorityUpdates?: { goalId: string; priority: number }[];
    goalCompletedMinUpdates?: { goalId: string; completedMin: number }[];
  };
}

export interface AgentRunner {
  runReview(input: ReviewInput): Promise<ReviewResult>;
}

export function constructPrompt(input: ReviewInput): string {
  return `You are Beni's daily coaching agent. Below is the input data for today (${input.date.toISOString().split("T")[0]}).
Review the planned blocks and outcomes. Inferred outcomes: if a planned block is still in status 'planned', it's likely completed but needs verification.
Assess the goal and habit progress.

Today's Scheduled Blocks:
${JSON.stringify(input.todayBlocks, null, 2)}

Active Habits:
${JSON.stringify(input.habits, null, 2)}

Active Goals:
${JSON.stringify(input.goals, null, 2)}

Output format: You MUST return a single valid JSON object. Do NOT wrap in markdown formatting or add other text. The JSON object must strictly match this schema:
{
  "summary": "A daily text recap summarizing achievements, warnings (e.g. lagging goals), and suggestions.",
  "adjustments": {
    "blockStatusUpdates": [
      { "blockId": "block-id-here", "status": "done" }
    ],
    "goalPriorityUpdates": [
      { "goalId": "goal-id-here", "priority": 3 }
    ],
    "goalCompletedMinUpdates": [
      { "goalId": "goal-id-here", "completedMin": 120 }
    ]
  }
}
If no adjustments are needed for goals/blocks, return empty arrays.`;
}

export class FakeAgentRunner implements AgentRunner {
  async runReview(input: ReviewInput): Promise<ReviewResult> {
    const updates = input.todayBlocks.map(b => ({
      blockId: b.id,
      status: "done" as const,
    }));

    return {
      summary: `You completed all ${input.todayBlocks.length} planned items today! Excellent job keeping up with your habits and goals.`,
      adjustments: {
        blockStatusUpdates: updates,
      },
    };
  }
}

export class OpenRouterRunner implements AgentRunner {
  async runReview(input: ReviewInput): Promise<ReviewResult> {
    const apiKey = process.env.OPENROUTER_API_KEY || "";
    const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

    const prompt = constructPrompt(input);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are Beni's daily calendar and coaching agent. You output JSON only." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API failed with status ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.choices[0].message.content;
    
    // Safety check for parsing JSON
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error(`Failed to extract JSON from OpenRouter output: ${text}`);
    }
    return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
  }
}

export class AgyRunner implements AgentRunner {
  async runReview(input: ReviewInput): Promise<ReviewResult> {
    const binaryPath = process.env.AGY_BINARY_PATH || "/Users/johnsarreal/.local/bin/agy";
    const model = process.env.AGY_MODEL || "";
    const prompt = constructPrompt(input);

    const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    const modelFlag = model ? `--model "${model}"` : "";

    const command = `"${binaryPath}" ${modelFlag} --print "${escapedPrompt}"`;

    try {
      const { stdout } = await execAsync(command);

      const jsonStart = stdout.indexOf("{");
      const jsonEnd = stdout.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error(`Failed to find JSON in agy output: ${stdout}`);
      }

      const jsonText = stdout.substring(jsonStart, jsonEnd + 1);
      return JSON.parse(jsonText);
    } catch (err: any) {
      console.error("[AgyRunner] Execution failed:", err);
      throw new Error(`Antigravity CLI run failed: ${err.message || err}`);
    }
  }
}

export function getAgentRunner(provider: string): AgentRunner {
  const prov = provider.toLowerCase();
  if (prov === "fake") {
    return new FakeAgentRunner();
  }
  if (prov === "agy") {
    return new AgyRunner();
  }
  return new OpenRouterRunner();
}
