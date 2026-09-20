import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type { CommentRecord, CreateCommentInput, ListCommentsQuery, Platform } from './types';

const STORAGE_KEY = 'overlay_comments_sqlite_v1';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let ready: Promise<void> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  video_id TEXT NOT NULL,
  parent_id TEXT,
  native_parent_id TEXT,
  reply_to_author TEXT,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_video
  ON comments(platform, video_id);
CREATE INDEX IF NOT EXISTS idx_comments_native
  ON comments(platform, video_id, native_parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON comments(parent_id);
`;

function uuid(): string {
  return crypto.randomUUID();
}

async function loadWasm(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  const wasmUrl = browser.runtime.getURL('/sql-wasm.wasm');
  const wasmBinary = await fetch(wasmUrl).then((r) => {
    if (!r.ok) throw new Error(`加载 sql-wasm.wasm 失败: ${r.status}`);
    return r.arrayBuffer();
  });
  SQL = await initSqlJs({ wasmBinary });
  return SQL;
}

async function persist(): Promise<void> {
  if (!db) return;
  const exported = db.export();
  await browser.storage.local.set({
    [STORAGE_KEY]: Array.from(exported),
  });
}

function migrate(database: Database) {
  const cols = database.exec(`PRAGMA table_info(comments)`);
  const names = new Set((cols[0]?.values ?? []).map((row) => String(row[1])));
  if (names.size > 0 && !names.has('reply_to_author')) {
    database.run(`ALTER TABLE comments ADD COLUMN reply_to_author TEXT`);
  }
}

async function open(): Promise<Database> {
  if (db) return db;
  const sql = await loadWasm();
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const bytes = stored[STORAGE_KEY] as number[] | undefined;
  db = bytes?.length ? new sql.Database(new Uint8Array(bytes)) : new sql.Database();
  db.run(SCHEMA);
  migrate(db);
  return db;
}

export function ensureDb(): Promise<void> {
  if (!ready) {
    ready = open().then(() => undefined);
  }
  return ready;
}

function rowToComment(row: Record<string, unknown>): CommentRecord {
  return {
    id: String(row.id),
    platform: row.platform as Platform,
    videoId: String(row.video_id),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    nativeParentId: row.native_parent_id == null ? null : String(row.native_parent_id),
    replyToAuthor: row.reply_to_author == null ? null : String(row.reply_to_author),
    author: String(row.author),
    body: String(row.body),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function queryAll(database: Database, sql: string, params: unknown[] = []): CommentRecord[] {
  const stmt = database.prepare(sql);
  stmt.bind(params as never[]);
  const rows: CommentRecord[] = [];
  while (stmt.step()) {
    rows.push(rowToComment(stmt.getAsObject()));
  }
  stmt.free();
  return rows;
}

export async function listComments(query: ListCommentsQuery): Promise<CommentRecord[]> {
  await ensureDb();
  const database = await open();
  return queryAll(
    database,
    `SELECT * FROM comments
     WHERE platform = ? AND video_id = ?
     ORDER BY created_at ASC`,
    [query.platform, query.videoId],
  );
}

export async function createComment(input: CreateCommentInput): Promise<CommentRecord> {
  await ensureDb();
  const database = await open();
  const now = Date.now();
  const record: CommentRecord = {
    id: uuid(),
    platform: input.platform,
    videoId: input.videoId,
    parentId: input.parentId ?? null,
    nativeParentId: input.nativeParentId ?? null,
    replyToAuthor: input.replyToAuthor?.trim() || null,
    author: input.author?.trim() || '我',
    body: input.body.trim(),
    createdAt: now,
    updatedAt: now,
  };

  if (!record.body) {
    throw new Error('评论内容不能为空');
  }

  database.run(
    `INSERT INTO comments
      (id, platform, video_id, parent_id, native_parent_id, reply_to_author, author, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.platform,
      record.videoId,
      record.parentId,
      record.nativeParentId,
      record.replyToAuthor,
      record.author,
      record.body,
      record.createdAt,
      record.updatedAt,
    ],
  );
  await persist();
  return record;
}

export async function deleteComment(id: string): Promise<void> {
  await ensureDb();
  const database = await open();
  const all = queryAll(database, `SELECT * FROM comments`);
  const remove = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of all) {
      if (row.parentId && remove.has(row.parentId) && !remove.has(row.id)) {
        remove.add(row.id);
        grew = true;
      }
    }
  }
  for (const rid of remove) {
    database.run(`DELETE FROM comments WHERE id = ?`, [rid]);
  }
  await persist();
}

export async function countAll(): Promise<number> {
  await ensureDb();
  const database = await open();
  const stmt = database.prepare(`SELECT COUNT(*) AS c FROM comments`);
  stmt.step();
  const c = Number(stmt.getAsObject().c ?? 0);
  stmt.free();
  return c;
}

export async function exportDbBytes(): Promise<Uint8Array> {
  await ensureDb();
  const database = await open();
  return database.export();
}
