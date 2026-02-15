type EnvIssueSeverity = "warn" | "error";

type EnvIssue = {
  key: string;
  severity: EnvIssueSeverity;
  message: string;
};

export type StartupEnvValidationSnapshot = {
  checkedAt: string;
  strictMode: boolean;
  issues: EnvIssue[];
  warningCount: number;
  errorCount: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __faypathStartupEnvValidation: StartupEnvValidationSnapshot | undefined;
}

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isLikelyUrl(value: string) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:";
  } catch {
    return false;
  }
}

function validateEnv(): StartupEnvValidationSnapshot {
  const issues: EnvIssue[] = [];
  const strictMode = envValue("ENV_VALIDATION_STRICT").toLowerCase() === "true";

  const databaseUrl = envValue("DATABASE_URL");
  if (!databaseUrl) {
    issues.push({
      key: "DATABASE_URL",
      severity: "error",
      message: "DATABASE_URL is missing."
    });
  } else if (!databaseUrl.startsWith("file:") && !isLikelyUrl(databaseUrl)) {
    issues.push({
      key: "DATABASE_URL",
      severity: "warn",
      message: "DATABASE_URL does not look like a valid file/db URL."
    });
  }

  const authSecret = envValue("AUTH_SECRET");
  if (!authSecret || authSecret === "replace-with-a-long-random-secret") {
    issues.push({
      key: "AUTH_SECRET",
      severity: "error",
      message: "AUTH_SECRET is missing or still set to the example placeholder."
    });
  }

  const authUrl = envValue("AUTH_URL");
  if (!authUrl) {
    issues.push({
      key: "AUTH_URL",
      severity: "warn",
      message: "AUTH_URL is not set (required for some auth callback/deployment setups)."
    });
  } else if (!isLikelyUrl(authUrl)) {
    issues.push({
      key: "AUTH_URL",
      severity: "warn",
      message: "AUTH_URL is set but does not look like a valid URL."
    });
  }

  const emailProvider = (envValue("EMAIL_PROVIDER") || "log").toLowerCase();
  if (emailProvider !== "log" && emailProvider !== "resend") {
    issues.push({
      key: "EMAIL_PROVIDER",
      severity: "warn",
      message: `EMAIL_PROVIDER="${emailProvider}" is unknown. Expected "log" or "resend".`
    });
  }

  if (emailProvider === "resend") {
    if (!envValue("RESEND_API_KEY")) {
      issues.push({
        key: "RESEND_API_KEY",
        severity: "error",
        message: "EMAIL_PROVIDER is resend but RESEND_API_KEY is missing."
      });
    }

    if (!envValue("EMAIL_FROM")) {
      issues.push({
        key: "EMAIL_FROM",
        severity: "warn",
        message: "EMAIL_FROM is empty; resend will fallback to alerts@faypath.dev."
      });
    }
  }

  const pushProvider = (envValue("PUSH_PROVIDER") || "log").toLowerCase();
  if (pushProvider !== "log" && pushProvider !== "webhook") {
    issues.push({
      key: "PUSH_PROVIDER",
      severity: "warn",
      message: `PUSH_PROVIDER="${pushProvider}" is unknown. Expected "log" or "webhook".`
    });
  }

  if (pushProvider === "webhook") {
    const pushWebhookUrl = envValue("PUSH_WEBHOOK_URL");
    if (!pushWebhookUrl) {
      issues.push({
        key: "PUSH_WEBHOOK_URL",
        severity: "error",
        message: "PUSH_PROVIDER is webhook but PUSH_WEBHOOK_URL is missing."
      });
    } else if (!isLikelyUrl(pushWebhookUrl)) {
      issues.push({
        key: "PUSH_WEBHOOK_URL",
        severity: "warn",
        message: "PUSH_WEBHOOK_URL is set but does not look like a valid URL."
      });
    }
  }

  const webhookOutbound = envValue("WEBHOOK_OUTBOUND_URL");
  if (webhookOutbound && !isLikelyUrl(webhookOutbound)) {
    issues.push({
      key: "WEBHOOK_OUTBOUND_URL",
      severity: "warn",
      message: "WEBHOOK_OUTBOUND_URL is set but does not look like a valid URL."
    });
  }

  const hasWebhookSecret = !!envValue("WEBHOOK_SHARED_SECRET") || !!envValue("WEBHOOK_INBOUND_SECRET");
  if (!hasWebhookSecret) {
    issues.push({
      key: "WEBHOOK_SHARED_SECRET",
      severity: "warn",
      message: "No webhook signing secret configured; signatures cannot be strongly verified."
    });
  }

  if (!envValue("EXTERNAL_INGEST_TOKEN")) {
    issues.push({
      key: "EXTERNAL_INGEST_TOKEN",
      severity: "warn",
      message: "External feed endpoint token is not configured."
    });
  }

  const warningCount = issues.filter((issue) => issue.severity === "warn").length;
  const errorCount = issues.filter((issue) => issue.severity === "error").length;

  return {
    checkedAt: new Date().toISOString(),
    strictMode,
    issues,
    warningCount,
    errorCount
  };
}

export function runStartupEnvValidation() {
  if (globalThis.__faypathStartupEnvValidation) {
    return globalThis.__faypathStartupEnvValidation;
  }

  const snapshot = validateEnv();
  globalThis.__faypathStartupEnvValidation = snapshot;

  if (snapshot.issues.length) {
    for (const issue of snapshot.issues) {
      const message = `[startup:env] ${issue.key}: ${issue.message}`;
      if (issue.severity === "error") {
        console.error(message);
      } else {
        console.warn(message);
      }
    }
  } else {
    console.info("[startup:env] environment validation passed with no issues.");
  }

  if (snapshot.strictMode && snapshot.errorCount > 0) {
    throw new Error(
      `Startup env validation failed with ${snapshot.errorCount} error(s). Set ENV_VALIDATION_STRICT=false to disable fail-fast mode.`
    );
  }

  return snapshot;
}
