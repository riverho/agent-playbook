// scripts/lib/nl-router.mjs
// ----------------------------------------------------------------------------
// The canonical natural-language → intent matcher for the agent-playbook.
//
// Single source of truth for the grammar that skills/nl/SKILL.md teaches an
// agent. Pure Node stdlib (zero deps) so it stays carry-on.
//
// Public API:
//   const { route, INTENTS, version } = require('./nl-router.mjs');
//   route("what's next?")        -> { intent: 'select', commands: ['next'], ... }
//   route("claim the next task") -> { intent: 'claim',  commands: ['next --claim'], ... }
//   route("is it green?")        -> { intent: 'verify', commands: ['validate'], ... }
//   route("I learned X")         -> { intent: 'learn',  commands: ['learn --source user'], ... }
//   route("xyzzy")               -> { intent: 'unknown', commands: [], hints: [...] }
//
// Precedence (first match wins; the table is iterated top-to-bottom):
//   1. verify-task      (specific: "validate task oc-plugin")
//   2. record-blocked    (specific: "blocked" beats generic done)
//   3. record-done       (generic done)
//   4. claim             (beats select: "claim the next task" != "what's next")
//   5. cycle-new         (beats loop-new: "new phase" is cycle, not loop)
//   6. cycle-close / reflect
//   7. loop-new / loop-close
//   8. ... (single-intent patterns)
//   N. help (fallback before unknown)
//
// Match style: case-insensitive; regex over the whole utterance. Patterns are
// tested with `regex.test(text)`; if any one of an intent's `patterns` hits,
// the intent matches. The agent can also `route(text).explanations` to learn
// WHY an intent matched (which patterns fired) — useful for transparency.
// ----------------------------------------------------------------------------

export const version = '1.0.0';

// Each intent: { id, summary, commands, patterns[] }.
// `commands` are the pb shell form(s) the agent should run.
// `patterns` are JS regex sources; we wrap them with the `i` flag.
export const INTENTS = [
  // -- scoped verify (must precede generic verify) -----------------------
  {
    id: 'verify-task',
    summary: 'Run acceptance_checks for a specific backlog task.',
    commands: ['node scripts/pb.mjs validate --task <id>'],
    patterns: [
      /\bcheck\s+task\s+[\w-]+/,
      /\bvalidate\s+task\s+[\w-]+/,
      /\brun\s+(the\s+)?checks?\s+for\s+[\w-]+/,
    ],
  },

  // -- record outcomes (blocked beats done) -------------------------------
  {
    id: 'record-blocked',
    summary: 'Mark the in-progress task blocked with a reason.',
    commands: ['node scripts/pb.mjs record --task <id> --action execute --status blocked --notes "<reason>"'],
    patterns: [
      /\bblocked\b/,
      /\bmark\s+(it\s+)?blocked\b/,
      /\brecord\s+(it\s+)?blocked\b/,
    ],
  },
  {
    id: 'record-done',
    summary: 'Mark the in-progress task done and run its acceptance_checks.',
    commands: ['node scripts/pb.mjs record --task <id> --action execute --status done --notes "<what+why>"'],
    patterns: [
      /\b(mark|log|record)\b.*\bdone\b/,
      /\bthat'?s\s+done\b/,
      /\b(?:i|we)\s+(?:am|are|have)\s+(?:done|finished)\b/i,
      /\b(?:i|we)'(?:m|re)\s+(?:done|finished)\b/i,
      /\bfinished\s+(it|with)\b/,
      /\ball\s+done\b/,
    ],
  },

  // -- select / claim (claim is more specific) ----------------------------
  {
    id: 'claim',
    summary: 'Claim the next actionable task (status → in_progress).',
    commands: ['node scripts/pb.mjs next --claim'],
    patterns: [
      /\bclaim\s+(the\s+)?(next\s+)?(task|one)?\b/,
      /\bpick\s+(the\s+)?(next\s+)?(task|one)?\b/,
      /\blet'?s\s+do\s+(the\s+)?next\b/,
      /\bstart\s+(the\s+)?next\s+(task|one)\b/,
      /\bwork\s+on\s+(the\s+)?next\b/,
    ],
  },
  {
    id: 'select',
    summary: 'Peek at the next task without claiming it.',
    commands: ['node scripts/pb.mjs next'],
    patterns: [
      /\bwhat'?s\s+next\b/,
      /\bnext\s+(task|up)\b/,
      /\bshow\s+(me\s+)?(the\s+)?(queue|backlog)\b/,
      /\bwhat\s+(should|do)\s+(i|we)\s+do\s+next\b/,
      /\bwhat'?s\s+on\s+(the\s+)?(queue|backlog|list)\b/,
    ],
  },

  // -- phase / cycle (cycle-new beats loop-new) ---------------------------
  {
    id: 'cycle-new',
    summary: 'Open a new phase with a 4+1-question brief.',
    commands: ['node scripts/pb.mjs cycle --new --goal "<goal>" --stop "<stop>"'],
    patterns: [
      /\bnew\s+phase\b/,
      /\bnew\s+cycle\b/,
      /\bstart\s+(a\s+)?(cycle|phase)\b/,
      /\bopen\s+(a\s+)?(cycle|phase)\b/,
      /\bbrief\s+(me\s+)?(on\s+)?(the\s+)?(new\s+)?(cycle|phase)\b/,
    ],
  },
  {
    id: 'reflect',
    summary: 'Close the current phase: review done vs North Star and record.',
    commands: ['node scripts/pb.mjs reflect --notes "<summary>"'],
    patterns: [
      /\breflect\b/,
      /\bclose\s+(the\s+)?(phase|cycle)\b/,
      /\bwrap\s+(up|it)\b/,
      /\bend\s+(the\s+)?(phase|cycle)\b/,
    ],
  },

  // -- loop (durable epochs) ---------------------------------------------
  {
    id: 'loop-new',
    summary: 'Open a new durable loop epoch (optionally --fresh / --from-lessons).',
    commands: ['node scripts/pb.mjs loop new [--fresh] [--from-lessons] --goal "<goal>" --stop "<stop>"'],
    patterns: [
      /\bnew\s+loop\b/,
      /\bloop\s+new\b/,
      /\bfresh\s+loop\b/,
      /\bground[- ]?up\b/,
    ],
  },
  {
    id: 'loop-close',
    summary: 'Close the active loop epoch.',
    commands: ['node scripts/pb.mjs loop close --status <done|failed|abandoned> [--reason "..."]'],
    patterns: [
      /\bclose\s+(the\s+)?loop\b/,
      /\bloop\s+close\b/,
      /\bend\s+(the\s+)?loop\b/,
    ],
  },

  // -- single-intent actions ---------------------------------------------
  {
    id: 'orient',
    summary: 'Snapshot: backlog, recent journal, guardrail state — no mutation.',
    commands: ['node scripts/pb.mjs status'],
    patterns: [
      /\bstatus\b/,
      /\bwhere\s+are\s+we\b/,
      /\bwhere\s+am\s+i\b/,
      /\borient\b/,
      /\bbig\s+picture\b/,
      /\bsnapshot\b.*\b(state|loop)\b/,
    ],
  },
  {
    id: 'plan',
    summary: 'Add a task to the backlog with acceptance_checks.',
    commands: ['node scripts/pb.mjs plan --goal "<goal>" [--check "<cmd>"]... [--manual]'],
    patterns: [
      /\badd\s+(a\s+)?task\b/,
      /\bqueue\s+(this\s+)?up\b/,
      /\bbacklog\s*:/,
      /\bplan\s*:/,
      /\bschedule\s+(this\s+)?(to\s+)?(do|for)\b/,
      /\bnew\s+backlog\b/,
    ],
  },
  {
    id: 'verify',
    summary: 'Run structural guardrails (pb validate).',
    commands: ['node scripts/pb.mjs validate'],
    patterns: [
      /\bis\s+it\s+green\b/,
      /\bvalidate\b/,
      /\brun\s+(the\s+)?(guardrails|checks?)\b/,
      /\bcheck\s+(the\s+)?guardrails\b/,
      /\bverify\b(?!\s+task)/,
    ],
  },
  {
    id: 'report',
    summary: 'Roll the journal up into a human-readable artifact.',
    commands: ['node scripts/pb.mjs report'],
    patterns: [
      /\breport\b/,
      /\broll\s*up\b/,
      /\b(show|generate)\s+(me\s+)?(a|the)\s+report\b/,
      /\bhuman[- ]facing\s+(artifact|rollup)\b/,
    ],
  },
  {
    id: 'learn',
    summary: 'Record a structured lesson for the next loop.',
    commands: ['node scripts/pb.mjs learn --source user --notes "<lesson>" [--severity high]'],
    patterns: [
      /\bi\s+learned\b/,
      /\bcapture\s+(this\s+)?lesson\b/,
      /\blesson\s*:/,
      /\bnote\s+for\s+(the\s+)?(next\s+)?loop\b/,
      /\bafterthought\b/,
    ],
  },
  {
    id: 'anchor',
    summary: 'Re-print the constitution; safe to re-inject every turn.',
    commands: ['node scripts/pb.mjs anchor [--brief]'],
    patterns: [
      /\bre[- ]?anchor\b/,
      /\banchor\b/,
      /\b(inject|replay)\s+(the\s+)?(constitution|master)\b/,
    ],
  },
  {
    id: 'checkpoint',
    summary: 'Heartbeat: re-anchor + detect drift; --snapshot writes RESUME.md.',
    commands: ['node scripts/pb.mjs checkpoint [--snapshot]'],
    patterns: [
      /\bcheckpoint\b/,
      /\bresume\b/,
      /\bafter\s+(a\s+)?compact(ion)?\b/,
      /\bafter\s+(a\s+)?handoff\b/,
    ],
  },
  {
    id: 'scaffold',
    summary: 'Copy this engine into another repo (copy-don\u2019t-clobber).',
    commands: ['node scripts/pb.mjs scaffold --target <dir>'],
    patterns: [
      /\bscaffold\s+(this\s+)?(into|to)\b/,
      /\binstall\s+(this\s+)?playbook\b/,
      /\bapply\s+(this\s+)?playbook\b/,
      /\bcopy\s+(the\s+)?engine\b/,
    ],
  },

  // -- fallback before unknown ------------------------------------------
  {
    id: 'help',
    summary: 'Show available commands and the loop.',
    commands: ['node scripts/pb.mjs help'],
    patterns: [
      /\bhelp\b/,
      /\bwhat\s+can\s+you\s+do\b/,
      /\bcommands?\s+(list|available)\b/,
      /\bhow\s+do\s+i\b/,
    ],
  },
];

/**
 * Route a natural-language utterance to a playbook intent.
 *
 * @param {string} text  — what the human/agent said
 * @returns {{ intent: string, summary: string, commands: string[], matched: string[], hints: string[] }}
 */
export function route(text) {
  const t = String(text ?? '').trim();
  if (!t) {
    return {
      intent: 'unknown',
      summary: 'Empty input.',
      commands: [],
      matched: [],
      hints: ['Say something like "what\u2019s next?" or "add a task to ..."'],
    };
  }

  for (const def of INTENTS) {
    const fired = [];
    for (const src of def.patterns) {
      const re = new RegExp(src.source, src.flags.includes('i') ? src.flags : src.flags + 'i');
      if (re.test(t)) fired.push(re.source);
    }
    if (fired.length) {
      return {
        intent: def.id,
        summary: def.summary,
        commands: def.commands.slice(),
        matched: fired,
        hints: [],
      };
    }
  }

  // No pattern fired. Suggest the closest intents (overlap on token presence).
  const tokens = new Set(t.toLowerCase().split(/\W+/).filter(Boolean));
  const scored = [];
  for (const def of INTENTS) {
    const defTokens = def.patterns
      .map((p) => p.source.toLowerCase().match(/[a-z][a-z0-9-]+/g) || [])
      .flat();
    const overlap = defTokens.filter((w) => tokens.has(w)).length;
    if (overlap > 0) scored.push({ id: def.id, overlap });
  }
  scored.sort((a, b) => b.overlap - a.overlap);
  const hints = scored.slice(0, 3).map((s) => `${s.id} (overlap ${s.overlap})`);

  return {
    intent: 'unknown',
    summary: 'No intent matched.',
    commands: [],
    matched: [],
    hints: hints.slice(0, 3),
  };
}

// CLI shim — lets humans / agents dry-run the matcher without writing JS.
// Usage:   node scripts/lib/nl-router.mjs "what's next?"
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const text = process.argv.slice(2).join(' ').trim();
  const out = route(text);
  console.log(JSON.stringify(out, null, 2));
}