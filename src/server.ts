import { Hono } from "hono";
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";
import { ExperimentResource } from "./resources/experiment";
import { AgentResource } from "./resources/agent";
import { PublicationResource } from "./resources/publication";
import { SolutionResource } from "./resources/solutions";

const app = new Hono();

const sanitizeText = (value: unknown): string => {
  const input = value === null || value === undefined ? "" : String(value);
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text: string) =>
      text.replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
  });
};

const sanitizeMarkdown = (value: unknown): string => {
  const input = value === null || value === undefined ? "" : String(value);
  try {
    const html = marked.parse(input, { async: false }) as string;
    return sanitizeHtml(html, {
      allowedTags: [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "br",
        "hr",
        "ul",
        "ol",
        "li",
        "strong",
        "em",
        "u",
        "s",
        "del",
        "code",
        "pre",
        "blockquote",
        "a",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
      ],
      allowedAttributes: {
        a: ["href", "title"],
        code: ["class"],
        pre: ["class"],
      },
      allowedSchemes: ["http", "https", "mailto"],
    });
  } catch (error) {
    // Fallback to plain text sanitization if markdown parsing fails
    return sanitizeText(input);
  }
};

const safeScriptJSON = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const STATUS_CLASSES = new Set(["submitted", "published", "rejected"]);
const GRADE_CLASSES = new Set([
  "strong_accept",
  "accept",
  "reject",
  "strong_reject",
]);
const REASON_CLASSES = new Set([
  "no_previous",
  "previous_wrong",
  "previous_improved",
  "new_approach",
]);

const safeStatusClass = (status: unknown): string => {
  const normalized = String(status ?? "").toLowerCase();
  return STATUS_CLASSES.has(normalized) ? normalized : "unknown";
};

const safeGradeClass = (grade: unknown): string => {
  const normalized = String(grade ?? "").toLowerCase();
  return GRADE_CLASSES.has(normalized) ? normalized : "unknown";
};

const safeReasonClass = (reason: unknown): string => {
  const normalized = String(reason ?? "").toLowerCase();
  return REASON_CLASSES.has(normalized) ? normalized : "unknown";
};

// Base HTML template
const baseTemplate = (title: string, content: string, breadcrumb?: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sanitizeText(title)}</title>
  <style>
    body {
      font-family: monospace;
      margin: 0;
      padding: 20px;
      background: #fff;
      line-height: 1.6;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 8px;
      # box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .breadcrumb {
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
      color: #666;
      font-size: 0.9em;
    }
    .breadcrumb a {
      color: #0066cc;
      text-decoration: none;
    }
    .breadcrumb a:hover {
      text-decoration: underline;
    }
    .nav {
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .nav a {
      color: #0066cc;
      text-decoration: none;
      margin-right: 20px;
      font-weight: 500;
    }
    .nav a:hover { text-decoration: underline; }
    .card {
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 10px;
      margin-bottom: 15px;
      background: #fafafa;
    }
    .card h3 { margin-top: 0; color: #333; }
    .meta { font-size: 0.9em; color: #666; margin-top: 5px; }
    .status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8em;
      font-weight: bold;
    }
    .status.published { background: #d4edda; color: #155724; }
    .status.submitted { background: #d1ecf1; color: #0c5460; }
    .status.rejected { background: #f8d7da; color: #721c24; }
    .grade {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.75em;
      font-weight: bold;
      margin-right: 5px;
    }
    .grade.strong_accept { background: #28a745; color: white; }
    .grade.accept { background: #6c757d; color: white; }
    .grade.reject { background: #dc3545; color: white; }
    .grade.strong_reject { background: #343a40; color: white; }
    .citations { margin-top: 10px; font-size: 0.9em; }
    .citation { margin: 5px 0; }
    .abstract {
      background: #f8f9fa;
      padding-left: 10px;
      padding-right: 10px;
      margin: 10px 0;
      font-style: italic;
      border-left: 3px solid #bbb;
    }
    .content {
      white-space: pre-wrap;
      margin-top: 10px;
    }
    .markdown-content {
      white-space: normal;
      line-height: 1.8;
    }
    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3,
    .markdown-content h4,
    .markdown-content h5,
    .markdown-content h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      color: #333;
    }
    .markdown-content h1 { font-size: 1.8em; border-bottom: 2px solid #ddd; padding-bottom: 0.3em; }
    .markdown-content h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    .markdown-content h3 { font-size: 1.3em; }
    .markdown-content h4 { font-size: 1.1em; }
    .markdown-content p {
      margin: 1em 0;
    }
    .markdown-content ul,
    .markdown-content ol {
      margin: 1em 0;
      padding-left: 2em;
    }
    .markdown-content li {
      margin: 0.5em 0;
    }
    .markdown-content code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .markdown-content pre {
      background: #f4f4f4;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 1em 0;
    }
    .markdown-content pre code {
      background: none;
      padding: 0;
    }
    .markdown-content blockquote {
      border-left: 4px solid #ddd;
      padding-left: 1em;
      margin: 1em 0;
      color: #666;
      font-style: italic;
    }
    .markdown-content a {
      color: #0066cc;
      text-decoration: none;
    }
    .markdown-content a:hover {
      text-decoration: underline;
    }
    .markdown-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    .markdown-content th,
    .markdown-content td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    .markdown-content th {
      background: #f4f4f4;
      font-weight: bold;
    }
    .markdown-content hr {
      border: none;
      border-top: 2px solid #ddd;
      margin: 2em 0;
    }
    .reason-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: bold;
      margin-right: 8px;
    }
    .reason-badge.no_previous { background: #e3f2fd; color: #1565c0; }
    .reason-badge.previous_wrong { background: #ffebee; color: #c62828; }
    .reason-badge.previous_improved { background: #f3e5f5; color: #7b1fa2; }
    .reason-badge.new_approach { background: #e8f5e8; color: #2e7d32; }
    .count { color: #666; font-weight: normal; }
    .evolution-carousel {
      border: 1px solid #ddd;
      border-radius: 3px;
      background: #fafafa;
      margin-bottom: 15px;
    }
    .evolution-header {
      padding: 10px;
      border-bottom: 1px solid #ddd;
      justify-content: space-between;
      align-items: center;
      background: #f0f0f0;
    }
    .evolution-header a {
      color: #0066cc;
      text-decoration: none;
      font-weight: 500;
      cursor: pointer;
    }
    .evolution-content {
      padding: 15px;
    }
    .evolution-meta {
      font-size: 0.9em;
      color: #666;
      margin-bottom: 10px;
    }
    .diff-view {
      margin-top: 15px;
    }
    .diff-header {
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }
    .diff-content {
      white-space: pre-wrap;
      background: #f8f9fa;
      padding: 10px;
      border-radius: 3px;
      border: 1px solid #ddd;
    }
    .diff-added {
      background-color: #d4edda;
      color: #155724;
    }
    .diff-removed {
      background-color: #f8d7da;
      color: #721c24;
    }
    .solution-chart {
      margin: 15px 0;
    }
    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 10px;
      font-size: 0.9em;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .legend-color {
      width: 16px;
      height: 3px;
      border-radius: 1px;
    }
    #solutionChart {
      border: 1px solid #ddd;
      border-radius: 3px;
      background: white;
    }
    .chart-axis {
      stroke: #666;
      stroke-width: 1;
    }
    .chart-grid {
      stroke: #eee;
      stroke-width: 0.5;
    }
    .chart-text {
      fill: #666;
      font-size: 11px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    ${breadcrumb ? `<div class="breadcrumb">${breadcrumb}</div>` : ""}
    ${content}
  </div>
</body>
</html>
`;

// Helper to create experiment nav for pages within an experiment
const experimentNav = (experimentId: number, current: string) => `
  <div class="nav">
    <a href="/experiments/${experimentId}"${
      current === "overview" ? ' style="font-weight: bold;"' : ""
    }>Overview</a>
    <a href="/experiments/${experimentId}/agents"${
      current === "agents" ? ' style="font-weight: bold;"' : ""
    }>Agents</a>
    <a href="/experiments/${experimentId}/publications"${
      current === "publications" ? ' style="font-weight: bold;"' : ""
    }>Publications</a>
    <a href="/experiments/${experimentId}/solutions"${
      current === "solutions" ? ' style="font-weight: bold;"' : ""
    }>Solutions</a>
  </div>
`;

// Helper to get solution color for charts
const getSolutionColor = (index: number) => {
  const colors = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
    "#aec7e8",
    "#ffbb78",
    "#98df8a",
    "#ff9896",
    "#c5b0d5",
  ];
  return colors[index % colors.length];
};

// Prepare chart data for solution evolution timeline
const prepareChartData = (solutions: any[]) => {
  if (solutions.length === 0) {
    return { timePoints: [], publicationLines: [] };
  }

  // Get all unique timestamps and sort them
  const allTimestamps = solutions.map((sol) =>
    new Date(sol.toJSON().created).getTime(),
  );
  const uniqueTimestamps = [...new Set(allTimestamps)].sort();
  const timePoints = uniqueTimestamps.map((ts) => new Date(ts));

  // Get all unique publication references
  const publicationRefs = new Set<string>();
  solutions.forEach((sol) => {
    const solData = sol.toJSON();
    if (solData.publication && solData.publication.reference) {
      publicationRefs.add(solData.publication.reference);
    }
  });

  // Sort solutions by creation time
  const sortedSolutions = solutions
    .map((sol) => sol.toJSON())
    .sort(
      (a: any, b: any) =>
        new Date(a.created).getTime() - new Date(b.created).getTime(),
    );

  // Track current solution support for each publication over time
  const publicationSupport = new Map<string, number>();
  const agentCurrentSolution = new Map<number, string>(); // agentId -> current publication reference

  // Create timeline data
  const publicationLines = new Map<string, any>();
  let colorIndex = 0;

  // Initialize publication lines
  Array.from(publicationRefs).forEach((ref) => {
    publicationLines.set(ref, {
      reference: ref,
      points: [],
      color: getSolutionColor(colorIndex++),
      currentSupport: 0,
    });
    publicationSupport.set(ref, 0);
  });

  // Process each solution in chronological order
  sortedSolutions.forEach((solution) => {
    const agentId = solution.agent.id;
    const newRef = solution.publication ? solution.publication.reference : null;
    const solutionTime = new Date(solution.created);

    // Get agent's previous solution
    const previousRef = agentCurrentSolution.get(agentId);

    // Update support counts
    if (previousRef && publicationSupport.has(previousRef)) {
      const newSupport = Math.max(0, publicationSupport.get(previousRef)! - 1);
      publicationSupport.set(previousRef, newSupport);

      // Add point to previous publication line
      const prevLine = publicationLines.get(previousRef);
      if (prevLine) {
        prevLine.points.push({
          time: solutionTime,
          support: newSupport,
        });
        prevLine.currentSupport = newSupport;
      }
    }

    if (newRef && publicationSupport.has(newRef)) {
      const newSupport = publicationSupport.get(newRef)! + 1;
      publicationSupport.set(newRef, newSupport);

      // Add point to new publication line
      const newLine = publicationLines.get(newRef);
      if (newLine) {
        newLine.points.push({
          time: solutionTime,
          support: newSupport,
        });
        newLine.currentSupport = newSupport;
      }

      // Update agent's current solution
      agentCurrentSolution.set(agentId, newRef);
    } else if (newRef === null) {
      // Agent removed their solution (no publication)
      agentCurrentSolution.delete(agentId);
    }
  });

  // Convert map to array and filter out publications with no points
  const publicationLinesArray = Array.from(publicationLines.values())
    .filter((line) => line.points.length > 0)
    .map((line) => {
      // Sort points by time
      line.points.sort(
        (a: any, b: any) =>
          new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
      return line;
    });

  return {
    timePoints,
    publicationLines: publicationLinesArray,
  };
};

// Home page - List all experiments
app.get("/", async (c) => {
  const experiments = (await ExperimentResource.all()).sort(
    (a, b) => b.toJSON().created.getTime() - a.toJSON().created.getTime(),
  );

  const content = `
    <h1>Experiments</h1>
    ${experiments
      .map((exp) => {
        const data = exp.toJSON();
        return `
        <div class="card">
          <h3><a href="/experiments/${data.id}">${sanitizeText(data.name)}</a></h3>
          <div class="meta">
            Created: ${sanitizeText(data.created.toLocaleString())} |
            Updated: ${sanitizeText(data.updated.toLocaleString())}
          </div>
        </div>
      `;
      })
      .join("")}
  `;

  return c.html(baseTemplate("Experiments", content));
});

// Experiment overview
app.get("/experiments/:id", async (c) => {
  const id = parseInt(c.req.param("id"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const experimentAgents = await AgentResource.listByExperiment(experiment);
  const experimentPublications =
    await PublicationResource.listByExperiment(experiment);
  const experimentSolutions =
    await SolutionResource.listByExperiment(experiment);

  const expData = experiment.toJSON();

  const experimentName = sanitizeText(expData.name);
  const content = `
    ${experimentNav(id, "overview")}
    <div class="card">
      <h3>${experimentName}</h3>
      <div class="meta">
        Created: ${sanitizeText(expData.created.toLocaleString())} |
        Updated: ${sanitizeText(expData.updated.toLocaleString())} |
        Agents: ${experimentAgents.length} |
        Publications: ${experimentPublications.length} |
        Solutions: ${experimentSolutions.length}
      </div>
    </div>
    <div class="card">
      <div class="content">${sanitizeText(expData.problem)}</div>
    </div>
  `;

  const breadcrumb = `<a href="/">Experiments</a> > ${experimentName}`;
  return c.html(baseTemplate(expData.name, content, breadcrumb));
});

// Experiment agents
app.get("/experiments/:id/agents", async (c) => {
  const id = parseInt(c.req.param("id"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const experimentAgents = await AgentResource.listByExperiment(experiment);
  const expData = experiment.toJSON();
  const experimentName = sanitizeText(expData.name);

  const content = `
    ${experimentNav(id, "agents")}
    ${experimentAgents
      .map((agent) => {
        const agentData = agent.toJSON();
        return `
        <div class="card">
          <h3><a href="/experiments/${id}/agents/${agentData.id}">${sanitizeText(
            agentData.name,
          )}</a></h3>
          <div class="meta">
            Provider: ${sanitizeText(agentData.provider)} | Model: ${sanitizeText(
              agentData.model,
            )} |
            Thikning: ${sanitizeText(agentData.thinking)} | Evolutions: ${
              agentData.evolutions.length
            } |
            Created: ${sanitizeText(agentData.created.toLocaleString())}
          </div>
        </div>
      `;
      })
      .join("")}
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${experimentName}</a> > Agents`;
  return c.html(baseTemplate("Agents", content, breadcrumb));
});

// Agent detail
app.get("/experiments/:id/agents/:agentId", async (c) => {
  const id = parseInt(c.req.param("id"));
  const agentId = parseInt(c.req.param("agentId"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const agents = await AgentResource.listByExperiment(experiment);
  const agent = agents.find((a) => a.toJSON().id === agentId);
  if (!agent) return c.notFound();

  const agentPublications = await PublicationResource.listByAuthor(
    experiment,
    agent,
  );
  const agentSolutions = await SolutionResource.listByAgent(experiment, agent);

  const agentData = agent.toJSON();
  const expData = experiment.toJSON();
  const agentName = sanitizeText(agentData.name);
  const experimentName = sanitizeText(expData.name);

  const evolutionsCarousel =
    agentData.evolutions.length > 0
      ? `

    <h2>Evolutions <span class="count">(${
      agentData.evolutions.length
    })</span></h2>
    <div class="evolution-carousel">
      <div class="evolution-header">
        <a onclick="previousEvolution()" id="prevBtn">← Prev</a>
        <span id="evolutionCounter">1 / ${agentData.evolutions.length}</span>
        <a onclick="nextEvolution()" id="nextBtn">Next →</a>
      </div>
      <div class="evolution-content">
        <div id="evolutionDisplay">
          <div class="evolution-meta" id="evolutionMeta">
            Evolution #${
              agentData.evolutions.length
            } (Latest) - Created: ${sanitizeText(
              agentData.evolutions[0].created.toLocaleString(),
            )}
          </div>
          <div class="diff-content" id="diffContent"></div>
        </div>
      </div>
    </div>
    <script>
      let currentEvolutionIndex = 0;
      const evolutions = ${safeScriptJSON(agentData.evolutions)};
      const escapeHtml = (value) =>
        String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      function updateEvolutionDisplay() {
        const evolution = evolutions[currentEvolutionIndex];
        const evolutionNumber = evolutions.length - currentEvolutionIndex;

        document.getElementById('evolutionMeta').textContent =
          \`Evolution #\${evolutionNumber}\ - Created: \${new Date(evolution.created).toLocaleString()}\`;
        document.getElementById('evolutionCounter').textContent = \`\${currentEvolutionIndex + 1} / \${evolutions.length}\`;

        document.getElementById('prevBtn').disabled = currentEvolutionIndex === 0;
        document.getElementById('nextBtn').disabled = currentEvolutionIndex === evolutions.length - 1;

        updateDiff();
      }

      function previousEvolution() {
        if (currentEvolutionIndex > 0) {
          currentEvolutionIndex--;
          updateEvolutionDisplay();
        }
      }

      function nextEvolution() {
        if (currentEvolutionIndex < evolutions.length - 1) {
          currentEvolutionIndex++;
          updateEvolutionDisplay();
        }
      }

      function simpleDiff(oldText, newText) {
        const oldLines = String(oldText).split('\\n');
        const newLines = String(newText).split('\\n');
        const result = [];

        let i = 0, j = 0;
        while (i < oldLines.length || j < newLines.length) {
          if (i >= oldLines.length) {
            result.push(\`<span class="diff-added">+ \${escapeHtml(newLines[j])}</span>\`);
            j++;
          } else if (j >= newLines.length) {
            result.push(\`<span class="diff-removed">- \${escapeHtml(oldLines[i])}</span>\`);
            i++;
          } else if (oldLines[i] === newLines[j]) {
            // result.push(\`  \${oldLines[i]}\`);
            i++; j++;
          } else {
            result.push(\`<span class="diff-removed">- \${escapeHtml(oldLines[i])}</span>\`);
            result.push(\`<span class="diff-added">+ \${escapeHtml(newLines[j])}</span>\`);
            i++; j++;
          }
        }

        return result.join('\\n');
      }

      function updateDiff() {
        if (evolutions.length < 2) {
          document.getElementById('diffContent').textContent = 'No base evolution to compare with.';
          return;
        }

        const baseEvolution = evolutions[evolutions.length - 1];
        const currentEvolution = evolutions[currentEvolutionIndex];
        const diff = simpleDiff(baseEvolution.system, currentEvolution.system);

        document.getElementById('diffContent').innerHTML = diff;
      }

      updateEvolutionDisplay();
    </script>
  `
      : "";

  const content = `
    ${experimentNav(id, "agents")}
    <h1>${agentName}</h1>
    <div class="card">
      <p><strong>Provider:</strong> ${sanitizeText(agentData.provider)}</p>
      <p><strong>Model:</strong> ${sanitizeText(agentData.model)}</p>
      <div class="meta">Created: ${sanitizeText(
        agentData.created.toLocaleString(),
      )}</div>
    </div>

    ${evolutionsCarousel}

    <h2>Publications <span class="count">(${
      agentPublications.length
    })</span></h2>
    ${agentPublications
      .map((pub) => {
        const pubData = pub.toJSON();
        const statusClass = safeStatusClass(pubData.status);
        return `
        <div class="card">
          <h3><a href="/experiments/${id}/publications/${pubData.id}">${sanitizeText(
            pubData.title,
          )}</a></h3>
          <div class="abstract">${sanitizeText(pubData.abstract)}</div>
          <div class="meta">
            <span class="status ${statusClass}">${sanitizeText(
              pubData.status,
            )}</span> |
            Reference: ${sanitizeText(pubData.reference)}
          </div>
        </div>
      `;
      })
      .join("")}

    <h2>Solutions <span class="count">(${agentSolutions.length})</span></h2>
    ${agentSolutions
      .map((sol) => {
        const solData = sol.toJSON();
        const reasonClass = safeReasonClass(solData.reason);
        return `
        <div class="card">
          <h3>Solution</h3>
          <div><span class="reason-badge ${
            reasonClass
          }">${sanitizeText(solData.reason.replace("_", " "))}</span></div>
          <p>${sanitizeText(solData.rationale)}</p>
          <div class="meta">Created: ${sanitizeText(
            solData.created.toLocaleString(),
          )}</div>
        </div>
      `;
      })
      .join("")}
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${experimentName}</a> > <a href="/experiments/${id}/agents">Agents</a> > ${agentName}`;
  return c.html(baseTemplate(agentData.name, content, breadcrumb));
});

// Experiment publications
app.get("/experiments/:id/publications", async (c) => {
  const id = parseInt(c.req.param("id"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const experimentPublications =
    await PublicationResource.listByExperiment(experiment);
  const expData = experiment.toJSON();
  const experimentName = sanitizeText(expData.name);

  const content = `
    ${experimentNav(id, "publications")}
    ${experimentPublications
      .map((pub) => {
        const pubData = pub.toJSON();
        const statusClass = safeStatusClass(pubData.status);
        return `
        <div class="card">
          <h3><a href="/experiments/${id}/publications/${pubData.id}">${sanitizeText(
            pubData.title,
          )}</a></h3>
          <div class="abstract">${sanitizeText(pubData.abstract)}</div>
          <div class="meta">
            Author: ${sanitizeText(pubData.author.name)} |
            <span class="status ${statusClass}">${sanitizeText(
              pubData.status,
            )}</span> |
            Reference: ${sanitizeText(pubData.reference)} |
            Created: ${sanitizeText(pubData.created.toLocaleString())} |
            Citations: ${pubData.citations.to.length} |
            Reviews: ${
              pubData.reviews
                .filter((r) => r.grade)
                .map(
                  (r) =>
                    `<span class="grade ${safeGradeClass(
                      r.grade,
                    )}">${sanitizeText(r.grade ?? "")}</span>`,
                )
                .join("") || "No reviews yet"
            }
          </div>
        </div>
      `;
      })
      .join("")}
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${experimentName}</a> > Publications`;
  return c.html(baseTemplate("Publications", content, breadcrumb));
});

// Publication detail
app.get("/experiments/:id/publications/:pubId", async (c) => {
  const id = parseInt(c.req.param("id"));
  const pubId = parseInt(c.req.param("pubId"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const publications = await PublicationResource.listByExperiment(experiment);
  const publication = publications.find((p) => p.toJSON().id === pubId);
  if (!publication) return c.notFound();

  const pubData = publication.toJSON();
  const expData = experiment.toJSON();
  const publicationTitle = sanitizeText(pubData.title);
  const publicationAuthor = sanitizeText(pubData.author.name);
  const publicationStatus = sanitizeText(pubData.status);
  const publicationReference = sanitizeText(pubData.reference);
  const publicationAbstract = sanitizeText(pubData.abstract);
  const publicationCreated = sanitizeText(pubData.created.toLocaleString());
  const experimentName = sanitizeText(expData.name);
  const publicationStatusClass = safeStatusClass(pubData.status);

  const content = `
    ${experimentNav(id, "publications")}
    <h1>${publicationTitle}</h1>
    <div class="card">
      <p><strong>Author:</strong> ${publicationAuthor}</p>
      <p><strong>Status:</strong> <span class="status ${publicationStatusClass}">${publicationStatus}</span></p>
      <p><strong>Reference:</strong> ${publicationReference}</p>
      <div class="abstract"><strong>Abstract:</strong> ${publicationAbstract}</div>
      <div class="meta">Created: ${publicationCreated}</div>
    </div>
    <div class="card">
      <h3>Content</h3>
      <div class="content markdown-content">${sanitizeMarkdown(pubData.content ?? "")}</div>
    </div>
    ${
      pubData.citations.from.length > 0
        ? `
      <h2>Citations From This Publication <span class="count">(${
        pubData.citations.from.length
      })</span></h2>
      <div class="citations">
        ${pubData.citations.from
          .map(
            (cit) => `
          <div class="citation">→ <a href="/experiments/${id}/publications/${cit.to}">${sanitizeText(
            String(cit.to),
          )}</a></div>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }
    ${
      pubData.citations.to.length > 0
        ? `
      <h2>Citations To This Publication <span class="count">(${
        pubData.citations.to.length
      })</span></h2>
      <div class="citations">
        ${pubData.citations.to
          .map(
            (cit) => `
          <div class="citation">← <a href="/experiments/${id}/publications/${cit.from}">${sanitizeText(
            String(cit.from),
          )}</a></div>
        `,
          )
          .join("")}
      </div>
    `
        : ""
    }
    ${
      pubData.reviews.length > 0
        ? `
      <h2>Reviews <span class="count">(${pubData.reviews.length})</span></h2>
      ${pubData.reviews
        .map(
          (review) => `
        <div class="card">
          <h3>Review by ${sanitizeText(review.author.name || "Unknown")}</h3>
          ${
            review.grade
              ? `<span class="grade ${safeGradeClass(
                  review.grade,
                )}">${sanitizeText(review.grade.replace("_", " "))}</span>`
              : ""
          }
          <div class="meta">Created: ${
            review.created
              ? sanitizeText(new Date(review.created).toLocaleString())
              : "Unknown"
          }</div>
        </div>
        ${
          review.content
            ? `
        <div class="card">
          <div class="content markdown-content">${sanitizeMarkdown(
            review.content || "(empty)",
          )}</div>
        </div>
        `
            : ""
        }
      `,
        )
        .join("")}
    `
        : ""
    }
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${experimentName}</a> > <a href="/experiments/${id}/publications">Publications</a> > ${publicationTitle}`;
  return c.html(baseTemplate(pubData.title, content, breadcrumb));
});

// Experiment solutions
app.get("/experiments/:id/solutions", async (c) => {
  const id = parseInt(c.req.param("id"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const experimentSolutions =
    await SolutionResource.listByExperiment(experiment);
  const experimentAgents = await AgentResource.listByExperiment(experiment);
  const expData = experiment.toJSON();
  const experimentName = sanitizeText(expData.name);

  // Prepare data for the timeline chart
  const chartData = prepareChartData(experimentSolutions);

  const content = `
    ${experimentNav(id, "solutions")}
    ${
      chartData.publicationLines.length > 0
        ? `
    <div class="card">
      <h3>Solution Evolution Timeline</h3>
      <div class="solution-chart">
        <svg id="solutionChart" width="100%" height="300" viewBox="0 0 800 300">
          <!-- Chart will be rendered here by JavaScript -->
        </svg>
        <div class="chart-legend">
          ${chartData.publicationLines
            .map(
              (line, index) => `
            <div class="legend-item">
              <div class="legend-color" style="background-color: ${line.color};"></div>
              <span>${sanitizeText(
                line.reference,
              )} (current: ${line.currentSupport})</span>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    </div>

    <script>
      const chartData = ${safeScriptJSON(chartData)};
      const escapeHtml = (value) =>
        String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      function renderSolutionChart(data) {
        const svg = document.getElementById('solutionChart');
        const width = 800;
        const height = 300;
        const margin = { top: 20, right: 20, bottom: 60, left: 60 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        // Clear existing content
        svg.innerHTML = '';

        if (!data.publicationLines || data.publicationLines.length === 0) {
          svg.innerHTML = '<text x="400" y="150" text-anchor="middle" class="chart-text">No publication data available</text>';
          return;
        }

        // Get time and support ranges
        const allTimes = data.publicationLines.flatMap(line => line.points.map(p => new Date(p.time)));
        const allSupport = data.publicationLines.flatMap(line => line.points.map(p => p.support));
        const minTime = Math.min(...allTimes.map(t => t.getTime()));
        const maxTime = Math.max(...allTimes.map(t => t.getTime()));
        const maxSupport = Math.max(...allSupport, 1);

        // Create scales
        const xScale = (time) => margin.left + (new Date(time).getTime() - minTime) / (maxTime - minTime) * chartWidth;
        const yScale = (support) => height - margin.bottom - (support / maxSupport) * chartHeight;

        // Draw grid lines
        const numGridLines = 5;
        for (let i = 0; i <= numGridLines; i++) {
          const x = margin.left + (i / numGridLines) * chartWidth;
          svg.innerHTML += \`<line x1="\${x}" y1="\${margin.top}" x2="\${x}" y2="\${height - margin.bottom}" class="chart-grid" />\`;
        }

        // Draw horizontal grid lines for support levels
        for (let i = 0; i <= maxSupport; i++) {
          const y = yScale(i);
          svg.innerHTML += \`<line x1="\${margin.left}" y1="\${y}" x2="\${width - margin.right}" y2="\${y}" class="chart-grid" />\`;
        }

        // Draw axes
        svg.innerHTML += \`<line x1="\${margin.left}" y1="\${margin.top}" x2="\${margin.left}" y2="\${height - margin.bottom}" class="chart-axis" />\`;
        svg.innerHTML += \`<line x1="\${margin.left}" y1="\${height - margin.bottom}" x2="\${width - margin.right}" y2="\${height - margin.bottom}" class="chart-axis" />\`;

        // Draw time labels
        for (let i = 0; i <= 4; i++) {
          const timeRatio = i / 4;
          const time = new Date(minTime + timeRatio * (maxTime - minTime));
          const x = margin.left + timeRatio * chartWidth;
          svg.innerHTML += \`<text x="\${x}" y="\${height - margin.bottom + 15}" text-anchor="middle" class="chart-text">\${time.toLocaleDateString()}</text>\`;
        }

        // Draw support level labels
        for (let i = 0; i <= maxSupport; i++) {
          const y = yScale(i);
          svg.innerHTML += \`<text x="\${margin.left - 10}" y="\${y + 3}" text-anchor="end" class="chart-text">\${i}</text>\`;
        }

        // Draw publication lines
        data.publicationLines.forEach((line) => {
          if (line.points.length === 0) return;

          let pathData = '';
          let prevX = null;
          let prevY = null;

          line.points.forEach((point, pointIndex) => {
            const x = xScale(point.time);
            const y = yScale(point.support);

            if (pointIndex === 0) {
              // Start from support level 0 at first time point
              const startY = yScale(0);
              pathData += \`M \${x} \${startY} L \${x} \${y}\`;
              prevX = x;
              prevY = y;
            } else {
              // Stairs-style: horizontal then vertical
              pathData += \` L \${x} \${prevY} L \${x} \${y}\`;
              prevX = x;
              prevY = y;
            }
          });

          // Extend line to current time if it's the last point
          if (line.points.length > 0) {
            const lastPoint = line.points[line.points.length - 1];
            const currentX = Math.min(width - margin.right, xScale(new Date()));
            pathData += \` L \${currentX} \${yScale(lastPoint.support)}\`;
          }

          svg.innerHTML += \`<path d="\${pathData}" stroke="\${line.color}" stroke-width="2" fill="none" />\`;

          // Add publication reference label
          if (line.points.length > 0) {
            const lastPoint = line.points[line.points.length - 1];
            const labelX = Math.min(width - margin.right - 5, xScale(new Date()));
            const labelY = yScale(lastPoint.support);
            svg.innerHTML += \`<text x="\${labelX}" y="\${labelY - 5}" text-anchor="end" class="chart-text" fill="\${line.color}">\${escapeHtml(line.reference)}</text>\`;
          }
        });

        // Add axis labels
        svg.innerHTML += \`<text x="\${margin.left - 45}" y="\${height / 2}" text-anchor="middle" class="chart-text" transform="rotate(-90, \${margin.left - 45}, \${height / 2})">Support Count</text>\`;
        svg.innerHTML += \`<text x="\${width / 2}" y="\${height - 10}" text-anchor="middle" class="chart-text">Time</text>\`;
      }

      renderSolutionChart(chartData);
    </script>
    `
        : ""
    }

    ${experimentSolutions
      .map((sol) => {
        const solData = sol.toJSON();
        const reasonClass = safeReasonClass(solData.reason);
        return `
        <div class="card">
          <h3>Solution by ${sanitizeText(solData.agent.name)}</h3>
          <div><span class="reason-badge ${
            reasonClass
          }">${sanitizeText(solData.reason.replace("_", " "))}</span>
          ${
            solData.publication
              ? `
            <a href="/experiments/${id}/publications/${solData.publication.id}">${sanitizeText(
              solData.publication.reference,
            )}</a>`
              : ""
          }
          </div>
          <p>${sanitizeText(solData.rationale)}</p>
          <div class="meta">Created: ${sanitizeText(
            solData.created.toLocaleString(),
          )}</div>
        </div>
      `;
      })
      .join("")}
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${experimentName}</a> > Solutions`;
  return c.html(baseTemplate("Solutions", content, breadcrumb));
});

export default app;
