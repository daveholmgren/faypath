type IntegrationPushInput = {
  recipient: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type IntegrationPushResult = {
  provider: string;
  accepted: boolean;
  providerMessageId: string | null;
  error: string | null;
};

function currentProvider() {
  const provider = (process.env.PUSH_PROVIDER ?? "log").trim().toLowerCase();
  return provider || "log";
}

function logMessageId() {
  return `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function sendIntegrationPush(
  input: IntegrationPushInput
): Promise<IntegrationPushResult> {
  const provider = currentProvider();

  if (provider === "webhook") {
    const endpoint = process.env.PUSH_WEBHOOK_URL?.trim() ?? "";
    const token = process.env.PUSH_WEBHOOK_AUTH_TOKEN?.trim() ?? "";

    if (!endpoint) {
      return {
        provider: "webhook",
        accepted: false,
        providerMessageId: null,
        error: "PUSH_WEBHOOK_URL is not set"
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          to: input.recipient,
          title: input.title,
          body: input.body,
          data: input.data ?? {},
          sentAt: new Date().toISOString(),
          source: "faypath"
        })
      });

      const raw = await response.text();
      if (!response.ok) {
        return {
          provider: "webhook",
          accepted: false,
          providerMessageId: null,
          error: `Push webhook ${response.status}: ${raw.slice(0, 260)}`
        };
      }

      let parsed: { id?: string; messageId?: string } = {};
      try {
        parsed = JSON.parse(raw) as { id?: string; messageId?: string };
      } catch {
        parsed = {};
      }

      return {
        provider: "webhook",
        accepted: true,
        providerMessageId: parsed.messageId ?? parsed.id ?? null,
        error: null
      };
    } catch (error) {
      return {
        provider: "webhook",
        accepted: false,
        providerMessageId: null,
        error: error instanceof Error ? error.message : "Unknown push delivery error"
      };
    }
  }

  const messageId = logMessageId();
  console.info(
    `[integration:push:${provider}] to=${input.recipient} title=${input.title} id=${messageId}`
  );

  return {
    provider,
    accepted: true,
    providerMessageId: messageId,
    error: null
  };
}
