import type { FastifyInstance } from "fastify";
import { findCheckoutState, type CheckoutStateView } from "../../billing/create.js";
import { escapeHtml, FOLIO_CSS, renderDocument } from "../../views/skin.js";

export const ABOUT_PATH = "/about" as const;
export const RULES_PATH = "/rules" as const;
export const CHECKOUT_COMPLETE_PATH = "/checkout/complete" as const;

type CompletionState =
  | "pending"
  | "open"
  | "unknown"
  | "paid"
  | "needs_reconciliation"
  | "rejected"
  | "malformed";

const CHECKOUT_CSS = `${FOLIO_CSS}
.checkout-state {
  max-width: 38rem;
  margin: 2.25rem auto 0;
  padding: 1.35rem 0 0;
  border-top: 4px double var(--rule);
}
.checkout-state .state-kicker {
  margin: 0 0 .45rem;
  color: var(--flag);
  font-family: var(--display);
  font-size: .72rem;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.checkout-state h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(2rem, 8vw, 3.6rem);
  letter-spacing: -.04em;
  line-height: .95;
  text-transform: uppercase;
}
.checkout-state .state-copy {
  margin: 1rem 0 0;
  max-width: 34rem;
  font-size: 1.05rem;
}
.checkout-state .state-fact {
  margin: 1.15rem 0 0;
  padding-top: .75rem;
  border-top: 1px solid var(--hair);
  color: var(--mute);
  font-family: var(--display);
  font-size: .72rem;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.checkout-state .state-link {
  display: inline-block;
  margin-top: 1.35rem;
  text-decoration: underline;
  text-underline-offset: .15em;
}
`;

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
    `        <p>Newsletter Cover is a public auction for the cover and first slot of the next weekly issue.</p>
        <p>The next issue’s cover goes to whoever pays the most. <strong>Rank is the bid</strong> — nothing else. Clicks, pitch, and destination never break a tie. A new listing starts at <strong>$5</strong>.</p>
        <p>Each paid placement remains eligible for seven days. The highest current bid is the cover; when bids are equal, the listing placed first stays higher. If nobody has paid for a placement, the issue remains without a sponsored cover.</p>
        <p>Readers can watch the public board without an account. A listing appears only after payment is confirmed. The board does not display invented subscriber counts or editorial scores.</p>
`,
    "about",
  );
}

export function renderRulesHtml(): string {
  return renderPage(
    "Rules · Newsletter Cover",
    "Rules",
    `        <p>These are the public auction rules. <strong>Rank is the bid.</strong></p>
        <ul>
          <li>Minimum first bid is <strong>$5</strong>. Maximum bid is <strong>$10,000</strong>. Whole USD only. No cents, no other currencies.</li>
          <li>Rank is the bid. Sort bid descending. A bid below #1 still lists at the rank that amount can take.</li>
          <li>Equal bids: the listing placed first keeps the higher rank. Pitch, destination, and clicks never break a tie.</li>
          <li>A raise uses the same cleaned sponsor link and must increase the current total by at least $1. The original payer is charged only the difference.</li>
          <li>Rank changes only after payment is confirmed. An incomplete or abandoned checkout changes nothing.</li>
          <li>Each paid placement remains eligible for <strong>seven days</strong>. The board does not reset for everyone at Monday midnight.</li>
          <li>Tracking and click-identifying parameters are removed from sponsor links.</li>
          <li>Link shorteners, chat invitations, adult content, and unsafe destinations are rejected before checkout.</li>
          <li>Paid listings appear on the board immediately after confirmation; there is no editorial re-ranking.</li>
        </ul>
`,
    "rules",
  );
}

function completionStateFor(
  row: CheckoutStateView | null,
  malformed: boolean,
): CompletionState {
  if (malformed) return "malformed";
  if (!row) return "unknown";
  switch (row.status) {
    case "creating":
    case "pending":
      return "pending";
    case "open":
      return "open";
    case "paid":
      return "paid";
    case "needs_reconciliation":
      return "needs_reconciliation";
    case "rejected":
      return "rejected";
    case "unknown":
    case "pending_unknown":
    default:
      return "unknown";
  }
}

function completionCopy(state: CompletionState): { heading: string; copy: string } {
  switch (state) {
    case "pending":
      return {
        heading: "Checkout pending",
        copy: "This checkout is recorded, but payment has not been confirmed. Complete the hosted checkout to continue.",
      };
    case "open":
      return {
        heading: "Checkout open",
        copy: "Your checkout is open. Complete payment to place the cover bid.",
      };
    case "paid":
      return {
        heading: "Payment received",
        copy: "Your paid cover placement is on the board and ranked by bid.",
      };
    case "needs_reconciliation":
      return {
        heading: "Payment is under review",
        copy: "Payment was captured, but the cover placement still needs confirmation. Do not pay again.",
      };
    case "rejected":
      return {
        heading: "Checkout rejected",
        copy: "This checkout was rejected and did not place a cover bid.",
      };
    case "malformed":
      return {
        heading: "Checkout not identified",
        copy: "This return link is incomplete. Open the checkout link you were given or return to the cover.",
      };
    case "unknown":
    default:
      return {
        heading: "Checkout status unknown",
        copy: "We could not confirm this checkout yet. Keep your receipt and check the board again shortly.",
      };
  }
}

export function renderCheckoutCompleteHtml(
  state: CompletionState,
  row: CheckoutStateView | null,
): string {
  const copy = completionCopy(state);
  const intentAttr = row
    ? ` data-checkout-intent="${escapeHtml(row.id)}"`
    : "";
  const fact = row && (state === "pending" || state === "open")
    ? `<p class="state-fact">Target bid $${escapeHtml(String(row.targetBidUsd))} · awaiting payment confirmation</p>`
    : row && state === "paid"
      ? `<p class="state-fact">Paid cover bid · $${escapeHtml(String(row.targetBidUsd))}</p>`
      : "";
  return renderDocument({
    title: `${copy.heading} · The Cover`,
    active: "cover",
    css: CHECKOUT_CSS,
    body: `      <main class="checkout-state" data-checkout-state="${state}"${intentAttr}>
        <p class="state-kicker">The Cover · checkout</p>
        <h1>${copy.heading}</h1>
        <p class="state-copy">${copy.copy}</p>
        ${fact}
        <a class="state-link" href="/">Back to the cover board.</a>
      </main>`,
  });
}

function requestedCheckoutIdentifier(query: unknown): {
  identifier: string | null;
  malformed: boolean;
} {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return { identifier: null, malformed: true };
  }
  const values = query as Record<string, unknown>;
  const raw = values.intent ?? values.checkoutId;
  if (typeof raw !== "string" || raw.trim() === "" || raw.length > 200) {
    return { identifier: null, malformed: true };
  }
  return { identifier: raw, malformed: false };
}

export function registerPageRoutes(app: FastifyInstance): void {
  app.get(ABOUT_PATH, async (_request, reply) => {
    await reply.type("text/html; charset=utf-8").send(renderAboutHtml());
  });
  app.get(RULES_PATH, async (_request, reply) => {
    await reply.type("text/html; charset=utf-8").send(renderRulesHtml());
  });
  app.get(CHECKOUT_COMPLETE_PATH, async (request, reply) => {
    const requested = requestedCheckoutIdentifier(request.query);
    const row = requested.identifier
      ? findCheckoutState(app.db, requested.identifier)
      : null;
    const state = completionStateFor(row, requested.malformed);
    await reply
      .header("cache-control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderCheckoutCompleteHtml(state, row));
  });
}
