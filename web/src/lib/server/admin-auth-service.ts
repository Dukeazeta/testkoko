import type { AdminRole, Prisma } from "@prisma/client";
import { AdminRole as AdminRoleEnum } from "@prisma/client";
import type { NextRequest } from "next/server";

import type {
  AdminAuthErrorResponse,
  AdminAuthRequestBody,
  AdminAuthSuccessResponse,
} from "@/lib/admin/contracts";
import { prisma } from "@/lib/server/prisma";
import { hashPassword, hashToken, randomToken, verifyPassword } from "@/lib/server/security";

export const ADMIN_SESSION_COOKIE = "tk_admin_session";

export interface AdminActor {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  sessionId: string;
  expiresAt: Date;
}

type AdminAuthResult =
  | {
      status: number;
      body: AdminAuthSuccessResponse;
      sessionToken: string;
    }
  | {
      status: number;
      body: AdminAuthErrorResponse;
      sessionToken?: undefined;
    };

type AdminRequirementResult =
  | {
      ok: true;
      actor: AdminActor;
    }
  | {
      ok: false;
      status: number;
      body: AdminAuthErrorResponse;
    };

function authError(
  status: number,
  code: AdminAuthErrorResponse["error"]["code"],
  message: string,
): { status: number; body: AdminAuthErrorResponse } {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
      },
    },
  };
}

function sessionTtlMs(): number {
  const envValue = Number(process.env.ADMIN_SESSION_TTL_MINUTES ?? 480);
  const minutes = Number.isFinite(envValue) ? Math.max(15, Math.min(envValue, 1440)) : 480;
  return minutes * 60 * 1000;
}

async function ensureBootstrapAdmins(): Promise<void> {
  const existingCount = await prisma.adminUser.count();
  if (existingCount > 0) {
    return;
  }

  const email = (process.env.ADMIN_EMAIL ?? "admin@testkoko.local").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "admin12345";
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? "System Admin";

  const users: Prisma.AdminUserCreateManyInput[] = [
    {
      email,
      displayName,
      role: AdminRoleEnum.SUPER_ADMIN,
      passwordHash: hashPassword(password),
    },
  ];

  const proctorEmail = process.env.PROCTOR_EMAIL?.trim().toLowerCase();
  const proctorPassword = process.env.PROCTOR_PASSWORD?.trim();
  if (proctorEmail && proctorPassword) {
    users.push({
      email: proctorEmail,
      displayName: process.env.PROCTOR_DISPLAY_NAME ?? "Exam Proctor",
      role: AdminRoleEnum.PROCTOR,
      passwordHash: hashPassword(proctorPassword),
    });
  }

  await prisma.adminUser.createMany({
    data: users,
    skipDuplicates: true,
  });
}

export function adminCookieMaxAgeSeconds(): number {
  return Math.floor(sessionTtlMs() / 1000);
}

export async function loginAdmin(
  payload: AdminAuthRequestBody,
  context: { clientIp: string; userAgent: string },
): Promise<AdminAuthResult> {
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password ?? "";

  if (!email || !password) {
    return authError(400, "INVALID_REQUEST", "email and password are required.");
  }

  await ensureBootstrapAdmins();

  const admin = await prisma.adminUser.findUnique({
    where: {
      email,
    },
  });

  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return authError(401, "INVALID_CREDENTIALS", "Invalid admin credentials.");
  }

  const rawToken = randomToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  const session = await prisma.adminSession.create({
    data: {
      adminUserId: admin.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
    },
  });

  return {
    status: 200,
    sessionToken: rawToken,
    body: {
      ok: true,
      data: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        role: admin.role,
        expiresAt: session.expiresAt.toISOString(),
      },
    },
  };
}

async function resolveActorFromToken(token: string): Promise<AdminActor | null> {
  const session = await prisma.adminSession.findUnique({
    where: {
      tokenHash: hashToken(token),
    },
    include: {
      adminUser: true,
    },
  });

  if (!session || !session.adminUser) {
    return null;
  }

  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    if (!session.revokedAt) {
      await prisma.adminSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }

    return null;
  }

  return {
    id: session.adminUser.id,
    email: session.adminUser.email,
    displayName: session.adminUser.displayName,
    role: session.adminUser.role,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

export async function getAdminActor(request: NextRequest): Promise<AdminActor | null> {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return resolveActorFromToken(token);
}

export async function requireAdminActor(request: NextRequest, allowedRoles?: AdminRole[]): Promise<AdminRequirementResult> {
  const actor = await getAdminActor(request);
  if (!actor) {
    return {
      ok: false,
      ...authError(401, "UNAUTHORIZED", "Admin authentication required."),
    };
  }

  if (allowedRoles && !allowedRoles.includes(actor.role)) {
    return {
      ok: false,
      ...authError(403, "FORBIDDEN", "Insufficient role for this operation."),
    };
  }

  return {
    ok: true,
    actor,
  };
}

export async function logoutAdminByRequest(request: NextRequest): Promise<void> {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return;
  }

  await prisma.adminSession.updateMany({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
