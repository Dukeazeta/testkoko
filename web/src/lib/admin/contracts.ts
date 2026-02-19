import type { AdminRole } from "@prisma/client";

export interface AdminAuthRequestBody {
  email?: string;
  password?: string;
}

export interface AdminAuthSuccessResponse {
  ok: true;
  data: {
    id: string;
    email: string;
    displayName: string;
    role: AdminRole;
    expiresAt: string;
  };
}

export interface AdminLogoutSuccessResponse {
  ok: true;
  data: {
    loggedOut: true;
  };
}

export interface AdminAuthErrorResponse {
  ok: false;
  error: {
    code: "INVALID_REQUEST" | "INVALID_CREDENTIALS" | "UNAUTHORIZED" | "FORBIDDEN" | "SERVICE_UNAVAILABLE";
    message: string;
  };
}
