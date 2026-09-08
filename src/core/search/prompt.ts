// Prompts. The numbers the model is told to cite are the shortIds assigned while the context was
// assembled, so every citation in an answer maps back to a record the view can open.
import type { Message } from "./llm";
import type { ContextKind, SearchContext } from "./types";

const HEADINGS: Record<ContextKind, string> = {
  entities: "Entities",
  relationships: "Relationships",
  reports: "Reports",
  sources: "Sources",
  claims: "Claims",
};

const CITE_RULE = [
  "Support each statement with the data you were given.",
  "Cite it inline as [Data: <Kind> (<numbers>)], for example [Data: Entities (1, 4); Reports (2)].",
  "Use only the numbers listed below. Never invent a number and never cite a kind that is empty.",
  "If the data does not answer the question, say so plainly instead of guessing.",
].join(" ");

export function contextBlock(context: SearchContext): string {
  const parts: string[] = [];
  for (const kind of Object.keys(HEADINGS) as ContextKind[]) {
    const items = context[kind];
    if (items.length === 0) continue;
    const lines = items.map((entry) => `${entry.shortId}. ${entry.text}`);
    parts.push(`## ${HEADINGS[kind]}\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

export function localMessages(query: string, context: SearchContext, responseLanguage: string): Message[] {
  return [
    {
      role: "system",
      content: [
        "You answer questions about a knowledge graph using only the data supplied.",
        CITE_RULE,
        `Write the answer in ${responseLanguage}.`,
      ].join(" "),
    },
    { role: "user", content: `# Data\n\n${contextBlock(context)}\n\n# Question\n\n${query}` },
  ];
}

/** One batch of community reports becomes a list of scored points. JSON keeps the parse honest. */
export function mapMessages(query: string, reportsBlock: string): Message[] {
  return [
    {
      role: "system",
      content: [
        "You extract the points in a set of community reports that help answer a question.",
        "Answer with JSON only, shaped as",
        '{"points":[{"description":"…","score":0,"reports":["1"]}]}.',
        "score is 0 to 100 for how much the point helps answer the question.",
        "reports lists the report numbers the point came from.",
        "Return an empty points array when nothing in the batch is relevant.",
      ].join(" "),
    },
    { role: "user", content: `# Reports\n\n${reportsBlock}\n\n# Question\n\n${query}` },
  ];
}

export function reduceMessages(query: string, points: string, responseLanguage: string): Message[] {
  return [
    {
      role: "system",
      content: [
        "You write one answer from points that analysts extracted from community reports.",
        CITE_RULE,
        "Cite reports as [Data: Reports (<numbers>)] using the numbers attached to each point.",
        `Write the answer in ${responseLanguage}.`,
      ].join(" "),
    },
    { role: "user", content: `# Points\n\n${points}\n\n# Question\n\n${query}` },
  ];
}
