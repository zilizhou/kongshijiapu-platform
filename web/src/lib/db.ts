import mysql, { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

let pool: Pool | null = null;

function parseDatabaseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const cfg = parseDatabaseUrl(url);
    pool = mysql.createPool({
      ...cfg,
      waitForConnections: true,
      connectionLimit: 20,
      namedPlaceholders: true,
      charset: "utf8mb4",
      timezone: "+08:00",
    });
  }
  return pool;
}

// mysql2 namedPlaceholders accepts object params; keep loose for query builders
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlParams = any;

export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: SqlParams,
) {
  const [rows] = await getPool().query<T>(sql, params);
  return rows;
}

export async function execute(sql: string, params?: SqlParams) {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>,
) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const value = await fn(conn);
    await conn.commit();
    return value;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
