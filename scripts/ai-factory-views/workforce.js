/* Open-Connect AI Factory — Workforce Directory (merged platform view)
   The former /ai-factory SPA "Workforce Directory" tab, now a view of the one
   platform. Reads the signed-in owner's own specialists from production
   Supabase (workforce_agents + workforce_agent_versions) under RLS, and offers
   the same actions the SPA offered: launch a specialist chat, open the
   specialist in Studio, and set up the starter workforce.

   Honesty rule: nothing here claims a capability the database does not have.
   A specialist is only shown as launchable when it has an active version; the
   launch button calls the same launch_workforce_chat RPC the SPA used, and a
   failure is reported as a failure. */
(function () {
  "use strict";

  var SUPABASE_URL = "https://huadtiuuoiriqrjpjxhr.supabase.co";
  var SUPABASE_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1YWR0aXV1b2lyaXFyanBqeGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MzIwODMsImV4cCI6MjEwNTEwODA4M30.5TF6RWJ7ycwI2YJqu_aYVS7ZZxXAIGSCcim3ilkPr0w";

  var sb = null,
    user = null,
    agents = [],
    versions = [],
    canManage = false;
  var $ = function (id) {
    return document.getElementById(id);
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function msg(text, kind) {
    var el = $("wfMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "st-msg" + (kind ? " " + kind : "");
  }
  function state(text, kind) {
    var el = $("wfState");
    if (!el) return;
    el.textContent = text || "";
    el.className = "st-save" + (kind ? " " + kind : "");
  }

  function activeVersion(agent) {
    if (!agent.active_version_id) return null;
    for (var i = 0; i < versions.length; i++) {
      if (versions[i].id === agent.active_version_id && versions[i].agent_id === agent.id)
        return versions[i];
    }
    return null;
  }

  function render() {
    var grid = $("wfGrid");
    if (!grid) return;
    var dept = ($("wfDept") || {}).value || "";
    var q = (($("wfSearch") || {}).value || "").trim().toLowerCase();
    var shown = agents.filter(function (a) {
      if (dept && a.department !== dept) return false;
      if (!q) return true;
      var v = activeVersion(a);
      var hay = [
        a.slug,
        a.department,
        v && v.config && v.config.name,
        v && v.config && v.config.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    $("wfCount").textContent = agents.length + " specialists";
    $("wfLeads").textContent =
      agents.filter(function (a) {
        return a.lead;
      }).length + " leads";
    var depts = {};
    agents.forEach(function (a) {
      depts[a.department] = true;
    });
    $("wfDepts").textContent = Object.keys(depts).length + " departments";
    $("wfSrc").textContent = shown.length + " shown";

    if (!shown.length) {
      grid.innerHTML =
        '<p class="st-msg">No specialists match this filter. Clear the search or choose another department.</p>';
      return;
    }

    grid.innerHTML = shown
      .map(function (a) {
        var v = activeVersion(a);
        var c = (v && v.config) || {};
        var tools = (c.tools || []).length,
          skills = (c.skillIds || []).length,
          conns = (c.connectionIds || []).length;
        var launchable = !!v;
        return (
          '<article class="agent-card" data-agent="' +
          esc(a.id) +
          '">' +
          '<div class="agent-body">' +
          '<div class="agent-cat">' +
          esc(a.department) +
          (a.lead ? " · lead" : "") +
          "</div>" +
          '<h3 class="agent-role">' +
          esc(c.name || a.slug) +
          "</h3>" +
          '<p class="agent-desc">' +
          esc(c.role || "Specialist") +
          "</p>" +
          '<div class="agent-tags">' +
          '<span class="chip">' +
          tools +
          " tools</span>" +
          '<span class="chip">' +
          skills +
          " skills</span>" +
          '<span class="chip">' +
          conns +
          " connectors</span>" +
          '<span class="chip">' +
          (v ? "v" + v.number : "no active version") +
          "</span>" +
          "</div>" +
          "</div>" +
          '<div class="agent-foot">' +
          '<button class="btn btn-outline btn-sm" type="button" data-open="' +
          esc(a.id) +
          '">Details</button>' +
          (launchable
            ? '<button class="btn btn-primary btn-sm" type="button" data-launch="' +
              esc(a.id) +
              '">Launch chat</button>'
            : '<button class="btn btn-outline btn-sm" type="button" disabled title="Activate a version in Studio first">Launch chat</button>') +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function openDrawer(id) {
    var a = null;
    for (var i = 0; i < agents.length; i++) if (agents[i].id === id) a = agents[i];
    if (!a) return;
    var v = activeVersion(a),
      c = (v && v.config) || {};
    var body = $("wfDrawerBody");
    body.innerHTML =
      '<div class="pf-head"><div class="pf-headmain">' +
      '<span class="pf-eyebrow">' +
      esc(a.department) +
      (a.lead ? " · lead" : "") +
      "</span>" +
      '<h2 class="pf-name" id="wfDrawerTitle">' +
      esc(c.name || a.slug) +
      "</h2>" +
      '<p class="pf-desc">' +
      esc(c.role || "Specialist") +
      "</p>" +
      "</div></div>" +
      '<div class="pf-body">' +
      '<div class="pf-sec"><h5>1 · Identity</h5><div class="pf-list">' +
      '<span class="pf-item">Slug: ' +
      esc(a.slug) +
      "</span>" +
      '<span class="pf-item">Scope: ' +
      (a.project_id ? "project" : "personal") +
      "</span>" +
      '<span class="pf-item">Enabled: ' +
      (a.enabled ? "yes" : "no") +
      "</span>" +
      "</div></div>" +
      '<div class="pf-sec"><h5>2 · Description</h5><p class="pf-desc">' +
      esc(c.description || "No description yet.") +
      "</p></div>" +
      '<div class="pf-sec"><h5>3 · Instruction</h5><div class="pf-instruction">' +
      esc(c.instructions || "No instruction yet.") +
      "</div></div>" +
      '<div class="pf-sec"><h5>4 · Training</h5><p class="pf-note">Runs on the instruction above plus ' +
      (c.knowledgeIds || []).length +
      " attached knowledge source" +
      ((c.knowledgeIds || []).length === 1 ? "" : "s") +
      ". No fine-tuned weights.</p></div>" +
      '<div class="pf-sec"><h5>5 · Setup</h5><div class="pf-list">' +
      '<span class="pf-item">Model: ' +
      esc(c.model || "auto-free") +
      "</span>" +
      '<span class="pf-item">' +
      (c.tools || []).length +
      " tools granted</span>" +
      '<span class="pf-item">' +
      (c.skillIds || []).length +
      " skills installed</span>" +
      '<span class="pf-item">' +
      (c.connectionIds || []).length +
      " connectors</span>" +
      '<span class="pf-item">Version: ' +
      (v ? v.number : "—") +
      "</span>" +
      "</div></div>" +
      '<div class="pf-sec"><h5>Actions</h5><div class="pf-chips">' +
      (v
        ? '<button class="btn btn-primary btn-sm" type="button" data-launch="' +
          esc(a.id) +
          '">Launch chat</button>'
        : "") +
      '<a class="btn btn-outline btn-sm" href="/ai-factory/roster/studio?agent=' +
      encodeURIComponent(a.id) +
      '">Open in Studio</a>' +
      "</div></div>" +
      "</div>";
    $("wfOverlay").hidden = false;
  }

  function closeDrawer() {
    $("wfOverlay").hidden = true;
  }

  async function launch(id) {
    state("launching…");
    try {
      var r = await sb.rpc("launch_workforce_chat", { p_id: id });
      if (r.error) throw new Error(r.error.message || "Launch failed");
      state("chat created", "ok");
      msg("Specialist chat created. Open it in the workspace to continue.", "ok");
      window.open("/copilot?chat=" + encodeURIComponent(r.data), "_blank", "noopener");
    } catch (e) {
      state("launch failed", "err");
      msg(e && e.message ? e.message : "The specialist could not launch.", "err");
    }
  }

  async function load() {
    state("loading…");
    var a = await sb
      .from("workforce_agents")
      .select("*")
      .is("project_id", null)
      .eq("owner_id", user.id)
      .order("created_at")
      .limit(250);
    if (a.error) {
      state("load failed", "err");
      msg("Workforce could not be loaded.", "err");
      return;
    }
    agents = a.data || [];
    var ids = agents.map(function (x) {
      return x.id;
    });
    versions = [];
    if (ids.length) {
      var v = await sb
        .from("workforce_agent_versions")
        .select("*")
        .in("agent_id", ids)
        .order("number", { ascending: false })
        .limit(5000);
      if (v.error) {
        state("load failed", "err");
        msg("Agent versions could not be loaded.", "err");
        return;
      }
      versions = v.data || [];
    }
    var deptSel = $("wfDept");
    var seen = {};
    agents.forEach(function (x) {
      seen[x.department] = true;
    });
    deptSel.innerHTML =
      '<option value="">All departments</option>' +
      Object.keys(seen)
        .sort()
        .map(function (d) {
          return '<option value="' + esc(d) + '">' + esc(d) + "</option>";
        })
        .join("");
    state("loaded", "ok");
    msg("");
    render();
  }

  async function setup() {
    state("setting up…");
    try {
      var r = await sb.rpc("setup_workforce", {});
      if (r.error) throw new Error(r.error.message || "Setup failed");
      state("setup complete", "ok");
      await load();
    } catch (e) {
      state("setup failed", "err");
      msg(e && e.message ? e.message : "The starter workforce could not be set up.", "err");
    }
  }

  function signedIn(session) {
    user = session && session.user ? session.user : null;
    $("wfGate").style.display = user ? "none" : "";
    $("wfApp").style.display = user ? "" : "none";
    if (user) {
      $("wfWhoEmail").textContent = user.email || user.id;
      $("wfWhoDot").className = "st-dot on";
      load();
    }
  }

  function init() {
    if (!window.supabase || !window.supabase.createClient) {
      msg("The Supabase client could not be loaded. Check your connection and reload.", "err");
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    sb.auth.getSession().then(function (res) {
      signedIn(res.data && res.data.session);
    });
    sb.auth.onAuthStateChange(function (_e, session) {
      signedIn(session);
    });

    $("wfSigninForm").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      $("wfGateMsg").textContent = "signing in…";
      var r = await sb.auth.signInWithPassword({
        email: $("wfEmail").value,
        password: $("wfPassword").value,
      });
      $("wfGateMsg").textContent = r.error ? r.error.message || "Sign in failed" : "";
    });
    $("wfSignoutBtn").addEventListener("click", function () {
      sb.auth.signOut();
    });
    $("wfSetupBtn").addEventListener("click", setup);
    $("wfClose").addEventListener("click", closeDrawer);
    $("wfOverlay").addEventListener("click", function (ev) {
      if (ev.target === $("wfOverlay")) closeDrawer();
    });
    $("wfDept").addEventListener("change", render);
    $("wfSearch").addEventListener("input", render);
    $("wfGrid").addEventListener("click", function (ev) {
      var t = ev.target.closest ? ev.target.closest("[data-open],[data-launch]") : null;
      if (!t) return;
      if (t.hasAttribute("data-open")) openDrawer(t.getAttribute("data-open"));
      else launch(t.getAttribute("data-launch"));
    });
    $("wfDrawerBody").addEventListener("click", function (ev) {
      var t = ev.target.closest ? ev.target.closest("[data-launch]") : null;
      if (t) launch(t.getAttribute("data-launch"));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
