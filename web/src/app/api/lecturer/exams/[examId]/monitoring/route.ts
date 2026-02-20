import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getExamMonitoring } from "@/lib/server/exam-monitoring-service";
import { prisma } from "@/lib/server/prisma";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ examId: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
    }

    const { examId } = await params;

    const exam = await prisma.exam.findUnique({
        where: { id: examId },
        select: { lecturerId: true },
    });

    if (!exam || exam.lecturerId !== session.user.id) {
        return NextResponse.json({ ok: false, error: { message: "Exam not found" } }, { status: 404 });
    }

    const result = await getExamMonitoring({ examId });
    return NextResponse.json(result.body, { status: result.status });
}
