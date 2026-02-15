type IntegrationEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type IntegrationEmailResult = {
  provider: string;
  accepted: boolean;
  providerMessageId: string | null;
  error: string | null;
};

function currentProvider() {
  const provider = (process.env.EMAIL_PROVIDER ?? "log").trim().toLowerCase();
  return provider || "log";
}

export async function sendIntegrationEmail(
  input: IntegrationEmailInput
): Promise<IntegrationEmailResult> {
  const provider = currentProvider();

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || "alerts@faypath.dev";

    if (!apiKey) {
      return {
        provider: "resend",
        accepted: false,
        providerMessageId: null,
        error: "RESEND_API_KEY is not set"
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: input.to,
          subject: input.subject,
          text: input.text
        })
      });

      const raw = await response.text();
      if (!response.ok) {
        return {
          provider: "resend",
          accepted: false,
          providerMessageId: null,
          error: `Resend API ${response.status}: ${raw.slice(0, 300)}`
        };
      }

      let parsed: { id?: string } = {};
      try {
        parsed = JSON.parse(raw) as { id?: string };
      } catch {
        parsed = {};
      }

      return {
        provider: "resend",
        accepted: true,
        providerMessageId: parsed.id ?? null,
        error: null
      };
    } catch (error) {
      return {
        provider: "resend",
        accepted: false,
        providerMessageId: null,
        error: error instanceof Error ? error.message : "Unknown resend error"
      };
    }
  }

  const messageId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.info(
    `[integration:email:${provider}] to=${input.to} subject=${input.subject} id=${messageId}`
  );

  return {
    provider,
    accepted: true,
    providerMessageId: messageId,
    error: null
  };
}
