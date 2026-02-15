import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

let seeded: Promise<void> | null = null;

function demoCredentials() {
  return {
    password: process.env.DEMO_PASSWORD ?? "demo12345",
    candidateEmail: process.env.DEMO_CANDIDATE_EMAIL ?? "candidate@faypath.dev",
    employerEmail: process.env.DEMO_EMPLOYER_EMAIL ?? "employer@faypath.dev",
    adminEmail: process.env.DEMO_ADMIN_EMAIL ?? "admin@faypath.dev"
  };
}

export async function ensureSeedData() {
  if (seeded) return seeded;

  seeded = (async () => {
    const creds = demoCredentials();
    const passwordHash = await hash(creds.password, 10);

    const candidate = await prisma.user.upsert({
      where: { email: creds.candidateEmail },
      update: {
        billingPlan: "free",
        profileSkills: "React, TypeScript, Design Systems, Accessibility",
        profileHeadline: "Frontend engineer focused on measurable UX outcomes",
        profileSummary:
          "Built design systems and performance improvements across B2B and healthcare products.",
        profileCompleteness: 82
      },
      create: {
        email: creds.candidateEmail,
        name: "Demo Candidate",
        passwordHash,
        role: "CANDIDATE",
        billingPlan: "free",
        profileSkills: "React, TypeScript, Design Systems, Accessibility",
        profileHeadline: "Frontend engineer focused on measurable UX outcomes",
        profileSummary:
          "Built design systems and performance improvements across B2B and healthcare products.",
        profileCompleteness: 82
      }
    });

    const employer = await prisma.user.upsert({
      where: { email: creds.employerEmail },
      update: {
        billingPlan: "growth",
        profileCompleteness: 68
      },
      create: {
        email: creds.employerEmail,
        name: "Demo Employer",
        passwordHash,
        role: "EMPLOYER",
        billingPlan: "growth",
        profileCompleteness: 68
      }
    });

    await prisma.user.upsert({
      where: { email: creds.adminEmail },
      update: {
        billingPlan: "enterprise",
        profileCompleteness: 74
      },
      create: {
        email: creds.adminEmail,
        name: "Demo Admin",
        passwordHash,
        role: "ADMIN",
        billingPlan: "enterprise",
        profileCompleteness: 74
      }
    });

    if ((await prisma.job.count()) === 0) {
      await prisma.job.createMany({
        data: [
          {
            title: "Senior Product Designer",
            company: "Northbeam Health",
            location: "Austin, TX",
            mode: "hybrid",
            salary: "$132k-$155k",
            meritFit: 92,
            evidence: "Strong outcomes in healthcare UX and accessibility audits.",
            tags: "Figma, Design Systems, Accessibility",
            requiredScreeners: "Healthcare UX case study, Accessibility remediation experience",
            preferredScreeners: "Design ops leadership, A/B experiment ownership",
            requiredSkills: "Figma, Accessibility, Design Systems",
            preferredSkills: "Experimentation, Research synthesis",
            sponsorTier: "premium",
            sponsored: true,
            featuredEmployer: true,
            paywallTier: "advanced",
            createdById: employer.id
          },
          {
            title: "Frontend Engineer (React)",
            company: "Sunline Commerce",
            location: "Remote (US)",
            mode: "remote",
            salary: "$118k-$145k",
            meritFit: 89,
            evidence: "Built high-conversion component libraries at scale.",
            tags: "React, TypeScript, Performance",
            requiredScreeners: "TypeScript production ownership, Performance tuning",
            preferredScreeners: "Checkout optimization metrics, CI/CD ownership",
            requiredSkills: "React, TypeScript, Performance",
            preferredSkills: "A/B Testing, Cypress",
            sponsorTier: "boost",
            sponsored: true,
            featuredEmployer: false,
            paywallTier: "advanced",
            createdById: employer.id
          },
          {
            title: "People Operations Manager",
            company: "Atlas Foods",
            location: "Chicago, IL",
            mode: "onsite",
            salary: "$96k-$118k",
            meritFit: 84,
            evidence: "Proven retention lift and process redesign wins.",
            tags: "HR Ops, Workforce Planning, Coaching",
            requiredScreeners: "US labor compliance, Workforce planning at 200+ employees",
            preferredScreeners: "Multi-state policy rollout",
            requiredSkills: "HR Ops, Workforce Planning",
            preferredSkills: "Coaching, Change management",
            createdById: employer.id
          },
          {
            title: "Data Analyst, Growth",
            company: "Tangent Labs",
            location: "San Diego, CA",
            mode: "remote",
            salary: "$102k-$128k",
            meritFit: 87,
            evidence: "Strong experimentation and attribution portfolio.",
            tags: "SQL, A/B Testing, BI",
            requiredScreeners: "SQL analytics ownership, Experiment design",
            preferredScreeners: "Marketing mix modeling",
            requiredSkills: "SQL, Experimentation, BI",
            preferredSkills: "Attribution, Python",
            createdById: employer.id
          }
        ]
      });
    }

    if ((await prisma.talentProfile.count()) === 0) {
      await prisma.talentProfile.createMany({
        data: [
          {
            name: "Rina Shah",
            role: "Frontend Engineer",
            summary: "Shipped design systems used by 30+ product squads.",
            merit: 91,
            assessment: "94th percentile",
            trust: "4.8/5"
          },
          {
            name: "Leo Martin",
            role: "Growth Data Analyst",
            summary: "Raised activation by 18% through attribution redesign.",
            merit: 89,
            assessment: "91st percentile",
            trust: "4.7/5"
          },
          {
            name: "Maya Ortega",
            role: "Operations Manager",
            summary: "Reduced fulfillment delays by 26% across four regions.",
            merit: 88,
            assessment: "89th percentile",
            trust: "4.9/5"
          }
        ]
      });
    }

    if ((await prisma.conversation.count()) === 0) {
      await prisma.conversation.create({
        data: {
          title: "Northbeam Hiring Team",
          messages: {
            create: [
              {
                role: "employer",
                text: "Thanks for applying. Can you share your latest case study?"
              },
              {
                role: "candidate",
                text: "Absolutely. I can send details and metrics today."
              }
            ]
          }
        }
      });

      await prisma.conversation.create({
        data: {
          title: "Sunline Engineering",
          messages: {
            create: [{ role: "employer", text: "We liked your portfolio. Are you open this week?" }]
          }
        }
      });
    }

    const conversations = await prisma.conversation.findMany({
      select: { id: true }
    });

    for (const conversation of conversations) {
      await prisma.conversationPresence.upsert({
        where: {
          conversationId_role: {
            conversationId: conversation.id,
            role: "candidate"
          }
        },
        update: {},
        create: {
          conversationId: conversation.id,
          role: "candidate"
        }
      });

      await prisma.conversationPresence.upsert({
        where: {
          conversationId_role: {
            conversationId: conversation.id,
            role: "employer"
          }
        },
        update: {},
        create: {
          conversationId: conversation.id,
          role: "employer"
        }
      });
    }

    if ((await prisma.interview.count()) === 0) {
      await prisma.interview.create({
        data: {
          person: "Rina Shah",
          owner: "M. Collins",
          time: new Date("2026-02-18T13:00:00Z"),
          type: "video"
        }
      });
    }

    if ((await prisma.moderationItem.count()) === 0) {
      await prisma.moderationItem.createMany({
        data: [
          {
            type: "Profile flag",
            target: "Candidate: Alex P.",
            reason: "Possible unverifiable credential",
            status: "pending"
          },
          {
            type: "Job content flag",
            target: "Role: Growth Marketing Lead",
            reason: "Comp range missing for US posting policy",
            status: "pending"
          }
        ]
      });
    }

    if ((await prisma.application.count()) === 0) {
      const job = await prisma.job.findFirst({
        where: { title: "Frontend Engineer (React)" },
        select: { id: true }
      });

      if (job) {
        await prisma.application.create({
          data: {
            jobId: job.id,
            userId: candidate.id,
            status: "Interview",
            appliedAt: new Date("2026-02-10T11:20:00Z")
          }
        });
      }
    }

    const candidateSearchCount = await prisma.savedSearch.count({
      where: { userId: candidate.id }
    });

    if (candidateSearchCount === 0) {
      await prisma.savedSearch.create({
        data: {
          userId: candidate.id,
          label: "Remote Product + Frontend",
          keyword: "frontend product",
          mode: "remote",
          minScore: 82,
          emailEnabled: true,
          inAppEnabled: true,
          pushEnabled: true,
          pushDeferred: true,
          timezone: "America/Chicago",
          digestCadence: "daily",
          digestHour: 9
        }
      });
    }

    if ((await prisma.securityBacklogItem.count()) === 0) {
      await prisma.securityBacklogItem.createMany({
        data: [
          {
            area: "Object-level authorization",
            title: "Validate ownership on all mutable resources",
            severity: "high",
            status: "in_progress",
            owner: "security@faypath.dev",
            notes: "Add ownership checks on applications, saved searches, and shortlist actions."
          },
          {
            area: "Third-party API handling",
            title: "Enforce response schema allow-lists",
            severity: "medium",
            status: "planned",
            owner: "platform@faypath.dev",
            notes: "Reject unexpected upstream payload keys from partner ingest and webhooks."
          },
          {
            area: "API inventory",
            title: "Complete endpoint classification and auth mapping",
            severity: "medium",
            status: "planned",
            owner: "platform@faypath.dev",
            notes: "Track auth requirements and object-level checks for every route."
          }
        ]
      });
    }

    if ((await prisma.apiInventoryItem.count()) === 0) {
      await prisma.apiInventoryItem.createMany({
        data: [
          {
            method: "POST",
            path: "/api/applications",
            authRequired: true,
            objectLevelCheck: true,
            thirdPartyRisk: "low",
            notes: "Candidate-only endpoint with spam and duplicate checks."
          },
          {
            method: "POST",
            path: "/api/integrations/webhook",
            authRequired: false,
            objectLevelCheck: false,
            thirdPartyRisk: "high",
            notes: "Signature verification and abuse controls required."
          },
          {
            method: "GET",
            path: "/api/analytics",
            authRequired: true,
            objectLevelCheck: true,
            thirdPartyRisk: "low",
            notes: "Employer scope filtering required."
          }
        ]
      });
    }
  })().catch((error) => {
    seeded = null;
    throw error;
  });

  return seeded;
}
