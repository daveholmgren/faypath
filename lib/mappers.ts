import { parseUniqueList } from "@/lib/list-codec";
import type {
  Application,
  Conversation,
  ConversationPresenceState,
  DigestCadence,
  Interview,
  JobAlert,
  Job,
  ModerationItem,
  RoleMode,
  SavedSearch,
  TalentProfile
} from "@/lib/types";

export function mapJob(record: {
  id: number;
  title: string;
  company: string;
  location: string;
  mode: string;
  salary: string;
  meritFit: number;
  evidence: string;
  tags: string;
  requiredScreeners: string;
  preferredScreeners: string;
  requiredSkills: string;
  preferredSkills: string;
  sponsorTier: string;
  sponsored: boolean;
  featuredEmployer: boolean;
  paywallTier: string;
  marketRegion: string;
}): Job {
  return {
    id: record.id,
    title: record.title,
    company: record.company,
    location: record.location,
    mode: record.mode as Job["mode"],
    salary: record.salary,
    meritFit: record.meritFit,
    evidence: record.evidence,
    tags: parseUniqueList(record.tags),
    requiredScreeners: parseUniqueList(record.requiredScreeners),
    preferredScreeners: parseUniqueList(record.preferredScreeners),
    requiredSkills: parseUniqueList(record.requiredSkills),
    preferredSkills: parseUniqueList(record.preferredSkills),
    sponsorTier: record.sponsorTier as Job["sponsorTier"],
    sponsored: record.sponsored,
    featuredEmployer: record.featuredEmployer,
    paywallTier: record.paywallTier === "advanced" ? "advanced" : "free",
    marketRegion: record.marketRegion || "US"
  };
}

export function mapTalent(record: TalentProfile): TalentProfile {
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    summary: record.summary,
    merit: record.merit,
    assessment: record.assessment,
    trust: record.trust
  };
}

export function mapApplication(record: {
  id: number;
  jobId: number;
  status: string;
  appliedAt: Date;
  screenerRequiredPassed: boolean;
  screenerRequiredScore: number;
  screenerPreferredScore: number;
  autoRankScore: number;
  matchExplanation: string;
  missingSkills: string;
  profileFixSuggestions: string;
  riskScore: number;
  riskFlags: string;
  needsManualReview: boolean;
}): Application {
  return {
    id: record.id,
    jobId: record.jobId,
    status: record.status as Application["status"],
    appliedAt: record.appliedAt.toISOString(),
    screenerRequiredPassed: record.screenerRequiredPassed,
    screenerRequiredScore: record.screenerRequiredScore,
    screenerPreferredScore: record.screenerPreferredScore,
    autoRankScore: record.autoRankScore,
    matchExplanation: record.matchExplanation,
    missingSkills: parseUniqueList(record.missingSkills),
    profileFixSuggestions: parseUniqueList(record.profileFixSuggestions),
    riskScore: record.riskScore,
    riskFlags: parseUniqueList(record.riskFlags),
    needsManualReview: record.needsManualReview
  };
}

export function mapConversation(record: {
  id: number;
  title: string;
  messages: {
    id: number;
    role: string;
    text: string;
    sentAt: Date;
  }[];
  presence: {
    role: string;
    typingUntil: Date | null;
    lastSeenAt: Date | null;
  }[];
}): Conversation {
  return {
    id: record.id,
    title: record.title,
    messages: record.messages.map((message) => ({
      id: message.id,
      role: message.role as RoleMode,
      text: message.text,
      sentAt: message.sentAt.toISOString()
    })),
    presence: record.presence.map(
      (state): ConversationPresenceState => ({
        role: state.role as RoleMode,
        typingUntil: state.typingUntil ? state.typingUntil.toISOString() : null,
        lastSeenAt: state.lastSeenAt ? state.lastSeenAt.toISOString() : null
      })
    )
  };
}

export function mapInterview(record: {
  id: number;
  person: string;
  owner: string;
  time: Date;
  type: string;
}): Interview {
  return {
    id: record.id,
    person: record.person,
    owner: record.owner,
    time: record.time.toISOString(),
    type: record.type as Interview["type"]
  };
}

export function mapModeration(record: {
  id: number;
  type: string;
  target: string;
  reason: string;
  status: string;
}): ModerationItem {
  return {
    id: record.id,
    type: record.type,
    target: record.target,
    reason: record.reason,
    status: record.status as ModerationItem["status"]
  };
}

export function mapSavedSearch(record: {
  id: number;
  label: string;
  keyword: string;
  mode: string;
  minScore: number;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  pushDeferred: boolean;
  timezone: string;
  digestCadence: string;
  digestHour: number;
  lastDigestAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SavedSearch {
  return {
    id: record.id,
    label: record.label,
    keyword: record.keyword,
    mode: record.mode as SavedSearch["mode"],
    minScore: record.minScore,
    emailEnabled: record.emailEnabled,
    inAppEnabled: record.inAppEnabled,
    pushEnabled: record.pushEnabled,
    pushDeferred: record.pushDeferred,
    timezone: record.timezone,
    digestCadence: record.digestCadence as DigestCadence,
    digestHour: record.digestHour,
    lastDigestAt: record.lastDigestAt ? record.lastDigestAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mapJobAlert(record: {
  id: number;
  savedSearchId: number;
  reason: string;
  createdAt: Date;
  readAt: Date | null;
  emailSentAt: Date | null;
  inAppSentAt: Date | null;
  pushSentAt: Date | null;
  savedSearch: {
    label: string;
    emailEnabled: boolean;
    inAppEnabled: boolean;
    pushEnabled: boolean;
  };
  job: {
    id: number;
    title: string;
    company: string;
    location: string;
    mode: string;
    salary: string;
    meritFit: number;
    evidence: string;
    tags: string;
    requiredScreeners: string;
    preferredScreeners: string;
    requiredSkills: string;
    preferredSkills: string;
    sponsorTier: string;
    sponsored: boolean;
    featuredEmployer: boolean;
    paywallTier: string;
    marketRegion: string;
  };
}): JobAlert {
  return {
    id: record.id,
    savedSearchId: record.savedSearchId,
    searchLabel: record.savedSearch.label,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt ? record.readAt.toISOString() : null,
    emailSentAt: record.emailSentAt ? record.emailSentAt.toISOString() : null,
    inAppSentAt: record.inAppSentAt ? record.inAppSentAt.toISOString() : null,
    pushSentAt: record.pushSentAt ? record.pushSentAt.toISOString() : null,
    emailEnabled: record.savedSearch.emailEnabled,
    inAppEnabled: record.savedSearch.inAppEnabled,
    pushEnabled: record.savedSearch.pushEnabled,
    job: mapJob(record.job)
  };
}
