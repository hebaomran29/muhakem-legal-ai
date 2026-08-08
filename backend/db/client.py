"""
اتصال الـ Postgres (Supabase). الباك إند بيستخدم الـ service role connection
string (متغير SUPABASE_DB_URL) — يعني بيتخطى الـ Row Level Security، والباك
إند نفسه مسؤول إنه يتحقق من إن المستخدم عضو في المكتب بتاع الجلسة قبل أي
عملية (شوفي auth.py).
"""
import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool

_DB_URL = os.environ.get("SUPABASE_DB_URL", "")
_pool: pg_pool.SimpleConnectionPool | None = None


def _ensure_pool():
    global _pool
    if _pool is None:
        if not _DB_URL:
            raise RuntimeError(
                "SUPABASE_DB_URL مش موجود في متغيرات البيئة — "
                "هتلاقيه في Supabase Dashboard → Project Settings → Database → Connection string (URI)"
            )
        _pool = pg_pool.SimpleConnectionPool(1, 10, dsn=_DB_URL)


@contextmanager
def get_conn():
    _ensure_pool()
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


@contextmanager
def get_cursor():
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            yield cur
        finally:
            cur.close()
