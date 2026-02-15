export type RoleMode = "candidate" | "employer";
export type WorkMode = "remote" | "hybrid" | "onsite";
export type SavedSearchMode = "all" | WorkMode;
export type DigestCadence = "instant" | "daily" | "weekly";
export type BillingPlan = "free" | "pro" | "growth" | "enterprise";
export type SponsorTier = "none" | "boost" | "premium";
export type AlertChannel = "email" | "in_app" | "push";

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  mode: WorkMode;
  salary: string;
  meritFit: number;
  evidence: string;
  tags: string[];
  requiredScreeners: string[];
  preferredScreeners: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  sponsorTier: SponsorTier;
  sponsored: boolean;
  featuredEmployer: boolean;
  paywallTier: "free" | "advanced";
  marketRegion: string;
}

export interface TalentProfile {
  id: number;
  name: string;
  role: string;
  summary: string;
  merit: number;
  assessment: string;
  trust: string;
}

export interface Application {
  id: number;
  jobId: number;
  status: "Applied" | "Interview" | "Offer" | "Rejected";
  appliedAt: string;
  screenerRequiredPassed: boolean;
  screenerRequiredScore: number;
  screenerPreferredScore: number;
  autoRankScore: number;
  matchExplanation: string;
  missingSkills: string[];
  profileFixSuggestions: string[];
  riskScore: number;
  riskFlags: string[];
  needsManualReview: boolean;
}

export interface ConversationMessage {
  id: number;
  role: RoleMode;
  text: string;
  sentAt: string;
}

export interface ConversationPresenceState {
  role: RoleMode;
  typingUntil: string | null;
  lastSeenAt: string | null;
}

export interface Conversation {
  id: number;
  title: string;
  messages: ConversationMessage[];
  presence: ConversationPresenceState[];
}

export interface Interview {
  id: number;
  person: string;
  owner: string;
  time: string;
  type: "video" | "onsite" | "phone";
}

export interface ModerationItem {
  id: number;
  type: string;
  target: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
}

export interface SavedSearch {
  id: number;
  label: string;
  keyword: string;
  mode: SavedSearchMode;
  minScore: number;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  pushDeferred: boolean;
  timezone: string;
  digestCadence: DigestCadence;
  digestHour: number;
  lastDigestAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobAlert {
  id: number;
  savedSearchId: number;
  searchLabel: string;
  reason: string;
  createdAt: string;
  readAt: string | null;
  emailSentAt: string | null;
  inAppSentAt: string | null;
  pushSentAt: string | null;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  job: Job;
}

export interface AlertFeed {
  alerts: JobAlert[];
  unread: number;
  pendingEmail: number;
  pendingInApp: number;
  pendingPush: number;
}

export interface AlertDeliveryPreview {
  scope: "self" | "all";
  pendingAlerts: number;
  pendingEmailAlerts: number;
  pendingInAppAlerts: number;
  pendingPushAlerts: number;
  pendingInstantAlerts: number;
  dueDigestSearches: number;
  waitingDigestSearches: number;
}

export interface AlertDeliveryRunSummary {
  scope: "self" | "all";
  runAt: string;
  searchesScanned: number;
  attemptedDeliveries: number;
  alertsDelivered: number;
  instantAlertsDelivered: number;
  digestAlertsDelivered: number;
  failedDeliveries: number;
  digestRuns: number;
  logsCreated: number;
  waitingDigestSearches: number;
  channelDeliveries: {
    email: number;
    inApp: number;
    push: number;
  };
}

export interface EmployerAnalyticsStatus {
  status: string;
  count: number;
}

export interface EmployerAnalyticsTopRole {
  jobId: number;
  title: string;
  company: string;
  applications: number;
  meritFit: number;
  avgRankScore: number;
}

export interface EmployerAnalytics {
  scope: "none" | "employer" | "admin";
  advancedEnabled: boolean;
  paywallReason: string | null;
  totalJobs: number;
  totalApplications: number;
  avgMeritFit: number;
  shortlistCount: number;
  interviewsScheduled: number;
  sponsoredJobs: number;
  featuredEmployers: number;
  statusBreakdown: EmployerAnalyticsStatus[];
  topRoles: EmployerAnalyticsTopRole[];
}

export interface PipelineStageRecommendation {
  applicationId: number;
  jobId: number;
  jobTitle: string;
  company: string;
  candidateEmail: string;
  currentStatus: Application["status"];
  recommendedStatus: Application["status"];
  priority: "high" | "medium" | "low";
  confidence: number;
  reason: string;
  appliedAt: string;
}

export interface InterviewLoadStat {
  owner: string;
  scheduled: number;
  nextInterviewAt: string | null;
  loadLevel: "high" | "balanced" | "low";
}

export interface InterviewRebalanceSuggestion {
  interviewId: number;
  person: string;
  currentOwner: string;
  suggestedOwner: string;
  time: string;
  reason: string;
}

export interface PipelineAutomationSnapshot {
  scope: "none" | "employer" | "admin";
  generatedAt: string;
  totals: {
    applications: number;
    recommendations: number;
    scheduledInterviews: number;
  };
  recommendations: PipelineStageRecommendation[];
  loadStats: InterviewLoadStat[];
  rebalanceSuggestions: InterviewRebalanceSuggestion[];
}

export interface PipelineAutomationRunResult {
  scope: "employer" | "admin";
  runAt: string;
  recommendationsConsidered: number;
  rebalanceConsidered: number;
  appliedStatusUpdates: number;
  movedInterviews: number;
}

export interface IntegrationDeliveryRecord {
  id: number;
  kind: "instant" | "digest";
  recipient: string;
  subject: string;
  provider: string;
  accepted: boolean;
  deliveredAt: string;
  channel: AlertChannel;
}

export interface IntegrationWebhookRecord {
  id: number;
  direction: "inbound" | "outbound";
  source: string;
  eventType: string;
  status: string;
  httpStatus: number | null;
  abuseScore: number;
  blocked: boolean;
  receivedAt: string;
  processedAt: string | null;
}

export interface IntegrationActivity {
  scope: "none" | "employer" | "admin";
  generatedAt: string;
  deliveries: {
    total: number;
    accepted: number;
    failed: number;
    recent: IntegrationDeliveryRecord[];
  };
  webhooks: {
    total: number;
    delivered: number;
    failed: number;
    blocked: number;
    recent: IntegrationWebhookRecord[];
  };
}

export interface IntegrationRetrySummary {
  runAt: string;
  requested: number;
  retried: number;
  delivered: number;
  failed: number;
  skipped: number;
  retriedIds: number[];
}

export interface IntegrationAuditEvent {
  id: number;
  direction: "inbound" | "outbound";
  source: string;
  eventType: string;
  status: string;
  httpStatus: number | null;
  abuseScore: number;
  blocked: boolean;
  note: string | null;
  deliveryUrl: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface SystemStatusCheck {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface SystemStatusSnapshot {
  generatedAt: string;
  overallStatus: "ready" | "warning" | "degraded";
  checks: SystemStatusCheck[];
  counts: {
    users: number;
    jobs: number;
    applications: number;
    pendingAlerts: number;
    webhookEvents: number;
    fraudEvents: number;
    securityBacklogItems: number;
  };
}

export interface ExternalJobImportSummary {
  source: string;
  format: "json" | "csv";
  dryRun: boolean;
  runAt: string;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface MarketCompBand {
  label: string;
  minSalary: number;
  maxSalary: number;
  jobs: number;
  applications: number;
}

export interface MarketLocationDepth {
  location: string;
  jobOpenings: number;
  activeApplicants: number;
  talentDepth: "thin" | "balanced" | "deep";
  supplyDemandRatio: number;
}

export interface EmployerMarketIntel {
  generatedAt: string;
  scope: "none" | "employer" | "admin";
  demandIndex: number;
  supplyDemandRatio: number;
  compBands: MarketCompBand[];
  locationDepth: MarketLocationDepth[];
}

export interface SecurityBacklogItem {
  id: number;
  area: string;
  title: string;
  status: string;
  severity: string;
  owner: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiInventoryItem {
  id: number;
  method: string;
  path: string;
  authRequired: boolean;
  objectLevelCheck: boolean;
  thirdPartyRisk: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityBacklogSnapshot {
  generatedAt: string;
  items: SecurityBacklogItem[];
  inventory: ApiInventoryItem[];
  highRiskOpen: number;
}

export interface ReliabilitySloMetric {
  key: string;
  label: string;
  objective: string;
  value: number;
  unit: "%" | "ms" | "hours";
  status: "healthy" | "warning" | "breach";
  detail: string;
}

export interface ReliabilitySloSnapshot {
  generatedAt: string;
  scope: "employer" | "admin";
  metrics: ReliabilitySloMetric[];
}

export interface MonetizationSnapshot {
  plan: BillingPlan;
  advancedAnalyticsUnlocked: boolean;
  sponsoredJobs: number;
  featuredEmployerProfiles: number;
  paywalledInsights: string[];
}

export interface IntegrationReportSummary {
  generatedAt: string;
  scope: "employer" | "admin";
  analytics: EmployerAnalytics;
  pipeline: PipelineAutomationSnapshot;
  deliveryPreview: AlertDeliveryPreview;
}
