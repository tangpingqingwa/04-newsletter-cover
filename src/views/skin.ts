import { MIN_BID_USD } from "../listings.js";

export type NavId = "cover" | "about" | "rules";

export type BoardViewListing = {
  rank: number;
  id: string;
  sponsorUrl: string;
  blurb: string;
  bidUsd: number;
  clicks: number;
};

export type BoardView = {
  issueDate: string | null;
  status: "open" | "closed" | null;
  listings: BoardViewListing[];
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function spokenIssueDate(issueDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueDate);
  if (!match) {
    return issueDate;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return issueDate;
  }
  return `${WEEKDAYS[utc.getUTCDay()]}, ${MONTHS[utc.getUTCMonth()]} ${day}, ${year}`;
}

export function displaySponsor(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${host}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

function navItem(href: string, label: string, current: boolean): string {
  return `<li><a href="${href}"${current ? ' aria-current="page"' : ""}>${label}</a></li>`;
}

export function renderDocument(input: {
  title: string;
  active: NavId;
  body: string;
  css?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <style>${input.css ?? FOLIO_CSS}</style>
  </head>
  <body>
    <div class="sheet">
      <nav class="site-nav" aria-label="Main">
        <a class="mark" href="/">The Cover</a>
        <ul>
          ${navItem("/", "Leaderboard", input.active === "cover")}
          ${navItem("/about", "About", input.active === "about")}
          ${navItem("/rules", "Rules", input.active === "rules")}
        </ul>
      </nav>
      ${input.body}
    </div>
  </body>
</html>
`;
}

function issueState(status: BoardView["status"]): { label: string; attr: string } {
  if (status === "open") {
    return { label: "OPEN", attr: "open" };
  }
  if (status === "closed") {
    return { label: "CLOSED", attr: "closed" };
  }
  return { label: "UNSET", attr: "unset" };
}

function renderMasthead(board: BoardView): string {
  const state = issueState(board.status);
  const dateBlock = board.issueDate
    ? `<time datetime="${escapeHtml(board.issueDate)}" data-issue-date="${escapeHtml(board.issueDate)}">${escapeHtml(spokenIssueDate(board.issueDate))}</time>`
    : `<span data-issue-date="">No issue on the stand</span>`;
  return `      <header class="masthead">
        <p class="folio">
          ${dateBlock}
          <span class="issue-state" data-issue-status="${state.attr}">${state.label}</span>
        </p>
        <div class="nameplate">
          <p class="ear">Vol. I · One prize</p>
          <h1>The Cover</h1>
          <p class="ear ear-right">Weekly · UTC</p>
        </div>
        ${renderFlag(board)}
      </header>`;
}

function renderFlag(board: BoardView): string {
  if (board.status === "closed") {
    if (board.listings.length === 0) {
      return `<p class="flag">This issue is closed. It is not the next issue’s cover. <a href="/" data-open-cover="true">The open cover is on the stand.</a></p>`;
    }
    return `<p class="flag">This issue is closed. It is not the next issue’s cover.</p>`;
  }
  if (board.listings.length > 0) {
    return `<p class="flag"><span data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold.</span> Rank is the bid.</p>`;
  }
  return `<p class="flag" data-empty-open-stand="true">The next issue’s cover goes to whoever pays the most. Rank is the bid.</p>`;
}

function renderClaim(board: BoardView): string {
  if (board.status === "closed") {
    return board.listings.length === 0
      ? `      <p class="form-hint">This issue is frozen. No cover sold.</p>`
      : `      <p class="form-hint" data-frozen-issue="true">This issue is frozen. The cover is whoever paid the most before close. <a href="/" data-open-cover="true">The open cover is on the stand.</a></p>`;
  }
  const empty = board.listings.length === 0;
  const top = board.listings[0]?.bidUsd ?? 0;
  const defaultBid = top > 0 ? top + 1 : MIN_BID_USD;
  const note = empty
    ? `<p class="claim-note" data-empty-issue="true" data-cover-prize="true">No cover sold. No paid listings on this board. $${MIN_BID_USD} takes #1 — this issue’s cover.</p>`
    : `<p class="claim-note">New spots start at $${MIN_BID_USD}. One prize: the cover. Paying less than #1 still lists at the rank that bid can take.</p>`;
  const raiseHint = empty
    ? ""
    : `
          <p class="form-hint">Already on this issue? Enter the same sponsor URL and raise. You pay only the difference.</p>`;
  const claimAttrs = empty
    ? ' class="claim empty-claim-first" id="claim" data-empty-claim-first="true" aria-label="Claim #1"'
    : ' class="claim" id="claim"';
  const claimHedAttrs = empty
    ? ' class="claim-hed" data-first-click="claim"'
    : ' class="claim-hed"';
  const formFields = empty
    ? `<button type="submit" class="outbid">Outbid</button>
          <div class="cover-identity" data-cover-identity="true" data-later-write="true">
            <p class="later-write-label">Then the cover URL</p>
            <input name="sponsorUrl" type="url" required placeholder="Sponsor URL" autocomplete="url"/>
            <input class="blurb-field" name="blurb" type="text" required maxlength="120" placeholder="One-line cover pitch"/>
          </div>`
    : `<div class="bid-row">
            <input name="sponsorUrl" type="url" required placeholder="Sponsor URL" autocomplete="url"/>
            <button type="submit" class="outbid">Outbid</button>
          </div>
          <div class="later-listing" data-later-listing="true">
            <input class="blurb-field" name="blurb" type="text" required maxlength="120" placeholder="One-line listing"/>
          </div>${raiseHint}`;
  return `      <section${claimAttrs}>
        <h2${claimHedAttrs}>
          <span>Claim #1 for</span>
          <span class="amount-stepper">
            <button type="button" class="step" data-bid-step="-1" aria-label="Decrease bid by one dollar">−</button>
            <label class="amount-field">
              <span class="sr-only">Amount in dollars</span>
              $<input id="bid" name="bidUsd" form="bid-form" inputmode="numeric" pattern="[0-9]*" value="${defaultBid}" required/>
            </label>
            <button type="button" class="step" data-bid-step="1" aria-label="Increase bid by one dollar">+</button>
          </span>
        </h2>
        ${note}
        <form id="bid-form" method="post" action="/listings">
          ${formFields}
        </form>
      </section>
      <script>
        (function () {
          var min = ${MIN_BID_USD};
          var input = document.getElementById("bid");
          if (!input) return;
          function parseBid(raw) {
            var n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
            return Number.isFinite(n) ? Math.max(min, n) : min;
          }
          document.querySelectorAll("[data-bid-step]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              input.value = String(parseBid(input.value) + Number(btn.getAttribute("data-bid-step")));
            });
          });
        })();
      </script>`;
}

function renderPitch(listing: BoardViewListing, openPrize: boolean): string {
  const href = `/l/${encodeURIComponent(listing.id)}`;
  const isCover = listing.rank === 1;
  const coverClass = isCover ? " cover" : "";
  const kicker = isCover ? "Cover · #1" : `#${listing.rank}`;
  const prizeLine = isCover ? ' data-cover-prize-line="true"' : "";
  const prizeBefore = isCover ? ' data-prize-before-price="true"' : "";
  const laterRank = isCover ? "" : ' data-later-rank="true"';
  const namedPrize = isCover ? ' data-named-prize="true"' : "";
  const paidName = isCover ? ' data-paid-name="true"' : "";
  const stampedCoverClass = openPrize ? coverClass : "";
  const stampedPrizeLine = openPrize ? prizeLine : "";
  const stampedPrizeBefore = openPrize ? prizeBefore : "";
  const stampedLaterRank = openPrize ? laterRank : "";
  const stampedNamedPrize = openPrize ? namedPrize : "";
  const stampedPaidName = openPrize ? paidName : "";
  const laterFact = openPrize && isCover;
  if (laterFact) {
    return `        <li class="cover-line${stampedCoverClass}"${stampedPrizeBefore} data-rank="${listing.rank}" data-id="${escapeHtml(listing.id)}" data-sponsor-url="${escapeHtml(listing.sponsorUrl)}"${stampedNamedPrize}${stampedPaidName}>
          <span class="rank"${stampedPrizeLine}>${kicker}</span>
          <div>
            <p class="hed"><a href="${href}" data-cover-first="true">${escapeHtml(listing.blurb)}</a></p>
            <div class="later-fact" data-later-fact="true">
              <p class="dek"><a href="${href}">${escapeHtml(displaySponsor(listing.sponsorUrl))}</a></p>
              <p class="bid">$${listing.bidUsd}</p>
              <p class="clicks">${listing.clicks} clicks</p>
            </div>
          </div>
        </li>`;
  }
  if (openPrize && !isCover) {
    return `        <li class="cover-line"${stampedLaterRank} data-rank="${listing.rank}" data-id="${escapeHtml(listing.id)}" data-sponsor-url="${escapeHtml(listing.sponsorUrl)}">
          <span class="rank">${kicker}</span>
          <div>
            <p class="dek"><a href="${href}">${escapeHtml(displaySponsor(listing.sponsorUrl))}</a></p>
            <p class="slot">${escapeHtml(listing.blurb)}</p>
          </div>
          <div class="money">
            <p class="bid">$${listing.bidUsd}</p>
            <p class="clicks">${listing.clicks} clicks</p>
          </div>
        </li>`;
  }
  if (!openPrize && isCover) {
    return `        <li class="cover-line cover" data-frozen-cover="true" data-archive-name="true" data-rank="${listing.rank}" data-id="${escapeHtml(listing.id)}" data-sponsor-url="${escapeHtml(listing.sponsorUrl)}">
          <span class="rank">${kicker}</span>
          <div>
            <p class="hed"><a href="${href}">${escapeHtml(listing.blurb)}</a></p>
            <p class="dek"><a href="${href}">${escapeHtml(displaySponsor(listing.sponsorUrl))}</a></p>
          </div>
          <div class="money">
            <p class="bid">$${listing.bidUsd}</p>
            <p class="clicks">${listing.clicks} clicks</p>
          </div>
        </li>`;
  }
  if (!openPrize && !isCover) {
    return `        <li class="cover-line" data-rank="${listing.rank}" data-id="${escapeHtml(listing.id)}" data-sponsor-url="${escapeHtml(listing.sponsorUrl)}">
          <span class="rank">${kicker}</span>
          <div>
            <p class="dek"><a href="${href}">${escapeHtml(displaySponsor(listing.sponsorUrl))}</a></p>
            <p class="slot">${escapeHtml(listing.blurb)}</p>
          </div>
          <div class="money">
            <p class="bid">$${listing.bidUsd}</p>
            <p class="clicks">${listing.clicks} clicks</p>
          </div>
        </li>`;
  }
  return `        <li class="cover-line${stampedCoverClass}"${stampedPrizeBefore}${stampedLaterRank} data-rank="${listing.rank}" data-id="${escapeHtml(listing.id)}" data-sponsor-url="${escapeHtml(listing.sponsorUrl)}"${stampedNamedPrize}>
          <span class="rank"${stampedPrizeLine}>${kicker}</span>
          <div>
            <p class="hed">${escapeHtml(listing.blurb)}</p>
            <p class="dek"><a href="${href}">${escapeHtml(displaySponsor(listing.sponsorUrl))}</a></p>
          </div>
          <div class="money">
            <p class="bid">$${listing.bidUsd}</p>
            <p class="clicks">${listing.clicks} clicks</p>
          </div>
        </li>`;
}

/** Occupied Claim the next cover is a later write after Cover · #1, not a masthead rail. */
const OCCUPIED_CLAIM_HOP = `      <p class="claim-after-listing" data-claim-after-listing="true"><a href="#claim" data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover.</a></p>`;

function renderRack(board: BoardView): string {
  if (board.listings.length === 0) {
    if (board.status === "closed") {
      return `      <section class="empty-issue" data-empty-issue="true" data-closed-empty-issue="true">
        <p class="empty-kicker">No cover sold</p>
        <p>No paid listings on this board. Nobody bought the cover. The folio stays blank.</p>
      </section>`;
    }
    return `      <section class="empty-stand" aria-label="This issue’s cover" data-read-stand="true" data-empty-open-stand="true">
        <p class="empty-kicker">This issue’s cover</p>
        <p class="hed">No cover sold</p>
        <p class="dek">No paid listings on this board. This issue’s cover is still open.</p>
        <p class="claim-after-stand"><a href="#claim" data-claim-after-stand="true">Claim this issue’s cover.</a></p>
      </section>`;
  }
  const readCover = board.status === "open";
  const attrs = readCover
    ? ' aria-label="This issue’s cover" data-read-cover="true"'
    : ' aria-label="This issue’s cover" data-frozen-board="true"';
  const rack = `      <ol class="cover-rack"${attrs}>
${board.listings.map((listing) => renderPitch(listing, board.status === "open")).join("\n")}
      </ol>`;
  if (!readCover) {
    return rack;
  }
  return `${rack}
${OCCUPIED_CLAIM_HOP}`;
}

function weekShell(board: BoardView): { open: string; close: string } {
  if (board.status === "closed") {
    const kind = board.listings.length === 0 ? "week-closed-empty" : "week-closed-occupied";
    return {
      open: `      <div class="week ${kind}">`,
      close: `      </div>`,
    };
  }
  if (board.listings.length > 0) {
    return {
      open: `      <div class="week week-open-sold">`,
      close: `      </div>`,
    };
  }
  return {
    open: `      <div class="week week-open-empty" data-empty-open-stand="true">`,
    close: `      </div>`,
  };
}

function boardCss(board: BoardView): string {
  const occupiedOpen = board.status === "open" && board.listings.length > 0;
  return occupiedOpen ? ISSUE_CSS : FOLIO_CSS;
}

export function renderBoardHtml(board: BoardView): string {
  const masthead = renderMasthead(board);
  const claim = renderClaim(board);
  const rack = renderRack(board);
  const week = weekShell(board);
  const readSoldCover = board.status === "open" && board.listings.length > 0;
  const readEmptyStand = board.status !== "closed" && board.listings.length === 0;
  const readFrozenCover = board.status === "closed" && board.listings.length > 0;
  const inner = readSoldCover || readEmptyStand || readFrozenCover
    ? `${masthead}
${rack}
${claim}`
    : `${masthead}
${claim}
${rack}`;
  const body = `${week.open}
${inner}
${week.close}`;
  return renderDocument({
    title: "The Cover · Newsletter Cover",
    active: "cover",
    body,
    css: boardCss(board),
  });
}

export const FOLIO_CSS = /* css */ `
:root {
  --stone: #1c1d21;
  --sheet: #ece7dc;
  --rule: #121212;
  --ink: #121212;
  --mute: #4a463e;
  --flag: #9d1c14;
  --hair: #b7b19f;
  --display: "Franklin Gothic Medium", "Arial Narrow", Impact, "Helvetica Neue", sans-serif;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { height: 100%; }
body {
  min-height: 100%;
  background:
    radial-gradient(1200px 480px at 50% -10%, #2a2c33, transparent 55%),
    var(--stone);
  color: var(--ink);
  font-family: var(--serif);
  line-height: 1.45;
}
a { color: inherit; text-decoration: none; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.sheet {
  width: min(100% - 1.25rem, 48rem);
  margin: 1.1rem auto 2.5rem;
  background:
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 11.9rem,
      rgb(18 18 18 / 0.06) 12rem
    ),
    var(--sheet);
  border: 1px solid #0b0b0b;
  box-shadow: 0 22px 50px rgb(0 0 0 / 0.38);
  padding: 0.85rem 1.15rem 2.4rem;
}
.site-nav {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding-bottom: 0.45rem;
  border-bottom: 1px solid var(--rule);
  font-family: var(--display);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.mark { font-weight: 700; }
.site-nav ul {
  display: flex; gap: 0.95rem; list-style: none; margin: 0; padding: 0;
}
.site-nav a { color: var(--mute); }
.site-nav a[aria-current="page"],
.site-nav a:hover { color: var(--ink); }
.masthead {
  text-align: center;
  padding: 0.7rem 0 0.85rem;
  border-bottom: 4px double var(--rule);
}
.folio {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.45rem;
  font-family: var(--display);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.folio time { font-variant-numeric: tabular-nums; }
.issue-state {
  display: inline-block;
  min-width: 5.4rem;
  padding: 0.12rem 0.4rem;
  border: 1px solid var(--rule);
  font-weight: 700;
}
.issue-state[data-issue-status="open"] {
  background: var(--ink);
  color: var(--sheet);
}
.issue-state[data-issue-status="closed"] {
  background: var(--flag);
  color: #fff8f4;
  border-color: var(--flag);
}
.nameplate {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 0.6rem;
  padding: 0.15rem 0 0.2rem;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.ear {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
}
.ear-right { text-align: right; }
.nameplate h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(2.6rem, 10vw, 4.6rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 0.82;
  text-transform: uppercase;
}
.flag {
  margin: 0.55rem 0 0;
  font-size: 0.95rem;
}
.flag a {
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
.week-closed-empty .flag a[data-open-cover] {
  display: block;
  font-weight: 700;
  margin-top: 0.55rem;
}
.week-closed-occupied .cover-rack[data-frozen-board] {
  margin-top: 0.85rem;
}
.week-closed-occupied .cover-line.cover[data-frozen-cover][data-archive-name] {
  grid-template-columns: max-content 1fr auto;
  background: linear-gradient(180deg, rgb(157 28 20 / 0.08), transparent 70%);
  border-top: 2px solid var(--rule);
}
.week-closed-occupied .cover-line.cover[data-frozen-cover][data-archive-name] .rank {
  color: var(--flag);
  font-size: 1.85rem;
  letter-spacing: -0.04em;
  line-height: 0.92;
  white-space: nowrap;
}
.week-closed-occupied .cover-line.cover[data-frozen-cover][data-archive-name] .hed {
  font-size: 1.55rem;
  letter-spacing: -0.04em;
  line-height: 1.02;
}
.week-closed-occupied .cover-line.cover[data-frozen-cover][data-archive-name] .hed a {
  color: inherit;
  text-decoration: none;
}
.week-closed-occupied .cover-line.cover[data-frozen-cover][data-archive-name] .hed a:hover {
  text-decoration: underline;
  text-underline-offset: 0.12em;
}
.week-closed-occupied .cover-line.cover[data-frozen-cover][data-archive-name] .dek {
  font-size: 0.78rem;
}
.week-closed-occupied .cover-line.cover[data-frozen-cover][data-archive-name] .bid {
  font-size: 0.92rem;
}
.week-closed-occupied .cover-line:not([data-frozen-cover]) {
  padding: 0.55rem 0;
}
.week-closed-occupied .cover-line:not([data-frozen-cover]) .rank {
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--mute);
}
.week-closed-occupied .cover-line:not([data-frozen-cover]) .dek {
  margin: 0;
  font-size: 0.78rem;
}
.week-closed-occupied .cover-line:not([data-frozen-cover]) .slot {
  margin: 0.18rem 0 0;
  font-family: var(--serif);
  font-size: 0.78rem;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--mute);
  line-height: 1.35;
}
.week-closed-occupied .form-hint[data-frozen-issue] {
  margin: 1.1rem 0 0;
  padding: 0.85rem 0 0;
  border-top: 1px solid var(--rule);
  text-align: left;
  font-size: 0.88rem;
  color: var(--mute);
}
.week-closed-occupied .form-hint[data-frozen-issue] a[data-open-cover] {
  display: block;
  margin-top: 0.45rem;
  font-weight: 400;
  color: var(--mute);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
.week-closed-empty .form-hint[data-frozen-issue] {
  display: none;
}
.claim {
  padding: 1rem 0 1.05rem;
  border-bottom: 1px solid var(--rule);
}
.claim-hed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.45rem 0.6rem;
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.45rem, 4vw, 2.05rem);
  letter-spacing: -0.03em;
  text-transform: uppercase;
  text-align: center;
}
.amount-stepper { display: inline-flex; align-items: center; gap: 0.4rem; }
.step {
  width: 1.5rem; height: 1.5rem;
  border: 1px solid var(--rule);
  background: transparent;
  font-weight: 700;
}
.step:hover { background: var(--ink); color: var(--sheet); }
.amount-field {
  color: var(--flag);
  text-decoration: underline dashed;
  text-underline-offset: 0.28em;
  font-variant-numeric: tabular-nums;
}
.amount-field input {
  width: 5.5ch; border: 0; background: transparent; color: inherit; font: inherit; outline: none;
}
.claim-note {
  margin: 0.5rem 0 0;
  text-align: center;
  color: var(--mute);
  font-size: 0.92rem;
}
.bid-row {
  display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.85rem;
}
.bid-row input, .blurb-field {
  min-width: 0; flex: 1 1 16rem;
  height: 2.55rem;
  padding: 0 0.7rem;
  border: 1px solid var(--rule);
  background: #f7f3ea;
}
.blurb-field { margin-top: 0.5rem; width: 100%; }
.outbid {
  height: 2.55rem;
  padding: 0 1.2rem;
  border: 1px solid var(--rule);
  background: var(--ink);
  color: var(--sheet);
  font-family: var(--display);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}
/* Empty open: Claim #1 is the only first click. Cover URL is a later write after Outbid. */
.week-open-empty #claim.empty-claim-first[data-empty-claim-first] {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.week-open-empty #claim.empty-claim-first[data-empty-claim-first] #bid-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .claim-hed[data-first-click="claim"] {
  font-size: clamp(1.85rem, 5vw, 2.55rem);
}
.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .outbid {
  width: auto;
  min-width: 9rem;
  margin: 0.85rem auto 0;
}
.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .cover-identity[data-later-write] {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 28rem;
  margin: 0.85rem auto 0;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--hair);
}
.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .later-write-label {
  margin: 0;
  text-align: center;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
}
.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .cover-identity[data-later-write] input {
  width: 100%;
  min-width: 0;
  flex: none;
  height: 2.2rem;
  font-size: 0.88rem;
  color: var(--mute);
}
.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .cover-identity[data-later-write] .blurb-field {
  margin-top: 0;
}
.form-hint { margin: 0.55rem 0 0; text-align: center; font-size: 0.78rem; color: var(--mute); }
.cover-rack + .claim,
.claim-after-listing + .claim,
.empty-stand + .claim,
.cover-rack + .form-hint[data-frozen-issue] {
  border-top: 1px solid var(--rule);
  border-bottom: 0;
}
.week-open-empty .claim-after-listing,
.week-closed-empty .claim-after-listing,
.week-closed-occupied .claim-after-listing {
  display: none;
}
.empty-stand {
  margin: 1.1rem 0 0;
  padding: 0.95rem 0 1.15rem;
}
.empty-stand .hed { margin-top: 0.12rem; }
.empty-stand .claim-after-stand { margin: 0.7rem 0 0; }
.empty-stand .claim-after-stand a {
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
.week-open-empty .empty-issue,
.week-closed-empty .empty-stand,
.week-closed-occupied .empty-stand,
.week-closed-occupied .claim,
.week-closed-empty [data-frozen-cover],
.week-closed-empty [data-frozen-board],
.week-closed-empty [data-archive-name],
.week-open-empty [data-frozen-cover],
.week-open-empty [data-frozen-board],
.week-open-empty [data-archive-name],
.week-open-sold [data-frozen-cover],
.week-open-sold [data-frozen-board],
.week-open-sold [data-archive-name] {
  display: none;
}
.week-open-empty .empty-stand {
  display: block;
}
.empty-issue {
  margin: 1.4rem 0 0;
  padding: 1.2rem 0.6rem 0.4rem;
  text-align: center;
  border-top: 1px dashed var(--hair);
}
.empty-kicker {
  margin: 0 0 0.35rem;
  font-family: var(--display);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-size: 0.78rem;
}
.cover-rack { list-style: none; margin: 1.1rem 0 0; padding: 0; }
.cover-line {
  display: grid;
  grid-template-columns: 2.4rem 1fr auto;
  gap: 0.55rem 0.8rem;
  padding: 0.85rem 0;
  border-top: 1px solid var(--hair);
}
.rank {
  font-family: var(--display);
  font-weight: 700;
  letter-spacing: 0.04em;
}
.hed {
  margin: 0;
  font-family: var(--display);
  font-size: 1.35rem;
  line-height: 1.05;
  letter-spacing: -0.03em;
  text-transform: uppercase;
}
.dek {
  margin: 0.28rem 0 0;
  color: var(--mute);
  font-size: 0.92rem;
}
.dek a { text-decoration: underline; text-underline-offset: 0.15em; }
.money { text-align: right; }
.bid {
  margin: 0;
  font-family: var(--display);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.clicks { margin: 0.2rem 0 0; color: var(--mute); font-size: 0.78rem; }
.doc { max-width: 38rem; margin: 1.2rem auto 0; }
.doc h1 {
  font-family: var(--display);
  text-transform: uppercase;
  letter-spacing: -0.03em;
}
.doc p, .doc li { color: #2a271f; }
.doc a { color: var(--flag); text-decoration: underline; }
`;

export const OCCUPIED_CSS = /* css */ `
.week-open-sold .flag [data-read-after-claim-sold] {
  display: block;
  font-weight: 700;
}
.week-open-sold .flag [data-read-after-claim-two] {
  font-family: var(--display);
  font-size: 1.2rem;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.week-open-sold .flag [data-read-after-claim-three] {
  font-size: 1.55rem;
  letter-spacing: -0.035em;
  line-height: 1.05;
}
.week-open-sold .flag [data-read-after-claim-four] {
  font-size: 1.9rem;
  letter-spacing: -0.05em;
  line-height: 0.98;
}
.week-open-sold .flag [data-read-after-claim-five] {
  font-size: 2.25rem;
  letter-spacing: -0.065em;
  line-height: 0.92;
}
.week-open-sold .flag [data-read-after-claim-six] {
  font-size: 2.6rem;
  letter-spacing: -0.08em;
  line-height: 0.86;
}
.week-open-sold .claim-after-listing[data-claim-after-listing] {
  margin: 0.7rem 0 0;
  padding: 0.65rem 0 0;
  border-top: 1px dashed var(--hair);
}
.week-open-sold .claim-after-listing a[data-claim-after-sold],
.week-open-sold .claim-after-listing a[data-claim-after-read-sold],
.week-open-sold .claim-after-listing a[data-claim-after-read-two],
.week-open-sold .claim-after-listing a[data-claim-after-read-three],
.week-open-sold .claim-after-listing a[data-claim-after-read-four],
.week-open-sold .claim-after-listing a[data-claim-after-read-five],
.week-open-sold .claim-after-listing a[data-claim-after-read-six] {
  display: inline;
  margin-top: 0;
  font-family: var(--serif);
  font-size: 0.92rem;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  line-height: 1.45;
  color: var(--mute);
}
.week-open-empty[data-empty-open-stand] [data-sold-cover],
.week-open-empty[data-empty-open-stand] [data-claim-cover],
.week-open-empty[data-empty-open-stand] [data-claim-after-listing],
.week-open-empty[data-empty-open-stand] [data-named-prize],
.week-open-empty[data-empty-open-stand] [data-later-fact],
.week-open-empty[data-empty-open-stand] [data-cover-first],
.week-open-empty[data-empty-open-stand] [data-paid-name],
.week-open-empty[data-empty-open-stand] [data-later-listing],
.week-open-empty .cover-rack,
.week-open-empty .cover-line,
.week-open-empty .claim-after-listing,
.week-open-sold .empty-stand,
.week-open-sold .empty-issue {
  display: none;
}
.week-open-sold .cover-line.cover {
  grid-template-columns: max-content 1fr auto;
  background: linear-gradient(180deg, rgb(157 28 20 / 0.08), transparent 70%);
  border-top: 2px solid var(--rule);
}
.week-open-sold .cover-line.cover[data-prize-before-price] {
  grid-template-columns: max-content 1fr;
  align-items: start;
}
.week-open-sold .cover-line[data-prize-before-price][data-named-prize] .later-fact[data-later-fact] {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.85rem;
  margin: 0.4rem 0 0;
}
.week-open-sold .cover-line[data-prize-before-price][data-named-prize] .later-fact[data-later-fact] .dek {
  margin: 0;
  flex: 1 1 12rem;
}
.week-open-sold .cover-line[data-prize-before-price][data-named-prize] .later-fact[data-later-fact] .bid {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--mute);
}
.week-open-sold .cover-line[data-prize-before-price][data-named-prize] .later-fact[data-later-fact] .clicks {
  margin: 0;
  font-size: 0.7rem;
}
.week-open-sold .cover .rank { color: var(--flag); }
.week-open-sold .rank[data-cover-prize-line] { white-space: nowrap; }
.week-open-sold .cover-line[data-prize-before-price] .rank {
  font-size: 1.85rem;
  letter-spacing: -0.04em;
  line-height: 0.92;
}
.week-open-sold .cover-line[data-prize-before-price] .bid {
  font-size: 0.92rem;
}
.week-open-sold .cover-line[data-prize-before-price] .clicks {
  font-size: 0.7rem;
}
.week-open-sold .cover-line[data-later-rank] {
  padding: 0.55rem 0;
}
.week-open-sold .cover-line[data-later-rank] .rank {
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--mute);
}
.week-open-sold .cover-line[data-later-rank] .dek {
  margin: 0;
  font-size: 0.78rem;
}
.week-open-sold .cover-line[data-later-rank] .slot {
  margin: 0.18rem 0 0;
  font-family: var(--serif);
  font-size: 0.78rem;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--mute);
  line-height: 1.35;
}
.week-open-sold .cover-line[data-later-rank] .bid {
  font-size: 0.85rem;
  font-weight: 600;
}
.week-open-sold .cover-line[data-later-rank] .clicks {
  font-size: 0.7rem;
}
.week-open-sold .cover-line[data-named-prize] .hed {
  font-size: 1.55rem;
  letter-spacing: -0.04em;
  line-height: 1.02;
}
.week-open-sold .cover-line[data-named-prize] .dek {
  font-size: 0.78rem;
  letter-spacing: 0.01em;
}
.week-open-sold .cover-line[data-named-prize] .hed a[data-cover-first] {
  color: inherit;
  text-decoration: none;
}
.week-open-sold .cover-line[data-named-prize] .hed a[data-cover-first]:hover {
  text-decoration: underline;
  text-underline-offset: 0.12em;
}
.week-open-sold .cover-line[data-named-prize][data-paid-name] .hed {
  font-size: 1.55rem;
  letter-spacing: -0.04em;
  line-height: 1.02;
}
.week-open-sold .cover-line[data-named-prize][data-paid-name] .hed a[data-cover-first] {
  color: inherit;
  text-decoration: none;
}
.week-open-sold .later-listing[data-later-listing] {
  margin-top: 0.5rem;
}
.week-open-sold .later-listing[data-later-listing] .blurb-field {
  margin-top: 0;
  height: 2.2rem;
  font-size: 0.88rem;
  color: var(--mute);
}
.week-open-sold .claim-after-listing a[data-claim-cover] {
  display: inline;
  margin-top: 0;
  font-family: var(--serif);
  font-size: 0.92rem;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  line-height: 1.45;
  color: var(--mute);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
`;

export const ISSUE_CSS = `${FOLIO_CSS}\n${OCCUPIED_CSS}`;

export const BOARD_CSS = ISSUE_CSS;

