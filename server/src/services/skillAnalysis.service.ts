import { z } from 'zod';
import { ApiError } from '../lib/errors';
import { logger } from '../lib/logger';
import { completeChat, type ChatTurn } from './groq.service';

/**
 * Skill analysis and roadmap generation.
 *
 * The model returns JSON, but its output is untrusted input: it is parsed with
 * a schema and normalised before it reaches the client, so a malformed or
 * over-long reply becomes a clear error instead of a broken page.
 *
 * Learning *timelines* are deliberately absent from the schema. The brief for
 * this feature asks for a realistic roadmap without promising a schedule, and
 * a model inventing "3 weeks to mastery" is exactly the kind of claim that
 * misleads beginners.
 */

const roadmapStageSchema = z.object({
  stage: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  summary: z.string().trim().min(1).max(600),
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        explanation: z.string().trim().min(1).max(900),
        example: z.string().trim().max(1200).optional().default(''),
        exercise: z.string().trim().max(900).optional().default(''),
      }),
    )
    .min(1)
    .max(14),
  checklist: z.array(z.string().trim().min(1).max(220)).max(14).default([]),
});

const projectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(700),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
});

export const skillAnalysisSchema = z.object({
  skill: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(900),
  whyUseful: z.array(z.string().trim().min(1).max(400)).min(1).max(8),
  prerequisites: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  relatedSkills: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  practiceTips: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  stages: z.array(roadmapStageSchema).min(1).max(3),
  projects: z.array(projectSchema).max(8).default([]),
});

export type SkillAnalysis = z.infer<typeof skillAnalysisSchema>;

const SYSTEM = `You are a curriculum designer for SkillSpring, a peer skill-exchange platform.

You produce a learning guide for one skill. Return ONE JSON object and nothing
else — no prose, no markdown fences.

Shape:
{
  "skill": string,
  "summary": string,
  "whyUseful": string[],
  "prerequisites": string[],
  "relatedSkills": string[],
  "practiceTips": string[],
  "stages": [
    { "stage": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
      "summary": string,
      "topics": [ { "title": string, "explanation": string, "example": string, "exercise": string } ],
      "checklist": string[] }
  ],
  "projects": [ { "title": string, "description": string, "level": "BEGINNER" | "INTERMEDIATE" | "ADVANCED" } ]
}

Rules
- Cover all three stages. Each stage needs 4-8 topics with a concrete example
  and one exercise per topic where it makes sense.
- Be specific to the named skill. "Learn the basics" is useless; "install the
  JDK and run a first class in jshell" is useful.
- No timelines, no "master in N weeks", no guarantees. Describe order, not speed.
- Never invent URLs, course names, book titles or channel names. You are not
  given a web search tool here; resources are handled elsewhere.
- Assume a motivated adult beginner with no prior knowledge unless the skill
  obviously requires a prerequisite, which you list.
- Keep every string plain text. No markdown inside JSON values.`;

/** Extracts the first JSON object from a reply that may include stray prose. */
function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/**
 * Asks the model for a structured guide. Throws ApiError when the reply cannot
 * be trusted; never returns a partially parsed object.
 */
export async function analyseSkill(skill: string, language: 'en' | 'te' = 'en'): Promise<SkillAnalysis> {
  const languageRule =
    language === 'te'
      ? 'Write all prose in Telugu, keeping technical terms and code in English.'
      : 'Write all prose in clear simple English.';

  const turns: ChatTurn[] = [
    {
      role: 'user',
      content: `Skill to analyse: ${skill}\n\n${languageRule}`,
    },
  ];

  const completion = await completeChat(turns, {
    systemPrompt: SYSTEM,
    temperature: 0.3,
    maxTokens: 4096,
    jsonMode: true,
  });

  const json = extractJson(completion.content);
  if (!json) {
    logger.warn('skill_analysis.unparseable', { skill, preview: completion.content.slice(0, 200) });
    throw new ApiError(
      502,
      'AI_UNPARSEABLE_RESPONSE',
      'The assistant returned a guide that could not be read. Please try again.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    logger.warn('skill_analysis.invalid_json', { skill });
    throw new ApiError(
      502,
      'AI_UNPARSEABLE_RESPONSE',
      'The assistant returned a guide that could not be read. Please try again.',
    );
  }

  const result = skillAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn('skill_analysis.schema_mismatch', {
      skill,
      issues: result.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    throw new ApiError(
      502,
      'AI_INCOMPLETE_RESPONSE',
      'The assistant returned a guide that was missing required sections. Please try again.',
    );
  }

  // Trust the requested skill name over whatever the model echoed back.
  return { ...result.data, skill };
}

const CHAT_SYSTEM = `You are the SkillSpring learning coach, helping one member study a specific skill.

Rules
- Answer questions about the selected skill: explain a topic, give examples,
  walk through a task step by step, set practice questions, review code, suggest
  a small project.
- Stay on the selected skill unless the member clearly changes subject.
- Use short headings, bullet points, and fenced code blocks with a language tag.
- If the member writes in Telugu, answer in Telugu and keep technical terms in
  English. Otherwise answer in English.
- Be honest when something is outside your knowledge or needs the member's own
  files. Never invent citations, versions or API signatures.
- Never invent URLs.`;

export type SkillChatMessage = { role: 'user' | 'assistant'; content: string };

/** Context-aware learning chat for one skill. */
export async function skillChat(input: {
  skill: string;
  history: SkillChatMessage[];
  language: 'en' | 'te';
}): Promise<string> {
  const languageRule =
    input.language === 'te'
      ? 'The member prefers Telugu: answer in Telugu, technical terms in English.'
      : 'Answer in clear simple English.';

  const systemPrompt = `${CHAT_SYSTEM}\n\nSelected skill: ${input.skill}\n${languageRule}`;
  const completion = await completeChat(
    input.history.map((m) => ({ role: m.role, content: m.content })),
    { systemPrompt, temperature: 0.4, maxTokens: 2048 },
  );

  return completion.content;
}
