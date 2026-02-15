import { prisma } from "@/lib/prisma";
import type { SecurityBacklogSnapshot } from "@/lib/types";

const defaultBacklogItems = [
  {
    area: "Object-level authorization",
    title: "Enforce owner checks on all write APIs",
    severity: "high",
    status: "in_progress",
    owner: "security@faypath.dev",
    notes: "Confirm every PATCH/DELETE checks authenticated resource ownership."
  },
  {
    area: "API inventory map",
    title: "Document auth + risk for all active endpoints",
    severity: "medium",
    status: "planned",
    owner: "platform@faypath.dev",
    notes: "Keep route ownership map current with release checklist."
  },
  {
    area: "Third-party API handling",
    title: "Reject unsafe upstream payloads and unexpected fields",
    severity: "high",
    status: "planned",
    owner: "platform@faypath.dev",
    notes: "Use schema allow-lists for all partner webhooks and importers."
  }
] as const;

const defaultInventoryItems = [
  {
    method: "POST",
    path: "/api/applications",
    authRequired: true,
    objectLevelCheck: true,
    thirdPartyRisk: "low",
    notes: "Candidate-only; includes anti-spam checks."
  },
  {
    method: "PATCH",
    path: "/api/saved-searches",
    authRequired: true,
    objectLevelCheck: true,
    thirdPartyRisk: "low",
    notes: "Ownership check required on search id."
  },
  {
    method: "POST",
    path: "/api/integrations/webhook",
    authRequired: false,
    objectLevelCheck: false,
    thirdPartyRisk: "high",
    notes: "Signature verification, throttling, and payload allow-list required."
  },
  {
    method: "GET",
    path: "/api/integrations/activity",
    authRequired: true,
    objectLevelCheck: true,
    thirdPartyRisk: "low",
    notes: "Scope and role checks required."
  }
] as const;

export async function ensureSecurityCatalog() {
  for (const item of defaultBacklogItems) {
    const existing = await prisma.securityBacklogItem.findFirst({
      where: {
        area: item.area,
        title: item.title
      },
      select: { id: true }
    });
    if (!existing) {
      await prisma.securityBacklogItem.create({
        data: item
      });
    }
  }

  for (const item of defaultInventoryItems) {
    await prisma.apiInventoryItem.upsert({
      where: {
        method_path: {
          method: item.method,
          path: item.path
        }
      },
      create: item,
      update: {
        authRequired: item.authRequired,
        objectLevelCheck: item.objectLevelCheck,
        thirdPartyRisk: item.thirdPartyRisk,
        notes: item.notes
      }
    });
  }
}

export async function getSecurityBacklogSnapshot(): Promise<SecurityBacklogSnapshot> {
  await ensureSecurityCatalog();

  const [items, inventory] = await Promise.all([
    prisma.securityBacklogItem.findMany({
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }]
    }),
    prisma.apiInventoryItem.findMany({
      orderBy: [{ thirdPartyRisk: "desc" }, { path: "asc" }]
    })
  ]);

  const highRiskOpen = items.filter(
    (item) => item.severity === "high" && item.status !== "done" && item.status !== "closed"
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    items: items.map((item) => ({
      id: item.id,
      area: item.area,
      title: item.title,
      status: item.status,
      severity: item.severity,
      owner: item.owner,
      notes: item.notes,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    })),
    inventory: inventory.map((item) => ({
      id: item.id,
      method: item.method,
      path: item.path,
      authRequired: item.authRequired,
      objectLevelCheck: item.objectLevelCheck,
      thirdPartyRisk: item.thirdPartyRisk,
      notes: item.notes,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    })),
    highRiskOpen
  };
}
