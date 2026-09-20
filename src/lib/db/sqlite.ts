import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type {
  CommentRecord,
  CreateCommentInput,
  ListCommentsQuery,
  Platform,
  VoteCommentInput,
  VoteKind,
} from './types';
import { applyVote } from './vote';

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
  author_pubkey TEXT,
  body TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  dislikes INTEGER NOT NULL DEFAULT 0,
  my_vote TEXT,
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
  if (names.size === 0) return;
  if (!names.has('reply_to_author')) {
    database.run(`ALTER TABLE comments ADD COLUMN reply_to_author TEXT`);
  }
  if (!names.has('likes')) {
    database.run(`ALTER TABLE comments ADD COLUMN likes INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has('dislikes')) {
    database.run(`ALTER TABLE comments ADD COLUMN dislikes INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has('my_vote')) {
    database.run(`ALTER TABLE comments ADD COLUMN my_vote TEXT`);
  }
  if (!names.has('author_pubkey')) {
    database.run(`ALTER TABLE comments ADD COLUMN author_pubkey TEXT`);
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

function parseMyVote(value: unknown): VoteKind | null {
  return value === 'up' || value === 'down' ? value : null;
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
    authorPubkey: row.author_pubkey == null ? null : String(row.author_pubkey),
    body: String(row.body),
    likes: Number(row.likes ?? 0),
    dislikes: Number(row.dislikes ?? 0),
    myVote: parseMyVote(row.my_vote),
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
    nativeParentId: null,
    replyToAuthor: input.replyToAuthor?.trim() || null,
    author: input.author?.trim() || '我',
    authorPubkey: input.authorPubkey?.trim() || null,
    body: input.body.trim(),
    likes: 0,
    dislikes: 0,
    myVote: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!record.body) {
    throw new Error('评论内容不能为空');
  }

  database.run(
    `INSERT INTO comments
      (id, platform, video_id, parent_id, native_parent_id, reply_to_author, author,
       author_pubkey, body, likes, dislikes, my_vote, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.platform,
      record.videoId,
      record.parentId,
      record.nativeParentId,
      record.replyToAuthor,
      record.author,
      record.authorPubkey,
      record.body,
      record.likes,
      record.dislikes,
      record.myVote,
      record.createdAt,
      record.updatedAt,
    ],
  );
  await persist();
  return record;
}

/** 远程评论写入；若带本地 id 或同内容本机稿，则合并为 event id，避免重复 */
export async function absorbRemoteComment(
  record: CommentRecord,
  localIdHint?: string | null,
): Promise<'inserted' | 'merged' | 'skipped'> {
  await ensureDb();
  const database = await open();

  const byEvent = queryAll(database, `SELECT id FROM comments WHERE id = ?`, [record.id]);
  if (byEvent[0]) return 'skipped';

  let localId: string | null = null;
  if (localIdHint) {
    const byLocal = queryAll(database, `SELECT id FROM comments WHERE id = ?`, [localIdHint]);
    if (byLocal[0]) localId = localIdHint;
  }
  if (!localId) {
    const same = queryAll(
      database,
      `SELECT id FROM comments
       WHERE platform = ? AND video_id = ? AND body = ? AND id != ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [record.platform, record.videoId, record.body, record.id],
    );
    if (same[0]) localId = same[0].id;
  }

  if (localId) {
    const local = queryAll(database, `SELECT * FROM comments WHERE id = ?`, [localId])[0];
    database.run(`UPDATE comments SET parent_id = ? WHERE parent_id = ?`, [
      record.id,
      localId,
    ]);
    database.run(`DELETE FROM comments WHERE id = ?`, [localId]);
    database.run(
      `INSERT INTO comments
        (id, platform, video_id, parent_id, native_parent_id, reply_to_author, author,
         author_pubkey, body, likes, dislikes, my_vote, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.platform,
        record.videoId,
        record.parentId,
        record.nativeParentId,
        record.replyToAuthor,
        record.author,
        record.authorPubkey,
        record.body,
        local?.likes ?? 0,
        local?.dislikes ?? 0,
        local?.myVote ?? null,
        record.createdAt,
        Date.now(),
      ],
    );
    await persist();
    return 'merged';
  }

  database.run(
    `INSERT INTO comments
      (id, platform, video_id, parent_id, native_parent_id, reply_to_author, author,
       author_pubkey, body, likes, dislikes, my_vote, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.platform,
      record.videoId,
      record.parentId,
      record.nativeParentId,
      record.replyToAuthor,
      record.author,
      record.authorPubkey,
      record.body,
      record.likes,
      record.dislikes,
      record.myVote,
      record.createdAt,
      record.updatedAt,
    ],
  );
  await persist();
  return 'inserted';
}

/** @deprecated 使用 absorbRemoteComment */
export async function upsertRemoteComment(record: CommentRecord): Promise<boolean> {
  const r = await absorbRemoteComment(record);
  return r === 'inserted';
}

/** 本地 uuid 对齐为 Nostr event id，避免拉取后重复 */
export async function remapCommentId(fromId: string, toId: string): Promise<void> {
  if (!fromId || !toId || fromId === toId) return;
  await ensureDb();
  const database = await open();
  const target = queryAll(database, `SELECT id FROM comments WHERE id = ?`, [toId]);
  if (target[0]) {
    database.run(`UPDATE comments SET parent_id = ? WHERE parent_id = ?`, [toId, fromId]);
    database.run(`DELETE FROM comments WHERE id = ?`, [fromId]);
  } else {
    database.run(`UPDATE comments SET parent_id = ? WHERE parent_id = ?`, [toId, fromId]);
    database.run(`UPDATE comments SET id = ? WHERE id = ?`, [toId, fromId]);
  }
  await persist();
}

export async function voteComment(input: VoteCommentInput): Promise<CommentRecord> {
  await ensureDb();
  const database = await open();
  const rows = queryAll(database, `SELECT * FROM comments WHERE id = ?`, [input.id]);
  const current = rows[0];
  if (!current) throw new Error('评论不存在');

  const next = applyVote(
    { likes: current.likes, dislikes: current.dislikes, myVote: current.myVote },
    input.vote,
  );
  const updatedAt = Date.now();
  database.run(
    `UPDATE comments
     SET likes = ?, dislikes = ?, my_vote = ?, updated_at = ?
     WHERE id = ?`,
    [next.likes, next.dislikes, next.myVote, updatedAt, input.id],
  );
  await persist();
  return {
    ...current,
    likes: next.likes,
    dislikes: next.dislikes,
    myVote: next.myVote,
    updatedAt,
  };
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

export async function clearAllComments(): Promise<number> {
  await ensureDb();
  const database = await open();
  const stmt = database.prepare(`SELECT COUNT(*) AS c FROM comments`);
  stmt.step();
  const before = Number(stmt.getAsObject().c ?? 0);
  stmt.free();
  database.run(`DELETE FROM comments`);
  await persist();
  return before;
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
