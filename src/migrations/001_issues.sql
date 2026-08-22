CREATE TABLE issues (
  issue_date TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  closed_at TEXT
);
