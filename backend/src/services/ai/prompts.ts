/**
 * Versioned prompt templates for the AI layer (§50).
 *
 * Every prompt change must bump PROMPT_VERSION so cached insights and stored
 * conversations remain explainable ("which prompt produced this answer?").
 */

export const PROMPT_VERSION = '1.0';

/** Prompt for cached dashboard insights (§12, §49). */
export const INSIGHT_PROMPTS: Record<
  'PROFILE_SUMMARY' | 'STRENGTHS' | 'WEAKNESSES' | 'RECOMMENDATIONS',
  string
> = {
  PROFILE_SUMMARY:
    'Write a grounded profile summary of this developer for their dashboard. Explain their Developer DNA using the numbers and evidence provided: what the measured data says they are strong at, what it says needs work, and one concrete first step. Reference only technologies, repositories and scores present in the context.',
  STRENGTHS:
    'List the developer\'s top strengths. Each must be backed by specific evidence from the context (skill scores, repository facts, commit/language data). Never invent a technology or score.',
  WEAKNESSES:
    'List the developer\'s main areas to improve based strictly on the context: low scores, missing practices (e.g. tests, CI/CD), and skill gaps for their target role. Every weakness must cite the evidence that produced it.',
  RECOMMENDATIONS:
    'Produce concrete, prioritized recommendations grounded in the context: which gaps to close first, which repository to improve, and which recommended project fits best. Recommendations must reference actual data — no generic advice that ignores the developer\'s profile.'
};

/** Extra interviewer behavior appended to the grounding system prompt (§13). */
export const INTERVIEW_SYSTEM_ADDENDUM = [
  'You are also a technical interviewer for a PRACTICE interview (never a real hiring decision).',
  'Ask questions ONLY about technologies, skills and projects present in the DevDNA context.',
  'Adapt difficulty based on the quality of previous answers: after a weak answer, ask a follow-up that reinforces fundamentals; after a strong answer, go one level deeper.',
  'Keep questions self-contained and specific to this developer\'s evidence.'
].join('\n');

/** Builds the compact developer context section of a prompt (the caller serializes). */
export function userQuestionPrompt(question: string): string {
  return `Developer question: ${question}`;
}
