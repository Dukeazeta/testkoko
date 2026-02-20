import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { importQuestionsFromFile } from "@/lib/server/question-import-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: { message: "Upload a file in the 'file' field." } }, { status: 400 });
    }

    const parsed = await importQuestionsFromFile(file);

    if (parsed.questions.length === 0) {
      const firstIssue = parsed.issues[0]?.message ?? "No valid questions found in file.";
      return NextResponse.json(
        {
          ok: false,
          error: { message: firstIssue },
          data: {
            importedCount: 0,
            issueCount: parsed.issues.length,
            issues: parsed.issues,
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        fileName: file.name,
        importedCount: parsed.questions.length,
        issueCount: parsed.issues.length,
        issues: parsed.issues,
        questions: parsed.questions,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Question import failed.";
    return NextResponse.json({ ok: false, error: { message } }, { status: 400 });
  }
}
