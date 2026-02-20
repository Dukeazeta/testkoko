import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { uploadExamRosterCsv } from "@/lib/server/admin-exam-service";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ examId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
    }

    const { examId } = await params;
    const body = await request.json();
    const result = await uploadExamRosterCsv(examId, body, session.user.id);
    return NextResponse.json(result.body, { status: result.status });
}
