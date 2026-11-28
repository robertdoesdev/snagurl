interface FailedRequest {
  path: string;
  method: string;
}

interface FailureContext {
  routePath: string;
  routeType: string;
}

export function onRequestError(
  error: unknown,
  request: FailedRequest,
  context: FailureContext,
): void {
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      method: request.method,
      path: request.path,
      route: context.routePath,
      type: context.routeType,
      message: error instanceof Error ? error.message : String(error),
      digest: (error as { digest?: string } | null)?.digest,
    }),
  );
}
