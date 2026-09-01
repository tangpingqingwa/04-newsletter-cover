import { MIN_BID_USD } from "../listings.js";

export type NavId = "cover" | "about" | "rules";

export type BoardViewListing = {
  rank: number;
  id: string;
  sponsorUrl: string;
  blurb: string;
  bidUsd: number;
  clicks: number;
  createdAt?: string;
  updatedAt?: string;
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

function publicCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    /waffo|fixture|reference|outbid|local-only|test-only|implementation|development/i.test(comment)
      ? ""
      : comment,
  );
}

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

function renderSearchControl(listings: BoardViewListing[]): string {
  const results = listings.map((listing) => {
    const href = `/l/${encodeURIComponent(listing.id)}`;
    const host = displaySponsor(listing.sponsorUrl);
    const searchText = `${listing.blurb} ${host} ${listing.sponsorUrl}`;
    return `            <li class="search-result" data-search-item data-search-text="${escapeHtml(searchText)}">
              <a href="${href}">
                <span class="search-result-title">${escapeHtml(listing.blurb)}</span>
                <span class="search-result-host">${escapeHtml(host)}</span>
                <span class="search-result-bid">Bid $${listing.bidUsd}</span>
              </a>
            </li>`;
  }).join("\n");
  const initialStatus = listings.length > 0
    ? "Paid covers on this issue."
    : "No paid covers on this issue.";
  return `<div class="search-wrap" data-search-wrap>
            <button class="search-toggle" type="button" data-search-toggle="true" aria-label="Find a cover" aria-controls="cover-search" aria-expanded="false">Find</button>
            <div class="search-popover" id="cover-search" role="search" aria-label="Find a cover" aria-hidden="true" hidden>
              <form class="search-form" data-search-form>
                <label class="sr-only" for="cover-search-input">Find a cover</label>
                <input id="cover-search-input" type="search" data-search-input placeholder="Find a cover" autocomplete="off" />
                <button class="search-close" type="button" data-search-close>Close</button>
              </form>
              <p class="search-status" data-search-status role="status" aria-live="polite">${initialStatus}</p>
              <ul class="search-results" data-search-results>
${results}
              </ul>
            </div>
          </div>`;
}

export function renderDocument(input: {
  title: string;
  active: NavId;
  body: string;
  css?: string;
  searchListings?: BoardViewListing[];
  description?: string;
  canonicalPath?: string;
  noIndex?: boolean;
}): string {
  const siteUrl = "https://newslettercover.lol";
  const siteName = "Newsletter Cover";
  const defaultDescription =
    "Discover the paid cover and first slot of the next newsletter issue. Placements stay eligible for seven days and rank is the bid.";
  const title = escapeHtml(input.title);
  const description = escapeHtml(input.description ?? defaultDescription);
  const canonicalPath = input.canonicalPath ??
    (input.active === "about" ? "/about" : input.active === "rules" ? "/rules" : "/");
  const canonical = `${siteUrl}${canonicalPath}`;
  const noIndex = input.noIndex ?? /(checkout|payment|return)/i.test(input.title);
  const robots = noIndex
    ? "noindex,nofollow"
    : "index,follow,max-image-preview:large,max-snippet:-1";
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    description: input.description ?? defaultDescription,
    inLanguage: "en",
    isAccessibleForFree: true,
  }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/svg+xml" href="/icons/brand-mark.svg">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="canonical" href="${canonical}">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="robots" content="${robots}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${siteName}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${siteUrl}/icons/brand-mark.png">
    <meta property="og:image:width" content="512">
    <meta property="og:image:height" content="512">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${siteUrl}/icons/brand-mark.png">
    <script type="application/ld+json">${structuredData}</script>
    <style>${publicCss(input.css ?? FOLIO_CSS)}</style>
  </head>
  <body>
    <div class="sheet">
      <header class="site-header" data-slot="site-header">
        <nav class="site-nav" aria-label="Main" data-slot="shell">
          <a class="mark" href="/" data-slot="brand"><img class="brand-mark" src="/icons/brand-mark.svg" width="28" height="28" alt="" aria-hidden="true">The Cover</a>
          <div class="nav-tools">
            <div class="primary-nav" role="navigation" aria-label="Primary" data-slot="primary-nav">
              <ul>
                ${navItem("/", "Leaderboard", input.active === "cover")}
                ${navItem("/about", "About", input.active === "about")}
                ${navItem("/rules", "Rules", input.active === "rules")}
              </ul>
            </div>
            ${renderSearchControl(input.searchListings ?? [])}
            <button class="theme-toggle" type="button" data-theme-toggle="true" aria-label="Toggle theme" aria-pressed="false">Theme</button>
          </div>
        </nav>
      </header>
      ${input.body}
      <footer class="maker-contact" data-maker-contact>Built by <a href="mailto:tangpingqingwa@gmail.com">tangpingqingwa@gmail.com</a></footer>
    </div>
    <script>
      (function () {
        var root = document.documentElement;
        var toggle = document.querySelector("[data-theme-toggle]");
        if (!toggle) return;
        toggle.addEventListener("click", function () {
          var dark = root.getAttribute("data-theme") !== "dark";
          root.setAttribute("data-theme", dark ? "dark" : "light");
          toggle.setAttribute("aria-pressed", String(dark));
        });
        document.querySelectorAll("[data-rail-menu]").forEach(function (menu) {
          var summary = menu.querySelector("summary");
          if (!summary) return;
          function sync() {
            summary.setAttribute("aria-expanded", String(menu.open));
          }
          menu.addEventListener("toggle", sync);
          summary.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && menu.open) {
              menu.removeAttribute("open");
              summary.focus();
            }
          });
          sync();
        });
        var searchWrap = document.querySelector("[data-search-wrap]");
        if (searchWrap) {
          var searchToggle = searchWrap.querySelector("[data-search-toggle]");
          var searchPanel = searchWrap.querySelector("#cover-search");
          var searchInput = searchWrap.querySelector("[data-search-input]");
          var searchClose = searchWrap.querySelector("[data-search-close]");
          var searchForm = searchWrap.querySelector("[data-search-form]");
          var searchStatus = searchWrap.querySelector("[data-search-status]");
          var searchItems = Array.prototype.slice.call(searchWrap.querySelectorAll("[data-search-item]"));
          function updateSearch() {
            if (!searchInput || !searchStatus) return;
            var query = String(searchInput.value || "").trim().toLowerCase();
            var matches = 0;
            searchItems.forEach(function (item) {
              var text = String(item.getAttribute("data-search-text") || "").toLowerCase();
              var match = query === "" || text.indexOf(query) !== -1;
              item.hidden = !match;
              if (match) matches += 1;
            });
            if (query === "") {
              searchStatus.textContent = searchItems.length > 0 ? "Paid covers on this issue." : "No paid covers on this issue.";
            } else {
              searchStatus.textContent = matches > 0 ? String(matches) + (matches === 1 ? " result" : " results") : "No matching covers.";
            }
          }
          function setSearchOpen(open, restoreFocus) {
            if (!searchToggle || !searchPanel) return;
            searchPanel.hidden = !open;
            searchPanel.setAttribute("aria-hidden", String(!open));
            searchToggle.setAttribute("aria-expanded", String(open));
            if (open && searchInput) {
              searchInput.focus();
            } else if (!open && restoreFocus) {
              searchToggle.focus();
            }
          }
          if (searchToggle && searchPanel) {
            searchToggle.addEventListener("click", function () {
              setSearchOpen(searchPanel.hidden, false);
            });
          }
          if (searchClose) {
            searchClose.addEventListener("click", function () {
              setSearchOpen(false, true);
            });
          }
          if (searchForm) {
            searchForm.addEventListener("submit", function (event) {
              event.preventDefault();
            });
          }
          if (searchInput) {
            searchInput.addEventListener("input", updateSearch);
          }
          document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && searchPanel && !searchPanel.hidden) {
              setSearchOpen(false, true);
            }
          });
          document.addEventListener("pointerdown", function (event) {
            if (searchPanel && !searchPanel.hidden && !searchWrap.contains(event.target)) {
              setSearchOpen(false, false);
            }
          });
          updateSearch();
        }
        var periodTabs = Array.prototype.slice.call(document.querySelectorAll("[data-period-tab][role='tab']"));
        var periodSurface = document.querySelector("[data-period-surface]");
        var periodCopy = document.querySelector("[data-period-copy]");
        var periodCopyText = document.querySelector("[data-period-copy-text]");
        function setPeriod(name) {
          var selected = name === "weekly" && periodTabs.some(function (tab) {
            return tab.getAttribute("data-period") === "weekly";
          }) ? "weekly" : "current";
          periodTabs.forEach(function (tab) {
            var active = tab.getAttribute("data-period") === selected;
            tab.setAttribute("aria-selected", String(active));
            tab.setAttribute("tabindex", active ? "0" : "-1");
            tab.classList.toggle("scope-active", active);
          });
          if (periodSurface) {
            periodSurface.setAttribute("data-period-surface", selected);
            periodSurface.setAttribute("data-period-window", selected === "weekly" ? "weekly-utc" : "current-issue");
            periodSurface.setAttribute("aria-label", selected === "weekly" ? "Weekly UTC board window" : "Current issue board");
          }
          if (periodCopy && periodCopyText) {
            var copy = periodCopy.getAttribute(selected === "weekly" ? "data-period-copy-weekly" : "data-period-copy-current");
            if (copy) periodCopyText.textContent = copy;
          }
        }
        function periodFromUrl() {
          var params = new URLSearchParams(window.location.search);
          return params.get("scope") === "weekly" ? "weekly" : "current";
        }
        periodTabs.forEach(function (tab, index) {
          tab.addEventListener("click", function () {
            setPeriod(tab.getAttribute("data-period") || "current");
          });
          tab.addEventListener("keydown", function (event) {
            var next = index;
            if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % periodTabs.length;
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + periodTabs.length - 1) % periodTabs.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = periodTabs.length - 1;
            if (next !== index) {
              event.preventDefault();
              periodTabs[next].focus();
              periodTabs[next].click();
            } else if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              tab.click();
            }
          });
        });
        window.addEventListener("popstate", function () {
          setPeriod(periodFromUrl());
        });
        setPeriod(periodFromUrl());
      })();
    </script>
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
  const rightEar = board.status === "open" && board.listings.length === 0
    ? `<p class="ear ear-right" data-empty-ear="true">Last 7 days · UTC</p>`
    : board.status === "open" && board.listings.length > 0
      ? `<p class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC</p>`
      : board.status === "closed" && board.listings.length > 0
        ? `<p class="ear ear-right" data-frozen-ear="true">Frozen last 7 days · UTC</p>`
        : `<p class="ear ear-right">Weekly · UTC</p>`;
  const dateBlock = board.issueDate
    ? `<time datetime="${escapeHtml(board.issueDate)}" data-issue-date="${escapeHtml(board.issueDate)}">${escapeHtml(spokenIssueDate(board.issueDate))}</time>`
    : `<span data-issue-date="">No issue on the stand</span>`;
  return `      <header class="masthead" data-slot="status">
        <p class="folio">
          ${dateBlock}
          <span class="issue-state" data-issue-status="${state.attr}">${state.label}</span>
        </p>
        <div class="nameplate" data-slot="identity">
          <p class="ear">Vol. I · One prize</p>
          <h1>The Cover</h1>
          ${rightEar}
        </div>
        ${renderFlag(board)}
      </header>`;
}

function renderFlag(board: BoardView): string {
  if (board.status === "closed") {
    if (board.listings.length === 0) {
      return `<p class="flag" data-empty-flag="true">This issue is a closed empty week. No last-7-days cover. It is not the next issue’s cover. <a href="/" data-open-cover="true">The open cover is on the stand.</a></p>`;
    }
    return `<p class="flag" data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot. It is not the next issue’s cover.</p>`;
  }
  if (board.listings.length > 0) {
    return `<p class="flag"><span data-sold-cover="true">This issue’s cover is sold.</span> Rank is the bid.</p>`;
  }
  return `<p class="flag" data-empty-open-stand="true">The next issue’s cover goes to whoever pays the most. Rank is the bid.</p>`;
}

function renderClaim(board: BoardView): string {
  if (board.status === "closed") {
    return board.listings.length === 0
      ? `      <p class="form-hint" data-empty-freeze="true">No last-7-days cover sold. This empty close is not a freeze of a live week.</p>`
      : `      <p class="form-hint" data-frozen-issue="true" data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot. The cover is whoever paid the most in that window. <a href="/" data-open-cover="true">The open cover is on the stand.</a></p>`;
  }
  const empty = board.listings.length === 0;
  const top = board.listings[0]?.bidUsd ?? 0;
  const defaultBid = top > 0 ? top + 1 : MIN_BID_USD;
  const note = empty
    ? `<p id="claim-note" class="claim-note" data-empty-issue="true" data-cover-prize="true">No cover sold. No paid listings on this board. $${MIN_BID_USD} takes #1 — this issue’s cover.</p>`
    : `<p id="claim-note" class="claim-note">New spots start at $${MIN_BID_USD}. One prize: the cover. Paying less than #1 still lists at the rank that bid can take.</p>`;
  const raiseHint = empty
    ? ""
    : `
      <p class="form-hint claim-raise-note" data-raise-hint="true">Already on this issue? Enter the same sponsor URL and raise. You pay only the difference.</p>`;
  const claimAttrs = ' class="claim" id="claim" aria-label="Claim #1" data-slot="claim-hero"';
  const claimHedAttrs = ' class="claim-hed" data-slot="claim-heading"';
  const identityFields = `<div class="cover-identity" data-cover-identity="true">
            <label class="sr-only" for="sponsor-url">Sponsor URL</label>
            <input id="sponsor-url" name="sponsorUrl" type="url" required placeholder="Sponsor URL" autocomplete="url" aria-describedby="claim-note"/>
            <label class="sr-only" for="cover-pitch">One-line cover pitch</label>
            <input id="cover-pitch" class="blurb-field" name="blurb" type="text" required maxlength="120" placeholder="One-line cover pitch" aria-describedby="claim-note"/>
          </div>`;
  const formFields = `${identityFields}
          <button type="submit" class="outbid" data-claim-submit="true" data-ready="false" aria-disabled="true" disabled>Outbid</button>`;
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
        <form id="bid-form" class="claim-form" method="post" action="/listings" data-claim-form="true" data-slot="claim-form">
          ${formFields}
        </form>
      </section>${raiseHint}
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
          var form = document.getElementById("bid-form");
          var sponsor = document.getElementById("sponsor-url");
          var pitch = document.getElementById("cover-pitch");
          var submit = form && form.querySelector("[data-claim-submit]");
          if (!form || !sponsor || !pitch || !submit) return;
          function updateReady() {
            var ready = sponsor.value.trim() !== "" && pitch.value.trim() !== "" && sponsor.checkValidity();
            submit.disabled = !ready;
            submit.setAttribute("aria-disabled", String(!ready));
            submit.setAttribute("data-ready", String(ready));
          }
          sponsor.addEventListener("input", updateReady);
          pitch.addEventListener("input", updateReady);
          updateReady();
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
  const rankLabel = isCover
    ? `Cover · #1<span class="rank-visible" aria-hidden="true">#1</span>`
    : kicker;
  const sponsor = escapeHtml(displaySponsor(listing.sponsorUrl));
  const pitch = escapeHtml(listing.blurb);
  const timestamp = activityTimestamp(listing);
  const time = timestamp
    ? `<time class="card-time" data-cover-time="true" datetime="${escapeHtml(timestamp)}">${escapeHtml(timestamp.slice(0, 10))}</time>`
    : "";
  const frozenAttrs = !openPrize && isCover
    ? ' data-frozen-cover="true" data-archive-name="true"'
    : "";
  const firstAttrs = openPrize && isCover ? ' data-cover-first="true"' : "";
  const title = `<p class="hed" data-cover-title="true" data-cover-domain="true"><a href="${href}"${firstAttrs} data-cover-title="true" data-cover-domain="true">${sponsor}</a></p>`;
  const description = `<p class="dek" data-cover-description="true">${pitch}</p>`;
  const metadata = `<div class="card-meta bid-ledger later-fact" data-cover-meta="true" data-later-fact="true" aria-label="Bid ledger"><a class="card-action" href="${href}" data-cover-action="true">Open sponsor</a><span class="clicks" data-cover-clicks="true">${listing.clicks} clicks</span>${time}</div>`;
  return `        <li class="cover-line${stampedCoverClass}"${stampedPrizeBefore}${stampedLaterRank}${frozenAttrs} data-rank="${listing.rank}" data-id="${escapeHtml(listing.id)}" data-sponsor-url="${escapeHtml(listing.sponsorUrl)}"${stampedNamedPrize}${stampedPaidName} data-slot="paid-card">
          <span class="rank"${stampedPrizeLine}>${rankLabel}</span>
          <div class="cover-copy">
            ${title}
            ${description}
            ${metadata}
          </div>
          <div class="money">
            <p class="bid" data-cover-price="true">$${listing.bidUsd}</p>
          </div>
        </li>`;
}

/** Occupied open boards offer one quiet route to the direct claim form. */
const OCCUPIED_NEXT_COVER_LINK = `      <p class="claim-after-listing" data-claim-after-listing="true"><a href="#claim" data-claim-cover="true">Claim the next cover.</a></p>`;

/** Occupied live week is rolling last 7 days from paid placement. */
const OCCUPIED_WEEK_WINDOW = `      <p class="week-window" data-rolling-week="true">Rolling last 7 days from paid placement. Not Monday 00:00 UTC.</p>`;

function activityTimestamp(listing: BoardViewListing): string | null {
  const raw = listing.updatedAt ?? listing.createdAt;
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function renderRack(board: BoardView): string {
  if (board.listings.length === 0) {
    if (board.status === "closed") {
      return `      <section class="empty-issue" id="archive" data-folio-section="archive" data-empty-issue="true" data-closed-empty-issue="true">
        <p class="section-kicker">Issue archive</p>
        <p class="empty-kicker" data-empty-slab="true">No last-7-days cover sold</p>
        <p class="dek" data-empty-week="true">This closed week has no last-7-days cover. Nobody bought a last-7-days cover. The folio stays blank.</p>
      </section>`;
    }
    return `      <section class="empty-stand" id="cover" aria-label="This issue’s cover" data-folio-section="cover" data-read-stand="true" data-empty-open-stand="true">
        <p class="section-kicker">The Cover</p>
        <p class="empty-kicker">This issue’s cover</p>
        <p class="hed">No cover sold</p>
        <p class="dek">No paid listings on this board. This issue’s cover is still open.</p>
        <p class="fair-window" data-fair-window="true">Live rank is rolling last 7 days from paid placement. Not Monday 00:00 UTC.</p>
      </section>`;
  }
  const readCover = board.status === "open";
  const attrs = readCover
    ? ' aria-label="This issue’s cover" data-read-cover="true" data-rolling-week="true"'
    : ' aria-label="This issue’s cover" data-frozen-board="true"';
  if (!readCover) {
    return `      <section class="folio-section archive-section" id="archive" aria-labelledby="archive-heading" data-folio-section="archive">
        <p class="section-kicker" id="archive-heading">Issue archive</p>
        <ol class="cover-rack"${attrs} data-slot="paid-board">
${board.listings.map((listing) => renderPitch(listing, false)).join("\n")}
        </ol>
      </section>`;
  }
  const coverListing = board.listings[0];
  const coverRack = `      <section class="folio-section cover-section" id="cover" aria-labelledby="cover-heading" data-folio-section="cover">
        <p class="section-kicker" id="cover-heading">The Cover</p>
        <ol class="cover-rack cover-rack-top"${attrs} data-slot="top-three">
${coverListing ? renderPitch(coverListing, true) : ""}
        </ol>
      </section>`;
  const stackListings = board.listings.slice(1);
  const stackRack = stackListings.length > 0
    ? `      <section class="folio-section stack-section" id="stack" aria-labelledby="stack-heading" data-folio-section="stack">
        <p class="section-kicker" id="stack-heading">The Stack</p>
        <ol class="cover-rack cover-rack-later" aria-label="More covers on this issue" data-later-board-rows="true" data-slot="later-rows">
${stackListings.map((listing) => renderPitch(listing, true)).join("\n")}
        </ol>
      </section>`
    : "";
  const ledger = `      <section class="folio-section ledger-section" id="ledger" aria-labelledby="ledger-heading" data-folio-section="ledger">
        <p class="section-kicker" id="ledger-heading">Bid ledger</p>
        <p class="section-note">Rank is the bid. Clicks and paid dates are later facts.</p>
${OCCUPIED_WEEK_WINDOW}
      </section>`;
  return `${coverRack}
${stackRack}
${ledger}
${OCCUPIED_NEXT_COVER_LINK}`;
}

/**
 * The folio index is editorial navigation, not a category system. Every
 * destination is an existing anchor or public route.
 */
function renderContextRail(board: BoardView): string {
  if (board.status !== "open") {
    return "";
  }
  const issueDate = board.issueDate;
  const parsedIssue = issueDate ? new Date(`${issueDate}T00:00:00.000Z`) : null;
  const validIssue = Boolean(
    issueDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(issueDate) &&
    parsedIssue &&
    !Number.isNaN(parsedIssue.getTime()) &&
    parsedIssue.toISOString().slice(0, 10) === issueDate,
  );
  const issueHref = validIssue ? `/issue/${encodeURIComponent(issueDate ?? "")}` : "/";
  const occupied = board.listings.length > 0;
  return `      <nav class="folio-index" aria-label="Folio sections" data-folio-index="true" data-slot="folio-index">
        <a href="#cover" aria-current="page">Cover</a>
        <a href="#claim">Claim Desk</a>
        ${occupied ? '<a href="#stack">Stack</a><a href="#ledger">Bid Ledger</a>' : ""}
        <a href="${issueHref}">Archive</a>
      </nav>`;
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
  return occupiedOpen ? ISSUE_CSS : `${FOLIO_CSS}\n${CLAIM_CONTROL_ALIGNMENT_CSS}`;
}

export function renderBoardHtml(board: BoardView): string {
  const masthead = renderMasthead(board);
  const claim = renderClaim(board);
  const rack = renderRack(board);
  const rail = renderContextRail(board);
  const week = weekShell(board);
  const readSoldCover = board.status === "open" && board.listings.length > 0;
  const readEmptyStand = board.status !== "closed" && board.listings.length === 0;
  const readFrozenCover = board.status === "closed" && board.listings.length > 0;
  const inner = readSoldCover
    ? `${masthead}
${rail}
${rack}
${claim}`
    : readEmptyStand
      ? `${masthead}
${rack}
${claim}
${rail}`
      : readFrozenCover
        ? `${masthead}
${rack}
${claim}`
        : `${masthead}
${claim}
${rack}`;
  const body = `${week.open}
      <main class="home-shell" id="board-surface" data-slot="home-shell" data-period-surface="current" data-period-window="current-issue" aria-label="Current issue board">
${inner}
      </main>
${week.close}`;
  return renderDocument({
    title: "The Cover · Newsletter Cover",
    active: "cover",
    body,
    css: boardCss(board),
    searchListings: board.listings,
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
/* Empty open ear names the fair live-rank window, not Monday UTC. */
.week-open-empty .nameplate .ear-right[data-empty-ear] {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  text-align: right;
}
/* Closed occupied ear names frozen last-7-days rank, not live Last 7 days or Monday UTC. */
.week-closed-occupied .nameplate .ear-right[data-frozen-ear] {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  text-align: right;
}
.week-open-empty .nameplate .ear-right:not([data-empty-ear]),
.week-open-sold .nameplate .ear-right:not([data-occupied-ear]),
.week-closed-occupied .nameplate .ear-right:not([data-frozen-ear]),
.week-open-sold [data-empty-ear],
.week-open-empty [data-occupied-ear],
.week-open-empty [data-frozen-ear],
.week-open-sold [data-frozen-ear],
.week-closed-empty [data-empty-ear],
.week-closed-empty [data-occupied-ear],
.week-closed-empty [data-frozen-ear],
.week-closed-occupied [data-empty-ear],
.week-closed-occupied [data-occupied-ear] {
  display: none;
}
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
/* Closed empty flag names last-7-days / closed empty week, not a generic closed archive. */
.week-closed-empty .flag[data-empty-flag] {
  display: block;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.week-closed-empty .flag:not([data-empty-flag]),
.week-open-empty [data-empty-flag],
.week-open-sold [data-empty-flag],
.week-closed-occupied [data-empty-flag] {
  display: none;
}
/* Closed occupied flag names frozen last-7-days rank snapshot, not a live close line. */
.week-closed-occupied .flag[data-frozen-flag] {
  display: block;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.week-closed-occupied .flag:not([data-frozen-flag]),
.week-open-empty [data-frozen-flag],
.week-open-sold [data-frozen-flag],
.week-closed-empty [data-frozen-flag] {
  display: none;
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
/* Closed occupied after-rack hint names frozen last-7-days rank snapshot, not a midnight close line. */
.week-closed-occupied .form-hint[data-frozen-issue][data-frozen-hint] {
  font-weight: 500;
  letter-spacing: -0.01em;
}
.week-closed-occupied .form-hint[data-frozen-issue]:not([data-frozen-hint]),
.week-open-empty [data-frozen-hint],
.week-open-sold [data-frozen-hint],
.week-closed-empty [data-frozen-hint] {
  display: none;
}
.week-closed-empty .form-hint[data-frozen-issue] {
  display: none;
}
/* Closed empty freeze line names no last-7-days cover sold, not a freeze of a live week. */
.week-closed-empty .form-hint[data-empty-freeze] {
  font-weight: 500;
  letter-spacing: -0.01em;
}
.week-closed-empty .form-hint:not([data-empty-freeze]),
.week-open-empty [data-empty-freeze],
.week-open-sold [data-empty-freeze],
.week-closed-occupied [data-empty-freeze] {
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
  text-decoration: none;
  font-variant-numeric: tabular-nums;
}
.amount-field input {
  width: 5.5ch; border: 0; background: transparent; color: inherit; font: inherit; outline: none;
}
.amount-field input:focus-visible {
  outline: 2px solid var(--flag);
  outline-offset: 3px;
  border-radius: 2px;
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
/* Empty open: direct identity fields lead to one real Claim rank submission. */
.week-open-empty #claim {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.week-open-empty #claim #bid-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.week-open-empty #claim .claim-hed {
  font-size: clamp(1.85rem, 5vw, 2.55rem);
}
.cover-identity {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  width: 100%;
  margin-top: 0.85rem;
}
.cover-identity input {
  min-width: 0;
  flex: 1 1 16rem;
  height: 2.55rem;
  padding: 0 0.7rem;
  border: 1px solid var(--rule);
  background: #f7f3ea;
}
.cover-identity input:focus-visible,
.bid-row input:focus-visible {
  outline: 2px solid var(--flag);
  outline-offset: 2px;
}
.cover-identity .blurb-field {
  flex-basis: 100%;
  margin-top: 0;
}
.week-open-empty #claim .outbid {
  width: auto;
  min-width: 9rem;
  margin: 0.85rem auto 0;
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
/* Empty stand names the same fair occupied-rank window. Not occupied week-window chrome. */
.week-open-empty .empty-stand .fair-window[data-fair-window] {
  margin: 0.45rem 0 0;
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.35;
  color: var(--mute);
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
.week-open-empty[data-empty-open-stand] [data-rolling-week],
.week-open-empty .week-window,
.week-closed-empty [data-rolling-week],
.week-closed-empty .week-window,
.week-closed-occupied [data-rolling-week],
.week-closed-occupied .week-window,
.week-open-sold .fair-window,
.week-open-sold [data-fair-window],
.week-closed-empty .fair-window,
.week-closed-empty [data-fair-window],
.week-closed-occupied .fair-window,
.week-closed-occupied [data-fair-window] {
  display: none;
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
/* Closed empty empty-issue kicker names no last-7-days cover, not a generic empty live week. */
.week-closed-empty .empty-issue .empty-kicker[data-empty-slab] {
  font-weight: 700;
  letter-spacing: 0.14em;
}
.week-closed-empty .empty-issue .empty-kicker:not([data-empty-slab]),
.week-open-empty [data-empty-slab],
.week-open-sold [data-empty-slab],
.week-closed-occupied [data-empty-slab] {
  display: none;
}
/* Closed empty empty-issue body names no last-7-days cover / closed empty week, not the live empty stand line. */
.week-closed-empty .empty-issue .dek[data-empty-week] {
  font-weight: 500;
  letter-spacing: -0.01em;
}
.week-closed-empty .empty-issue p:not(.empty-kicker):not([data-empty-week]),
.week-open-empty [data-empty-week],
.week-open-sold [data-empty-week],
.week-closed-occupied [data-empty-week] {
  display: none;
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

/*
 * Current folio presentation: the board keeps its editorial semantics while
 * using the airy, coral-on-warm-white geometry of the measured reference.
 * These declarations intentionally sit at the end of the legacy folio block
 * so the accepted state selectors above remain the source of truth.
 */
:root {
  color-scheme: light;
  --page: #fcfaf8;
  --surface: #fffdfb;
  --surface-soft: #f8f3ef;
  --surface-quiet: #f5f0ed;
  --ink: #292624;
  --mute: #756d69;
  --line: #e7dfdb;
  --line-soft: #eedbd4;
  --coral: #d97961;
  --coral-strong: #d56f55;
  --coral-soft: #edb4a5;
  --coral-wash: #fbeae5;
  --card-lead-border: #d26d50;
  --card-lead-surface: #f6dfd8;
  --card-later-border: #ebbdae;
  --card-later-surface: #fcf3ee;
  --card-quiet-border: #f6e3dd;
  --card-quiet-surface: #fdf9f6;
  --focus: #cf654d;
  --display: "DM Sans", "Avenir Next", "Helvetica Neue", Arial, sans-serif;
  --serif: "DM Sans", "Avenir Next", "Helvetica Neue", Arial, sans-serif;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #211c1a;
  --surface: #2d2623;
  --surface-soft: #332b28;
  --surface-quiet: #2a2321;
  --ink: #f9eee9;
  --mute: #c1aaa2;
  --line: #554641;
  --line-soft: #6c4940;
  --coral: #eb9479;
  --coral-strong: #ee896d;
  --coral-soft: #895548;
  --coral-wash: #432c28;
  --card-lead-border: #ee896d;
  --card-lead-surface: #432c28;
  --card-later-border: #6c4940;
  --card-later-surface: #3b2926;
  --card-quiet-border: #554641;
  --card-quiet-surface: #332b28;
  --focus: #ffaf95;
}
html, body {
  min-width: 0;
  scrollbar-width: none;
}
html::-webkit-scrollbar,
body::-webkit-scrollbar { width: 0; height: 0; }
body {
  min-height: 100vh;
  background: var(--page);
  color: var(--ink);
  font-family: var(--display);
  line-height: 1.5;
}
body::selection { background: var(--coral-soft); }
a { color: inherit; }
button, input { font-family: var(--display); }
button:disabled { cursor: not-allowed; }
.sheet {
  width: min(calc(100% - 2rem), 62rem);
  margin: 0 auto;
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}
.site-header {
  width: 100%;
  min-height: 4.75rem;
}
.site-header > .site-nav {
  width: min(calc(100% - 2rem), 62rem);
  margin: 0 auto;
}
.site-nav {
  width: 100%;
  min-height: 4.75rem;
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 0;
  border: 0;
  font-family: var(--display);
  font-size: 0.875rem;
  letter-spacing: 0;
  text-transform: none;
}
.primary-nav { min-width: 0; }
.mark {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  flex: 0 0 auto;
  color: var(--ink) !important;
  font-size: 1.45rem;
  font-weight: 650;
  letter-spacing: -0.055em;
  line-height: 1;
  text-transform: none;
}
.brand-mark { display: block; width: 28px; height: 28px; flex: 0 0 28px; border-radius: 7px; }
.scope-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  margin-left: 0.2rem;
  padding: 0.25rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  color: var(--mute);
  font-size: 0.8rem;
  white-space: nowrap;
}
.scope-switch-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0.38rem 0.45rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--mute);
  font: inherit;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
}
.scope-switch-tab.scope-active,
.scope-switch-tab[aria-selected="true"] {
  border-radius: 999px;
  background: var(--surface-soft);
  color: var(--ink);
}
.scope-switch-tab:hover { color: var(--ink); }
.scope-switch-tab.scope-disabled { cursor: default; opacity: 0.62; }
.masthead-period {
  position: absolute;
  z-index: 2;
  top: -3.5rem;
  left: 8.23rem;
  width: 10.8rem;
  height: 2.5rem;
  box-sizing: border-box;
  margin: 0;
}
.nav-tools {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  margin-left: auto;
}
.site-nav ul {
  display: flex;
  align-items: center;
  gap: 1.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.site-nav a { color: var(--mute); transition: color 120ms ease; }
.site-nav a[aria-current="page"],
.site-nav a:hover { color: var(--ink); }
.theme-toggle {
  width: auto;
  min-width: 3.75rem;
  height: 2.25rem;
  padding: 0 0.45rem;
  flex: 0 0 auto;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font-size: 1.1rem;
  line-height: 1;
  white-space: nowrap;
}
.theme-toggle:hover { border-color: var(--line-soft); background: var(--surface-soft); }
.search-wrap {
  position: relative;
  flex: 0 0 auto;
  min-width: 0;
}
.search-toggle,
.search-close {
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font-family: var(--display);
  font-size: 0.82rem;
  line-height: 1;
  white-space: nowrap;
}
.search-toggle {
  min-width: 3.6rem;
  height: 2.25rem;
  padding: 0 0.4rem;
}
.search-toggle:hover { border-color: var(--line-soft); background: var(--surface-soft); }
.search-popover[hidden] { display: none !important; }
.search-popover {
  position: absolute;
  z-index: 10;
  top: calc(100% + 0.5rem);
  right: 0;
  width: min(22rem, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: var(--surface);
  box-shadow: 0 0.8rem 2rem rgb(53 37 31 / 12%);
}
.search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.45rem;
  margin: 0;
}
.search-form input {
  width: 100%;
  min-width: 0;
  height: 2.75rem;
  padding: 0 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--surface-soft);
  color: var(--ink);
  font-size: 0.82rem;
}
.search-close {
  min-width: 3.6rem;
  height: 2.75rem;
  padding: 0 0.55rem;
  border-color: var(--line);
  background: var(--surface-soft);
}
.search-close:hover { border-color: var(--coral-soft); background: var(--coral-wash); }
.search-status {
  margin: 0.6rem 0 0.45rem;
  color: var(--mute);
  font-size: 0.72rem;
}
.search-results {
  display: grid;
  gap: 0.35rem;
  max-height: 15rem;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.search-result[hidden] { display: none; }
.search-result a {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.1rem 0.5rem;
  min-width: 0;
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--surface-soft);
  text-decoration: none;
}
.search-result a:hover { border-color: var(--coral-soft); background: var(--coral-wash); }
.search-result-title {
  grid-column: 1 / -1;
  overflow: hidden;
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-result-host,
.search-result-bid {
  overflow: hidden;
  color: var(--mute);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-result-bid { color: var(--coral-strong); text-align: right; }
.masthead {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0;
  padding: 1rem 0 0;
  border: 0;
  text-align: center;
}
.masthead-context {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
}
.context-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 19.375rem;
  height: 2.03125rem;
  min-height: 2.03125rem;
  margin: 0;
  padding: 0 0.75rem;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--surface-soft);
  color: var(--mute);
  font-size: 0.8rem;
  white-space: nowrap;
}
.context-dot {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 999px;
  background: var(--coral);
  box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--coral) 16%, transparent);
}
.week-closed-empty .context-dot,
.week-closed-occupied .context-dot { background: var(--mute); box-shadow: none; }
.folio {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  margin: -1px;
  padding: 0;
  border: 0;
}
.nameplate {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  margin: -1px;
  padding: 0;
  border: 0;
}
.flag {
  max-width: 48rem;
  margin: 0.75rem 0 0;
  color: var(--mute);
  font-size: 0.82rem;
  line-height: 1.4;
}
.week-open-empty .masthead > .flag,
.week-open-sold .masthead > .flag { display: none; }
.week-closed-empty .masthead > .flag,
.week-closed-occupied .masthead > .flag { display: block; }
.week-closed-empty .flag a,
.week-closed-occupied .flag a { color: var(--coral); }
.issue-state { border: 0; background: none !important; color: inherit !important; }
.week-closed-empty .issue-state,
.week-closed-occupied .issue-state { color: var(--coral) !important; }
.claim {
  padding: 1.25rem 0 0;
  border: 0;
}
.claim-hed {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--ink);
  font-family: var(--display);
  font-size: clamp(1.8rem, 3.15vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.055em;
  line-height: 1.5;
  text-transform: none;
}
.amount-stepper { display: inline-flex; align-items: center; gap: 0.42rem; }
.step {
  width: 1.45rem;
  height: 1.45rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--coral-wash);
  color: var(--coral);
  font-size: 0.95rem;
  line-height: 1;
}
.step:hover { background: var(--coral-soft); color: #fff; }
.amount-field {
  color: var(--coral);
  font-variant-numeric: tabular-nums;
  text-decoration: none;
}
.amount-field input {
  width: 5.5ch;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.claim-note {
  max-width: 44rem;
  margin: 0.45rem auto 0;
  color: var(--mute);
  font-size: 0.8rem;
  line-height: 1.4;
  text-align: center;
}
.week-open-empty .claim-note,
.week-open-sold .claim-note { display: none; }
#bid-form {
  display: grid;
  grid-template-columns: minmax(0, 2.35fr) minmax(0, 1fr) auto;
  gap: 0.5rem;
  width: 100%;
  margin-top: 1.5rem;
}
.week-open-empty #claim #bid-form,
.week-open-sold #claim #bid-form {
  display: grid;
  grid-template-columns: minmax(0, 2.35fr) minmax(0, 1fr) auto;
  align-items: stretch;
  flex-direction: initial;
}
.cover-identity { display: contents; }
.cover-identity input,
.bid-row input,
.blurb-field {
  flex: 0 0 auto;
  align-self: stretch;
  width: 100%;
  min-width: 0;
  height: 2.75rem;
  margin: 0;
  padding: 0 1rem;
  border: 1px solid var(--line);
  border-radius: 1.225rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.95rem;
}
.cover-identity input::placeholder,
.bid-row input::placeholder { color: var(--mute); opacity: 1; }
.outbid {
  min-width: 7.2rem;
  height: 2.75rem;
  padding: 0 1.25rem;
  border: 1px solid var(--coral-strong);
  border-radius: 999px;
  background: var(--coral-strong);
  color: #fffaf7;
  font-family: var(--display);
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
}
.outbid:disabled {
  border-color: var(--coral-soft);
  background: var(--coral-soft);
  color: #fffaf7;
  opacity: 1;
}
.outbid:not(:disabled):hover { background: var(--coral); border-color: var(--coral); }
.form-hint {
  grid-column: 1 / -1;
  margin: 0.1rem 0 0;
  color: var(--mute);
  font-size: 0.76rem;
  text-align: left;
}
.context-rail {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  min-height: 2rem;
  margin: 2rem 0 1.25rem;
  padding: 0;
  border: 0;
  overflow: visible;
  white-space: nowrap;
}
.rail-item,
.rail-menu summary {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 2rem;
  padding: 0.35rem 0.72rem;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--mute);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
}
.rail-item:hover,
.rail-menu summary:hover { color: var(--ink); background: var(--surface-soft); }
.rail-item.rail-active {
  background: var(--coral);
  color: #fffaf7;
}
.rail-menu { position: relative; margin-left: auto; }
.rail-menu summary { cursor: pointer; list-style: none; border-color: var(--line); background: var(--surface); color: var(--ink); }
.rail-menu summary::-webkit-details-marker { display: none; }
.rail-menu-panel {
  position: absolute;
  z-index: 4;
  top: calc(100% + 0.35rem);
  right: 0;
  display: grid;
  min-width: 11rem;
  padding: 0.35rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: var(--surface);
  box-shadow: 0 0.8rem 2rem rgb(53 37 31 / 0.12);
}
.rail-menu-panel a { padding: 0.55rem 0.65rem; border-radius: 0.55rem; color: var(--mute); font-size: 0.8rem; }
.rail-menu-panel a:hover { background: var(--surface-soft); color: var(--ink); }
.empty-stand,
.empty-issue {
  width: 100%;
  margin: 1.25rem 0 0;
  padding: 1.25rem 1.1rem;
  border: 1px dashed var(--line-soft);
  border-radius: 1.25rem;
  background: var(--surface-soft);
  text-align: center;
}
.empty-stand .empty-kicker,
.empty-issue .empty-kicker {
  margin: 0;
  color: var(--coral);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.empty-stand .hed,
.empty-issue .hed {
  margin: 0.3rem 0 0;
  color: var(--ink);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.2;
  text-transform: none;
}
.empty-stand .dek,
.empty-issue .dek { margin: 0.35rem auto 0; max-width: 42rem; color: var(--mute); font-size: 0.85rem; }
.week-open-empty .claim { margin-top: 1.15rem; }
.week-open-empty .context-rail { margin-top: 1.35rem; }
.week-open-empty {
  display: block;
}
.home-shell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.week-open-empty > .home-shell {
  display: flex;
  flex-direction: column;
}
.week-open-empty .masthead { order: 0; }
.week-open-empty .claim { order: 1; margin-top: 0; }
.week-open-empty .context-rail { order: 2; }
.week-open-empty .empty-stand { order: 3; margin-top: 0; }
.week-closed-empty .claim,
.week-closed-occupied .claim { display: none; }
.week-closed-empty .empty-issue { margin-top: 1.45rem; }
.cover-rack {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cover-line {
  position: relative;
  display: grid;
  grid-template-columns: 2.375rem minmax(0, 1fr) max-content;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
  min-height: 6.875rem;
  padding: 0.75rem 0.875rem;
  border: 2px solid var(--line-soft);
  border-radius: 1.55rem;
  background: var(--surface);
  box-shadow: 0 0.45rem 1.2rem rgb(80 55 47 / 0.05);
  overflow: visible;
}
.cover-rack > .cover-line:nth-child(-n+3) { background: var(--coral-wash); }
.cover-line.cover { border-color: var(--coral); background: #f9e2db; }
.cover-line[data-later-rank] { border-color: #efd8d0; }
.cover-line:nth-child(n+4) {
  min-height: 4.2rem;
  padding-top: 0.7rem;
  padding-bottom: 0.7rem;
  border-color: transparent;
  border-radius: 0.8rem;
  background: transparent;
  box-shadow: none;
}
.cover-line:nth-child(n+4):hover { background: var(--surface-soft); }
.cover-line .rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  min-width: 2.55rem;
  min-height: 2rem;
  padding: 0.28rem 0.48rem;
  border-radius: 999px;
  background: var(--coral);
  color: #fffaf7;
  font-family: var(--display);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  text-transform: none;
  white-space: nowrap;
}
.cover-line.cover .rank { font-size: 0; }
.cover-line.cover .rank-visible { font-size: 0.85rem; }
.cover-line[data-later-rank] .rank,
.cover-line:nth-child(n+4) .rank { background: var(--surface-soft); color: var(--mute); }
.cover-line.cover .rank { min-width: 3.15rem; background: var(--coral); }
.cover-line > div { min-width: 0; }
.cover-line > .cover-copy {
  display: grid;
  align-self: stretch;
  grid-template-rows: auto auto 1fr;
  align-content: stretch;
  min-width: 0;
}
.cover-line .hed {
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font-family: var(--display);
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}
.cover-line .hed a { color: inherit; text-decoration: none; }
.cover-line .dek,
.cover-line .slot {
  margin: 0.25rem 0 0;
  overflow: hidden;
  color: var(--mute);
  font-family: var(--display);
  font-size: 0.8rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}
.cover-line .dek {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
}
.cover-line .dek a { color: inherit; text-decoration: none; }
.cover-line .hed a:hover,
.cover-line .dek a:hover,
.cover-line .slot a:hover { color: var(--coral-strong); text-decoration: underline; text-underline-offset: 0.15em; }
.cover-line .slot a { color: inherit; text-decoration: none; }
.cover-line .money { align-self: start; min-width: max-content; text-align: right; }
.cover-line .bid { margin: 0; color: var(--coral); font-size: 0.95rem; font-weight: 700; }
.cover-line .clicks { margin: 0.22rem 0 0; color: var(--mute); font-size: 0.72rem; }
.cover-line .card-meta {
  display: flex;
  align-self: end;
  align-items: center;
  gap: 0.2rem 0.65rem;
  min-width: 0;
  margin-top: 0.35rem;
  overflow: hidden;
  color: var(--mute);
  font-size: 0.68rem;
  line-height: 1.15;
  white-space: nowrap;
}
.cover-line .card-meta .card-action,
.cover-line .card-meta .clicks,
.cover-line .card-meta .card-time {
  flex: 0 0 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cover-line .card-meta .card-action { color: var(--ink); text-decoration: underline; text-underline-offset: 0.15em; }
.cover-line .card-meta .card-action:hover { color: var(--coral-strong); }
.cover-line .card-meta .clicks,
.cover-line .card-meta .card-time { color: var(--mute); }
.cover-line.cover[data-prize-before-price] {
  grid-template-columns: 2.375rem minmax(0, 1fr) max-content;
  align-items: start;
}
.cover-line.cover[data-prize-before-price] .later-fact {
  margin-top: 0;
}
.cover-line[data-later-rank] .slot { color: var(--ink); font-weight: 600; }
.week-open-sold .cover-line.cover:hover,
.week-open-sold .cover-line.cover:focus-within { border-color: var(--coral-strong); box-shadow: 0 0.55rem 1.4rem rgb(192 98 76 / 0.16); }
.week-open-sold .cover-line.cover:hover::after,
.week-open-sold .cover-line.cover:focus-within::after {
  content: "Open cover";
  position: absolute;
  top: -0.72rem;
  left: 50%;
  padding: 0.22rem 0.65rem;
  border-radius: 999px;
  background: var(--coral);
  color: #fffaf7;
  font-size: 0.68rem;
  font-weight: 700;
  transform: translateX(-50%);
}
.week-open-sold .cover-rack { margin-top: 0; }
.week-open-sold .claim {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px dashed var(--line-soft);
}
.week-open-sold .claim-hed { font-size: clamp(1.45rem, 2.4vw, 2rem); }
.week-window {
  margin: 0.65rem 0 0;
  color: var(--mute);
  font-size: 0.76rem;
  text-align: center;
}
.claim-after-listing {
  margin: 0.65rem 0 0;
  color: var(--mute);
  font-size: 0.8rem;
  text-align: center;
}
.claim-after-listing a { text-decoration: underline; text-underline-offset: 0.16em; }
.claim-after-listing a:hover { color: var(--coral-strong); }
.week-closed-occupied .cover-line { border-color: var(--line); background: var(--surface-soft); box-shadow: none; }
.week-closed-occupied .cover-line.cover { border-color: var(--coral-soft); background: var(--coral-wash); }
.week-closed-occupied .cover-line:nth-child(n+4) { border-color: transparent; background: transparent; }
.week-closed-occupied .cover-rack { margin-top: 1.2rem; }
.week-closed-occupied .form-hint[data-frozen-issue],
.week-closed-empty .form-hint[data-empty-freeze] {
  display: block;
  margin: 1rem 0 0;
  padding-top: 0.8rem;
  border-top: 1px dashed var(--line-soft);
  color: var(--mute);
  font-size: 0.8rem;
  text-align: center;
}
.week-closed-occupied .form-hint[data-frozen-issue] a { color: var(--coral); }
.week-closed-empty .form-hint[data-empty-freeze] { display: block; }
a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
.amount-field input:focus-visible { outline: 2px solid var(--focus); outline-offset: 0.2rem; }
.doc { max-width: 44rem; margin: 2rem auto 0; }
.doc h1 { color: var(--ink); font-family: var(--display); font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -0.055em; text-transform: none; }
.doc p, .doc li { color: var(--mute); }
.doc a { color: var(--coral); }

@media (max-width: 719px) {
  .sheet { width: min(calc(100% - 2rem), 62rem); }
  .site-header,
  .site-nav { min-height: 4.25rem; }
  .site-nav { gap: 0.75rem; }
  .mark { font-size: 1.35rem; }
  .nav-tools { gap: 0.55rem; }
  .site-nav ul { gap: 0.8rem; font-size: 0.76rem; }
  .site-nav ul li:first-child { display: none; }
  .site-nav ul li:last-child { display: none; }
  .theme-toggle { width: auto; min-width: 3.65rem; height: 2.25rem; padding: 0 0.35rem; font-size: 0.82rem; }
  .masthead { padding-top: 1.0625rem; }
  .masthead-context { gap: 1.375rem; }
  .context-pill { width: 19.125rem; max-width: 100%; font-size: 0.78rem; }
  .masthead-period {
    position: static;
    top: auto;
    left: auto;
    margin: 1.34375rem auto 0;
    width: 10.8rem;
  }
  .claim { padding-top: 1.75rem; }
  .claim-hed { gap: 0.35rem; font-size: clamp(1.65rem, 7.2vw, 1.75rem); line-height: 1.25; }
  .amount-stepper { gap: 0.32rem; }
  .step { width: 1.35rem; height: 1.35rem; }
  #bid-form,
  .week-open-empty #claim #bid-form,
  .week-open-sold #claim #bid-form { grid-template-columns: minmax(0, 1fr); gap: 0.5rem; margin-top: 1.4375rem; }
  .cover-identity input, .bid-row input, .blurb-field, .outbid { height: 2.75rem; }
  .outbid { width: 100%; }
  .form-hint { text-align: center; }
  .context-rail { gap: 0.25rem; margin: 2rem 0 1.25rem; overflow: hidden; }
  .rail-item, .rail-menu summary { padding: 0.35rem 0.62rem; font-size: 0.74rem; }
  .context-rail .rail-item:nth-child(2),
  .context-rail .rail-item:nth-child(3) { display: none; }
  .rail-menu { margin-left: auto; }
  .empty-stand, .empty-issue { margin-top: 1rem; border-radius: 1rem; }
  .cover-rack { gap: 0.375rem; }
  .cover-line,
  .cover-line.cover[data-prize-before-price] {
    grid-template-columns: 2.375rem minmax(0, 1fr) max-content;
    align-items: start;
    min-height: 7.6875rem;
    gap: 0.65rem;
    padding: 0.75rem 1rem;
    border-radius: 1.575rem;
  }
  .cover-line .rank { min-width: 2.35rem; min-height: 1.75rem; padding: 0.25rem 0.35rem; font-size: 0.74rem; }
  .cover-line.cover .rank-visible { font-size: 0.74rem; }
  .cover-line.cover .rank { min-width: 2.55rem; }
  .cover-line .hed { font-size: 0.94rem; line-height: 1.2; }
  .cover-line .dek, .cover-line .slot { margin-top: 0; font-size: 0.76rem; line-height: 1.35; white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .cover-line .card-meta { align-self: start; gap: 0.15rem 0.45rem; margin-top: 18.75px; font-size: 0.68rem; }
  .cover-line .money { position: static; grid-column: 3; min-width: max-content; }
  .cover-line .bid { font-size: 0.88rem; }
  .cover-line .clicks { font-size: 0.68rem; }
  .cover-line.cover[data-prize-before-price] .later-fact { display: flex; margin-top: 0.3rem; }
  .cover-line.cover[data-prize-before-price] .later-fact .dek { display: -webkit-box; }
  .cover-line.cover[data-prize-before-price] .later-fact .clicks { display: inline; margin-right: 0.5rem; }
  .cover-line:nth-child(n+4) { min-height: 4.9rem; padding-top: 0.65rem; padding-bottom: 0.65rem; }
  .week-open-sold .claim { margin-top: 0; padding-top: 2rem; }
  .week-open-sold .claim-hed { font-size: 1.45rem; }
  .week-open-sold .cover-line.cover:hover::after,
  .week-open-sold .cover-line.cover:focus-within::after { display: none; }
  .week-closed-occupied .cover-rack { margin-top: 1rem; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
}

/*
 * Newsletter identity: the board is a printed folio, not a shared dashboard.
 * These rules intentionally come last so the historical parity geometry above
 * cannot hide the masthead or turn the issue ledger into rounded cards.
 */
:root,
:root[data-theme="dark"] {
  color-scheme: light;
  --page: #1c1d21;
  --surface: #ece7dc;
  --surface-soft: #e5ded1;
  --ink: #121212;
  --mute: #4a463e;
  --line: #b7b19f;
  --line-soft: #b7b19f;
  --coral: #9d1c14;
  --coral-strong: #9d1c14;
  --coral-soft: #c7bdae;
  --coral-wash: #e5ded1;
  --focus: #9d1c14;
  --display: "Franklin Gothic Medium", "Arial Narrow", Impact, "Helvetica Neue", sans-serif;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif;
}
html, body {
  min-width: 0;
  scrollbar-width: auto;
}
body {
  min-height: 100%;
  background:
    radial-gradient(1200px 480px at 50% -10%, #2a2c33, transparent 55%),
    var(--stone);
  color: var(--ink);
  font-family: var(--serif);
  line-height: 1.45;
}
.sheet {
  width: min(calc(100% - 1.25rem), 48rem);
  margin: 1.1rem auto 2.5rem;
  padding: 0.85rem 1.15rem 2.4rem;
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
}
.sheet .site-header,
.sheet .site-header > .site-nav {
  width: 100%;
  min-height: 0;
}
.sheet .site-nav {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 0 0.45rem;
  border-bottom: 1px solid var(--rule);
  font-family: var(--display);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.sheet .mark {
  flex: 0 0 auto;
  color: var(--ink) !important;
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}
.sheet .nav-tools {
  display: flex;
  align-items: baseline;
  gap: 0.85rem;
  margin-left: auto;
}
.sheet .site-nav ul {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.95rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sheet .site-nav a { color: var(--mute); transition: color 120ms ease; }
.sheet .site-nav a[aria-current="page"],
.sheet .site-nav a:hover { color: var(--ink); }
.sheet .search-toggle,
.sheet .theme-toggle,
.sheet .search-close {
  min-width: auto;
  height: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--mute);
  font-family: var(--display);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  line-height: 1.2;
  text-transform: uppercase;
  white-space: nowrap;
}
.sheet .search-toggle:hover,
.sheet .theme-toggle:hover,
.sheet .search-close:hover { border: 0; background: transparent; color: var(--ink); }
.sheet .search-popover {
  top: calc(100% + 0.55rem);
  right: 0;
  width: min(22rem, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  padding: 0.8rem;
  border: 1px solid var(--rule);
  border-radius: 0;
  background: var(--sheet);
  box-shadow: 0 0.8rem 1.6rem rgb(0 0 0 / 0.2);
}
.sheet .search-form input,
.sheet .search-close {
  height: 2.5rem;
  border: 1px solid var(--rule);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
}
.sheet .search-form input { padding: 0 0.7rem; }
.sheet .search-close { padding: 0 0.65rem; color: var(--ink); }
.sheet .search-result a {
  border: 1px solid var(--hair);
  border-radius: 0;
  background: transparent;
}
.sheet .search-result a:hover { border-color: var(--rule); background: var(--surface-soft); }
.sheet .search-result-bid { color: var(--flag); }
.sheet .masthead {
  position: relative;
  display: block;
  padding: 0.7rem 0 0.85rem;
  border-bottom: 4px double var(--rule);
  text-align: center;
}
.sheet .masthead-context,
.sheet .masthead-period { display: none; }
.sheet .folio {
  position: static;
  display: flex;
  width: auto;
  height: auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin: 0 0 0.45rem;
  padding: 0;
  overflow: visible;
  border: 0;
  clip: auto;
  clip-path: none;
  color: var(--ink);
  font-family: var(--display);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  line-height: 1.2;
  text-transform: uppercase;
  white-space: normal;
}
.sheet .folio time { font-variant-numeric: tabular-nums; }
.sheet .issue-state {
  display: inline-block;
  min-width: 5.4rem;
  padding: 0.12rem 0.4rem;
  border: 1px solid var(--rule);
  background: transparent !important;
  color: var(--ink) !important;
  font-weight: 700;
  text-align: center;
}
.sheet .issue-state[data-issue-status="open"] { background: var(--ink) !important; color: var(--sheet) !important; }
.sheet .issue-state[data-issue-status="closed"] { background: var(--flag) !important; border-color: var(--flag); color: #fff8f4 !important; }
.sheet .nameplate {
  position: static;
  display: grid;
  width: auto;
  height: auto;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 0.6rem;
  margin: 0;
  padding: 0.15rem 0 0.2rem;
  overflow: visible;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  clip: auto;
  clip-path: none;
  white-space: normal;
}
.sheet .nameplate h1 {
  margin: 0;
  color: var(--ink);
  font-family: var(--display);
  font-size: clamp(2.5rem, 7vw, 4.4rem);
  font-weight: 700;
  letter-spacing: -0.055em;
  line-height: 0.95;
  text-transform: uppercase;
}
.sheet .nameplate .ear { color: var(--mute); }
.sheet .masthead > .flag {
  display: block;
  max-width: 42rem;
  margin: 0.75rem auto 0;
  color: var(--flag);
  font-family: var(--serif);
  font-size: 0.95rem;
  line-height: 1.4;
  text-align: center;
}
.sheet .flag a { color: var(--flag); text-decoration: underline; text-underline-offset: 0.15em; }
.sheet .home-shell { display: flex; flex-direction: column; min-width: 0; }
.sheet .folio-index {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 1rem;
  margin: 1rem 0 0;
  padding: 0.55rem 0;
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
  font-family: var(--display);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.sheet .folio-index a { color: var(--mute); text-decoration: none; }
.sheet .folio-index a:hover,
.sheet .folio-index a:focus-visible { color: var(--ink); text-decoration: underline; text-underline-offset: 0.15em; }
.sheet .folio-section { min-width: 0; margin: 1.45rem 0 0; }
.sheet .section-kicker {
  margin: 0;
  padding: 0 0 0.4rem;
  border-bottom: 1px solid var(--rule);
  color: var(--flag);
  font-family: var(--display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  line-height: 1.2;
  text-transform: uppercase;
}
.sheet .section-note {
  margin: 0.5rem 0 0;
  color: var(--mute);
  font-size: 0.82rem;
}
.sheet .cover-rack { display: block; margin: 0.45rem 0 0; padding: 0; list-style: none; }
.sheet .cover-line,
.sheet .cover-line.cover,
.sheet .cover-line[data-later-rank] {
  display: grid;
  grid-template-columns: 2.8rem minmax(0, 1fr) max-content;
  align-items: start;
  gap: 0.7rem;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 1rem 0;
  border: 0;
  border-top: 1px solid var(--hair);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}
.sheet .cover-line.cover { border-top: 4px double var(--rule); }
.sheet .cover-line .rank {
  display: block;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--mute);
  font-family: var(--display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-transform: uppercase;
  white-space: normal;
}
.sheet .cover-line.cover .rank { color: var(--flag); font-size: 0.78rem; }
.sheet .cover-line .rank-visible { display: none; }
.sheet .cover-line > .cover-copy { grid-column: 2; min-width: 0; }
.sheet .cover-line > .money { grid-column: 3; min-width: max-content; text-align: right; }
.sheet .cover-line .hed {
  margin: 0;
  color: var(--ink);
  font-family: var(--display);
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.1;
  text-transform: uppercase;
}
.sheet .cover-line.cover .hed { font-size: clamp(1.45rem, 3.2vw, 2.1rem); line-height: 1.02; }
.sheet .cover-line .hed a { color: inherit; }
.sheet .cover-line .hed a:hover,
.sheet .cover-line .hed a:focus-visible { text-decoration: underline; text-underline-offset: 0.12em; }
.sheet .cover-line .dek {
  display: block;
  margin: 0.32rem 0 0;
  overflow: visible;
  color: var(--mute);
  font-family: var(--serif);
  font-size: 0.95rem;
  line-height: 1.4;
  text-overflow: clip;
  white-space: normal;
  -webkit-line-clamp: unset;
}
.sheet .cover-line .card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.7rem;
  min-width: 0;
  margin: 0.55rem 0 0;
  overflow: visible;
  color: var(--mute);
  font-family: var(--display);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  line-height: 1.25;
  text-transform: uppercase;
}
.sheet .cover-line .card-action { color: var(--flag); text-decoration: underline; text-underline-offset: 0.14em; }
.sheet .cover-line .clicks,
.sheet .cover-line .card-time { margin: 0; color: var(--mute); font-size: inherit; }
.sheet .cover-line .money .bid { margin: 0; color: var(--ink); font-family: var(--display); font-size: 1.08rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.sheet .stack-section .cover-line .money .bid { font-size: 0.92rem; font-weight: 600; }
.sheet .ledger-section { margin-top: 0.9rem; padding-top: 0.75rem; border-top: 1px solid var(--rule); }
.sheet .ledger-section .week-window {
  display: block;
  margin: 0.55rem 0 0;
  color: var(--mute);
  font-family: var(--display);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  line-height: 1.35;
  text-transform: uppercase;
}
.sheet .claim {
  margin-top: 1.7rem;
  padding: 1.2rem 0 0;
  border-top: 4px double var(--rule);
  border-bottom: 0;
}
.sheet .claim-hed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 0.25rem;
  margin: 0;
  color: var(--ink);
  font-family: var(--display);
  font-size: clamp(1.7rem, 4vw, 2.65rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 1;
  text-transform: uppercase;
}
.sheet .amount-stepper { display: inline-flex; align-items: center; gap: 0.42rem; }
.sheet .step {
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-size: 1.05rem;
  line-height: 1;
}
.sheet .step:hover,
.sheet .step:focus-visible { background: var(--ink); color: var(--sheet); }
.sheet .amount-field {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  text-decoration: none;
}
.sheet .amount-field input {
  width: 5.5ch;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.sheet .claim-note {
  display: block;
  max-width: 42rem;
  margin: 0.55rem 0 0;
  color: var(--mute);
  font-family: var(--serif);
  font-size: 0.88rem;
  line-height: 1.4;
  text-align: left;
}
.sheet #bid-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) max-content;
  gap: 0.6rem;
  width: 100%;
  margin-top: 1rem;
}
.sheet .cover-identity { display: contents; }
.sheet .cover-identity input,
.sheet .blurb-field {
  align-self: stretch;
  width: 100%;
  min-width: 0;
  height: 2.8rem;
  margin: 0;
  padding: 0 0.75rem;
  border: 1px solid var(--rule);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 0.95rem;
}
.sheet .cover-identity input::placeholder { color: var(--mute); opacity: 1; }
.sheet .outbid {
  min-width: 7.2rem;
  height: 2.8rem;
  padding: 0 1.05rem;
  border: 1px solid var(--ink);
  border-radius: 0;
  background: var(--ink);
  color: var(--sheet);
  font-family: var(--display);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}
.sheet .outbid:disabled { border-color: var(--hair); background: transparent; color: var(--mute); opacity: 1; }
.sheet .outbid:not(:disabled):hover,
.sheet .outbid:not(:disabled):focus-visible { border-color: var(--flag); background: var(--flag); color: #fff8f4; }
.sheet .form-hint {
  margin: 0.7rem 0 0;
  color: var(--mute);
  font-family: var(--serif);
  font-size: 0.86rem;
  line-height: 1.45;
  text-align: left;
}
.sheet .form-hint a { color: var(--flag); text-decoration: underline; text-underline-offset: 0.14em; }
.sheet .empty-stand,
.sheet .empty-issue {
  width: 100%;
  margin: 1.45rem 0 0;
  padding: 1rem 0 1.15rem;
  border: 0;
  border-top: 1px dashed var(--rule);
  border-bottom: 1px dashed var(--rule);
  border-radius: 0;
  background: transparent;
  text-align: left;
}
.sheet .empty-stand .section-kicker,
.sheet .empty-issue .section-kicker { margin-bottom: 0.8rem; }
.sheet .empty-stand .empty-kicker,
.sheet .empty-issue .empty-kicker {
  margin: 0;
  color: var(--flag);
  font-family: var(--display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.sheet .empty-stand .hed,
.sheet .empty-issue .hed { margin: 0.32rem 0 0; color: var(--ink); font-size: 1.5rem; text-transform: uppercase; }
.sheet .empty-stand .dek,
.sheet .empty-issue .dek { max-width: 42rem; margin: 0.35rem 0 0; color: var(--mute); font-size: 0.95rem; }
.sheet .fair-window { margin: 0.6rem 0 0; color: var(--mute); font-family: var(--display); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; }
.sheet .claim-after-listing {
  margin: 0.8rem 0 0;
  padding: 0.65rem 0 0;
  border-top: 1px dashed var(--hair);
  font-family: var(--serif);
  font-size: 0.9rem;
}
.sheet .claim-after-listing a { color: var(--mute); text-decoration: underline; text-underline-offset: 0.14em; }
.sheet .claim-raise-note[data-raise-hint] { margin-top: 0.7rem; padding-top: 0.7rem; border-top: 1px dashed var(--hair); }
.sheet .maker-contact {
  width: 100%;
  max-width: 100%;
  margin: 2rem 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--hair);
  color: var(--mute);
  font-family: var(--display);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  line-height: 1.45;
  text-align: center;
}
.sheet .maker-contact a {
  color: var(--flag);
  text-decoration: underline;
  text-underline-offset: 0.15em;
  overflow-wrap: anywhere;
}
.sheet .maker-contact a:hover,
.sheet .maker-contact a:focus-visible { color: var(--ink); }
.week-open-empty .masthead { order: 0; }
.week-open-empty .empty-stand { order: 1; }
.week-open-empty .claim { order: 2; }
.week-open-empty .folio-index { order: 3; }
.week-open-sold .masthead { order: 0; }
.week-open-sold .folio-index { order: 1; }
.week-open-sold .cover-section { order: 2; }
.week-open-sold .stack-section { order: 3; }
.week-open-sold .ledger-section { order: 4; }
.week-open-sold .claim-after-listing { order: 5; }
.week-open-sold .claim { order: 6; }
.week-open-sold .claim-raise-note { order: 7; }
.week-closed-empty .empty-issue { order: 1; }
.week-closed-empty .form-hint { order: 2; }
.week-closed-occupied .archive-section { order: 1; }
.week-closed-occupied .form-hint { order: 2; }
@media (max-width: 719px) {
  .sheet {
    width: calc(100% - 1.25rem);
    margin: 0.6rem auto 1.5rem;
    padding: 0.7rem 0.85rem 1.7rem;
  }
  .sheet .site-nav { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.55rem 0.8rem; align-items: baseline; }
  .sheet .nav-tools { grid-column: 1 / -1; display: flex; justify-content: space-between; width: 100%; margin: 0; padding-top: 0.4rem; border-top: 1px solid var(--hair); }
  .sheet .site-nav ul { gap: 0.55rem 0.8rem; font-size: 0.64rem; }
  .sheet .site-nav ul li:first-child,
  .sheet .site-nav ul li:last-child { display: list-item; }
  .sheet .mark { font-size: 0.98rem; }
  .sheet .search-toggle,
  .sheet .theme-toggle { font-size: 0.64rem; }
  .sheet .folio { font-size: 0.62rem; letter-spacing: 0.1em; }
  .sheet .nameplate { grid-template-columns: 1fr; gap: 0.18rem; align-items: center; padding: 0.35rem 0 0.4rem; }
  .sheet .nameplate h1 { font-size: clamp(2.45rem, 15vw, 3.6rem); }
  .sheet .nameplate .ear,
  .sheet .nameplate .ear-right { text-align: center; }
  .sheet .masthead > .flag { font-size: 0.86rem; }
  .sheet .folio-index { gap: 0.35rem 0.75rem; font-size: 0.62rem; }
  .sheet .claim-hed { display: flex; font-size: clamp(1.7rem, 8vw, 2.25rem); line-height: 1.05; }
  .sheet .amount-stepper { margin-top: 0; }
  .sheet .step { width: 2.4rem; height: 2.4rem; }
  .sheet #bid-form { grid-template-columns: minmax(0, 1fr); gap: 0.55rem; }
  .sheet .cover-identity input,
  .sheet .blurb-field,
  .sheet .outbid { height: 2.8rem; }
  .sheet .outbid { width: 100%; }
  .sheet .cover-line,
  .sheet .cover-line.cover,
  .sheet .cover-line[data-later-rank] {
    grid-template-columns: 2.5rem minmax(0, 1fr);
    gap: 0.5rem;
    padding: 0.9rem 0;
  }
  .sheet .cover-line > .cover-copy { grid-column: 2; grid-row: 1; }
  .sheet .cover-line > .money { grid-column: 2; grid-row: 2; display: flex; align-items: baseline; gap: 0.7rem; margin-top: 0.55rem; text-align: left; }
  .sheet .cover-line .rank { font-size: 0.66rem; }
  .sheet .cover-line.cover .rank { font-size: 0.7rem; }
  .sheet .cover-line.cover .hed { font-size: 1.35rem; }
  .sheet .cover-line .hed { font-size: 1.02rem; }
  .sheet .cover-line .dek { font-size: 0.9rem; }
  .sheet .cover-line .card-meta { margin-top: 0.45rem; font-size: 0.62rem; }
  .sheet .cover-line .money .bid { font-size: 0.94rem; }
  .sheet .stack-section .cover-line .money .bid { font-size: 0.86rem; }
  .sheet .maker-contact { margin-top: 1.45rem; padding-top: 0.65rem; font-size: 0.64rem; }
}

`;

export const OCCUPIED_CSS = /* css */ `
/* Occupied open ear names the fair live-rank window, not Monday UTC. */
.week-open-sold .nameplate .ear-right[data-occupied-ear] {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  text-align: right;
}
.week-open-sold .claim-after-listing[data-claim-after-listing] {
  margin: 0.7rem 0 0;
  padding: 0.65rem 0 0;
  border-top: 1px dashed var(--hair);
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
}
.week-open-empty[data-empty-open-stand] [data-sold-cover],
.week-open-empty[data-empty-open-stand] [data-claim-cover],
.week-open-empty[data-empty-open-stand] [data-claim-after-listing],
.week-open-empty[data-empty-open-stand] [data-named-prize],
.week-open-empty[data-empty-open-stand] [data-later-fact],
.week-open-empty[data-empty-open-stand] [data-cover-first],
.week-open-empty[data-empty-open-stand] [data-paid-name],
.week-open-empty[data-empty-open-stand] [data-occupied-ear],
.week-open-empty[data-empty-open-stand] [data-rolling-week],
.week-open-empty[data-empty-open-stand] .week-window,
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
  flex-wrap: nowrap;
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
/* Occupied live: rolling last-7-days window from paid placement. Not Monday midnight. */
.week-open-sold .today-ranking { margin-top: 1.5rem; }
.week-open-sold .activity-row { height: 3.25rem; }
.week-open-sold .cover-rack[data-rolling-week] + .week-window[data-rolling-week] {
  margin: 0.3rem 0 0;
  font-family: var(--display);
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.35;
  color: var(--ink);
  text-transform: none;
}

/* Keep occupied-row selectors explicit: later fact/rank markers remain
 * meaningful to the product contract while the visual treatment stays quiet. */
.week-open-sold .cover-line.cover[data-prize-before-price] {
  grid-template-columns: 2.375rem minmax(0, 1fr) max-content;
  min-height: 6.875rem;
  padding: 0.75rem 0.875rem;
  gap: 0.75rem;
  align-items: start;
  border: 2px solid var(--card-lead-border);
  border-radius: 1.55rem;
  background: var(--card-lead-surface);
}
.week-open-sold .cover-line.cover[data-prize-before-price] .rank {
  min-width: 2.375rem;
  font-size: 0;
  line-height: 1;
  align-self: center;
}
.week-open-sold .cover-line.cover[data-prize-before-price] .rank-visible { font-size: 0.85rem; }
.week-open-sold .cover-line[data-prize-before-price] .hed,
.week-open-sold .cover-line[data-named-prize] .hed,
.week-open-sold .cover-line[data-named-prize][data-paid-name] .hed {
  font-size: 1.02rem;
  line-height: 1.2;
  letter-spacing: -0.025em;
  text-transform: none;
}
.week-open-sold .cover-line[data-prize-before-price] .later-fact {
  display: flex;
  align-items: baseline;
  gap: 0.2rem 0.75rem;
  min-width: 0;
  margin: 0;
  overflow: hidden;
}
.week-open-sold .cover-line[data-prize-before-price] .later-fact .dek {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.week-open-sold .cover-line[data-prize-before-price] .later-fact .clicks {
  flex: 0 0 auto;
  margin: 0;
  white-space: nowrap;
}
.week-open-sold .cover-line.cover[data-prize-before-price] > .cover-copy,
.week-open-sold .cover-line[data-later-rank] > .cover-copy {
  grid-column: 2;
  align-self: stretch;
  display: grid;
  grid-template-rows: auto auto 1fr;
  align-content: stretch;
  min-width: 0;
}
.week-open-sold .cover-line.cover[data-prize-before-price] > .money {
  grid-column: 3;
  z-index: 1;
}
.week-open-sold .cover-line[data-later-rank] > .money {
  grid-column: 3;
  z-index: 1;
}
.week-open-sold .cover-line > .money { z-index: 1; }
.week-open-sold .cover-line .hed,
.week-open-sold .cover-line .slot,
.week-open-sold .cover-line .dek,
.week-open-sold .cover-line .clicks {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.week-open-sold .cover-line .hed { white-space: nowrap; }
.week-open-sold .cover-line[data-later-rank] {
  grid-template-columns: 2.375rem minmax(0, 1fr) max-content;
  min-height: 6.875rem;
  padding: 0.75rem 0.875rem;
  gap: 0.75rem;
  border: 2px solid var(--card-later-border);
  border-radius: 1.55rem;
  background: var(--card-later-surface);
}
.week-open-sold .cover-rack.cover-rack-top > .cover-line[data-later-rank]:nth-child(3) {
  border-color: var(--card-quiet-border);
  background: var(--card-quiet-surface);
}
.week-open-sold .cover-line[data-later-rank] .rank {
  min-width: 2.375rem;
  min-height: 2rem;
  padding: 0.28rem 0.48rem;
  background: var(--coral);
  color: #fffaf7;
  font-size: 0.85rem;
  font-weight: 700;
}
.week-open-sold .cover-line[data-later-rank] .dek,
.week-open-sold .cover-line[data-later-rank] .slot {
  margin-top: 0.25rem;
  font-family: var(--display);
  font-size: 0.8rem;
  line-height: 1.35;
  text-transform: none;
  white-space: nowrap;
}
.week-open-sold .cover-line[data-later-rank] .slot { color: var(--ink); font-weight: 600; }
.week-open-sold .cover-line[data-later-rank] .slot {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
}
.week-open-sold .cover-line[data-later-rank] .bid { font-size: 0.95rem; font-weight: 700; }
.week-open-sold .cover-line[data-later-rank] .dek,
.week-open-sold .cover-line[data-later-rank] .clicks {
  margin-top: 0.2rem;
  white-space: nowrap;
}
.week-open-sold .cover-line[data-later-rank] .clicks { font-size: 0.72rem; }
.week-open-sold .cover-line:nth-child(n+4) {
  min-height: 4.2rem;
  padding: 0.7rem 0.9rem;
  border-color: transparent;
  border-radius: 0.8rem;
  background: transparent;
  box-shadow: none;
}
.week-open-sold .cover-line:nth-child(n+4) .rank { background: var(--surface-soft); color: var(--mute); }
.week-open-sold .claim { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px dashed var(--line-soft); }
.week-open-sold .claim-hed { font-size: 2.5rem; line-height: 1.5; }

/* The source order remains Cover then claim for the first-click contract. The
 * visual stack follows the compact board composition: claim hero, rail, then
 * the highlighted rows. */
.week-open-sold { display: block; }
.week-open-sold > .home-shell {
  display: flex;
  flex-direction: column;
}
.week-open-sold .masthead { order: 0; }
.week-open-sold .claim { order: 1; margin-top: 0; padding-top: 1.25rem; border-top: 0; }
.week-open-sold .context-rail { order: 2; }
.week-open-sold .cover-rack { order: 3; }
.week-open-sold .week-window { order: 4; }
.week-open-sold .claim-after-listing { order: 5; }
.week-open-sold .claim-raise-note[data-raise-hint] {
  order: 9;
  margin: 1rem 0 0.35rem;
  padding: 0.85rem 0 0;
  border-top: 1px dashed var(--line-soft);
  color: var(--mute);
  font-size: 0.76rem;
  text-align: center;
}
.week-open-sold .cover-rack.cover-rack-top {
  order: 3;
  gap: 0.75rem;
  margin-top: 0;
}
.week-open-sold .today-ranking,
.week-open-sold .latest-activity {
  width: 100%;
  color: var(--ink);
}
.week-open-sold .today-ranking { order: 4; margin-top: 1.5rem; }
.week-open-sold .latest-activity { order: 5; margin-top: 1.5rem; }
.today-ranking h2,
.latest-activity h2 {
  margin: 0;
  color: var(--ink);
  font-family: var(--display);
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.3;
}
.today-ranking-list,
.latest-activity-list {
  display: grid;
  gap: 0.5rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}
.today-ranking-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.latest-activity-list { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.today-ranking-row,
.activity-row {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: var(--surface-soft);
  font-size: 0.78rem;
  line-height: 1.2;
}
.today-ranking-row {
  height: 4rem;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  align-content: center;
  gap: 0.1rem 0.6rem;
  padding: 0.55rem 0.7rem;
}
.today-ranking-rank {
  grid-row: 1 / -1;
  color: var(--coral-strong);
  font-size: 0.74rem;
  font-weight: 700;
}
.today-ranking-row a,
.activity-row > a {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  text-decoration: none;
  white-space: nowrap;
}
.today-ranking-row a:hover,
.activity-row > a:hover { color: var(--coral-strong); text-decoration: underline; text-underline-offset: 0.15em; }
.today-ranking-bid { color: var(--coral-strong); font-size: 0.72rem; font-weight: 700; }
.activity-row {
  height: 3.25rem;
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  gap: 0.15rem;
  padding: 0.45rem 0.6rem;
}
.activity-row > a { font-size: 0.74rem; }
.activity-fact {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0 0.35rem;
  max-height: 1.75rem;
  overflow: hidden;
  color: var(--mute);
  font-size: 0.66rem;
  line-height: 1.3;
}
.week-open-sold .cover-rack.cover-rack-later {
  order: 6;
  gap: 0.75rem;
  margin-top: 2rem;
}
.week-open-sold .cover-rack.cover-rack-later .cover-line {
  min-height: 4.2rem;
  padding: 0.7rem 0.9rem;
  border-color: transparent;
  border-radius: 0.8rem;
  background: transparent;
  box-shadow: none;
}
.week-open-sold .cover-rack.cover-rack-later .cover-line .rank {
  background: var(--surface-soft);
  color: var(--mute);
}
.week-open-sold .week-window { order: 7; }
.week-open-sold .claim-after-listing { order: 8; }

@media (max-width: 719px) {
  .week-open-sold .cover-line.cover[data-prize-before-price],
  .week-open-sold .cover-line[data-later-rank] {
    grid-template-columns: 2.375rem minmax(0, 1fr) max-content;
    min-height: 7.6875rem;
    gap: 0.65rem;
    padding: 0.75rem 1rem;
    border-radius: 1.575rem;
  }
  .week-open-sold .cover-line[data-later-rank] .rank { min-width: 2.375rem; min-height: 1.75rem; padding: 0.25rem 0.3rem; font-size: 0.74rem; }
  .week-open-sold .cover-line[data-later-rank] .dek,
  .week-open-sold .cover-line[data-later-rank] .slot { margin-top: 0; font-size: 0.76rem; line-height: 1.35; white-space: normal; }
  .week-open-sold .cover-line.cover[data-prize-before-price] .card-meta,
  .week-open-sold .cover-line[data-later-rank] .card-meta { align-self: start; margin-top: 18.75px; }
  .week-open-sold .cover-line[data-later-rank] .money { position: static; grid-column: 3; min-width: max-content; }
  .week-open-sold .cover-line.cover[data-prize-before-price] > .cover-copy,
  .week-open-sold .cover-line[data-later-rank] > .cover-copy {
    grid-column: 2;
    grid-row: 1 / -1;
    padding-inline-end: 0;
  }
  .week-open-sold .cover-line.cover[data-prize-before-price] > .rank,
  .week-open-sold .cover-line[data-later-rank] > .rank {
    min-width: 2.375rem;
    min-height: 1.75rem;
    padding: 0.25rem 0.3rem;
    font-size: 0.74rem;
    align-self: start;
    margin-top: 15px;
  }
  .week-open-sold .cover-line.cover[data-prize-before-price] > .rank { font-size: 0; }
  .week-open-sold .cover-line.cover[data-prize-before-price] > .rank .rank-visible { font-size: 0.74rem; }
  .week-open-sold .cover-line:nth-child(n+4) { min-height: 4.9rem; padding: 0.65rem; }
  .week-open-sold .cover-line.cover[data-prize-before-price] .rank-visible { font-size: 0.74rem; }
  .week-open-sold .claim { margin-top: 0; padding-top: 1.75rem; border-top: 0; }
  .week-open-sold .claim-hed { font-size: 1.75rem; line-height: 1.25; }
  .week-open-sold .today-ranking,
  .week-open-sold .latest-activity { display: block; }
  .week-open-sold .cover-rack.cover-rack-top { gap: 0.375rem; }
  .week-open-sold .cover-rack.cover-rack-later { gap: 0.5rem; margin-top: 0.5rem; }
  .week-open-sold .cover-rack.cover-rack-later .cover-line { min-height: 4.9rem; padding: 0.65rem; }
  .week-open-sold .cover-line.cover[data-prize-before-price] > .cover-copy,
  .week-open-sold .cover-line[data-later-rank] > .cover-copy { position: relative; }
  .week-open-sold .cover-line.cover[data-prize-before-price][data-named-prize] .card-meta.later-fact[data-later-fact],
  .week-open-sold .cover-line[data-later-rank] .card-meta.later-fact[data-later-fact] {
    position: absolute;
    top: 72px;
    right: 0;
    left: 0;
    align-self: start;
    margin: 0;
    margin-block-start: 0;
    margin-top: 0;
  }
  .week-open-sold .cover-line.cover[data-prize-before-price] .hed,
  .week-open-sold .cover-line[data-later-rank] .hed {
    font-size: 0.92rem;
    line-height: 1.15;
  }
  .week-open-sold .cover-line.cover[data-prize-before-price] .card-meta,
  .week-open-sold .cover-line[data-later-rank] .card-meta {
    gap: 0.15rem 0.35rem;
    font-size: 0.64rem;
  }
  .today-ranking-list,
  .latest-activity-list { grid-template-columns: 1fr; }
}

`;

const PRINT_FOLIO_OCCUPIED_CSS = /* css */ `
/* Occupied folio rows stay a hairline ledger after the legacy parity rules. */
.week-open-sold .folio-index,
.week-open-sold .cover-section,
.week-open-sold .stack-section,
.week-open-sold .ledger-section,
.week-open-sold .claim-after-listing,
.week-open-sold .claim,
.week-open-sold .claim-raise-note { position: static; }
.week-open-sold .folio-index { order: 1; }
.week-open-sold .cover-section { order: 2; }
.week-open-sold .stack-section { order: 3; }
.week-open-sold .ledger-section { order: 4; }
.week-open-sold .claim-after-listing { order: 5; }
.week-open-sold .claim { order: 6; margin-top: 1.7rem; padding-top: 1.2rem; border-top: 4px double var(--rule); }
.week-open-sold .claim-raise-note { order: 7; margin-top: 0.7rem; padding-top: 0.7rem; border-top: 1px dashed var(--hair); }
.week-open-sold .cover-rack { display: block; gap: 0; margin: 0.45rem 0 0; }
.week-open-sold .cover-line,
.week-open-sold .cover-line.cover,
.week-open-sold .cover-line[data-later-rank] {
  display: grid;
  grid-template-columns: 2.8rem minmax(0, 1fr) max-content;
  align-items: start;
  gap: 0.7rem;
  min-height: 0;
  padding: 1rem 0;
  border: 0;
  border-top: 1px solid var(--hair);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}
.week-open-sold .cover-line.cover { border-top: 4px double var(--rule); }
.week-open-sold .cover-line .rank,
.week-open-sold .cover-line.cover .rank,
.week-open-sold .cover-line[data-later-rank] .rank {
  display: block;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--mute);
  font-family: var(--display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.25;
  text-transform: uppercase;
  white-space: normal;
}
.week-open-sold .cover-line.cover .rank { color: var(--flag); font-size: 0.78rem; }
.week-open-sold .cover-line .rank-visible { display: none; }
.week-open-sold .cover-line > .cover-copy,
.week-open-sold .cover-line.cover[data-prize-before-price] > .cover-copy,
.week-open-sold .cover-line[data-later-rank] > .cover-copy {
  grid-column: 2;
  grid-row: auto;
  align-self: start;
  display: block;
  min-width: 0;
  padding-inline-end: 0;
  position: static;
}
.week-open-sold .cover-line > .money,
.week-open-sold .cover-line.cover[data-prize-before-price] > .money,
.week-open-sold .cover-line[data-later-rank] > .money {
  grid-column: 3;
  grid-row: auto;
  min-width: max-content;
  margin: 0;
  text-align: right;
  z-index: auto;
}
.week-open-sold .cover-line .hed,
.week-open-sold .cover-line[data-later-rank] .hed,
.week-open-sold .cover-line.cover[data-prize-before-price] .hed {
  display: block;
  margin: 0;
  overflow: visible;
  color: var(--ink);
  font-family: var(--display);
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.1;
  text-overflow: clip;
  text-transform: uppercase;
  white-space: normal;
}
.week-open-sold .cover-line.cover .hed { font-size: clamp(1.45rem, 3.2vw, 2.1rem); line-height: 1.02; }
.week-open-sold .cover-line .dek,
.week-open-sold .cover-line[data-later-rank] .dek {
  display: block;
  margin: 0.32rem 0 0;
  overflow: visible;
  color: var(--mute);
  font-family: var(--serif);
  font-size: 0.95rem;
  line-height: 1.4;
  text-overflow: clip;
  white-space: normal;
  -webkit-line-clamp: unset;
}
.week-open-sold .cover-line .card-meta,
.week-open-sold .cover-line[data-later-rank] .card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.7rem;
  min-width: 0;
  margin: 0.55rem 0 0;
  overflow: visible;
  color: var(--mute);
  font-family: var(--display);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  line-height: 1.25;
  text-transform: uppercase;
}
.week-open-sold .cover-line .card-action { color: var(--flag); text-decoration: underline; text-underline-offset: 0.14em; }
.week-open-sold .cover-line .clicks,
.week-open-sold .cover-line .card-time { margin: 0; color: var(--mute); font-size: inherit; }
.week-open-sold .cover-line .money .bid { margin: 0; color: var(--ink); font-family: var(--display); font-size: 1.08rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.week-open-sold .stack-section .cover-line .money .bid { font-size: 0.92rem; font-weight: 600; }
@media (max-width: 719px) {
  .week-open-sold .cover-line,
  .week-open-sold .cover-line.cover,
  .week-open-sold .cover-line[data-later-rank] {
    grid-template-columns: 2.5rem minmax(0, 1fr);
    gap: 0.5rem;
    min-height: 0;
    padding: 0.9rem 0;
    border-radius: 0;
  }
  .week-open-sold .cover-line > .cover-copy,
  .week-open-sold .cover-line.cover[data-prize-before-price] > .cover-copy,
  .week-open-sold .cover-line[data-later-rank] > .cover-copy { grid-column: 2; grid-row: 1; padding-inline-end: 0; }
  .week-open-sold .cover-line > .money,
  .week-open-sold .cover-line.cover[data-prize-before-price] > .money,
  .week-open-sold .cover-line[data-later-rank] > .money { grid-column: 2; grid-row: 2; display: flex; align-items: baseline; gap: 0.7rem; margin-top: 0.55rem; text-align: left; }
  .week-open-sold .cover-line .rank,
  .week-open-sold .cover-line[data-later-rank] .rank { min-width: 0; min-height: 0; margin: 0; padding: 0; font-size: 0.66rem; }
  .week-open-sold .cover-line.cover .rank { font-size: 0.7rem; }
  .week-open-sold .cover-line.cover .hed { font-size: 1.35rem; }
  .week-open-sold .cover-line .hed { font-size: 1.02rem; }
  .week-open-sold .cover-line .dek { font-size: 0.9rem; }
  .week-open-sold .cover-line .card-meta { margin-top: 0.45rem; font-size: 0.62rem; }
  .week-open-sold .cover-line .money .bid { font-size: 0.94rem; }
  .week-open-sold .stack-section .cover-line .money .bid { font-size: 0.86rem; }

  /* Mobile rows read as a short folio ledger: pitch, sponsor action,
   * click/date facts, then the bid on its own line. The legacy occupied
   * rules positioned metadata over the copy; reset that geometry here. */
  .week-open-sold .cover-line.cover[data-prize-before-price][data-named-prize] .card-meta.later-fact[data-later-fact],
  .week-open-sold .cover-line[data-later-rank] .card-meta.later-fact[data-later-fact] {
    position: static;
    inset: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: baseline;
    align-self: stretch;
    gap: 0.28rem 0.55rem;
    margin: 0.55rem 0 0;
    padding: 0;
    overflow: visible;
  }
  .week-open-sold .cover-line .card-action {
    grid-column: 1 / -1;
    min-width: 0;
    white-space: normal;
  }
  .week-open-sold .cover-line .clicks {
    grid-column: 1;
    min-width: 0;
    white-space: nowrap;
  }
  .week-open-sold .cover-line .card-time {
    grid-column: 2;
    justify-self: end;
    min-width: 0;
    white-space: nowrap;
  }
  .week-open-sold .cover-line > .money,
  .week-open-sold .cover-line.cover[data-prize-before-price] > .money,
  .week-open-sold .cover-line[data-later-rank] > .money {
    grid-column: 2;
    grid-row: 2;
    align-self: start;
    justify-self: start;
    min-width: 0;
    margin-top: 0.55rem;
  }
  .week-open-sold .cover-line .money .bid { white-space: nowrap; }
}
`;

const CLAIM_CONTROL_ALIGNMENT_CSS = /* css */ `
/* Keep the primary submit action on the same desktop control line as the
 * amount stepper. The form fields retain their own row below the claim note. */
@media (min-width: 720px) {
  .sheet .week-open-empty .claim {
    position: relative;
  }

  .sheet .week-open-empty #bid-form {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .sheet .week-open-empty #claim .outbid {
    position: absolute;
    top: 1.25rem;
    right: 0;
    margin: 0;
  }
}
`;

export const ISSUE_CSS = `${FOLIO_CSS}\n${OCCUPIED_CSS}\n${PRINT_FOLIO_OCCUPIED_CSS}\n${CLAIM_CONTROL_ALIGNMENT_CSS}`;

export const BOARD_CSS = ISSUE_CSS;
