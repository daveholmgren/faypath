import { prisma } from "@/lib/prisma";
import { sendIntegrationEmail } from "@/lib/integrations/email";
import { sendIntegrationPush } from "@/lib/integrations/push";
import { emitOutboundIntegrationEvent } from "@/lib/integrations/events";
import type { AlertDeliveryPreview, AlertDeliveryRunSummary, DigestCadence } from "@/lib/types";

type DeliveryScope = "self" | "all";
type AlertKind = "instant" | "digest";

function normalizeCadence(value: string): DigestCadence {
  if (value === "instant" || value === "weekly") return value;
  return "daily";
}

function cadenceIntervalHours(cadence: Exclude<DigestCadence, "instant">) {
  return cadence === "weekly" ? 7 * 24 : 24;
}

function isDigestDue(
  cadence: Exclude<DigestCadence, "instant">,
  digestHour: number,
  lastDigestAt: Date | null,
  now: Date
) {
  if (now.getHours() < digestHour) return false;
  if (!lastDigestAt) return true;
  const elapsedHours = (now.getTime() - lastDigestAt.getTime()) / (1000 * 60 * 60);
  return elapsedHours >= cadenceIntervalHours(cadence);
}

function subjectForInstant(title: string, company: string) {
  return `New Faypath match: ${title} at ${company}`;
}

function payloadForInstant(input: {
  jobTitle: string;
  company: string;
  location: string;
  salary: string;
  meritFit: number;
  reason: string;
}) {
  return [
    `Role: ${input.jobTitle}`,
    `Company: ${input.company}`,
    `Location: ${input.location}`,
    `Salary: ${input.salary}`,
    `Merit fit: ${input.meritFit}`,
    `Reason: ${input.reason}`
  ].join("\n");
}

function subjectForDigest(label: string, cadence: Exclude<DigestCadence, "instant">, count: number) {
  const prefix = cadence === "weekly" ? "Weekly" : "Daily";
  return `${prefix} Faypath digest: ${label} (${count} new matches)`;
}

function payloadForDigest(
  label: string,
  cadence: Exclude<DigestCadence, "instant">,
  alerts: {
    id: number;
    reason: string;
    job: {
      title: string;
      company: string;
      location: string;
      salary: string;
      meritFit: number;
    };
  }[]
) {
  const cadenceLabel = cadence === "weekly" ? "weekly" : "daily";
  const lines = [`${cadenceLabel.toUpperCase()} DIGEST`, `Saved search: ${label}`, ""];

  for (const alert of alerts) {
    lines.push(
      `${alert.job.title} | ${alert.job.company} | ${alert.job.location} | ${alert.job.salary} | fit ${alert.job.meritFit}`,
      `Reason: ${alert.reason}`,
      ""
    );
  }

  return lines.join("\n");
}

type JobAlertWithJob = {
  id: number;
  reason: string;
  emailSentAt: Date | null;
  inAppSentAt: Date | null;
  pushSentAt: Date | null;
  job: {
    title: string;
    company: string;
    location: string;
    salary: string;
    meritFit: number;
  };
};

type SavedSearchWithPendingAlerts = {
  id: number;
  userId: string;
  label: string;
  digestCadence: string;
  digestHour: number;
  lastDigestAt: Date | null;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  pushDeferred: boolean;
  user: {
    email: string;
  };
  alerts: JobAlertWithJob[];
};

async function fetchPendingSearches(userId?: string): Promise<SavedSearchWithPendingAlerts[]> {
  return prisma.savedSearch.findMany({
    where: {
      ...(userId ? { userId } : {}),
      OR: [{ emailEnabled: true }, { inAppEnabled: true }, { pushEnabled: true }]
    },
    include: {
      user: {
        select: {
          email: true
        }
      },
      alerts: {
        where: {
          OR: [{ emailSentAt: null }, { inAppSentAt: null }, { pushSentAt: null }]
        },
        include: {
          job: {
            select: {
              title: true,
              company: true,
              location: true,
              salary: true,
              meritFit: true
            }
          }
        }
      }
    }
  });
}

async function emitDeliveryWebhookEvent(input: {
  eventType: string;
  payload: Record<string, unknown>;
}) {
  try {
    await emitOutboundIntegrationEvent({
      eventType: input.eventType,
      payload: input.payload,
      source: "faypath.alerts"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[alerts] webhook emit failed: ${message}`);
  }
}

function channelPendingCounts(search: SavedSearchWithPendingAlerts) {
  const emailAlerts =
    search.emailEnabled
      ? search.alerts.filter((alert) => alert.emailSentAt === null)
      : [];
  const inAppAlerts =
    search.inAppEnabled
      ? search.alerts.filter((alert) => alert.inAppSentAt === null)
      : [];
  const pushAlerts =
    search.pushEnabled
      ? search.alerts.filter((alert) => alert.pushSentAt === null)
      : [];

  const uniquePending = new Set([
    ...emailAlerts.map((alert) => alert.id),
    ...inAppAlerts.map((alert) => alert.id),
    ...pushAlerts.map((alert) => alert.id)
  ]);

  return {
    emailAlerts,
    inAppAlerts,
    pushAlerts,
    pendingUniqueCount: uniquePending.size
  };
}

async function createInternalDeliveryLogs(input: {
  search: SavedSearchWithPendingAlerts;
  alerts: JobAlertWithJob[];
  now: Date;
  channel: "in_app";
  kind: AlertKind;
  subject: string;
  payload: string;
}) {
  const data = input.alerts.map((alert) => ({
    userId: input.search.userId,
    alertId: alert.id,
    savedSearchId: input.search.id,
    channel: input.channel,
    kind: input.kind,
    provider: "in_app",
    accepted: true,
    recipient: `user:${input.search.userId}`,
    subject: input.subject,
    payload: input.payload,
    deliveredAt: input.now
  }));

  if (!data.length) return 0;
  await prisma.alertDeliveryLog.createMany({ data });
  return data.length;
}

function pushBodyForAlert(input: {
  alert: JobAlertWithJob;
  searchLabel: string;
}) {
  return [
    input.alert.job.title,
    input.alert.job.company,
    input.alert.job.location,
    input.alert.job.salary,
    `Fit ${input.alert.job.meritFit}`,
    `Search: ${input.searchLabel}`
  ].join(" | ");
}

function pushDigestBody(input: {
  searchLabel: string;
  alerts: JobAlertWithJob[];
  cadence: "instant" | "daily" | "weekly";
}) {
  const prefix =
    input.cadence === "weekly"
      ? "Weekly digest"
      : input.cadence === "daily"
        ? "Daily digest"
        : "Queued digest";
  const top = input.alerts.slice(0, 3).map((alert) => `${alert.job.title} (${alert.job.company})`);
  return `${prefix} for ${input.searchLabel}: ${input.alerts.length} new matches${
    top.length ? ` | ${top.join(", ")}` : ""
  }`;
}

async function deliverPushDigest(input: {
  search: SavedSearchWithPendingAlerts;
  alerts: JobAlertWithJob[];
  now: Date;
  cadence: "instant" | "daily" | "weekly";
}): Promise<{
  accepted: boolean;
  deliveredAlerts: number;
  failedAttempts: number;
  logsCreated: number;
}> {
  if (!input.alerts.length) {
    return {
      accepted: true,
      deliveredAlerts: 0,
      failedAttempts: 0,
      logsCreated: 0
    };
  }

  const subject = `Faypath ${input.cadence === "weekly" ? "weekly" : "daily"} push digest`;
  const payload = pushDigestBody({
    searchLabel: input.search.label,
    alerts: input.alerts,
    cadence: input.cadence
  });
  const result = await sendIntegrationPush({
    recipient: input.search.user.email,
    title: subject,
    body: payload,
    data: {
      savedSearchId: input.search.id,
      alertIds: input.alerts.map((alert) => alert.id),
      digestCadence: input.cadence
    }
  });

  await prisma.alertDeliveryLog.create({
    data: {
      userId: input.search.userId,
      savedSearchId: input.search.id,
      channel: "push",
      kind: "digest",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      accepted: result.accepted,
      recipient: input.search.user.email,
      subject,
      payload,
      deliveredAt: input.now
    }
  });

  if (result.accepted) {
    await prisma.jobAlert.updateMany({
      where: { id: { in: input.alerts.map((alert) => alert.id) } },
      data: { pushSentAt: input.now }
    });
  }

  await emitDeliveryWebhookEvent({
    eventType: "alerts.delivery.push",
    payload: {
      savedSearchId: input.search.id,
      alertIds: input.alerts.map((alert) => alert.id),
      recipient: input.search.user.email,
      provider: result.provider,
      accepted: result.accepted,
      providerMessageId: result.providerMessageId,
      error: result.error,
      kind: "digest"
    }
  });

  return {
    accepted: result.accepted,
    deliveredAlerts: result.accepted ? input.alerts.length : 0,
    failedAttempts: result.accepted ? 0 : 1,
    logsCreated: 1
  };
}

async function deliverPushInstantPerAlert(input: {
  search: SavedSearchWithPendingAlerts;
  alerts: JobAlertWithJob[];
  now: Date;
}): Promise<{
  deliveredAlerts: number;
  failedAttempts: number;
  logsCreated: number;
}> {
  let deliveredAlerts = 0;
  let failedAttempts = 0;
  let logsCreated = 0;

  for (const alert of input.alerts) {
    const subject = `Faypath match: ${alert.job.title}`;
    const payload = pushBodyForAlert({
      alert,
      searchLabel: input.search.label
    });
    const result = await sendIntegrationPush({
      recipient: input.search.user.email,
      title: subject,
      body: payload,
      data: {
        savedSearchId: input.search.id,
        alertId: alert.id,
        jobTitle: alert.job.title
      }
    });

    const log = await prisma.alertDeliveryLog.create({
      data: {
        userId: input.search.userId,
        alertId: alert.id,
        savedSearchId: input.search.id,
        channel: "push",
        kind: "instant",
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        accepted: result.accepted,
        recipient: input.search.user.email,
        subject,
        payload,
        deliveredAt: input.now
      }
    });
    logsCreated += 1;

    if (result.accepted) {
      deliveredAlerts += 1;
      await prisma.jobAlert.update({
        where: { id: alert.id },
        data: { pushSentAt: input.now }
      });
    } else {
      failedAttempts += 1;
    }

    await emitDeliveryWebhookEvent({
      eventType: "alerts.delivery.push",
      payload: {
        deliveryLogId: log.id,
        savedSearchId: input.search.id,
        alertId: alert.id,
        recipient: input.search.user.email,
        provider: result.provider,
        accepted: result.accepted,
        providerMessageId: result.providerMessageId,
        error: result.error,
        kind: "instant"
      }
    });
  }

  return {
    deliveredAlerts,
    failedAttempts,
    logsCreated
  };
}

export async function getAlertDeliveryPreview(input: {
  scope: DeliveryScope;
  userId?: string;
  now?: Date;
}): Promise<AlertDeliveryPreview> {
  const now = input.now ?? new Date();
  const searches = await fetchPendingSearches(input.userId);

  let pendingAlerts = 0;
  let pendingEmailAlerts = 0;
  let pendingInAppAlerts = 0;
  let pendingPushAlerts = 0;
  let pendingInstantAlerts = 0;
  let dueDigestSearches = 0;
  let waitingDigestSearches = 0;

  for (const search of searches) {
    const channelCounts = channelPendingCounts(search);
    if (!channelCounts.pendingUniqueCount) continue;

    pendingAlerts += channelCounts.pendingUniqueCount;
    pendingEmailAlerts += channelCounts.emailAlerts.length;
    pendingInAppAlerts += channelCounts.inAppAlerts.length;
    pendingPushAlerts += channelCounts.pushAlerts.length;

    const cadence = normalizeCadence(search.digestCadence);

    if (cadence === "instant") {
      pendingInstantAlerts += channelCounts.pendingUniqueCount;
      continue;
    }

    if (isDigestDue(cadence, search.digestHour, search.lastDigestAt, now)) {
      dueDigestSearches += 1;
    } else {
      waitingDigestSearches += 1;
    }
  }

  return {
    scope: input.scope,
    pendingAlerts,
    pendingEmailAlerts,
    pendingInAppAlerts,
    pendingPushAlerts,
    pendingInstantAlerts,
    dueDigestSearches,
    waitingDigestSearches
  };
}

export async function runAlertDeliveryJob(input: {
  scope: DeliveryScope;
  userId?: string;
  now?: Date;
}): Promise<AlertDeliveryRunSummary> {
  const now = input.now ?? new Date();
  const searches = await fetchPendingSearches(input.userId);

  let searchesScanned = 0;
  let attemptedDeliveries = 0;
  let alertsDelivered = 0;
  let instantAlertsDelivered = 0;
  let digestAlertsDelivered = 0;
  let failedDeliveries = 0;
  let digestRuns = 0;
  let logsCreated = 0;
  let waitingDigestSearches = 0;
  let emailChannelDelivered = 0;
  let inAppChannelDelivered = 0;
  let pushChannelDelivered = 0;

  for (const search of searches) {
    searchesScanned += 1;
    const channelCounts = channelPendingCounts(search);
    if (!channelCounts.pendingUniqueCount) continue;

    const cadence = normalizeCadence(search.digestCadence);
    const isInstant = cadence === "instant";
    const isDueDigest = !isInstant && isDigestDue(cadence, search.digestHour, search.lastDigestAt, now);

    if (!isInstant && !isDueDigest) {
      waitingDigestSearches += 1;
      continue;
    }

    if (isInstant) {
      for (const alert of channelCounts.emailAlerts) {
        const subject = subjectForInstant(alert.job.title, alert.job.company);
        const payload = payloadForInstant({
          jobTitle: alert.job.title,
          company: alert.job.company,
          location: alert.job.location,
          salary: alert.job.salary,
          meritFit: alert.job.meritFit,
          reason: alert.reason
        });

        attemptedDeliveries += 1;
        const emailResult = await sendIntegrationEmail({
          to: search.user.email,
          subject,
          text: payload
        });

        const log = await prisma.alertDeliveryLog.create({
          data: {
            userId: search.userId,
            alertId: alert.id,
            savedSearchId: search.id,
            channel: "email",
            kind: "instant",
            provider: emailResult.provider,
            providerMessageId: emailResult.providerMessageId,
            accepted: emailResult.accepted,
            recipient: search.user.email,
            subject,
            payload,
            deliveredAt: now
          }
        });
        logsCreated += 1;

        if (emailResult.accepted) {
          await prisma.jobAlert.update({
            where: { id: alert.id },
            data: { emailSentAt: now }
          });
          alertsDelivered += 1;
          instantAlertsDelivered += 1;
          emailChannelDelivered += 1;
        } else {
          failedDeliveries += 1;
        }

        await emitDeliveryWebhookEvent({
          eventType: "alerts.delivery.instant",
          payload: {
            deliveryLogId: log.id,
            savedSearchId: search.id,
            alertId: alert.id,
            recipient: search.user.email,
            provider: emailResult.provider,
            accepted: emailResult.accepted,
            providerMessageId: emailResult.providerMessageId,
            error: emailResult.error
          }
        });
      }

      if (channelCounts.inAppAlerts.length) {
        attemptedDeliveries += channelCounts.inAppAlerts.length;
        const created = await createInternalDeliveryLogs({
          search,
          alerts: channelCounts.inAppAlerts,
          now,
          channel: "in_app",
          kind: "instant",
          subject: `In-app match alerts: ${search.label}`,
          payload: `Delivered ${channelCounts.inAppAlerts.length} instant in-app alerts.`
        });
        logsCreated += created;
        inAppChannelDelivered += channelCounts.inAppAlerts.length;
        alertsDelivered += channelCounts.inAppAlerts.length;
        instantAlertsDelivered += channelCounts.inAppAlerts.length;
        await prisma.jobAlert.updateMany({
          where: { id: { in: channelCounts.inAppAlerts.map((alert) => alert.id) } },
          data: { inAppSentAt: now }
        });
      }

      if (channelCounts.pushAlerts.length) {
        if (search.pushDeferred) {
          attemptedDeliveries += 1;
          const result = await deliverPushDigest({
            search,
            alerts: channelCounts.pushAlerts,
            now,
            cadence: "instant"
          });
          logsCreated += result.logsCreated;
          failedDeliveries += result.failedAttempts;
          pushChannelDelivered += result.deliveredAlerts;
          alertsDelivered += result.deliveredAlerts;
          digestAlertsDelivered += result.deliveredAlerts;
        } else {
          attemptedDeliveries += channelCounts.pushAlerts.length;
          const result = await deliverPushInstantPerAlert({
            search,
            alerts: channelCounts.pushAlerts,
            now
          });
          logsCreated += result.logsCreated;
          failedDeliveries += result.failedAttempts;
          pushChannelDelivered += result.deliveredAlerts;
          alertsDelivered += result.deliveredAlerts;
          instantAlertsDelivered += result.deliveredAlerts;
        }
      }

      continue;
    }

    if (channelCounts.emailAlerts.length) {
      const digestSubject = subjectForDigest(search.label, cadence, channelCounts.emailAlerts.length);
      const digestPayload = payloadForDigest(search.label, cadence, channelCounts.emailAlerts);
      attemptedDeliveries += 1;
      const emailResult = await sendIntegrationEmail({
        to: search.user.email,
        subject: digestSubject,
        text: digestPayload
      });

      const log = await prisma.alertDeliveryLog.create({
        data: {
          userId: search.userId,
          savedSearchId: search.id,
          channel: "email",
          kind: "digest",
          provider: emailResult.provider,
          providerMessageId: emailResult.providerMessageId,
          accepted: emailResult.accepted,
          recipient: search.user.email,
          subject: digestSubject,
          payload: digestPayload,
          deliveredAt: now
        }
      });
      logsCreated += 1;

      if (emailResult.accepted) {
        await prisma.jobAlert.updateMany({
          where: { id: { in: channelCounts.emailAlerts.map((alert) => alert.id) } },
          data: { emailSentAt: now }
        });
        alertsDelivered += channelCounts.emailAlerts.length;
        digestAlertsDelivered += channelCounts.emailAlerts.length;
        emailChannelDelivered += channelCounts.emailAlerts.length;
        digestRuns += 1;
      } else {
        failedDeliveries += 1;
      }

      await emitDeliveryWebhookEvent({
        eventType: "alerts.delivery.digest",
        payload: {
          deliveryLogId: log.id,
          savedSearchId: search.id,
          recipient: search.user.email,
          provider: emailResult.provider,
          accepted: emailResult.accepted,
          providerMessageId: emailResult.providerMessageId,
          error: emailResult.error
        }
      });
    }

    if (channelCounts.inAppAlerts.length) {
      attemptedDeliveries += 1;
      const created = await createInternalDeliveryLogs({
        search,
        alerts: channelCounts.inAppAlerts,
        now,
        channel: "in_app",
        kind: "digest",
        subject: `In-app digest: ${search.label}`,
        payload: payloadForDigest(search.label, cadence, channelCounts.inAppAlerts)
      });
      logsCreated += created;
      inAppChannelDelivered += channelCounts.inAppAlerts.length;
      alertsDelivered += channelCounts.inAppAlerts.length;
      digestAlertsDelivered += channelCounts.inAppAlerts.length;
      await prisma.jobAlert.updateMany({
        where: { id: { in: channelCounts.inAppAlerts.map((alert) => alert.id) } },
        data: { inAppSentAt: now }
      });
    }

    if (channelCounts.pushAlerts.length) {
      attemptedDeliveries += 1;
      const result = await deliverPushDigest({
        search,
        alerts: channelCounts.pushAlerts,
        now,
        cadence
      });
      logsCreated += result.logsCreated;
      failedDeliveries += result.failedAttempts;
      pushChannelDelivered += result.deliveredAlerts;
      alertsDelivered += result.deliveredAlerts;
      digestAlertsDelivered += result.deliveredAlerts;
    }

    await prisma.savedSearch.update({
      where: { id: search.id },
      data: { lastDigestAt: now }
    });
  }

  return {
    scope: input.scope,
    runAt: now.toISOString(),
    searchesScanned,
    attemptedDeliveries,
    alertsDelivered,
    instantAlertsDelivered,
    digestAlertsDelivered,
    failedDeliveries,
    digestRuns,
    logsCreated,
    waitingDigestSearches,
    channelDeliveries: {
      email: emailChannelDelivered,
      inApp: inAppChannelDelivered,
      push: pushChannelDelivered
    }
  };
}
