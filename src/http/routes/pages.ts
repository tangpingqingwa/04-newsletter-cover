import type { FastifyInstance } from "fastify";
import { renderDocument } from "../../views/skin.js";

export const ABOUT_PATH = "/about" as const;
export const RULES_PATH = "/rules" as const;

function renderPage(
  title: string,
  heading: string,
  body: string,
  active: "about" | "rules",
): string {
  return renderDocument({
    title,
    active,
    body: `      <article class="doc">
        <h1>${heading}</h1>
${body}
      </article>`,
  });
}

export function renderAboutHtml(): string {
  return renderPage(
    "About · Newsletter Cover",
    "About",
    `        <p>Newsletter Cover is a public auction for the next issue’s cover / first slot of one global English vertical newsletter. It is a clone of <a href="https://outbid.lol">outbid.lol</a> pay-to-rank mechanics.</p>
        <p>One-line pitch: the next issue’s cover goes to whoever pays the most. Rank is the bid — nothing else. Clicks, blurb, and URL never break a tie. First bid is at least <strong>$5</strong>.</p>
        <p>Cadence is a weekly issue. Occupied live rank is the <strong>rolling last 7 days</strong> from paid placement — not Monday 00:00 UTC, and not a 24h lock on #1. When the occupied window ends, the highest bid is the cover / issue #1. Empty issues still close at the cover date with no invented winner. Readers watch the public board. There are no ads, no on-site chat, and no invented subscriber counts or editor’s-pick scores.</p>
        <p>Money in is Polar. Readers never see an API key. Editor veto is off in v1: a paid listing appears on the board immediately.</p>
`,
    "about",
  );
}

export function renderRulesHtml(): string {
  return renderPage(
    "Rules · Newsletter Cover",
    "Rules",
    `        <p>These are the auction rules. Rank is money.</p>
        <ul>
          <li>Minimum first bid is <strong>$5</strong>. Maximum bid is <strong>$10,000</strong>. Whole USD only. No cents, no other currencies.</li>
          <li>Rank is the bid. Sort bid descending. A bid below #1 still lists at the rank that amount can take.</li>
          <li>Equal bids: the older listing wins the higher rank. Never break ties with blurb, URL, or clicks.</li>
          <li>Raise pays the difference only. Same cleaned sponsor URL on the same issue. New bid must be higher; Polar charges <code>new bid − current bid</code>. <code>createdAt</code> does not change.</li>
          <li>Unpaid Polar checkout does not change bid or rank.</li>
          <li>Occupied live rank is the <strong>rolling last 7 days</strong> from paid placement. Not Monday 00:00 UTC. Not a 24h lock on #1. Empty issues close at <code>issueDate 00:00:00 UTC</code> with no cover.</li>
          <li>Tracking and click-id query strings are stripped before store, display, or redirect.</li>
          <li>Chat-app links and NSFW are rejected. No on-site chat.</li>
          <li>Editor veto is off. <code>EDITOR_VETO</code> is not <code>1</code>. Paid listings are visible immediately. There is no pending gate and no admin re-rank.</li>
        </ul>
`,
    "rules",
  );
}

export function registerPageRoutes(app: FastifyInstance): void {
  app.get(ABOUT_PATH, async (_request, reply) => {
    await reply.type("text/html; charset=utf-8").send(renderAboutHtml());
  });
  app.get(RULES_PATH, async (_request, reply) => {
    await reply.type("text/html; charset=utf-8").send(renderRulesHtml());
  });
}
