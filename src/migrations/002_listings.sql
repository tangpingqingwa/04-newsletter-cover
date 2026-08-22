CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  issue_date TEXT NOT NULL,
  sponsor_url TEXT NOT NULL,
  blurb TEXT NOT NULL,
  bid_usd INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'rejected')),
  UNIQUE (sponsor_url, issue_date),
  FOREIGN KEY (issue_date) REFERENCES issues(issue_date)
);
