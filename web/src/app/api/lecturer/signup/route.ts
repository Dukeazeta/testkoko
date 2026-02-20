import { NextResponse } from "next/server";
import { hash } from "bcryptjs";

import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, password } = body;

        if (!name?.trim() || !email?.trim() || !password) {
            return NextResponse.json(
                { ok: false, error: { message: "Name, email, and password are required." } },
                { status: 400 },
            );
        }

        const existing = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
        });

        if (existing) {
            return NextResponse.json(
                { ok: false, error: { message: "An account with this email already exists." } },
                { status: 409 },
            );
        }

        const hashedPassword = await hash(password, 12);

        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password: hashedPassword,
            },
        });

        return NextResponse.json({
            ok: true,
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        });
    } catch {
        return NextResponse.json(
            { ok: false, error: { message: "Internal server error." } },
            { status: 500 },
        );
    }
}
