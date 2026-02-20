import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { exportExamResults } from "@/lib/server/admin-exam-service";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ examId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
    }

    const { examId } = await params;
    const csv = await exportExamResults(examId, session.user.id);

    if (!csv) {
        return NextResponse.json({ ok: false, error: { message: "Exam not found" } }, { status: 404 });
    }

    return new Response(csv, {
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="results-${examId}.csv"`,
        },
    });
}
