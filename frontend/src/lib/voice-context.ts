export function buildCoachContext(
  problem: {
    title?: string;
    difficulty?: string;
    description?: string;
  } | null,
  code: string,
  hints: string[]
): string {
  return `
Problem: ${problem?.title || 'Unknown'} (${problem?.difficulty || 'Unknown'})
Difficulty: ${problem?.difficulty}
Summary: ${problem?.description || ''}

User's Code:
\`\`\`python
${code || '(empty)'}
\`\`\`

Hints Given: ${hints.length > 0 ? hints.join(', ') : 'None'}
  `.trim();
}
