import { parseUniqueList, encodeList, normalizeToken } from "@/lib/list-codec";

type ScreenerAnswer = {
  question: string;
  answer: string;
};

type ScoringInput = {
  job: {
    meritFit: number;
    requiredScreeners: string;
    preferredScreeners: string;
    requiredSkills: string;
    preferredSkills: string;
    title: string;
    company: string;
  };
  user: {
    profileSkills: string;
    profileCompleteness: number;
    createdAt: Date;
    email: string;
    isFlagged: boolean;
  };
  answers: ScreenerAnswer[];
  recentApplicationCount: number;
  priorFraudEventsForIp: number;
  now?: Date;
};

export type ApplicationScoringResult = {
  requiredPassed: boolean;
  requiredScore: number;
  preferredScore: number;
  autoRankScore: number;
  matchExplanation: string;
  missingSkills: string[];
  profileFixSuggestions: string[];
  submittedAnswers: string;
  riskScore: number;
  riskFlags: string[];
  needsManualReview: boolean;
  blockForAbuse: boolean;
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function answerMatchesPrompt(prompt: string, answers: ScreenerAnswer[]) {
  const tokens = tokenize(prompt).slice(0, 8);
  if (!tokens.length) return false;

  return answers.some((entry) => {
    const answer = normalizeToken(entry.answer);
    if (!answer) return false;
    if (answer === "yes" || answer.startsWith("yes ")) return true;
    return tokens.some((token) => answer.includes(token));
  });
}

function extractSkillsFromAnswers(answers: ScreenerAnswer[]) {
  const skillSeeds = answers
    .flatMap((entry) => tokenize(`${entry.question} ${entry.answer}`))
    .filter((token) => token.length >= 4);

  return parseUniqueList(skillSeeds.join(", "));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function parseScreenerAnswers(value: unknown): ScreenerAnswer[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const candidate = entry as Record<string, unknown>;
      const question = typeof candidate.question === "string" ? candidate.question.trim() : "";
      const answer = typeof candidate.answer === "string" ? candidate.answer.trim() : "";
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((entry): entry is ScreenerAnswer => entry !== null);
}

export function evaluateApplication(input: ScoringInput): ApplicationScoringResult {
  const now = input.now ?? new Date();
  const requiredScreeners = parseUniqueList(input.job.requiredScreeners);
  const preferredScreeners = parseUniqueList(input.job.preferredScreeners);
  const requiredSkills = parseUniqueList(input.job.requiredSkills);
  const preferredSkills = parseUniqueList(input.job.preferredSkills);

  const answerSkills = extractSkillsFromAnswers(input.answers);
  const profileSkills = parseUniqueList(input.user.profileSkills);
  const candidateSkills = parseUniqueList([...profileSkills, ...answerSkills].join(", "));
  const candidateSkillIndex = new Set(candidateSkills.map((skill) => normalizeToken(skill)));

  let requiredScore = 0;
  for (const screener of requiredScreeners) {
    if (answerMatchesPrompt(screener, input.answers)) requiredScore += 1;
  }

  let preferredScore = 0;
  for (const screener of preferredScreeners) {
    if (answerMatchesPrompt(screener, input.answers)) preferredScore += 1;
  }

  const missingSkills = requiredSkills.filter(
    (skill) => !candidateSkillIndex.has(normalizeToken(skill))
  );
  const missingPreferredSkills = preferredSkills.filter(
    (skill) => !candidateSkillIndex.has(normalizeToken(skill))
  );

  const requiredPassed = requiredScreeners.length === 0 || requiredScore >= requiredScreeners.length;

  const riskFlags: string[] = [];
  let riskScore = 0;
  const accountAgeHours = (now.getTime() - input.user.createdAt.getTime()) / (1000 * 60 * 60);

  if (input.recentApplicationCount >= 6) {
    riskFlags.push("high_application_velocity");
    riskScore += 22;
  }
  if (input.recentApplicationCount >= 12) {
    riskFlags.push("extreme_application_velocity");
    riskScore += 20;
  }
  if (accountAgeHours < 1) {
    riskFlags.push("new_account");
    riskScore += 18;
  }
  if (accountAgeHours < 0.17) {
    riskFlags.push("very_new_account");
    riskScore += 18;
  }
  if (input.priorFraudEventsForIp > 0) {
    riskFlags.push("ip_history_flagged");
    riskScore += Math.min(24, input.priorFraudEventsForIp * 6);
  }
  if (input.user.isFlagged) {
    riskFlags.push("user_previously_flagged");
    riskScore += 26;
  }
  if (!input.answers.length && requiredScreeners.length > 0) {
    riskFlags.push("missing_required_answers");
    riskScore += 10;
  }

  const requiredRatio =
    requiredScreeners.length > 0 ? requiredScore / requiredScreeners.length : 1;
  const preferredRatio =
    preferredScreeners.length > 0 ? preferredScore / preferredScreeners.length : 0.6;

  const rawRank =
    input.job.meritFit * 0.52 +
    requiredRatio * 28 +
    preferredRatio * 12 +
    input.user.profileCompleteness * 0.12 -
    missingSkills.length * 7 -
    missingPreferredSkills.length * 2 -
    riskScore * 0.24;

  const profileFixSuggestions: string[] = [];
  if (input.user.profileCompleteness < 80) {
    profileFixSuggestions.push("Increase profile completeness to at least 80%.");
  }
  if (missingSkills.length > 0) {
    profileFixSuggestions.push(`Add evidence for required skills: ${missingSkills.join(", ")}.`);
  }
  if (missingPreferredSkills.length > 0) {
    profileFixSuggestions.push(
      `Strengthen preferred skills coverage: ${missingPreferredSkills.slice(0, 3).join(", ")}.`
    );
  }
  if (requiredScreeners.length > requiredScore) {
    profileFixSuggestions.push("Provide stronger examples for required screener prompts.");
  }
  if (!profileFixSuggestions.length) {
    profileFixSuggestions.push("Profile is strong. Add fresh outcome metrics to stay competitive.");
  }

  const autoRankScore = clampScore(rawRank);
  const needsManualReview = riskScore >= 45 || !requiredPassed;
  const blockForAbuse = riskScore >= 72;

  const matchExplanation = [
    `${requiredPassed ? "Passed" : "Missed"} required screeners (${requiredScore}/${requiredScreeners.length || 0}).`,
    `Preferred screener alignment ${preferredScore}/${preferredScreeners.length || 0}.`,
    missingSkills.length
      ? `Missing required skills: ${missingSkills.join(", ")}.`
      : "No required skill gaps detected.",
    `Auto-rank ${autoRankScore}/100 for ${input.job.title} at ${input.job.company}.`
  ].join(" ");

  const submittedAnswers = encodeList(
    input.answers.map((entry) => `${entry.question}: ${entry.answer.slice(0, 220)}`)
  );

  return {
    requiredPassed,
    requiredScore,
    preferredScore,
    autoRankScore,
    matchExplanation,
    missingSkills,
    profileFixSuggestions,
    submittedAnswers,
    riskScore: clampScore(riskScore),
    riskFlags,
    needsManualReview,
    blockForAbuse
  };
}
