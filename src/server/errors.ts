import type { ApiError } from "@/contracts";

export class AppError extends Error {
  constructor(
    public readonly code: ApiError["code"],
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}
