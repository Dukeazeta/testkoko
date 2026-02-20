import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { listLecturerExams, createExam } from "@/lib/server/admin-exam-service";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
    }

    const result = await listLecturerExams(session.user.id);
    return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
    }

    const body = await request.json();
    const result = await createExam(body, session.user.id);
    return NextResponse.json(result.body, { status: result.status });
}
