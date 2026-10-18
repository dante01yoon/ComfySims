import { readFileSync, writeFileSync } from 'node:fs'

const [name, ...notes] = process.argv.slice(2)
const summary = JSON.parse(readFileSync(`.recordings/${name}.summary.json`, 'utf8'))
const prompt = readFileSync(`docs/recordings/prompts/${name}.txt`, 'utf8').trim()
const tools = Object.entries(summary.toolCalls).map(([tool, count]) => `${tool} ${count}`).join(', ')

writeFileSync(`docs/recordings/${name}.md`, `# ${name}

- Started: ${summary.startedAt}
- Duration: ${summary.durationSec} s · Turns: ${summary.turns} · Cost: $${summary.costUsd?.toFixed(2)}
- Tool calls: ${tools}
- Stop hook sent the agent back: ${summary.stopHookSentBack} · Guard blocks: ${summary.guardBlocks}
- Raw transcript (local only): \`.recordings/${name}.jsonl\`

## Prompt

> ${prompt}

## Agent's final message

${summary.finalMessage}
${notes.length ? `\n## Reviewer notes\n\n${notes.map((note) => `- ${note}`).join('\n')}\n` : ''}`)
console.log(`wrote docs/recordings/${name}.md`)
