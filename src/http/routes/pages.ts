import type { FastifyInstance } from "fastify";

export const ABOUT_PATH = "/about" as const;
export const RULES_PATH = "/rules" as const;

function renderPage(title: string, heading: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body>
    <h1>${heading}</h1>
${body}
    <p>
      <a href="/">Board</a>
      ·
      <a href="/about">About</a>
      ·
      <a href="/rules">Rules</a>
    </p>
  </body>
</html>
`;
}

export function renderAboutHtml(): string {
  return renderPage(
    "About · Newsletter Cover",
    "About",
    `    <p>Newsletter Cover is a public auction for the next issue’s cover / first slot of one global English vertical newsletter. It is a clone of <a href="https://outbid.lol">outbid.lol</a> pay-to-rank mechanics.</p>
    <p>One-line pitch: the next issue’s cover goes to whoever pays the most. Rank is the bid — nothing else. Clicks, blurb, and URL never break a tie. First bid is at least <strong>$5</strong>.</p>
    <p>Cadence is a weekly issue. When the issue closes, the highest bid is the cover / issue #1. Readers watch the public board. There are no ads, no on-site chat, and no invented subscriber counts or editor’s-pick scores.</p>
    <p>Money in is Polar. Readers never see an API key. Editor veto is off in v1: a paid listing appears on the board immediately.</p>
`,
  );
}

export function renderRulesHtml(): string {
  return renderPage(
    "Rules · Newsletter Cover",
    "Rules",
    `    <p>These are the auction rules. Rank is money.</p>
    <ul>
      <li>Minimum first bid is <strong>$5</strong>. Maximum bid is <strong>$10,000</strong>. Whole USD only. No cents, no other currencies.</li>
      <li>Rank is the bid. Sort bid descending. A bid below #1 still lists at the rank that amount can take.</li>
      <li>Equal bids: the older listing wins the higher rank. Never break ties with blurb, URL, or clicks.</li>
      <li>Raise pays the difference only. Same cleaned sponsor URL on the same issue. New bid must be higher; Polar charges <code>new bid − current bid</code>. <code>createdAt</code> does not change.</li>
      <li>Unpaid Polar checkout does not change bid or rank.</li>
      <li>Tracking and click-id query strings are stripped before store, display, or redirect.</li>
      <li>Chat-app links and NSFW are rejected. No on-site chat.</li>
      <li>Editor veto is off. <code>EDITOR_VETO</code> is not <code>1</code>. Paid listings are visible immediately. There is no pending gate and no admin re-rank.</li>
    </ul>
`,
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
