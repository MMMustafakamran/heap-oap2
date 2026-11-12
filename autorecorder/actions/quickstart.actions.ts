import { type PageActionHandler } from '../core/types';
import { runStandardAction } from '../core/actions';
import { type DocEvidence, showFinding } from './doc-evidence';

/** Texts checked against the rendered page (2026-11-13). FINDINGS.md #1. */
export const FINDING_EVIDENCE: Record<string, DocEvidence[]> = {
  quickstart: [
    { text: 'Bring your OpenAI Agents SDK agents', caption: 'The Vue quickstart URL shows the landing page, not Vue steps' },
    { text: 'import type { NextRequest } from "next/server";', caption: 'The only runtime code is a Next.js route handler' },
  ],
};

/** Generic wording (owner rule): what the page shows vs what a Vue reader needs. */
const QUICKSTART_FINDING = [
  'the vue quickstart page is just the landing page for this framework',
  'the only code on it is a next js route handler, cant run that in a vue vite app',
  'no vue install steps, no node runtime for vue, no python agent code',
  'read the setup guide link just goes back to the same page',
  'so i had to wire the vue app to the python agent myself',
].join('\n');

export const runVueQuickstartAction: PageActionHandler = async (page, config, root, ctx) => {
  try {
    await runStandardAction(page, config, root, ctx);
  } finally {
    await showFinding(page, config, FINDING_EVIDENCE[config.id], QUICKSTART_FINDING, 'finding-vue-quickstart.txt');
  }
};
