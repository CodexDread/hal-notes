import Database from 'better-sqlite3'
import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function initDb(): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  db = new Database(join(dir, 'hal.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate()
}

export interface MetaRow {
  key: string
  value: string
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare<[string], MetaRow>('SELECT value FROM meta WHERE key = ?').get(key)
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  getDb().prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function deleteMeta(key: string): void {
  getDb().prepare('DELETE FROM meta WHERE key = ?').run(key)
}

function migrate(): void {
  const current = db!.pragma('user_version', { simple: true }) as number
  if (current >= 1) return
  db!.transaction(() => {
    db!.exec(`
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        parent_id TEXT,
        content TEXT NOT NULL DEFAULT '',
        local_hash TEXT NOT NULL DEFAULT '',
        synced_hash TEXT NOT NULL DEFAULT '',
        remote_hash TEXT,
        remote_version TEXT,
        modified_local INTEGER NOT NULL DEFAULT 0,
        modified_remote INTEGER,
        trashed INTEGER NOT NULL DEFAULT 0,
        remote_trashed INTEGER NOT NULL DEFAULT 0,
        conflicted INTEGER NOT NULL DEFAULT 0,
        content_version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(path)
      );

      CREATE INDEX idx_notes_parent ON notes(parent_id);
      CREATE INDEX idx_notes_dirty ON notes(trashed, local_hash, synced_hash);

      CREATE TABLE folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        parent_id TEXT,
        trashed INTEGER NOT NULL DEFAULT 0,
        remote_trashed INTEGER NOT NULL DEFAULT 0,
        UNIQUE(path)
      );

      CREATE TABLE links (
        source_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE ON UPDATE CASCADE,
        target_name TEXT NOT NULL,
        UNIQUE(source_id, target_name)
      );
      CREATE INDEX idx_links_target ON links(target_name);

      CREATE TABLE tags (
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE ON UPDATE CASCADE,
        tag TEXT NOT NULL,
        UNIQUE(note_id, tag)
      );
      CREATE INDEX idx_tags_tag ON tags(tag);

      CREATE TABLE embeddings (
        note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE ON UPDATE CASCADE,
        vec BLOB NOT NULL,
        dim INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

      CREATE VIRTUAL TABLE notes_fts USING fts5(name, content, content='notes', content_rowid='rowid');

      CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, name, content) VALUES (new.rowid, new.name, new.content);
      END;
      CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, name, content) VALUES ('delete', old.rowid, old.name, old.content);
      END;
      CREATE TRIGGER notes_au AFTER UPDATE OF name, content ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, name, content) VALUES ('delete', old.rowid, old.name, old.content);
        INSERT INTO notes_fts(rowid, name, content) VALUES (new.rowid, new.name, new.content);
      END;
    `)
    db!.pragma('user_version = 1')
  })()
}
