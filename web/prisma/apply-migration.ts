import "dotenv/config";

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const nextChar = sql[index + 1] ?? "";

    if (inLineComment) {
      current += char;
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && nextChar === "/") {
        current += nextChar;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "-" && nextChar === "-") {
      current += char + nextChar;
      index += 1;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "/" && nextChar === "*") {
      current += char + nextChar;
      index += 1;
      inBlockComment = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      current += char;

      if (inSingleQuote && nextChar === "'") {
        current += nextChar;
        index += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }

      continue;
    }

    if (!inSingleQuote && char === '"') {
      current += char;

      if (inDoubleQuote && nextChar === '"') {
        current += nextChar;
        index += 1;
      } else {
        inDoubleQuote = !inDoubleQuote;
      }

      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === ";") {
      const statement = current.trim();

      if (statement.length > 0) {
        statements.push(statement);
      }

      current = "";
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}

function stripLeadingComments(statement: string): string {
  let output = statement.trimStart();

  while (output.startsWith("--") || output.startsWith("/*")) {
    if (output.startsWith("--")) {
      const newLineIndex = output.indexOf("\n");
      if (newLineIndex === -1) {
        return "";
      }

      output = output.slice(newLineIndex + 1).trimStart();
      continue;
    }

    if (output.startsWith("/*")) {
      const endCommentIndex = output.indexOf("*/");
      if (endCommentIndex === -1) {
        return "";
      }

      output = output.slice(endCommentIndex + 2).trimStart();
    }
  }

  return output;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return String(error);
}

function isIgnorableCreateError(statement: string, message: string): boolean {
  const normalizedStatement = stripLeadingComments(statement).toUpperCase();
  const isCreateStatement =
    normalizedStatement.startsWith("CREATE TABLE") ||
    normalizedStatement.startsWith("CREATE INDEX") ||
    normalizedStatement.startsWith("CREATE UNIQUE INDEX");

  if (!isCreateStatement) {
    return false;
  }

  return message.toLowerCase().includes("already exists");
}

export async function applyTursoMigration(filePath = "prisma/migration.sql") {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }

  const sql = readFileSync(resolve(filePath), "utf8");
  const statements = splitSqlStatements(sql);

  if (statements.length === 0) {
    console.log(`No SQL statements found in ${filePath}.`);
    return;
  }

  const client = createClient({ url, authToken });
  let appliedCount = 0;
  let skippedCount = 0;

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];

    try {
      await client.execute(statement);
      appliedCount += 1;
    } catch (error: unknown) {
      const message = getErrorMessage(error);

      if (isIgnorableCreateError(statement, message)) {
        skippedCount += 1;
        continue;
      }

      const preview = stripLeadingComments(statement).slice(0, 120).replace(/\s+/g, " ");
      throw new Error(`Migration failed on statement ${index + 1}: ${preview}\n${message}`);
    }
  }

  console.log(`Migration completed. Applied: ${appliedCount}, skipped: ${skippedCount}, total: ${statements.length}.`);
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  const filePath = process.argv[2] ?? "prisma/migration.sql";

  applyTursoMigration(filePath).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
