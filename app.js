const state = {
  activeRole: "candidate",
  jobs: [
    {
      id: 101,
      title: "Senior Product Designer",
      company: "Northbeam Health",
      location: "Austin, TX",
      mode: "hybrid",
      salary: "$132k-$155k",
      meritFit: 92,
      evidence: "Strong outcomes in healthcare UX and accessibility audits.",
      tags: ["Figma", "Design Systems", "Accessibility"],
    },
    {
      id: 102,
      title: "Frontend Engineer (React)",
      company: "Sunline Commerce",
      location: "Remote (US)",
      mode: "remote",
      salary: "$118k-$145k",
      meritFit: 89,
      evidence: "Built high-conversion component libraries at scale.",
      tags: ["React", "TypeScript", "Performance"],
    },
    {
      id: 103,
      title: "People Operations Manager",
      company: "Atlas Foods",
      location: "Chicago, IL",
      mode: "onsite",
      salary: "$96k-$118k",
      meritFit: 84,
      evidence: "Proven retention lift and process redesign wins.",
      tags: ["HR Ops", "Workforce Planning", "Coaching"],
    },
    {
      id: 104,
      title: "Data Analyst, Growth",
      company: "Tangent Labs",
      location: "San Diego, CA",
      mode: "remote",
      salary: "$102k-$128k",
      meritFit: 87,
      evidence: "Strong experimentation and attribution portfolio.",
      tags: ["SQL", "A/B Testing", "BI"],
    },
  ],
  talent: [
    {
      id: 201,
      name: "Rina Shah",
      role: "Frontend Engineer",
      summary: "Shipped design systems used by 30+ product squads.",
      merit: 91,
      assessment: "94th percentile",
      trust: "4.8/5",
    },
    {
      id: 202,
      name: "Leo Martin",
      role: "Growth Data Analyst",
      summary: "Raised activation by 18% through attribution redesign.",
      merit: 89,
      assessment: "91st percentile",
      trust: "4.7/5",
    },
    {
      id: 203,
      name: "Maya Ortega",
      role: "Operations Manager",
      summary: "Reduced fulfillment delays by 26% across four regions.",
      merit: 88,
      assessment: "89th percentile",
      trust: "4.9/5",
    },
  ],
  applications: [
    { id: 301, jobId: 102, status: "Interview", appliedAt: "2026-02-10T11:20:00" },
  ],
  shortlist: [],
  conversations: [
    {
      id: 401,
      title: "Northbeam Hiring Team",
      messages: [
        { role: "employer", text: "Thanks for applying. Can you share your latest case study?" },
        { role: "candidate", text: "Absolutely. I can send details and metrics today." },
      ],
    },
    {
      id: 402,
      title: "Sunline Engineering",
      messages: [{ role: "employer", text: "We liked your portfolio. Are you open this week?" }],
    },
  ],
  activeConversationId: 401,
  interviews: [
    {
      id: 501,
      person: "Rina Shah",
      owner: "M. Collins",
      time: "2026-02-18T13:00",
      type: "video",
    },
  ],
  moderation: [
    {
      id: 601,
      type: "Profile flag",
      target: "Candidate: Alex P.",
      reason: "Possible unverifiable credential",
      status: "pending",
    },
    {
      id: 602,
      type: "Job content flag",
      target: "Role: Growth Marketing Lead",
      reason: "Comp range missing for US posting policy",
      status: "pending",
    },
  ],
};

const els = {
  form: document.querySelector("#search-form"),
  keyword: document.querySelector("#keyword"),
  mode: document.querySelector("#mode"),
  score: document.querySelector("#score"),
  scoreOut: document.querySelector("#score-out"),
  resultCount: document.querySelector("#result-count"),
  jobList: document.querySelector("#job-list"),
  talentGrid: document.querySelector("#talent-grid"),
  roleButtons: document.querySelectorAll(".switch-btn"),
  applicationList: document.querySelector("#application-list"),
  shortlistList: document.querySelector("#shortlist-list"),
  postJobForm: document.querySelector("#post-job-form"),
  conversationList: document.querySelector("#conversation-list"),
  threadTitle: document.querySelector("#thread-title"),
  threadLog: document.querySelector("#thread-log"),
  messageForm: document.querySelector("#message-form"),
  messageInput: document.querySelector("#message-input"),
  interviewForm: document.querySelector("#interview-form"),
  interviewList: document.querySelector("#interview-list"),
  moderationList: document.querySelector("#moderation-list"),
};

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function getFilteredJobs() {
  const q = els.keyword.value.trim().toLowerCase();
  const mode = els.mode.value;
  const minScore = Number(els.score.value);
  return state.jobs
    .filter((job) => {
      const matchesText =
        !q ||
        job.title.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.tags.join(" ").toLowerCase().includes(q);
      const matchesMode = mode === "all" || job.mode === mode;
      const matchesScore = job.meritFit >= minScore;
      return matchesText && matchesMode && matchesScore;
    })
    .sort((a, b) => b.meritFit - a.meritFit);
}

function renderJobs() {
  const rows = getFilteredJobs();
  els.resultCount.textContent = String(rows.length);

  if (!rows.length) {
    els.jobList.innerHTML = `
      <article class="job-card">
        <h3>No direct matches yet</h3>
        <p class="meta-copy">Try lowering the merit threshold or broadening your keyword.</p>
      </article>
    `;
    return;
  }

  els.jobList.innerHTML = rows
    .map((job) => {
      const actionLabel = state.activeRole === "candidate" ? "Apply Now" : "Open Role Pipeline";
      return `
        <article class="job-card">
          <div class="job-main">
            <div>
              <h3>${escapeHtml(job.title)}</h3>
              <p class="job-meta">
                <span>${escapeHtml(job.company)}</span>
                <span>${escapeHtml(job.location)}</span>
                <span>${escapeHtml(job.salary)}</span>
              </p>
            </div>
            <span class="score-pill">Merit Fit ${job.meritFit}</span>
          </div>
          <div class="tag-row">
            ${job.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
          <div class="job-actions">
            <span class="evidence">${escapeHtml(job.evidence)}</span>
            <button class="ghost-btn" type="button" data-job-action="apply" data-job-id="${job.id}">
              ${actionLabel}
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTalent() {
  els.talentGrid.innerHTML = state.talent
    .map((person) => {
      const buttonLabel = state.activeRole === "employer" ? "Add to Shortlist" : "Message";
      return `
        <article class="talent-card">
          <div class="card-row">
            <div>
              <h3>${escapeHtml(person.name)}</h3>
              <p class="meta-copy">${escapeHtml(person.role)}</p>
            </div>
            <span class="score-pill">Score ${person.merit}</span>
          </div>
          <p>${escapeHtml(person.summary)}</p>
          <ul class="talent-metrics">
            <li>Assessment: ${escapeHtml(person.assessment)}</li>
            <li>Trust index: ${escapeHtml(person.trust)}</li>
          </ul>
          <div class="job-actions">
            <span class="pill-light">Merit-first profile</span>
            <button
              class="ghost-btn"
              type="button"
              data-talent-action="shortlist"
              data-talent-id="${person.id}"
            >
              ${buttonLabel}
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderApplications() {
  if (!els.applicationList) return;

  if (!state.applications.length) {
    els.applicationList.innerHTML = `
      <article class="list-card">
        <h3>No applications yet</h3>
        <p class="meta-copy">Apply to a role to start your pipeline.</p>
      </article>
    `;
    return;
  }

  els.applicationList.innerHTML = state.applications
    .slice()
    .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))
    .map((application) => {
      const job = state.jobs.find((item) => item.id === application.jobId);
      if (!job) return "";
      return `
        <article class="list-card">
          <div class="card-row">
            <div>
              <h3>${escapeHtml(job.title)}</h3>
              <p class="meta-copy">${escapeHtml(job.company)} | ${escapeHtml(job.location)}</p>
            </div>
            <span class="status-pill">${escapeHtml(application.status)}</span>
          </div>
          <p class="meta-copy">Applied: ${formatDate(application.appliedAt)}</p>
        </article>
      `;
    })
    .join("");
}

function renderShortlist() {
  if (!els.shortlistList) return;

  if (!state.shortlist.length) {
    els.shortlistList.innerHTML = `
      <article class="list-card">
        <h3>No candidates shortlisted</h3>
        <p class="meta-copy">Use "Add to Shortlist" on talent cards.</p>
      </article>
    `;
    return;
  }

  els.shortlistList.innerHTML = state.shortlist
    .map((candidateId) => {
      const person = state.talent.find((item) => item.id === candidateId);
      if (!person) return "";
      return `
        <article class="list-card">
          <div class="card-row">
            <div>
              <h3>${escapeHtml(person.name)}</h3>
              <p class="meta-copy">${escapeHtml(person.role)}</p>
            </div>
            <span class="score-pill">Score ${person.merit}</span>
          </div>
          <p class="meta-copy">${escapeHtml(person.summary)}</p>
        </article>
      `;
    })
    .join("");
}

function getActiveConversation() {
  return state.conversations.find((conversation) => conversation.id === state.activeConversationId);
}

function renderConversations() {
  if (!els.conversationList) return;
  els.conversationList.innerHTML = state.conversations
    .map((conversation) => {
      const activeClass = conversation.id === state.activeConversationId ? "active" : "";
      return `
        <button
          class="conversation-btn ${activeClass}"
          type="button"
          data-conversation-id="${conversation.id}"
        >
          ${escapeHtml(conversation.title)}
        </button>
      `;
    })
    .join("");
}

function renderThread() {
  const conversation = getActiveConversation();
  if (!conversation) return;

  els.threadTitle.textContent = conversation.title;
  els.threadLog.innerHTML = conversation.messages
    .map((message) => {
      const bubbleClass = message.role === state.activeRole ? "self" : "other";
      return `<p class="bubble ${bubbleClass}">${escapeHtml(message.text)}</p>`;
    })
    .join("");
  els.threadLog.scrollTop = els.threadLog.scrollHeight;
}

function renderInterviews() {
  if (!els.interviewList) return;

  if (!state.interviews.length) {
    els.interviewList.innerHTML = `
      <article class="list-card">
        <h3>No interviews scheduled</h3>
        <p class="meta-copy">Create one with the scheduler form above.</p>
      </article>
    `;
    return;
  }

  els.interviewList.innerHTML = state.interviews
    .slice()
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .map((item) => {
      return `
        <article class="list-card">
          <div class="card-row">
            <div>
              <h3>${escapeHtml(item.person)}</h3>
              <p class="meta-copy">With: ${escapeHtml(item.owner)}</p>
            </div>
            <span class="status-pill">${escapeHtml(item.type.toUpperCase())}</span>
          </div>
          <p class="meta-copy">${formatDate(item.time)}</p>
        </article>
      `;
    })
    .join("");
}

function renderModeration() {
  if (!els.moderationList) return;

  const queue = state.moderation.filter((item) => item.status === "pending");
  if (!queue.length) {
    els.moderationList.innerHTML = `
      <article class="list-card">
        <h3>Queue clear</h3>
        <p class="meta-copy">No pending moderation actions right now.</p>
      </article>
    `;
    return;
  }

  els.moderationList.innerHTML = queue
    .map((item) => {
      return `
        <article class="list-card">
          <div class="card-row">
            <div>
              <h3>${escapeHtml(item.type)}</h3>
              <p class="meta-copy">${escapeHtml(item.target)}</p>
            </div>
            <span class="pill-light">Pending</span>
          </div>
          <p class="meta-copy">${escapeHtml(item.reason)}</p>
          <div class="moderation-actions">
            <button type="button" class="ghost-btn" data-moderation-action="approve" data-item-id="${
              item.id
            }">
              Approve
            </button>
            <button type="button" class="ghost-btn" data-moderation-action="reject" data-item-id="${
              item.id
            }">
              Reject
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRoleVisibility() {
  document.querySelectorAll("[data-role-view]").forEach((node) => {
    const view = node.getAttribute("data-role-view");
    const visible = view === "both" || view === state.activeRole;
    node.classList.toggle("is-hidden", !visible);
  });

  els.roleButtons.forEach((button) => {
    const active = button.dataset.role === state.activeRole;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function renderAll() {
  renderRoleVisibility();
  renderJobs();
  renderTalent();
  renderApplications();
  renderShortlist();
  renderConversations();
  renderThread();
  renderInterviews();
  renderModeration();
}

els.score.addEventListener("input", () => {
  els.scoreOut.value = els.score.value;
  renderJobs();
});

els.mode.addEventListener("change", renderJobs);
els.keyword.addEventListener("input", renderJobs);
els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderJobs();
});

els.roleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeRole = button.dataset.role;
    renderAll();
  });
});

els.jobList.addEventListener("click", (event) => {
  const target = event.target.closest("[data-job-action='apply']");
  if (!target) return;
  const jobId = Number(target.dataset.jobId);

  if (state.activeRole === "candidate") {
    const exists = state.applications.some((application) => application.jobId === jobId);
    if (!exists) {
      state.applications.unshift({
        id: Date.now(),
        jobId,
        status: "Applied",
        appliedAt: new Date().toISOString(),
      });
      renderApplications();
      target.textContent = "Applied";
    } else {
      target.textContent = "Already Applied";
    }
  }
});

els.talentGrid.addEventListener("click", (event) => {
  const target = event.target.closest("[data-talent-action='shortlist']");
  if (!target) return;
  const talentId = Number(target.dataset.talentId);

  if (state.activeRole === "employer") {
    if (!state.shortlist.includes(talentId)) {
      state.shortlist.unshift(talentId);
      renderShortlist();
      target.textContent = "Shortlisted";
    } else {
      target.textContent = "Already Shortlisted";
    }
  } else {
    state.activeConversationId = 401;
    renderConversations();
    renderThread();
  }
});

if (els.postJobForm) {
  els.postJobForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const title = document.querySelector("#post-title").value.trim();
    const company = document.querySelector("#post-company").value.trim();
    const location = document.querySelector("#post-location").value.trim();
    const mode = document.querySelector("#post-mode").value;
    const salary = document.querySelector("#post-salary").value.trim();
    const tags = document
      .querySelector("#post-tags")
      .value.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const meritFit = Number(document.querySelector("#post-score").value);

    state.jobs.unshift({
      id: Date.now(),
      title,
      company,
      location,
      mode,
      salary,
      meritFit,
      evidence: "Newly posted role awaiting first applicant signals.",
      tags: tags.length ? tags : ["General"],
    });

    state.moderation.unshift({
      id: Date.now() + 1,
      type: "Job content flag",
      target: `Role: ${title}`,
      reason: "Auto-review generated for newly published posting.",
      status: "pending",
    });

    els.postJobForm.reset();
    renderJobs();
    renderModeration();
  });
}

if (els.conversationList) {
  els.conversationList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-conversation-id]");
    if (!target) return;
    state.activeConversationId = Number(target.dataset.conversationId);
    renderConversations();
    renderThread();
  });
}

if (els.messageForm) {
  els.messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.messageInput.value.trim();
    if (!text) return;

    const conversation = getActiveConversation();
    if (!conversation) return;

    conversation.messages.push({ role: state.activeRole, text });
    const replyRole = state.activeRole === "candidate" ? "employer" : "candidate";
    conversation.messages.push({
      role: replyRole,
      text: "Received. We will follow up with next steps shortly.",
    });
    els.messageInput.value = "";
    renderThread();
  });
}

if (els.interviewForm) {
  els.interviewForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const person = document.querySelector("#interview-person").value.trim();
    const owner = document.querySelector("#interview-owner").value.trim();
    const time = document.querySelector("#interview-time").value;
    const type = document.querySelector("#interview-type").value;
    if (!person || !owner || !time || !type) return;

    state.interviews.push({ id: Date.now(), person, owner, time, type });
    els.interviewForm.reset();
    renderInterviews();
  });
}

if (els.moderationList) {
  els.moderationList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-moderation-action]");
    if (!target) return;

    const itemId = Number(target.dataset.itemId);
    const action = target.dataset.moderationAction;
    const item = state.moderation.find((entry) => entry.id === itemId);
    if (!item) return;

    item.status = action === "approve" ? "approved" : "rejected";
    renderModeration();
  });
}

els.scoreOut.value = els.score.value;
renderAll();
