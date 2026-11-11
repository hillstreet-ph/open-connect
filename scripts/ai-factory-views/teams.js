/* Open-Connect AI Factory — Team Builder (merged platform view)
   The former /ai-factory?view=teams SPA workspace, now a view of the one
   platform. Private teams live in public.ai_agency_teams (owner-scoped RLS);
   runs are started through /api/v1/ai-factory/teams/run with the signed-in
   user's own bearer token, which re-checks ownership and executes through the
   same runOwnedFactoryTeam path the SPA server function uses.

   Honesty rule: a run is only reported as succeeded when the API says so. The
   history list reads the real autonomous_runs rows for this team. */
(function () {
  "use strict";

  var SUPABASE_URL = "https://huadtiuuoiriqrjpjxhr.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1YWR0aXV1b2lyaXFyanBqeGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MzIwODMsImV4cCI6MjEwNTEwODA4M30.5TF6RWJ7ycwI2YJqu_aYVS7ZZxXAIGSCcim3ilkPr0w";
  var CATEGORIES = ["development", "business", "marketing", "research", "operations", "custom"];

  var sb = null, user = null, teams = [], editing = null, selected = "";
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function msg(id, text, kind) {
    var el = $(id);
    if (!el) return;
    el.textContent = text || "";
    el.className = "st-msg" + (kind ? " " + kind : "");
  }
  function state(text, kind) {
    var el = $("tbState");
    if (!el) return;
    el.textContent = text || "";
    el.className = "st-save" + (kind ? " " + kind : "");
  }
  function rolesFrom(text) {
    return text.split("\n").map(function (r) { return r.trim(); }).filter(Boolean);
  }

  function renderList() {
    var cat = $("tbFilter").value;
    var showArchived = $("tbArchived").checked;
    var shown = teams.filter(function (t) {
      if (!showArchived && t.archived) return false;
      if (cat !== "all" && t.category !== cat) return false;
      return true;
    });
    var list = $("tbList");
    if (!shown.length) {
      list.innerHTML = '<p class="st-msg">No teams yet. Create one on the left, or clear the filter.</p>';
      return;
    }
    list.innerHTML = shown.map(function (t) {
      return '<article class="agent-card" data-team="' + esc(t.id) + '">' +
        '<div class="agent-body">' +
          '<div class="agent-cat">' + esc(t.category) + (t.archived ? " · archived" : "") + "</div>" +
          '<h3 class="agent-role">' + esc(t.name) + "</h3>" +
          '<p class="agent-desc">' + esc(t.description || "No description") + "</p>" +
          '<div class="agent-tags">' + (t.roles || []).map(function (r) { return '<span class="chip">' + esc(r) + "</span>"; }).join("") + "</div>" +
        "</div>" +
        '<div class="agent-foot">' +
          '<button class="btn btn-outline btn-sm" type="button" data-edit="' + esc(t.id) + '">Edit</button>' +
          '<button class="btn btn-outline btn-sm" type="button" data-archive="' + esc(t.id) + '">' + (t.archived ? "Restore" : "Archive") + "</button>" +
          '<button class="btn btn-primary btn-sm" type="button" data-select="' + esc(t.id) + '">Run</button>' +
        "</div>" +
      "</article>";
    }).join("");
  }

  function loadDraft(t) {
    editing = t || null;
    $("tbFormTitle").textContent = t ? "Edit team" : "New private team";
    $("tbName").value = t ? t.name : "";
    $("tbCategory").value = t ? t.category : "development";
    $("tbDescription").value = t ? t.description : "";
    $("tbRoles").value = t ? (t.roles || []).join("\n") : "Planner\nBuilder\nReviewer";
    msg("tbFormMsg", "");
  }

  async function loadTeams() {
    state("loading…");
    var r = await sb.from("ai_agency_teams").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
    if (r.error) { state("load failed", "err"); msg("tbMsg", "Teams could not be loaded.", "err"); return; }
    teams = r.data || [];
    state("loaded", "ok");
    renderList();
  }

  async function saveTeam(ev) {
    ev.preventDefault();
    var roles = rolesFrom($("tbRoles").value);
    if (roles.length < 2 || roles.length > 6) {
      msg("tbFormMsg", "A team needs between 2 and 6 roles.", "err");
      return;
    }
    var row = {
      user_id: user.id,
      name: $("tbName").value.trim(),
      category: $("tbCategory").value,
      description: $("tbDescription").value.trim(),
      roles: roles,
      updated_at: new Date().toISOString(),
    };
    if (!row.name) { msg("tbFormMsg", "Give the team a name.", "err"); return; }
    state("saving…");
    var r;
    if (editing) {
      r = await sb.from("ai_agency_teams").update(row).eq("id", editing.id).eq("user_id", user.id).select("id").maybeSingle();
    } else {
      r = await sb.from("ai_agency_teams").insert(row).select("id").maybeSingle();
    }
    if (r.error || !r.data) {
      state("save failed", "err");
      msg("tbFormMsg", r.error && r.error.message ? r.error.message : "The team could not be saved.", "err");
      return;
    }
    state("saved", "ok");
    msg("tbFormMsg", editing ? "Team updated." : "Team created.", "ok");
    loadDraft(null);
    await loadTeams();
  }

  async function archiveTeam(id) {
    var t = null;
    for (var i = 0; i < teams.length; i++) if (teams[i].id === id) t = teams[i];
    if (!t) return;
    state("updating…");
    var r = await sb.from("ai_agency_teams")
      .update({ archived: !t.archived, updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
    if (r.error || !r.data) { state("update failed", "err"); msg("tbMsg", "The team could not be updated.", "err"); return; }
    state("updated", "ok");
    await loadTeams();
  }

  function selectTeam(id) {
    selected = id;
    var t = null;
    for (var i = 0; i < teams.length; i++) if (teams[i].id === id) t = teams[i];
    $("tbRunSec").style.display = "";
    $("tbRunTitle").textContent = t ? "Run team — " + t.name : "Run team";
    msg("tbRunMsg", "");
    loadRuns();
  }

  async function loadRuns() {
    if (!selected) return;
    var r = await sb.from("autonomous_runs")
      .select("id,state,goal,evidence,created_at")
      .eq("user_id", user.id)
      .contains("evidence", { executor: "ai_agency", team_id: selected })
      .order("created_at", { ascending: false })
      .limit(20);
    var box = $("tbRuns");
    if (r.error) { box.innerHTML = '<p class="st-msg">Run history could not be loaded.</p>'; return; }
    var rows = r.data || [];
    if (!rows.length) { box.innerHTML = '<p class="st-msg">No runs for this team yet.</p>'; return; }
    box.innerHTML = rows.map(function (run) {
      var workers = (run.evidence && run.evidence.workers) || [];
      return '<div class="st-list-row">' +
        '<div><b>' + esc(run.state) + "</b> · " + esc(new Date(run.created_at).toLocaleString()) + "</div>" +
        '<div class="st-msg">' + esc(run.goal) + "</div>" +
        (workers.length ? '<div class="st-msg">' + workers.map(function (w) { return esc(w.role || w.name || "role") + ": " + esc(w.status); }).join(" · ") + "</div>" : "") +
      "</div>";
    }).join("");
  }

  async function runTeam(ev) {
    ev.preventDefault();
    if (!selected) { msg("tbRunMsg", "Choose a team to run first.", "err"); return; }
    var goal = $("tbGoal").value.trim();
    if (!goal) { msg("tbRunMsg", "Describe the goal.", "err"); return; }
    state("running…");
    msg("tbRunMsg", "Running the team. This can take a moment…");
    try {
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : "";
      if (!token) throw new Error("Your session expired. Sign in again.");
      var res = await fetch("/api/v1/ai-factory/teams/run", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ teamId: selected, goal: goal, context: $("tbContext").value.trim() }),
      });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.error || "The team run could not be started.");
      state(body.state === "succeeded" ? "run succeeded" : "run finished with issues", body.state === "succeeded" ? "ok" : "err");
      msg("tbRunMsg", body.state === "succeeded" ? "Team proposals are ready." : "Some roles were unavailable. Review the saved results.", body.state === "succeeded" ? "ok" : "err");
      await loadRuns();
    } catch (e) {
      state("run failed", "err");
      msg("tbRunMsg", e && e.message ? e.message : "The team run failed.", "err");
    }
  }

  function signedIn(session) {
    user = session && session.user ? session.user : null;
    $("tbGate").style.display = user ? "none" : "";
    $("tbApp").style.display = user ? "" : "none";
    if (user) {
      $("tbWhoEmail").textContent = user.email || user.id;
      $("tbWhoDot").className = "st-dot on";
      loadDraft(null);
      loadTeams();
    }
  }

  function init() {
    if (!window.supabase || !window.supabase.createClient) {
      msg("tbMsg", "The Supabase client could not be loaded. Check your connection and reload.", "err");
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    sb.auth.getSession().then(function (res) { signedIn(res.data && res.data.session); });
    sb.auth.onAuthStateChange(function (_e, session) { signedIn(session); });

    $("tbSigninForm").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      $("tbGateMsg").textContent = "signing in…";
      var r = await sb.auth.signInWithPassword({ email: $("tbEmail").value, password: $("tbPassword").value });
      $("tbGateMsg").textContent = r.error ? (r.error.message || "Sign in failed") : "";
    });
    $("tbSignoutBtn").addEventListener("click", function () { sb.auth.signOut(); });
    $("tbForm").addEventListener("submit", saveTeam);
    $("tbReset").addEventListener("click", function () { loadDraft(null); });
    $("tbFilter").addEventListener("change", renderList);
    $("tbArchived").addEventListener("change", renderList);
    $("tbRunForm").addEventListener("submit", runTeam);
    $("tbList").addEventListener("click", function (ev) {
      var t = ev.target.closest ? ev.target.closest("[data-edit],[data-archive],[data-select]") : null;
      if (!t) return;
      if (t.hasAttribute("data-edit")) {
        var id = t.getAttribute("data-edit");
        for (var i = 0; i < teams.length; i++) if (teams[i].id === id) loadDraft(teams[i]);
      } else if (t.hasAttribute("data-archive")) archiveTeam(t.getAttribute("data-archive"));
      else selectTeam(t.getAttribute("data-select"));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
