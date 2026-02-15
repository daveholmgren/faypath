"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import type {
  AlertDeliveryPreview,
  AlertDeliveryRunSummary,
  AlertFeed,
  Application,
  Conversation,
  DigestCadence,
  EmployerAnalytics,
  EmployerMarketIntel,
  IntegrationActivity,
  IntegrationAuditEvent,
  ExternalJobImportSummary,
  IntegrationRetrySummary,
  Interview,
  InterviewLoadStat,
  InterviewRebalanceSuggestion,
  JobAlert,
  Job,
  ModerationItem,
  PipelineAutomationRunResult,
  PipelineAutomationSnapshot,
  PipelineStageRecommendation,
  MonetizationSnapshot,
  ReliabilitySloSnapshot,
  RoleMode,
  SavedSearch,
  SavedSearchMode,
  SecurityBacklogSnapshot,
  SystemStatusSnapshot,
  TalentProfile,
  WorkMode
} from "@/lib/types";

type FilterMode = "all" | WorkMode;
type ModerationAction = "approve" | "reject";
type ShortlistResponse = { profileIds: number[] };
type SaveSearchDeleteResponse = { ok: true };
type DeliveryScope = "self" | "all";

const defaultAnalytics: EmployerAnalytics = {
  scope: "none",
  advancedEnabled: false,
  paywallReason: "Sign in as an employer to unlock analytics.",
  totalJobs: 0,
  totalApplications: 0,
  avgMeritFit: 0,
  shortlistCount: 0,
  interviewsScheduled: 0,
  sponsoredJobs: 0,
  featuredEmployers: 0,
  statusBreakdown: [],
  topRoles: []
};

const defaultPipelineSnapshot: PipelineAutomationSnapshot = {
  scope: "none",
  generatedAt: new Date(0).toISOString(),
  totals: {
    applications: 0,
    recommendations: 0,
    scheduledInterviews: 0
  },
  recommendations: [],
  loadStats: [],
  rebalanceSuggestions: []
};

const defaultIntegrationActivity: IntegrationActivity = {
  scope: "none",
  generatedAt: new Date(0).toISOString(),
  deliveries: {
    total: 0,
    accepted: 0,
    failed: 0,
    recent: []
  },
  webhooks: {
    total: 0,
    delivered: 0,
    failed: 0,
    blocked: 0,
    recent: []
  }
};

const defaultMarketIntel: EmployerMarketIntel = {
  generatedAt: new Date(0).toISOString(),
  scope: "none",
  demandIndex: 0,
  supplyDemandRatio: 0,
  compBands: [],
  locationDepth: []
};

const defaultReliability: ReliabilitySloSnapshot = {
  generatedAt: new Date(0).toISOString(),
  scope: "employer",
  metrics: []
};

const defaultSecurityBacklog: SecurityBacklogSnapshot = {
  generatedAt: new Date(0).toISOString(),
  items: [],
  inventory: [],
  highRiskOpen: 0
};

const defaultMonetization: MonetizationSnapshot = {
  plan: "free",
  advancedAnalyticsUnlocked: false,
  sponsoredJobs: 0,
  featuredEmployerProfiles: 0,
  paywalledInsights: []
};

function roleFromUserRole(role: string | undefined): RoleMode {
  return role === "EMPLOYER" || role === "ADMIN" ? "employer" : "candidate";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function toStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isSavedSearchMode(value: string): value is SavedSearchMode {
  return value === "all" || value === "remote" || value === "hybrid" || value === "onsite";
}

function nextDigestCadence(current: DigestCadence): DigestCadence {
  if (current === "instant") return "daily";
  if (current === "daily") return "weekly";
  return "instant";
}

export default function HomePage() {
  const { data: session, status } = useSession();

  const [activeRole, setActiveRole] = useState<RoleMode>("candidate");
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState<FilterMode>("all");
  const [score, setScore] = useState(72);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [talent, setTalent] = useState<TalentProfile[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [moderation, setModeration] = useState<ModerationItem[]>([]);
  const [shortlist, setShortlist] = useState<number[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [jobAlerts, setJobAlerts] = useState<JobAlert[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [pendingEmailAlerts, setPendingEmailAlerts] = useState(0);
  const [pendingInAppAlerts, setPendingInAppAlerts] = useState(0);
  const [pendingPushAlerts, setPendingPushAlerts] = useState(0);
  const [analytics, setAnalytics] = useState<EmployerAnalytics>(defaultAnalytics);
  const [marketIntel, setMarketIntel] = useState<EmployerMarketIntel>(defaultMarketIntel);
  const [reliability, setReliability] = useState<ReliabilitySloSnapshot>(defaultReliability);
  const [securityBacklog, setSecurityBacklog] =
    useState<SecurityBacklogSnapshot>(defaultSecurityBacklog);
  const [monetization, setMonetization] = useState<MonetizationSnapshot>(defaultMonetization);
  const [pipeline, setPipeline] = useState<PipelineAutomationSnapshot>(defaultPipelineSnapshot);
  const [integrationActivity, setIntegrationActivity] =
    useState<IntegrationActivity>(defaultIntegrationActivity);
  const [integrationAudit, setIntegrationAudit] = useState<IntegrationAuditEvent[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatusSnapshot | null>(null);
  const [retrySummary, setRetrySummary] = useState<IntegrationRetrySummary | null>(null);
  const [importSource, setImportSource] = useState("manual_csv");
  const [importCsv, setImportCsv] = useState("");
  const [importDryRun, setImportDryRun] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<ExternalJobImportSummary | null>(null);
  const [deliveryPreview, setDeliveryPreview] = useState<AlertDeliveryPreview | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messageDraft, setMessageDraft] = useState("");

  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const typingPingAtRef = useRef(0);
  const typingConversationRef = useRef<number | null>(null);

  const userRole = session?.user?.role;
  const canCandidateActions = userRole === "CANDIDATE" || userRole === "ADMIN";
  const canEmployerActions = userRole === "EMPLOYER" || userRole === "ADMIN";
  const integrationScope: DeliveryScope = userRole === "ADMIN" ? "all" : "self";
  const integrationActivityUrl =
    integrationScope === "all" ? "/api/integrations/activity?scope=all" : "/api/integrations/activity";
  const integrationAuditUrl = "/api/integrations/audit?limit=12";
  const systemStatusUrl = "/api/system/status";
  const authRoleForMessages = roleFromUserRole(userRole);
  const currentRoleForMessages = status === "authenticated" ? authRoleForMessages : activeRole;

  useEffect(() => {
    if (userRole === "EMPLOYER") setActiveRole("employer");
    if (userRole === "CANDIDATE") setActiveRole("candidate");
  }, [userRole]);

  const applyAlertFeed = useCallback((feed: AlertFeed) => {
    setJobAlerts(feed.alerts);
    setUnreadAlerts(feed.unread);
    setPendingEmailAlerts(feed.pendingEmail);
    setPendingInAppAlerts(feed.pendingInApp);
    setPendingPushAlerts(feed.pendingPush);
  }, []);

  const loadAllData = useCallback(async () => {
    const [
      jobsRes,
      talentRes,
      applicationsRes,
      conversationsRes,
      interviewsRes,
      moderationRes,
      shortlistRes,
      savedSearchesRes,
      alertFeedRes,
      analyticsRes,
      marketIntelRes,
      reliabilityRes,
      securityBacklogRes,
      monetizationRes,
      pipelineRes,
      integrationActivityRes,
      integrationAuditRes,
      systemStatusRes
    ] =
      await Promise.all([
        fetchJson<Job[]>("/api/jobs"),
        fetchJson<TalentProfile[]>("/api/talent"),
        fetchJson<Application[]>("/api/applications"),
        fetchJson<Conversation[]>("/api/messages"),
        fetchJson<Interview[]>("/api/interviews"),
        fetchJson<ModerationItem[]>("/api/moderation"),
        fetchJson<ShortlistResponse>("/api/shortlist"),
        fetchJson<SavedSearch[]>("/api/saved-searches"),
        fetchJson<AlertFeed>("/api/alerts"),
        fetchJson<EmployerAnalytics>("/api/analytics"),
        canEmployerActions
          ? fetchJson<EmployerMarketIntel>("/api/market-intel")
          : Promise.resolve<EmployerMarketIntel>(defaultMarketIntel),
        canEmployerActions
          ? fetchJson<ReliabilitySloSnapshot>("/api/reliability/slo")
          : Promise.resolve<ReliabilitySloSnapshot>(defaultReliability),
        canEmployerActions
          ? fetchJson<SecurityBacklogSnapshot>("/api/security/backlog")
          : Promise.resolve<SecurityBacklogSnapshot>(defaultSecurityBacklog),
        canEmployerActions
          ? fetchJson<MonetizationSnapshot>("/api/monetization")
          : Promise.resolve<MonetizationSnapshot>(defaultMonetization),
        fetchJson<PipelineAutomationSnapshot>("/api/pipeline/automation"),
        fetchJson<IntegrationActivity>(integrationActivityUrl),
        userRole === "ADMIN"
          ? fetchJson<{ events: IntegrationAuditEvent[] }>(integrationAuditUrl)
          : Promise.resolve<{ events: IntegrationAuditEvent[] }>({ events: [] }),
        canEmployerActions
          ? fetchJson<SystemStatusSnapshot>(systemStatusUrl)
          : Promise.resolve<SystemStatusSnapshot | null>(null)
      ]);

    setJobs(jobsRes);
    setTalent(talentRes);
    setApplications(applicationsRes);
    setConversations(conversationsRes);
    setInterviews(interviewsRes);
    setModeration(moderationRes);
    setShortlist(shortlistRes.profileIds);
    setSavedSearches(savedSearchesRes);
    applyAlertFeed(alertFeedRes);
    setAnalytics(analyticsRes);
    setMarketIntel(marketIntelRes);
    setReliability(reliabilityRes);
    setSecurityBacklog(securityBacklogRes);
    setMonetization(monetizationRes);
    setPipeline(pipelineRes);
    setIntegrationActivity(integrationActivityRes);
    setIntegrationAudit(integrationAuditRes.events);
    setSystemStatus(systemStatusRes);
    setActiveConversationId((current) => current ?? conversationsRes[0]?.id ?? null);
  }, [
    integrationActivityUrl,
    integrationAuditUrl,
    canEmployerActions,
    userRole,
    systemStatusUrl,
    applyAlertFeed
  ]);

  useEffect(() => {
    if (status === "loading") return;

    setLoading(true);
    loadAllData()
      .catch(() => {
        setNotice("Could not load one or more data feeds.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadAllData, status]);

  const refreshConversations = useCallback(async () => {
    const conversationRes = await fetchJson<Conversation[]>("/api/messages");
    setConversations(conversationRes);
    setActiveConversationId((current) => current ?? conversationRes[0]?.id ?? null);
  }, []);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  }, [conversations, activeConversationId]);

  const pushPresenceUpdate = useCallback(
    async (input: { conversationId: number; typing?: boolean; seen?: boolean }) => {
      if (status !== "authenticated") return;

      const response = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });

      if (!response.ok) return;
      const updated = (await response.json()) as Conversation;
      setConversations((current) =>
        current.map((conversation) => (conversation.id === updated.id ? updated : conversation))
      );
    },
    [status]
  );

  useEffect(() => {
    if (status !== "authenticated") return;

    const timer = window.setInterval(() => {
      void refreshConversations().catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [refreshConversations, status]);

  useEffect(() => {
    if (status !== "authenticated" || !canCandidateActions) return;

    const timer = window.setInterval(() => {
      void fetchJson<AlertFeed>("/api/alerts")
        .then((feed) => {
          applyAlertFeed(feed);
        })
        .catch(() => undefined);
    }, 12000);

    return () => window.clearInterval(timer);
  }, [status, canCandidateActions, applyAlertFeed]);

  useEffect(() => {
    if (status !== "authenticated" || !canCandidateActions) {
      setDeliveryPreview(null);
      return;
    }

    let cancelled = false;

    const refreshPreview = () => {
      void fetchJson<AlertDeliveryPreview>("/api/alerts/delivery")
        .then((preview) => {
          if (!cancelled) setDeliveryPreview(preview);
        })
        .catch(() => undefined);
    };

    refreshPreview();
    const timer = window.setInterval(refreshPreview, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, canCandidateActions]);

  useEffect(() => {
    if (status !== "authenticated" || !canEmployerActions) {
      setIntegrationActivity(defaultIntegrationActivity);
      setSystemStatus(null);
      setIntegrationAudit([]);
      setRetrySummary(null);
      setMarketIntel(defaultMarketIntel);
      setReliability(defaultReliability);
      setSecurityBacklog(defaultSecurityBacklog);
      setMonetization(defaultMonetization);
      return;
    }

    let cancelled = false;

    const refreshActivity = () => {
      void fetchJson<IntegrationActivity>(integrationActivityUrl)
        .then((activity) => {
          if (!cancelled) setIntegrationActivity(activity);
        })
        .catch(() => undefined);
    };

    refreshActivity();
    const timer = window.setInterval(refreshActivity, 35000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, canEmployerActions, integrationActivityUrl]);

  useEffect(() => {
    if (status !== "authenticated" || !canEmployerActions) return;

    let cancelled = false;
    const refreshOpsSignals = () => {
      const tasks: Promise<unknown>[] = [
        fetchJson<SystemStatusSnapshot>(systemStatusUrl)
          .then((snapshot) => {
            if (!cancelled) setSystemStatus(snapshot);
          })
          .catch(() => undefined),
        fetchJson<EmployerMarketIntel>("/api/market-intel")
          .then((snapshot) => {
            if (!cancelled) setMarketIntel(snapshot);
          })
          .catch(() => undefined),
        fetchJson<ReliabilitySloSnapshot>("/api/reliability/slo")
          .then((snapshot) => {
            if (!cancelled) setReliability(snapshot);
          })
          .catch(() => undefined),
        fetchJson<SecurityBacklogSnapshot>("/api/security/backlog")
          .then((snapshot) => {
            if (!cancelled) setSecurityBacklog(snapshot);
          })
          .catch(() => undefined),
        fetchJson<MonetizationSnapshot>("/api/monetization")
          .then((snapshot) => {
            if (!cancelled) setMonetization(snapshot);
          })
          .catch(() => undefined)
      ];

      if (userRole === "ADMIN") {
        tasks.push(
          fetchJson<{ events: IntegrationAuditEvent[] }>(integrationAuditUrl)
            .then((payload) => {
              if (!cancelled) setIntegrationAudit(payload.events);
            })
            .catch(() => undefined)
        );
      }

      void Promise.all(tasks);
    };

    refreshOpsSignals();
    const timer = window.setInterval(refreshOpsSignals, 45000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, canEmployerActions, userRole, integrationAuditUrl, systemStatusUrl]);

  useEffect(() => {
    if (status !== "authenticated" || !activeConversationId) return;
    void pushPresenceUpdate({
      conversationId: activeConversationId,
      seen: true
    });
  }, [status, activeConversationId, activeConversation?.messages.length, pushPresenceUpdate]);

  useEffect(() => {
    if (status !== "authenticated" || !activeConversationId) return;
    return () => {
      void pushPresenceUpdate({
        conversationId: activeConversationId,
        typing: false
      });
    };
  }, [status, activeConversationId, pushPresenceUpdate]);

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        const q = keyword.trim().toLowerCase();
        const matchesText =
          !q ||
          job.title.toLowerCase().includes(q) ||
          job.company.toLowerCase().includes(q) ||
          job.tags.join(" ").toLowerCase().includes(q);
        const matchesMode = mode === "all" || job.mode === mode;
        const matchesScore = job.meritFit >= score;
        return matchesText && matchesMode && matchesScore;
      })
      .sort(
        (a, b) =>
          Number(b.sponsored) - Number(a.sponsored) ||
          Number(b.featuredEmployer) - Number(a.featuredEmployer) ||
          b.meritFit - a.meritFit
      );
  }, [jobs, keyword, mode, score]);

  const otherRoleForMessages = currentRoleForMessages === "candidate" ? "employer" : "candidate";
  const otherPresence = activeConversation?.presence.find((state) => state.role === otherRoleForMessages);
  const isOtherTyping =
    typeof otherPresence?.typingUntil === "string" &&
    new Date(otherPresence.typingUntil).getTime() > Date.now();
  const seenAt = otherPresence?.lastSeenAt ?? null;

  const pendingModeration = useMemo(
    () => moderation.filter((item) => item.status === "pending"),
    [moderation]
  );

  const sortedInterviews = useMemo(
    () => interviews.slice().sort((a, b) => a.time.localeCompare(b.time)),
    [interviews]
  );

  const sortedApplications = useMemo(() => {
    return applications
      .slice()
      .sort(
        (a, b) =>
          b.autoRankScore - a.autoRankScore ||
          new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );
  }, [applications]);

  const topPipelineRecommendations = useMemo<PipelineStageRecommendation[]>(
    () => pipeline.recommendations.slice(0, 6),
    [pipeline.recommendations]
  );

  const loadStats = useMemo<InterviewLoadStat[]>(() => pipeline.loadStats, [pipeline.loadStats]);
  const rebalanceSuggestions = useMemo<InterviewRebalanceSuggestion[]>(
    () => pipeline.rebalanceSuggestions.slice(0, 4),
    [pipeline.rebalanceSuggestions]
  );
  const reportScopeParam = integrationScope === "all" ? "all" : "self";
  const summaryExportCsvHref = `/api/reports/export?resource=summary&format=csv&scope=${reportScopeParam}`;
  const deliveryExportJsonHref = `/api/reports/export?resource=deliveries&format=json&scope=${reportScopeParam}`;
  const webhookExportCsvHref = `/api/reports/export?resource=webhooks&format=csv&scope=${reportScopeParam}`;

  const roleActionLabel = activeRole === "candidate" ? "Apply Now" : "Open Role Pipeline";
  const talentActionLabel = activeRole === "employer" ? "Add to Shortlist" : "Message";

  async function refreshPipelineSnapshot() {
    const snapshot = await fetchJson<PipelineAutomationSnapshot>("/api/pipeline/automation");
    setPipeline(snapshot);
  }

  async function refreshEmployerAnalytics() {
    const nextAnalytics = await fetchJson<EmployerAnalytics>("/api/analytics");
    setAnalytics(nextAnalytics);
  }

  async function refreshMarketIntel() {
    const snapshot = await fetchJson<EmployerMarketIntel>("/api/market-intel");
    setMarketIntel(snapshot);
  }

  async function refreshReliability() {
    const snapshot = await fetchJson<ReliabilitySloSnapshot>("/api/reliability/slo");
    setReliability(snapshot);
  }

  async function refreshSecurityBacklog() {
    const snapshot = await fetchJson<SecurityBacklogSnapshot>("/api/security/backlog");
    setSecurityBacklog(snapshot);
  }

  async function refreshMonetization() {
    const snapshot = await fetchJson<MonetizationSnapshot>("/api/monetization");
    setMonetization(snapshot);
  }

  async function refreshIntegrationActivity() {
    const snapshot = await fetchJson<IntegrationActivity>(integrationActivityUrl);
    setIntegrationActivity(snapshot);
  }

  async function refreshIntegrationAudit() {
    if (userRole !== "ADMIN") return;
    const payload = await fetchJson<{ events: IntegrationAuditEvent[] }>(integrationAuditUrl);
    setIntegrationAudit(payload.events);
  }

  async function refreshSystemStatus() {
    if (!canEmployerActions) return;
    const snapshot = await fetchJson<SystemStatusSnapshot>(systemStatusUrl);
    setSystemStatus(snapshot);
  }

  async function refreshEmployerWorkspaceSignals() {
    const [
      apps,
      interviewList,
      nextAnalytics,
      marketIntelSnapshot,
      reliabilitySnapshot,
      securitySnapshot,
      monetizationSnapshot,
      snapshot,
      activity,
      statusSnapshot,
      auditPayload
    ] = await Promise.all([
      fetchJson<Application[]>("/api/applications"),
      fetchJson<Interview[]>("/api/interviews"),
      fetchJson<EmployerAnalytics>("/api/analytics"),
      fetchJson<EmployerMarketIntel>("/api/market-intel"),
      fetchJson<ReliabilitySloSnapshot>("/api/reliability/slo"),
      fetchJson<SecurityBacklogSnapshot>("/api/security/backlog"),
      fetchJson<MonetizationSnapshot>("/api/monetization"),
      fetchJson<PipelineAutomationSnapshot>("/api/pipeline/automation"),
      fetchJson<IntegrationActivity>(integrationActivityUrl),
      fetchJson<SystemStatusSnapshot>(systemStatusUrl).catch(() => null),
      userRole === "ADMIN"
        ? fetchJson<{ events: IntegrationAuditEvent[] }>(integrationAuditUrl)
        : Promise.resolve<{ events: IntegrationAuditEvent[] }>({ events: [] })
    ]);

    setApplications(apps);
    setInterviews(interviewList);
    setAnalytics(nextAnalytics);
    setMarketIntel(marketIntelSnapshot);
    setReliability(reliabilitySnapshot);
    setSecurityBacklog(securitySnapshot);
    setMonetization(monetizationSnapshot);
    setPipeline(snapshot);
    setIntegrationActivity(activity);
    setSystemStatus(statusSnapshot);
    setIntegrationAudit(auditPayload.events);
  }

  async function handleApply(jobId: number) {
    if (activeRole !== "candidate") return;
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to apply.");
      return;
    }

    const exists = applications.some((application) => application.jobId === jobId);
    if (exists) {
      setNotice("You already applied to this role.");
      return;
    }

    const selectedJob = jobs.find((job) => job.id === jobId);
    const answers = selectedJob
      ? [...selectedJob.requiredScreeners, ...selectedJob.preferredScreeners].slice(0, 5).map((question) => ({
          question,
          answer: `Yes - delivered results related to ${question}.`
        }))
      : [];

    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, answers })
    });

    if (response.status === 401 || response.status === 403) {
      setNotice("Sign in as a candidate account to apply.");
      return;
    }

    if (!response.ok) {
      setNotice("Could not apply to this role.");
      return;
    }

    const record = (await response.json()) as Application;
    setApplications((current) => [record, ...current]);
    if (record.needsManualReview) {
      setNotice("Application submitted. It is queued for manual review.");
      return;
    }
    setNotice(`Application submitted. Auto-rank score: ${record.autoRankScore}.`);
  }

  function handleTalentAction(profileId: number) {
    if (activeRole === "employer") {
      if (!canEmployerActions) {
        setNotice("Sign in as an employer account to manage shortlists.");
        return;
      }

      void (async () => {
        const response = await fetch("/api/shortlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId })
        });

        if (response.status === 401 || response.status === 403) {
          setNotice("Sign in as an employer account to manage shortlists.");
          return;
        }

        if (!response.ok) {
          setNotice("Could not add candidate to shortlist.");
          return;
        }

        const payload = (await response.json()) as ShortlistResponse;
        setShortlist(payload.profileIds);
        void refreshEmployerAnalytics()
          .then(() => refreshPipelineSnapshot())
          .catch(() => undefined);
        setNotice("Candidate added to shortlist.");
      })();
      return;
    }

    if (conversations.length) {
      setActiveConversationId(conversations[0].id);
      setNotice("Opened messaging thread.");
    }
  }

  async function handleShortlistRemove(profileId: number) {
    if (!canEmployerActions) {
      setNotice("Sign in as an employer account to manage shortlists.");
      return;
    }

    const response = await fetch("/api/shortlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId })
    });

    if (response.status === 401 || response.status === 403) {
      setNotice("Sign in as an employer account to manage shortlists.");
      return;
    }

    if (!response.ok) {
      setNotice("Could not remove candidate from shortlist.");
      return;
    }

    const payload = (await response.json()) as ShortlistResponse;
    setShortlist(payload.profileIds);
    void refreshEmployerAnalytics()
      .then(() => refreshPipelineSnapshot())
      .catch(() => undefined);
    setNotice("Candidate removed from shortlist.");
  }

  async function handleSaveSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to save searches.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const label = toStringValue(formData.get("label"));
    const searchKeyword = toStringValue(formData.get("keyword"));
    const modeValue = toStringValue(formData.get("mode"));
    const minScore = Number(toStringValue(formData.get("minScore")));
    const emailEnabled = formData.get("emailEnabled") === "on";
    const inAppEnabled = formData.get("inAppEnabled") === "on";
    const pushEnabled = formData.get("pushEnabled") === "on";
    const pushDeferred = formData.get("pushDeferred") === "on";
    const timezone = toStringValue(formData.get("timezone")) || "America/New_York";
    const digestCadence = toStringValue(formData.get("digestCadence"));
    const digestHour = Number(toStringValue(formData.get("digestHour")));

    if (!label || !searchKeyword) {
      setNotice("Search label and keyword are required.");
      return;
    }

    if (!isSavedSearchMode(modeValue)) {
      setNotice("Invalid saved search mode.");
      return;
    }

    if (!Number.isFinite(minScore) || minScore < 55 || minScore > 99) {
      setNotice("Saved search minimum score must be between 55 and 99.");
      return;
    }

    if (
      digestCadence !== "instant" &&
      digestCadence !== "daily" &&
      digestCadence !== "weekly"
    ) {
      setNotice("Invalid digest cadence.");
      return;
    }

    if (!Number.isFinite(digestHour) || digestHour < 0 || digestHour > 23) {
      setNotice("Digest hour must be between 0 and 23.");
      return;
    }

    const response = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        keyword: searchKeyword,
        mode: modeValue,
        minScore,
        emailEnabled,
        inAppEnabled,
        pushEnabled,
        pushDeferred,
        timezone,
        digestCadence,
        digestHour
      })
    });

    if (response.status === 401 || response.status === 403) {
      setNotice("Sign in as a candidate account to save searches.");
      return;
    }

    if (!response.ok) {
      setNotice("Could not save search.");
      return;
    }

    const created = (await response.json()) as SavedSearch;
    setSavedSearches((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
    applyAlertFeed(await fetchJson<AlertFeed>("/api/alerts"));
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
    setNotice("Saved search created. Alerts are now tracking new matches.");
    form.reset();
  }

  async function handleSavedSearchEmailToggle(searchId: number, nextValue: boolean) {
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to update alerts.");
      return;
    }

    const response = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: searchId,
        emailEnabled: nextValue
      })
    });

    if (!response.ok) {
      setNotice("Could not update email alert preference.");
      return;
    }

    const updated = (await response.json()) as SavedSearch;
    setSavedSearches((current) =>
      current.map((search) => (search.id === updated.id ? updated : search))
    );
    applyAlertFeed(await fetchJson<AlertFeed>("/api/alerts"));
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
    setNotice(nextValue ? "Email alerting enabled." : "Email alerting paused.");
  }

  async function handleSavedSearchInAppToggle(searchId: number, nextValue: boolean) {
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to update alerts.");
      return;
    }

    const response = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: searchId,
        inAppEnabled: nextValue
      })
    });

    if (!response.ok) {
      setNotice("Could not update in-app alert preference.");
      return;
    }

    const updated = (await response.json()) as SavedSearch;
    setSavedSearches((current) =>
      current.map((search) => (search.id === updated.id ? updated : search))
    );
    applyAlertFeed(await fetchJson<AlertFeed>("/api/alerts"));
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
    setNotice(nextValue ? "In-app alerts enabled." : "In-app alerts paused.");
  }

  async function handleSavedSearchPushToggle(searchId: number, nextValue: boolean) {
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to update alerts.");
      return;
    }

    const response = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: searchId,
        pushEnabled: nextValue
      })
    });

    if (!response.ok) {
      setNotice("Could not update push alert preference.");
      return;
    }

    const updated = (await response.json()) as SavedSearch;
    setSavedSearches((current) =>
      current.map((search) => (search.id === updated.id ? updated : search))
    );
    applyAlertFeed(await fetchJson<AlertFeed>("/api/alerts"));
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
    setNotice(nextValue ? "Push alerts enabled." : "Push alerts paused.");
  }

  async function handleSavedSearchPushDeferredToggle(searchId: number, nextValue: boolean) {
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to update alerts.");
      return;
    }

    const response = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: searchId,
        pushDeferred: nextValue
      })
    });

    if (!response.ok) {
      setNotice("Could not update push timing preference.");
      return;
    }

    const updated = (await response.json()) as SavedSearch;
    setSavedSearches((current) =>
      current.map((search) => (search.id === updated.id ? updated : search))
    );
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
    setNotice(nextValue ? "Push set to deferred mode." : "Push set to immediate mode.");
  }

  async function handleSavedSearchCadenceCycle(search: SavedSearch) {
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to update alerts.");
      return;
    }

    const nextCadence = nextDigestCadence(search.digestCadence);

    const response = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: search.id,
        digestCadence: nextCadence
      })
    });

    if (!response.ok) {
      setNotice("Could not update digest cadence.");
      return;
    }

    const updated = (await response.json()) as SavedSearch;
    setSavedSearches((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry))
    );
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
    setNotice(`Digest cadence set to ${nextCadence}.`);
  }

  async function handleSavedSearchDelete(searchId: number) {
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to update alerts.");
      return;
    }

    const response = await fetch("/api/saved-searches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: searchId })
    });

    if (!response.ok) {
      setNotice("Could not delete saved search.");
      return;
    }

    const payload = (await response.json()) as SaveSearchDeleteResponse;
    if (!payload.ok) {
      setNotice("Could not delete saved search.");
      return;
    }

    setSavedSearches((current) => current.filter((search) => search.id !== searchId));
    applyAlertFeed(await fetchJson<AlertFeed>("/api/alerts"));
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
    setNotice("Saved search removed.");
  }

  async function handleAlertRead(alertId: number) {
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to manage alerts.");
      return;
    }

    const response = await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId })
    });

    if (!response.ok) {
      setNotice("Could not update alert state.");
      return;
    }

    const feed = (await response.json()) as AlertFeed;
    applyAlertFeed(feed);
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
  }

  async function handleAlertsReadAll() {
    if (!canCandidateActions) {
      setNotice("Sign in as a candidate account to manage alerts.");
      return;
    }

    const response = await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true })
    });

    if (!response.ok) {
      setNotice("Could not mark alerts as read.");
      return;
    }

    const feed = (await response.json()) as AlertFeed;
    applyAlertFeed(feed);
    setDeliveryPreview(await fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"));
    setNotice("All alerts marked as read.");
  }

  async function handleRunDeliveryWorker(scope: DeliveryScope) {
    if (status !== "authenticated") {
      setNotice("Sign in to run alert delivery.");
      return;
    }

    if (scope === "all" && userRole !== "ADMIN") {
      setNotice("Only admin can run global delivery.");
      return;
    }

    setDeliveryBusy(true);
    const response = await fetch("/api/alerts/delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope })
    }).finally(() => {
      setDeliveryBusy(false);
    });

    if (!response.ok) {
      setNotice("Could not run alert delivery worker.");
      return;
    }

    const summary = (await response.json()) as AlertDeliveryRunSummary;
    applyAlertFeed(await fetchJson<AlertFeed>("/api/alerts"));
    const [nextPreview] = await Promise.all([
      fetchJson<AlertDeliveryPreview>("/api/alerts/delivery"),
      refreshIntegrationActivity().catch(() => undefined)
    ]);
    setDeliveryPreview(nextPreview);
    setNotice(
      `Delivery worker sent ${summary.alertsDelivered} alerts (${summary.channelDeliveries.email} email, ${summary.channelDeliveries.inApp} in-app, ${summary.channelDeliveries.push} push).`
    );
  }

  async function handleRunPipelineAutomation(input: {
    applyLimit: number;
    rebalanceLimit: number;
    scope?: DeliveryScope;
  }) {
    if (!canEmployerActions) {
      setNotice("Sign in as an employer account to run pipeline automation.");
      return;
    }

    const scope = input.scope ?? "self";
    if (scope === "all" && userRole !== "ADMIN") {
      setNotice("Only admin can run global pipeline automation.");
      return;
    }

    setPipelineBusy(true);
    const response = await fetch("/api/pipeline/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        applyLimit: input.applyLimit,
        rebalanceLimit: input.rebalanceLimit
      })
    }).finally(() => {
      setPipelineBusy(false);
    });

    if (!response.ok) {
      setNotice("Could not run pipeline automation.");
      return;
    }

    const payload = (await response.json()) as {
      result: PipelineAutomationRunResult;
      snapshot: PipelineAutomationSnapshot;
    };

    setPipeline(payload.snapshot);
    const [apps, interviewList, nextAnalytics] = await Promise.all([
      fetchJson<Application[]>("/api/applications"),
      fetchJson<Interview[]>("/api/interviews"),
      fetchJson<EmployerAnalytics>("/api/analytics")
    ]);
    setApplications(apps);
    setInterviews(interviewList);
    setAnalytics(nextAnalytics);

    setNotice(
      `Pipeline automation applied ${payload.result.appliedStatusUpdates} stage updates and moved ${payload.result.movedInterviews} interviews.`
    );
  }

  async function handleRefreshIntegrationOps() {
    if (!canEmployerActions) {
      setNotice("Sign in as an employer account to access integration operations.");
      return;
    }

    await Promise.all([
      refreshIntegrationActivity().catch(() => undefined),
      refreshSystemStatus().catch(() => undefined),
      refreshIntegrationAudit().catch(() => undefined),
      refreshMarketIntel().catch(() => undefined),
      refreshReliability().catch(() => undefined),
      refreshSecurityBacklog().catch(() => undefined),
      refreshMonetization().catch(() => undefined)
    ]);
    setNotice("Integration operations snapshot refreshed.");
  }

  async function handleRetryFailedWebhooks() {
    if (userRole !== "ADMIN") {
      setNotice("Only admin can retry failed webhooks.");
      return;
    }

    setRetryBusy(true);
    const response = await fetch("/api/integrations/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 15 })
    }).finally(() => {
      setRetryBusy(false);
    });

    if (!response.ok) {
      setNotice("Could not retry failed webhooks.");
      return;
    }

    const summary = (await response.json()) as IntegrationRetrySummary;
    setRetrySummary(summary);

    await Promise.all([
      refreshIntegrationActivity().catch(() => undefined),
      refreshIntegrationAudit().catch(() => undefined),
      refreshSystemStatus().catch(() => undefined)
    ]);

    setNotice(
      `Retried ${summary.retried} webhooks (${summary.delivered} delivered, ${summary.failed} failed, ${summary.skipped} skipped).`
    );
  }

  async function handleImportJobsCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEmployerActions) {
      setNotice("Sign in as an employer account to import listings.");
      return;
    }

    if (!importCsv.trim()) {
      setNotice("Paste CSV rows before running an import.");
      return;
    }

    setImportBusy(true);
    const response = await fetch("/api/integrations/jobs/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: importSource,
        format: "csv",
        dryRun: importDryRun,
        csv: importCsv
      })
    }).finally(() => {
      setImportBusy(false);
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setNotice(payload.error ?? "Could not import external listings.");
      return;
    }

    const summary = (await response.json()) as ExternalJobImportSummary;
    setLastImportSummary(summary);

    if (!summary.dryRun && (summary.created > 0 || summary.updated > 0)) {
      const [latestJobs] = await Promise.all([
        fetchJson<Job[]>("/api/jobs"),
        refreshEmployerWorkspaceSignals(),
        refreshIntegrationActivity().catch(() => undefined),
        refreshIntegrationAudit().catch(() => undefined),
        refreshSystemStatus().catch(() => undefined)
      ]);
      setJobs(latestJobs);
    }

    setNotice(
      `${summary.dryRun ? "Dry run" : "Import"}: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed.`
    );
  }

  async function handlePublishJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEmployerActions) {
      setNotice("Sign in as an employer account to post jobs.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const title = toStringValue(formData.get("title"));
    const company = toStringValue(formData.get("company"));
    const location = toStringValue(formData.get("location"));
    const modeValue = toStringValue(formData.get("mode"));
    const salary = toStringValue(formData.get("salary"));
    const tagsRaw = toStringValue(formData.get("tags"));
    const requiredScreenersRaw = toStringValue(formData.get("requiredScreeners"));
    const preferredScreenersRaw = toStringValue(formData.get("preferredScreeners"));
    const requiredSkillsRaw = toStringValue(formData.get("requiredSkills"));
    const preferredSkillsRaw = toStringValue(formData.get("preferredSkills"));
    const sponsorTier = toStringValue(formData.get("sponsorTier"));
    const sponsored = formData.get("sponsored") === "on";
    const featuredEmployer = formData.get("featuredEmployer") === "on";
    const paywallTier = toStringValue(formData.get("paywallTier"));
    const meritFit = Number(toStringValue(formData.get("score")));

    if (!title || !company || !location || !salary || !tagsRaw || !Number.isFinite(meritFit)) {
      setNotice("Please fill in every job posting field.");
      return;
    }

    if (modeValue !== "remote" && modeValue !== "hybrid" && modeValue !== "onsite") {
      setNotice("Invalid work mode selected.");
      return;
    }

    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        company,
        location,
        mode: modeValue,
        salary,
        meritFit,
        evidence: "Newly posted role awaiting first applicant signals.",
        tags: tagsRaw
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        requiredScreeners: requiredScreenersRaw,
        preferredScreeners: preferredScreenersRaw,
        requiredSkills: requiredSkillsRaw || tagsRaw,
        preferredSkills: preferredSkillsRaw,
        sponsorTier,
        sponsored,
        featuredEmployer,
        paywallTier
      })
    });

    if (response.status === 401 || response.status === 403) {
      setNotice("Sign in as an employer account to post jobs.");
      return;
    }

    if (!response.ok) {
      setNotice("Could not publish this job.");
      return;
    }

    const created = (await response.json()) as Job;
    setJobs((current) => [created, ...current]);
    const moderationRes = await fetchJson<ModerationItem[]>("/api/moderation");
    await refreshEmployerWorkspaceSignals();
    setModeration(moderationRes);
    setNotice("Job published and sent to moderation review.");
    form.reset();
  }

  async function handleMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "authenticated") {
      setNotice("Sign in to send messages.");
      return;
    }

    const text = messageDraft.trim();
    if (!text || !activeConversationId) return;

    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: activeConversationId,
        text
      })
    });

    if (response.status === 401) {
      setNotice("Sign in to send messages.");
      return;
    }

    if (!response.ok) {
      setNotice("Could not send message.");
      return;
    }

    const updated = (await response.json()) as Conversation;
    setConversations((current) =>
      current.map((conversation) => (conversation.id === updated.id ? updated : conversation))
    );
    setMessageDraft("");
    typingPingAtRef.current = 0;
    typingConversationRef.current = activeConversationId;
    if (activeConversationId) {
      void pushPresenceUpdate({
        conversationId: activeConversationId,
        typing: false,
        seen: true
      });
    }
  }

  function handleMessageDraftChange(nextValue: string) {
    setMessageDraft(nextValue);

    if (status !== "authenticated" || !activeConversationId) return;

    if (!nextValue.trim()) {
      typingPingAtRef.current = 0;
      typingConversationRef.current = activeConversationId;
      void pushPresenceUpdate({
        conversationId: activeConversationId,
        typing: false
      });
      return;
    }

    const now = Date.now();
    const shouldPing =
      typingConversationRef.current !== activeConversationId || now - typingPingAtRef.current > 2500;

    if (shouldPing) {
      typingPingAtRef.current = now;
      typingConversationRef.current = activeConversationId;
      void pushPresenceUpdate({
        conversationId: activeConversationId,
        typing: true
      });
    }
  }

  async function handleScheduleInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEmployerActions) {
      setNotice("Sign in as an employer account to schedule interviews.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    const person = toStringValue(formData.get("person"));
    const owner = toStringValue(formData.get("owner"));
    const time = toStringValue(formData.get("time"));
    const type = toStringValue(formData.get("type"));

    if (!person || !owner || !time || !type) {
      setNotice("Interview scheduling requires all fields.");
      return;
    }

    if (type !== "video" && type !== "onsite" && type !== "phone") {
      setNotice("Invalid interview type.");
      return;
    }

    const response = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person, owner, time, type })
    });

    if (response.status === 401 || response.status === 403) {
      setNotice("Sign in as an employer account to schedule interviews.");
      return;
    }

    if (!response.ok) {
      setNotice("Could not schedule interview.");
      return;
    }

    const record = (await response.json()) as Interview;
    setInterviews((current) => [...current, record]);
    void refreshPipelineSnapshot().catch(() => undefined);
    void refreshEmployerAnalytics().catch(() => undefined);
    setNotice("Interview scheduled.");
    form.reset();
  }

  async function handleModeration(itemId: number, action: ModerationAction) {
    if (!canEmployerActions) {
      setNotice("Sign in as an employer account to moderate.");
      return;
    }

    const response = await fetch("/api/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, action })
    });

    if (response.status === 401 || response.status === 403) {
      setNotice("Sign in as an employer account to moderate.");
      return;
    }

    if (!response.ok) {
      setNotice("Could not process moderation action.");
      return;
    }

    const updated = (await response.json()) as ModerationItem;
    setModeration((current) =>
      current.map((item) => (item.id === updated.id ? { ...item, status: updated.status } : item))
    );
  }

  return (
    <>
      <div className="bg-shape bg-shape-1" aria-hidden="true" />
      <div className="bg-shape bg-shape-2" aria-hidden="true" />
      <div className="bg-shape bg-shape-3" aria-hidden="true" />

      <div className="shell">
        <header className="topbar">
          <a className="brand" href="#">
            <span className="brand-dot" />
            Faypath
          </a>
          <nav className="topnav" aria-label="Primary">
            <a href="#discover">Discover</a>
            <a href="#workspace">Workspace</a>
            <a href="#messages">Messages</a>
            <a href="#moderation">Moderation</a>
          </nav>
          <div className="auth-pill">
            {status === "authenticated" ? (
              <>
                <span>{session.user.email}</span>
                <button
                  type="button"
                  className="ghost-btn compact-btn"
                  onClick={() => void signOut({ callbackUrl: "/" })}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <span>Mixed auth</span>
                <Link href="/sign-in" className="ghost-btn compact-btn">
                  Email
                </Link>
                <button
                  type="button"
                  className="ghost-btn compact-btn"
                  onClick={() => void signIn("google")}
                >
                  Google
                </button>
                <button
                  type="button"
                  className="ghost-btn compact-btn"
                  onClick={() => void signIn("linkedin")}
                >
                  LinkedIn
                </button>
              </>
            )}
          </div>
        </header>

        <section className="hero" id="discover">
          <p className="eyebrow">US-only launch | Merit-based hiring</p>
          <h1>A hiring network built on verified outcomes.</h1>
          <p className="lead">
            This Next.js build combines Indeed-style job discovery with LinkedIn-style professional
            reputation, then ranks matches by measurable ability and proof of work.
          </p>

          <div className="role-switch" role="tablist" aria-label="Role mode">
            <button
              type="button"
              className={`switch-btn ${activeRole === "candidate" ? "active" : ""}`}
              onClick={() => setActiveRole("candidate")}
            >
              Candidate View
            </button>
            <button
              type="button"
              className={`switch-btn ${activeRole === "employer" ? "active" : ""}`}
              onClick={() => setActiveRole("employer")}
            >
              Employer View
            </button>
          </div>

          <form className="search-shell" onSubmit={(event) => event.preventDefault()}>
            <label className="field">
              <span>Role or skill</span>
              <input
                type="text"
                placeholder="Product Designer, React, Operations..."
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Work mode</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as FilterMode)}>
                <option value="all">All modes</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </label>
            <label className="field">
              <span>Minimum merit score</span>
              <input
                type="range"
                min={55}
                max={95}
                value={score}
                onChange={(event) => setScore(Number(event.target.value))}
              />
              <output>{score}</output>
            </label>
            <button className="primary-btn" type="submit">
              Find Matches
            </button>
          </form>
        </section>

        <section className="signal-grid">
          <article className="signal-card">
            <h2>Default Merit Formula</h2>
            <p>40% work outcomes + 35% assessments + 25% trust signals.</p>
          </article>
          <article className="signal-card">
            <h2>Evidence Sources</h2>
            <p>Portfolio results, challenge tasks, references, and certifications.</p>
          </article>
          <article className="signal-card">
            <h2>Role Coverage</h2>
            <p>Candidate and employer dashboards with shared messaging.</p>
          </article>
        </section>

        {notice ? <p className="notice">{notice}</p> : null}
        {loading ? <p className="notice">Loading workspace data...</p> : null}

        <section className="panel" id="jobs">
          <div className="panel-head">
            <h2>Open Roles</h2>
            <p>{filteredJobs.length} roles ranked by merit fit</p>
          </div>
          <div className="job-list" aria-live="polite">
            {filteredJobs.length ? (
              filteredJobs.map((job) => (
                <article className="job-card" key={job.id}>
                  <div className="job-main">
                    <div>
                      <h3>{job.title}</h3>
                      <p className="job-meta">
                        <span>{job.company}</span>
                        <span>{job.location}</span>
                        <span>{job.salary}</span>
                      </p>
                    </div>
                    <span className="score-pill">Merit Fit {job.meritFit}</span>
                  </div>
                  <div className="tag-row">
                    {job.sponsored ? <span className="pill-light">Sponsored ({job.sponsorTier})</span> : null}
                    {job.featuredEmployer ? <span className="pill-light">Featured employer</span> : null}
                    {job.paywallTier === "advanced" ? <span className="pill-light">Advanced analytics</span> : null}
                  </div>
                  <div className="tag-row">
                    {job.tags.map((tag) => (
                      <span className="tag" key={`${job.id}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  {job.requiredScreeners.length ? (
                    <p className="meta-copy">
                      Required screeners: {job.requiredScreeners.slice(0, 2).join(" | ")}
                      {job.requiredScreeners.length > 2 ? " | ..." : ""}
                    </p>
                  ) : null}
                  <div className="job-actions">
                    <span className="evidence">{job.evidence}</span>
                    <button className="ghost-btn" type="button" onClick={() => void handleApply(job.id)}>
                      {roleActionLabel}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <article className="job-card">
                <h3>No direct matches yet</h3>
                <p className="meta-copy">Try lowering the score threshold or broadening the keyword.</p>
              </article>
            )}
          </div>
        </section>

        <section className="panel" id="talent">
          <div className="panel-head">
            <h2>Top Talent</h2>
            <p>Shortlist-ready candidates with verified outcomes.</p>
          </div>
          <div className="talent-grid">
            {talent.map((person) => (
              <article className="talent-card" key={person.id}>
                <div className="card-row">
                  <div>
                    <h3>{person.name}</h3>
                    <p className="meta-copy">{person.role}</p>
                  </div>
                  <span className="score-pill">Score {person.merit}</span>
                </div>
                <p>{person.summary}</p>
                <ul className="talent-metrics">
                  <li>Assessment: {person.assessment}</li>
                  <li>Trust index: {person.trust}</li>
                </ul>
                <div className="job-actions">
                  <span className="pill-light">Merit-first profile</span>
                  <button className="ghost-btn" type="button" onClick={() => handleTalentAction(person.id)}>
                    {activeRole === "employer" && shortlist.includes(person.id)
                      ? "Shortlisted"
                      : talentActionLabel}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" id="workspace">
          <div className="panel-head">
            <h2>Workspace</h2>
            <p>Role-aware workflows for hiring and applications.</p>
          </div>

          <div className="workspace-grid">
            {activeRole === "candidate" ? (
              <>
                <article className="workspace-card">
                  <h3>Your Applications</h3>
                  <p className="card-sub">Track status and interview progress.</p>
                  <div className="stack-list">
                    {sortedApplications.length ? (
                      sortedApplications.map((application) => {
                        const job = jobs.find((entry) => entry.id === application.jobId);
                        return (
                          <article className="list-card" key={application.id}>
                            <div className="card-row">
                              <div>
                                <h3>{job?.title ?? "Unknown role"}</h3>
                                <p className="meta-copy">
                                  {job?.company ?? "Unknown company"} | {job?.location ?? "US"}
                                </p>
                              </div>
                              <div className="pill-stack">
                                <span className="status-pill">
                                  {application.status} | Rank {application.autoRankScore}
                                </span>
                                <span
                                  className={`pill-light ${
                                    application.riskScore >= 70
                                      ? "health-fail"
                                      : application.riskScore >= 45
                                        ? "health-warn"
                                        : "health-pass"
                                  }`}
                                >
                                  Risk {application.riskScore}
                                </span>
                              </div>
                            </div>
                            <p className="meta-copy">Applied: {formatDate(application.appliedAt)}</p>
                            <p className="meta-copy">{application.matchExplanation}</p>
                            {application.missingSkills.length ? (
                              <p className="meta-copy">
                                Missing skills: {application.missingSkills.join(", ")}
                              </p>
                            ) : null}
                            {application.profileFixSuggestions.length ? (
                              <p className="meta-copy">
                                Suggested fixes: {application.profileFixSuggestions.join(" | ")}
                              </p>
                            ) : null}
                            {application.needsManualReview ? (
                              <p className="meta-copy">Flagged for manual review before progression.</p>
                            ) : null}
                          </article>
                        );
                      })
                    ) : (
                      <article className="list-card">
                        <h3>No applications yet</h3>
                        <p className="meta-copy">Apply to a role to start your pipeline.</p>
                      </article>
                    )}
                  </div>
                </article>

                <article className="workspace-card">
                  <h3>Saved Searches</h3>
                  <p className="card-sub">Create persistent filters and keep email alerts on if wanted.</p>
                  <form className="post-form" onSubmit={(event) => void handleSaveSearch(event)}>
                    <input type="text" name="label" placeholder="Label (e.g., Remote Frontend Roles)" required />
                    <input
                      type="text"
                      name="keyword"
                      placeholder="Keyword(s): React, product, analytics..."
                      defaultValue={keyword}
                      required
                    />
                    <div className="inline-fields">
                      <select name="mode" defaultValue={mode}>
                        <option value="all">All modes</option>
                        <option value="remote">Remote</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="onsite">On-site</option>
                      </select>
                      <input
                        type="number"
                        name="minScore"
                        min={55}
                        max={99}
                        defaultValue={score}
                        required
                      />
                    </div>
                    <div className="inline-fields">
                      <select name="digestCadence" defaultValue="daily">
                        <option value="instant">Instant alerts</option>
                        <option value="daily">Daily digest</option>
                        <option value="weekly">Weekly digest</option>
                      </select>
                      <input type="number" name="digestHour" min={0} max={23} defaultValue={9} required />
                    </div>
                    <input
                      type="text"
                      name="timezone"
                      placeholder="Timezone (e.g., America/New_York)"
                      defaultValue="America/New_York"
                      required
                    />
                    <label className="toggle-row">
                      <input type="checkbox" name="emailEnabled" defaultChecked />
                      <span>Email me when matching jobs appear</span>
                    </label>
                    <label className="toggle-row">
                      <input type="checkbox" name="inAppEnabled" defaultChecked />
                      <span>Enable in-app alerts</span>
                    </label>
                    <label className="toggle-row">
                      <input type="checkbox" name="pushEnabled" />
                      <span>Enable push alerts</span>
                    </label>
                    <label className="toggle-row">
                      <input type="checkbox" name="pushDeferred" defaultChecked />
                      <span>Push later (deferred queue)</span>
                    </label>
                    <button type="submit" className="primary-btn wide-btn">
                      Save Search
                    </button>
                  </form>
                  <div className="stack-list">
                    {savedSearches.length ? (
                      savedSearches.map((search) => (
                        <article className="list-card" key={search.id}>
                          <div className="card-row">
                            <div>
                              <h3>{search.label}</h3>
                              <p className="meta-copy">
                                {search.keyword} | {search.mode} | score {search.minScore}+
                              </p>
                              <p className="meta-copy">
                                Digest: {search.digestCadence} @ {search.digestHour}:00
                                {search.lastDigestAt ? ` | last sent ${formatDate(search.lastDigestAt)}` : ""}
                              </p>
                              <p className="meta-copy">
                                Channels: email {search.emailEnabled ? "on" : "off"} | in-app{" "}
                                {search.inAppEnabled ? "on" : "off"} | push{" "}
                                {search.pushEnabled ? (search.pushDeferred ? "deferred" : "instant") : "off"}
                              </p>
                            </div>
                            <span className="pill-light">{search.emailEnabled ? "Email on" : "Email off"}</span>
                          </div>
                          <div className="moderation-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => void handleSavedSearchCadenceCycle(search)}
                            >
                              {search.digestCadence === "instant"
                                ? "Set Daily"
                                : search.digestCadence === "daily"
                                  ? "Set Weekly"
                                  : "Set Instant"}
                            </button>
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() =>
                                void handleSavedSearchEmailToggle(search.id, !search.emailEnabled)
                              }
                            >
                              {search.emailEnabled ? "Pause Email" : "Enable Email"}
                            </button>
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() =>
                                void handleSavedSearchInAppToggle(search.id, !search.inAppEnabled)
                              }
                            >
                              {search.inAppEnabled ? "Pause In-App" : "Enable In-App"}
                            </button>
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() =>
                                void handleSavedSearchPushToggle(search.id, !search.pushEnabled)
                              }
                            >
                              {search.pushEnabled ? "Pause Push" : "Enable Push"}
                            </button>
                            {search.pushEnabled ? (
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() =>
                                  void handleSavedSearchPushDeferredToggle(search.id, !search.pushDeferred)
                                }
                              >
                                {search.pushDeferred ? "Push Immediate" : "Push Deferred"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => void handleSavedSearchDelete(search.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No saved searches yet</h3>
                        <p className="meta-copy">Save one to start auto-generating job alerts.</p>
                      </article>
                    )}
                  </div>
                </article>

                <article className="workspace-card">
                  <div className="card-row">
                    <div>
                      <h3>Job Alerts</h3>
                      <p className="card-sub">
                        Unread: {unreadAlerts} | Pending email: {pendingEmailAlerts} | in-app:{" "}
                        {pendingInAppAlerts} | push: {pendingPushAlerts}
                      </p>
                    </div>
                  </div>
                  <div className="moderation-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void handleAlertsReadAll()}
                      disabled={unreadAlerts === 0}
                    >
                      Mark All Read
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void handleRunDeliveryWorker("self")}
                      disabled={deliveryBusy}
                    >
                      {deliveryBusy ? "Running..." : "Run Worker"}
                    </button>
                    {userRole === "ADMIN" ? (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void handleRunDeliveryWorker("all")}
                        disabled={deliveryBusy}
                      >
                        {deliveryBusy ? "Running..." : "Run Global Worker"}
                      </button>
                    ) : null}
                  </div>
                  {deliveryPreview ? (
                    <p className="meta-copy">
                      Queue now: {deliveryPreview.pendingAlerts} pending alerts | email{" "}
                      {deliveryPreview.pendingEmailAlerts} | in-app {deliveryPreview.pendingInAppAlerts} | push{" "}
                      {deliveryPreview.pendingPushAlerts}. Instant queue: {deliveryPreview.pendingInstantAlerts}. Due digests:{" "}
                      {deliveryPreview.dueDigestSearches}, waiting digests:{" "}
                      {deliveryPreview.waitingDigestSearches}.
                    </p>
                  ) : null}
                  <div className="stack-list">
                    {jobAlerts.length ? (
                      jobAlerts.map((alert) => (
                        <article
                          className={`list-card ${alert.readAt ? "" : "alert-unread"}`}
                          key={alert.id}
                        >
                          <div className="card-row">
                            <div>
                              <h3>{alert.job.title}</h3>
                              <p className="meta-copy">
                                {alert.job.company} | {alert.job.location} | {alert.job.salary}
                              </p>
                            </div>
                            <span className="score-pill">Fit {alert.job.meritFit}</span>
                          </div>
                          <p className="meta-copy">{alert.reason}</p>
                          <p className="meta-copy">
                            Search: {alert.searchLabel} | Email {alert.emailEnabled ? "on" : "off"} | In-app{" "}
                            {alert.inAppEnabled ? "on" : "off"} | Push {alert.pushEnabled ? "on" : "off"}
                          </p>
                          <p className="meta-copy">Created: {formatDate(alert.createdAt)}</p>
                          {!alert.readAt ? (
                            <div className="moderation-actions">
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => void handleAlertRead(alert.id)}
                              >
                                Mark Read
                              </button>
                            </div>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No alerts yet</h3>
                        <p className="meta-copy">Create a saved search to begin tracking matches.</p>
                      </article>
                    )}
                  </div>
                </article>
              </>
            ) : (
              <>
                <article className="workspace-card">
                  <h3>Post a Job</h3>
                  <p className="card-sub">
                    Create US-based roles, add required/preferred screeners, and set monetization controls.
                  </p>
                  <form className="post-form" onSubmit={(event) => void handlePublishJob(event)}>
                    <input type="text" name="title" placeholder="Job title" required />
                    <input type="text" name="company" placeholder="Company" required />
                    <input
                      type="text"
                      name="location"
                      placeholder="Location (US city/state)"
                      required
                    />
                    <div className="inline-fields">
                      <select name="mode" defaultValue="remote">
                        <option value="remote">Remote</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="onsite">On-site</option>
                      </select>
                      <input type="text" name="salary" placeholder="Salary range" required />
                    </div>
                    <input type="text" name="tags" placeholder="Tags (comma separated)" required />
                    <input
                      type="text"
                      name="requiredSkills"
                      placeholder="Required skills (comma separated)"
                    />
                    <input
                      type="text"
                      name="preferredSkills"
                      placeholder="Preferred skills (comma separated)"
                    />
                    <textarea
                      name="requiredScreeners"
                      placeholder="Required screener prompts (comma, pipe, or newline separated)"
                    />
                    <textarea
                      name="preferredScreeners"
                      placeholder="Preferred screener prompts (comma, pipe, or newline separated)"
                    />
                    <div className="inline-fields">
                      <select name="sponsorTier" defaultValue="none">
                        <option value="none">No sponsorship</option>
                        <option value="boost">Sponsored boost</option>
                        <option value="premium">Premium sponsor</option>
                      </select>
                      <select name="paywallTier" defaultValue="free">
                        <option value="free">Free analytics tier</option>
                        <option value="advanced">Advanced analytics tier</option>
                      </select>
                    </div>
                    <label className="toggle-row">
                      <input type="checkbox" name="sponsored" />
                      <span>Mark as sponsored listing</span>
                    </label>
                    <label className="toggle-row">
                      <input type="checkbox" name="featuredEmployer" />
                      <span>Feature employer profile</span>
                    </label>
                    <input type="number" name="score" min={55} max={99} defaultValue={75} required />
                    <button type="submit" className="primary-btn wide-btn">
                      Publish Job
                    </button>
                  </form>
                </article>

                <article className="workspace-card">
                  <h3>Candidate Shortlist</h3>
                  <p className="card-sub">Prioritized by merit score and role fit.</p>
                  <div className="stack-list">
                    {shortlist.length ? (
                      shortlist.map((profileId) => {
                        const person = talent.find((entry) => entry.id === profileId);
                        if (!person) return null;
                        return (
                          <article className="list-card" key={person.id}>
                            <div className="card-row">
                              <div>
                                <h3>{person.name}</h3>
                                <p className="meta-copy">{person.role}</p>
                              </div>
                              <span className="score-pill">Score {person.merit}</span>
                            </div>
                            <p className="meta-copy">{person.summary}</p>
                            <div className="moderation-actions">
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => void handleShortlistRemove(person.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <article className="list-card">
                        <h3>No candidates shortlisted</h3>
                        <p className="meta-copy">Use Add to Shortlist on talent cards.</p>
                      </article>
                    )}
                  </div>
                </article>

                <article className="workspace-card">
                  <h3>Pipeline Automation</h3>
                  <p className="card-sub">Auto-stage recommendations and interviewer load balancing.</p>
                  <p className="meta-copy">
                    {pipeline.totals.recommendations} recommendations across {pipeline.totals.applications}{" "}
                    applications | {pipeline.rebalanceSuggestions.length} rebalance opportunities.
                  </p>
                  <div className="moderation-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={pipelineBusy}
                      onClick={() =>
                        void handleRunPipelineAutomation({
                          applyLimit: 3,
                          rebalanceLimit: 0
                        })
                      }
                    >
                      {pipelineBusy ? "Running..." : "Apply Top 3 Stages"}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={pipelineBusy}
                      onClick={() =>
                        void handleRunPipelineAutomation({
                          applyLimit: 0,
                          rebalanceLimit: 2
                        })
                      }
                    >
                      {pipelineBusy ? "Running..." : "Rebalance 2 Interviews"}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={pipelineBusy}
                      onClick={() =>
                        void handleRunPipelineAutomation({
                          applyLimit: 3,
                          rebalanceLimit: 2
                        })
                      }
                    >
                      {pipelineBusy ? "Running..." : "Run Combined"}
                    </button>
                    {userRole === "ADMIN" ? (
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={pipelineBusy}
                        onClick={() =>
                          void handleRunPipelineAutomation({
                            applyLimit: 5,
                            rebalanceLimit: 4,
                            scope: "all"
                          })
                        }
                      >
                        {pipelineBusy ? "Running..." : "Run Global"}
                      </button>
                    ) : null}
                  </div>
                  <div className="stack-list">
                    {topPipelineRecommendations.length ? (
                      topPipelineRecommendations.map((recommendation) => (
                        <article className="list-card" key={recommendation.applicationId}>
                          <div className="card-row">
                            <div>
                              <h3>{recommendation.jobTitle}</h3>
                              <p className="meta-copy">
                                {recommendation.company} | {recommendation.candidateEmail}
                              </p>
                            </div>
                            <span className="pill-light">{recommendation.priority.toUpperCase()}</span>
                          </div>
                          <p className="meta-copy">
                            {recommendation.currentStatus} → {recommendation.recommendedStatus}
                          </p>
                          <p className="meta-copy">{recommendation.reason}</p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No stage recommendations right now</h3>
                        <p className="meta-copy">Pipeline automation updates as applications age.</p>
                      </article>
                    )}
                  </div>
                  <div className="stack-list">
                    {loadStats.length ? (
                      loadStats.map((load) => (
                        <article className="list-card" key={load.owner}>
                          <div className="card-row">
                            <h3>{load.owner}</h3>
                            <span className="pill-light">
                              {load.scheduled} scheduled | {load.loadLevel}
                            </span>
                          </div>
                          <p className="meta-copy">
                            Next interview: {load.nextInterviewAt ? formatDate(load.nextInterviewAt) : "None"}
                          </p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No upcoming interviews</h3>
                        <p className="meta-copy">Load balancing will appear once interviews are scheduled.</p>
                      </article>
                    )}
                  </div>
                  <div className="stack-list">
                    {rebalanceSuggestions.length ? (
                      rebalanceSuggestions.map((suggestion) => (
                        <article className="list-card" key={suggestion.interviewId}>
                          <div className="card-row">
                            <div>
                              <h3>{suggestion.person}</h3>
                              <p className="meta-copy">{formatDate(suggestion.time)}</p>
                            </div>
                            <span className="pill-light">
                              {suggestion.currentOwner} → {suggestion.suggestedOwner}
                            </span>
                          </div>
                          <p className="meta-copy">{suggestion.reason}</p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No rebalance actions suggested</h3>
                        <p className="meta-copy">Interviewer load is currently balanced.</p>
                      </article>
                    )}
                  </div>
                </article>

                <article className="workspace-card">
                  <h3>Employer Analytics</h3>
                  <p className="card-sub">
                    Live pipeline metrics for your posted roles.
                    {analytics.advancedEnabled ? " Advanced analytics unlocked." : " Advanced analytics are paywalled."}
                  </p>
                  <div className="analytics-grid">
                    <article className="signal-card">
                      <h2>{analytics.totalJobs}</h2>
                      <p>Jobs in scope</p>
                    </article>
                    <article className="signal-card">
                      <h2>{analytics.totalApplications}</h2>
                      <p>Total applications</p>
                    </article>
                    <article className="signal-card">
                      <h2>{analytics.avgMeritFit}</h2>
                      <p>Average merit fit</p>
                    </article>
                    <article className="signal-card">
                      <h2>{analytics.shortlistCount}</h2>
                      <p>Shortlist entries</p>
                    </article>
                    <article className="signal-card">
                      <h2>{analytics.interviewsScheduled}</h2>
                      <p>Interviews scheduled</p>
                    </article>
                    <article className="signal-card">
                      <h2>{analytics.sponsoredJobs}</h2>
                      <p>Sponsored jobs</p>
                    </article>
                    <article className="signal-card">
                      <h2>{analytics.featuredEmployers}</h2>
                      <p>Featured employer profiles</p>
                    </article>
                  </div>
                  {!analytics.advancedEnabled ? (
                    <p className="meta-copy">
                      {analytics.paywallReason ?? "Upgrade your plan to unlock top roles and status drilldowns."}
                    </p>
                  ) : null}
                  <div className="stack-list">
                    {analytics.topRoles.length ? (
                      analytics.topRoles.map((role) => (
                        <article className="list-card" key={role.jobId}>
                          <div className="card-row">
                            <div>
                              <h3>{role.title}</h3>
                              <p className="meta-copy">{role.company}</p>
                            </div>
                            <span className="score-pill">{role.applications} applicants</span>
                          </div>
                          <p className="meta-copy">
                            Merit fit baseline: {role.meritFit} | Avg auto-rank: {role.avgRankScore}
                          </p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>{analytics.advancedEnabled ? "No role analytics yet" : "Advanced role analytics locked"}</h3>
                        <p className="meta-copy">
                          {analytics.advancedEnabled
                            ? "Post jobs to start building funnel data."
                            : "Upgrade to Pro/Growth to unlock role-level ranking insights."}
                        </p>
                      </article>
                    )}
                  </div>
                  <div className="stack-list">
                    {analytics.statusBreakdown.length ? (
                      analytics.statusBreakdown.map((entry) => (
                        <article className="list-card" key={entry.status}>
                          <div className="card-row">
                            <h3>{entry.status}</h3>
                            <span className="pill-light">{entry.count}</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No application states yet</h3>
                        <p className="meta-copy">State breakdown appears after applications arrive.</p>
                      </article>
                    )}
                  </div>
                </article>

                <article className="workspace-card">
                  <h3>Employer Market Intel</h3>
                  <p className="card-sub">
                    Supply/demand, compensation bands, and location talent depth in your hiring scope.
                  </p>
                  <div className="analytics-grid">
                    <article className="signal-card">
                      <h2>{marketIntel.demandIndex}</h2>
                      <p>Demand index</p>
                    </article>
                    <article className="signal-card">
                      <h2>{marketIntel.supplyDemandRatio}</h2>
                      <p>Applicants per opening</p>
                    </article>
                    <article className="signal-card">
                      <h2>{marketIntel.locationDepth.length}</h2>
                      <p>Tracked locations</p>
                    </article>
                  </div>
                  <div className="stack-list">
                    {marketIntel.compBands.length ? (
                      marketIntel.compBands.map((band) => (
                        <article className="list-card" key={band.label}>
                          <div className="card-row">
                            <h3>{band.label}</h3>
                            <span className="pill-light">
                              {band.jobs} jobs | {band.applications} applicants
                            </span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No compensation signals yet</h3>
                        <p className="meta-copy">Publish more jobs to build market compensation intel.</p>
                      </article>
                    )}
                  </div>
                  <div className="stack-list">
                    {marketIntel.locationDepth.length ? (
                      marketIntel.locationDepth.map((entry) => (
                        <article className="list-card" key={entry.location}>
                          <div className="card-row">
                            <h3>{entry.location}</h3>
                            <span className="pill-light">{entry.talentDepth}</span>
                          </div>
                          <p className="meta-copy">
                            Openings: {entry.jobOpenings} | Active applicants: {entry.activeApplicants} | Ratio:{" "}
                            {entry.supplyDemandRatio}
                          </p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No location talent depth yet</h3>
                        <p className="meta-copy">Location depth appears once jobs and applications accumulate.</p>
                      </article>
                    )}
                  </div>
                </article>

                <article className="workspace-card">
                  <h3>Integration Ops</h3>
                  <p className="card-sub">
                    Reliability controls, security hardening backlog, and monetization operations.
                  </p>
                  <p className="meta-copy">
                    Plan: {monetization.plan} | Advanced analytics{" "}
                    {monetization.advancedAnalyticsUnlocked ? "unlocked" : "locked"} | Sponsored jobs:{" "}
                    {monetization.sponsoredJobs} | Featured profiles:{" "}
                    {monetization.featuredEmployerProfiles}
                  </p>
                  {!monetization.advancedAnalyticsUnlocked && monetization.paywalledInsights.length ? (
                    <p className="meta-copy">
                      Paywalled insights: {monetization.paywalledInsights.join(" | ")}
                    </p>
                  ) : null}
                  <form className="post-form" onSubmit={(event) => void handleImportJobsCsv(event)}>
                    <div className="inline-fields">
                      <input
                        type="text"
                        value={importSource}
                        onChange={(event) => setImportSource(event.target.value)}
                        placeholder="Source (e.g., indeed_partner)"
                        required
                      />
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={importDryRun}
                          onChange={(event) => setImportDryRun(event.target.checked)}
                        />
                        <span>Dry run only</span>
                      </label>
                    </div>
                    <textarea
                      value={importCsv}
                      onChange={(event) => setImportCsv(event.target.value)}
                      placeholder={
                        "external_id,title,company,location,mode,salary,merit_fit,evidence,tags,source_url\nID-1,Senior Product Designer,Northbeam Health,\"Austin, TX\",hybrid,$132k-$155k,90,Portfolio outcomes,Figma|Design Systems,https://example.com/jobs/ID-1"
                      }
                    />
                    <button type="submit" className="primary-btn wide-btn" disabled={importBusy}>
                      {importBusy ? "Running Import..." : importDryRun ? "Run CSV Dry Run" : "Import CSV Listings"}
                    </button>
                  </form>
                  {lastImportSummary ? (
                    <p className="meta-copy">
                      Last CSV {lastImportSummary.dryRun ? "dry run" : "import"} ({formatDate(lastImportSummary.runAt)}
                      ): {lastImportSummary.created} created, {lastImportSummary.updated} updated,{" "}
                      {lastImportSummary.skipped} skipped, {lastImportSummary.failed} failed.
                    </p>
                  ) : null}
                  {lastImportSummary?.errors.length ? (
                    <div className="stack-list">
                      {lastImportSummary.errors.slice(0, 3).map((error, index) => (
                        <article className="list-card" key={`${index}-${error}`}>
                          <p className="meta-copy">{error}</p>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  <div className="moderation-actions">
                    <button type="button" className="ghost-btn" onClick={() => void handleRefreshIntegrationOps()}>
                      Refresh Ops
                    </button>
                    {userRole === "ADMIN" ? (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void handleRetryFailedWebhooks()}
                        disabled={retryBusy}
                      >
                        {retryBusy ? "Retrying..." : "Retry Failed Webhooks"}
                      </button>
                    ) : null}
                    <a className="ghost-btn" href={summaryExportCsvHref}>
                      Export Summary CSV
                    </a>
                    <a className="ghost-btn" href={deliveryExportJsonHref}>
                      Export Deliveries JSON
                    </a>
                    {userRole === "ADMIN" ? (
                      <a className="ghost-btn" href={webhookExportCsvHref}>
                        Export Webhooks CSV
                      </a>
                    ) : null}
                  </div>
                  {retrySummary ? (
                    <p className="meta-copy">
                      Last retry {formatDate(retrySummary.runAt)}: retried {retrySummary.retried} (
                      {retrySummary.delivered} delivered, {retrySummary.failed} failed,{" "}
                      {retrySummary.skipped} skipped).
                    </p>
                  ) : null}
                  <p className="meta-copy">
                    {integrationActivity.scope === "none"
                      ? "No integration activity in scope."
                      : `Scope: ${integrationActivity.scope} | Snapshot: ${formatDate(
                          integrationActivity.generatedAt
                        )}`}
                  </p>
                  <div className="analytics-grid">
                    <article className="signal-card">
                      <h2>{integrationActivity.deliveries.total}</h2>
                      <p>Total deliveries</p>
                    </article>
                    <article className="signal-card">
                      <h2>{integrationActivity.deliveries.accepted}</h2>
                      <p>Accepted deliveries</p>
                    </article>
                    <article className="signal-card">
                      <h2>{integrationActivity.deliveries.failed}</h2>
                      <p>Failed deliveries</p>
                    </article>
                    <article className="signal-card">
                      <h2>{integrationActivity.webhooks.total}</h2>
                      <p>Total webhooks</p>
                    </article>
                    <article className="signal-card">
                      <h2>{integrationActivity.webhooks.delivered}</h2>
                      <p>Delivered webhooks</p>
                    </article>
                    <article className="signal-card">
                      <h2>{integrationActivity.webhooks.failed}</h2>
                      <p>Failed webhooks</p>
                    </article>
                    <article className="signal-card">
                      <h2>{integrationActivity.webhooks.blocked}</h2>
                      <p>Blocked webhook attempts</p>
                    </article>
                  </div>
                  <div className="stack-list">
                    {reliability.metrics.length ? (
                      reliability.metrics.map((metric) => (
                        <article className="list-card" key={metric.key}>
                          <div className="card-row">
                            <h3>{metric.label}</h3>
                            <span
                              className={`pill-light ${
                                metric.status === "breach"
                                  ? "health-fail"
                                  : metric.status === "warning"
                                    ? "health-warn"
                                    : "health-pass"
                              }`}
                            >
                              {metric.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="meta-copy">
                            {metric.value}
                            {metric.unit} | {metric.objective}
                          </p>
                          <p className="meta-copy">{metric.detail}</p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No reliability metrics yet</h3>
                        <p className="meta-copy">Metrics populate as webhook and application activity grows.</p>
                      </article>
                    )}
                  </div>
                  <div className="stack-list">
                    <p className="meta-copy">Open high-risk security items: {securityBacklog.highRiskOpen}</p>
                    {securityBacklog.items.length ? (
                      securityBacklog.items.slice(0, 6).map((item) => (
                        <article className="list-card" key={item.id}>
                          <div className="card-row">
                            <h3>{item.title}</h3>
                            <span className="pill-light">
                              {item.severity} | {item.status}
                            </span>
                          </div>
                          <p className="meta-copy">{item.area}</p>
                          <p className="meta-copy">{item.notes}</p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No security backlog items</h3>
                        <p className="meta-copy">Security backlog will appear after initialization.</p>
                      </article>
                    )}
                  </div>
                  <div className="stack-list">
                    {securityBacklog.inventory.length ? (
                      securityBacklog.inventory.slice(0, 6).map((entry) => (
                        <article className="list-card" key={`${entry.method}-${entry.path}`}>
                          <div className="card-row">
                            <h3>
                              {entry.method} {entry.path}
                            </h3>
                            <span className="pill-light">
                              auth {entry.authRequired ? "required" : "open"} | object check{" "}
                              {entry.objectLevelCheck ? "yes" : "no"}
                            </span>
                          </div>
                          <p className="meta-copy">Third-party risk: {entry.thirdPartyRisk}</p>
                          <p className="meta-copy">{entry.notes}</p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No API inventory entries</h3>
                        <p className="meta-copy">Inventory appears once security catalog is seeded.</p>
                      </article>
                    )}
                  </div>
                  {systemStatus ? (
                    <>
                      <div className="card-row">
                        <h3>System Readiness ({systemStatus.overallStatus})</h3>
                        <span className="pill-light">{formatDate(systemStatus.generatedAt)}</span>
                      </div>
                      <div className="analytics-grid">
                        <article className="signal-card">
                          <h2>{systemStatus.counts.users}</h2>
                          <p>Users</p>
                        </article>
                        <article className="signal-card">
                          <h2>{systemStatus.counts.jobs}</h2>
                          <p>Jobs</p>
                        </article>
                        <article className="signal-card">
                          <h2>{systemStatus.counts.applications}</h2>
                          <p>Applications</p>
                        </article>
                        <article className="signal-card">
                          <h2>{systemStatus.counts.pendingAlerts}</h2>
                          <p>Pending alerts</p>
                        </article>
                        <article className="signal-card">
                          <h2>{systemStatus.counts.webhookEvents}</h2>
                          <p>Webhook events</p>
                        </article>
                        <article className="signal-card">
                          <h2>{systemStatus.counts.fraudEvents}</h2>
                          <p>Fraud events (24h)</p>
                        </article>
                        <article className="signal-card">
                          <h2>{systemStatus.counts.securityBacklogItems}</h2>
                          <p>Open security backlog</p>
                        </article>
                      </div>
                      <div className="stack-list">
                        {systemStatus.checks.map((check) => (
                          <article className="list-card" key={check.key}>
                            <div className="card-row">
                              <h3>{check.label}</h3>
                              <span className={`pill-light health-${check.status}`}>
                                {check.status.toUpperCase()}
                              </span>
                            </div>
                            <p className="meta-copy">{check.detail}</p>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <div className="stack-list">
                    {integrationActivity.deliveries.recent.length ? (
                      integrationActivity.deliveries.recent.map((delivery) => (
                        <article className="list-card" key={delivery.id}>
                          <div className="card-row">
                            <div>
                              <h3>{delivery.subject}</h3>
                              <p className="meta-copy">
                                {delivery.kind} | {delivery.channel} | {delivery.recipient}
                              </p>
                            </div>
                            <span className="pill-light">
                              {delivery.provider} | {delivery.accepted ? "accepted" : "failed"}
                            </span>
                          </div>
                          <p className="meta-copy">Delivered: {formatDate(delivery.deliveredAt)}</p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No delivery activity yet</h3>
                        <p className="meta-copy">Run the alert worker to generate delivery logs.</p>
                      </article>
                    )}
                  </div>
                  <div className="stack-list">
                    {integrationActivity.webhooks.recent.length ? (
                      integrationActivity.webhooks.recent.map((event) => (
                        <article className="list-card" key={event.id}>
                          <div className="card-row">
                            <div>
                              <h3>{event.eventType}</h3>
                              <p className="meta-copy">
                                {event.direction} | {event.source} | abuse {event.abuseScore}
                              </p>
                            </div>
                            <span className="pill-light">
                              {event.status}
                              {event.blocked ? " | blocked" : ""}
                              {event.httpStatus ? ` (${event.httpStatus})` : ""}
                            </span>
                          </div>
                          <p className="meta-copy">Received: {formatDate(event.receivedAt)}</p>
                        </article>
                      ))
                    ) : (
                      <article className="list-card">
                        <h3>No webhook activity yet</h3>
                        <p className="meta-copy">Configure a webhook URL to start sending events.</p>
                      </article>
                    )}
                  </div>
                  {userRole === "ADMIN" ? (
                    <div className="stack-list">
                      {integrationAudit.length ? (
                        integrationAudit.map((event) => (
                          <article className="list-card" key={event.id}>
                            <div className="card-row">
                              <div>
                                <h3>
                                  #{event.id} {event.eventType}
                                </h3>
                                <p className="meta-copy">
                                  {event.direction} | {event.source}
                                  {event.deliveryUrl ? ` | ${event.deliveryUrl}` : ""}
                                </p>
                              </div>
                              <span className="pill-light">
                                {event.status}
                                {event.blocked ? " | blocked" : ""}
                                {event.httpStatus ? ` (${event.httpStatus})` : ""}
                              </span>
                            </div>
                            <p className="meta-copy">Abuse score: {event.abuseScore}</p>
                            {event.note ? <p className="meta-copy">{event.note}</p> : null}
                            <p className="meta-copy">
                              Received: {formatDate(event.receivedAt)}
                              {event.processedAt ? ` | Processed: ${formatDate(event.processedAt)}` : ""}
                            </p>
                          </article>
                        ))
                      ) : (
                        <article className="list-card">
                          <h3>No audit events loaded</h3>
                          <p className="meta-copy">Integration audit events will appear after webhook activity.</p>
                        </article>
                      )}
                    </div>
                  ) : null}
                </article>
              </>
            )}
          </div>
        </section>

        <section className="panel messaging" id="messages">
          <div className="panel-head">
            <h2>Messaging</h2>
            <p>Candidate and employer conversations in one inbox.</p>
          </div>
          <div className="messages-shell">
            <aside>
              <h3>Conversations</h3>
              <div className="conversation-list">
                {conversations.map((conversation) => (
                  <button
                    className={`conversation-btn ${
                      activeConversationId === conversation.id ? "active" : ""
                    }`}
                    type="button"
                    key={conversation.id}
                    onClick={() => setActiveConversationId(conversation.id)}
                  >
                    {conversation.title}
                  </button>
                ))}
              </div>
            </aside>
            <div className="thread">
              <h3>{activeConversation?.title ?? "Thread"}</h3>
              <p className="meta-copy">
                {isOtherTyping
                  ? `${otherRoleForMessages === "candidate" ? "Candidate" : "Employer"} is typing...`
                  : seenAt
                    ? `Seen ${formatDate(seenAt)}`
                    : " "}
              </p>
              <div className="thread-log">
                {activeConversation?.messages.map((message) => (
                  <p
                    className={`bubble ${message.role === currentRoleForMessages ? "self" : "other"}`}
                    key={message.id}
                  >
                    {message.text}
                  </p>
                ))}
              </div>
              <form className="message-form" onSubmit={(event) => void handleMessage(event)}>
                <input
                  type="text"
                  placeholder="Type message..."
                  value={messageDraft}
                  onChange={(event) => handleMessageDraftChange(event.target.value)}
                  onBlur={() => {
                    if (!activeConversationId) return;
                    void pushPresenceUpdate({
                      conversationId: activeConversationId,
                      typing: false
                    });
                  }}
                  required
                />
                <button type="submit" className="primary-btn">
                  Send
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="panel scheduler" id="scheduler">
          <div className="panel-head">
            <h2>Interview Scheduling</h2>
            <p>Create and manage upcoming interviews.</p>
          </div>
          <form className="interview-form" onSubmit={(event) => void handleScheduleInterview(event)}>
            <input type="text" name="person" placeholder="Candidate name" required />
            <input type="text" name="owner" placeholder="Interviewer / hiring manager" required />
            <input type="datetime-local" name="time" required />
            <select name="type" defaultValue="video">
              <option value="video">Video</option>
              <option value="onsite">On-site</option>
              <option value="phone">Phone</option>
            </select>
            <button type="submit" className="primary-btn">
              Schedule
            </button>
          </form>
          <div className="stack-list">
            {sortedInterviews.map((interview) => (
              <article className="list-card" key={interview.id}>
                <div className="card-row">
                  <div>
                    <h3>{interview.person}</h3>
                    <p className="meta-copy">With: {interview.owner}</p>
                  </div>
                  <span className="status-pill">{interview.type.toUpperCase()}</span>
                </div>
                <p className="meta-copy">{formatDate(interview.time)}</p>
              </article>
            ))}
          </div>
        </section>

        {activeRole === "employer" ? (
          <section className="panel moderation" id="moderation">
            <div className="panel-head">
              <h2>Admin Moderation Queue</h2>
              <p>Review profile and posting flags before publishing.</p>
            </div>
            <div className="stack-list">
              {pendingModeration.length ? (
                pendingModeration.map((item) => (
                  <article className="list-card" key={item.id}>
                    <div className="card-row">
                      <div>
                        <h3>{item.type}</h3>
                        <p className="meta-copy">{item.target}</p>
                      </div>
                      <span className="pill-light">Pending</span>
                    </div>
                    <p className="meta-copy">{item.reason}</p>
                    <div className="moderation-actions">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void handleModeration(item.id, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void handleModeration(item.id, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <article className="list-card">
                  <h3>Queue clear</h3>
                  <p className="meta-copy">No pending moderation actions right now.</p>
                </article>
              )}
            </div>
          </section>
        ) : null}

        <section className="panel" id="scoring">
          <h2>How Merit Score Works</h2>
          <p className="lead">
            Merit score is your weighted performance score. Default formula: 40% work evidence,
            35% skill assessments, 25% trust signals.
          </p>
        </section>

        <footer className="site-footer">
          <p>Faypath full-stack prototype (Next.js)</p>
          <button className="primary-btn" type="button">
            Request Early Access
          </button>
        </footer>
      </div>
    </>
  );
}
