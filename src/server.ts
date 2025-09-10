import { Hono } from "hono";
import { ExperimentResource } from "./resources/experiment";
import { AgentResource } from "./resources/agent";
import { PublicationResource } from "./resources/publication";
import { SolutionResource } from "./resources/solutions";

const app = new Hono();

// Base HTML template
const baseTemplate = (title: string, content: string, breadcrumb?: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
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

// Home page - List all experiments
app.get("/", async (c) => {
  const allExperiments = await ExperimentResource.all();

  const content = `
    <h1>Experiments</h1>
    ${allExperiments
      .map((exp) => {
        const data = exp.toJSON();
        return `
        <div class="card">
          <h3><a href="/experiments/${data.id}">${data.name}</a></h3>
          <div class="meta">
            Created: ${data.created.toLocaleString()} |
            Updated: ${data.updated.toLocaleString()}
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
  const experimentPublications = await PublicationResource.listByExperiment(
    experiment
  );
  const experimentSolutions = await SolutionResource.listByExperiment(
    experiment
  );

  const expData = experiment.toJSON();

  const content = `
    ${experimentNav(id, "overview")}
    <div class="card">
      <h3>${expData.name}</h3>
      <div class="meta">
        Created: ${expData.created.toLocaleString()} |
        Updated: ${expData.updated.toLocaleString()} |
        Agents: ${experimentAgents.length} |
        Publications: ${experimentPublications.length} |
        Solutions: ${experimentSolutions.length}
      </div>
    </div>
    <div class="card">
      <div class="content">${expData.problem}</div>
    </div>
  `;

  const breadcrumb = `<a href="/">Experiments</a> > ${expData.name}`;
  return c.html(baseTemplate(expData.name, content, breadcrumb));
});

// Experiment agents
app.get("/experiments/:id/agents", async (c) => {
  const id = parseInt(c.req.param("id"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const experimentAgents = await AgentResource.listByExperiment(experiment);
  const expData = experiment.toJSON();

  const content = `
    ${experimentNav(id, "agents")}
    ${experimentAgents
      .map((agent) => {
        const agentData = agent.toJSON();
        return `
        <div class="card">
          <h3><a href="/experiments/${id}/agents/${agentData.id}">${
          agentData.name
        }</a></h3>
          <div class="meta">
            Provider: ${agentData.provider} | Model: ${agentData.model} |
            Created: ${agentData.created.toLocaleString()}
          </div>
        </div>
      `;
      })
      .join("")}
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${expData.name}</a> > Agents`;
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
    agent
  );
  const agentSolutions = await SolutionResource.listByAgent(experiment, agent);

  const agentData = agent.toJSON();
  const expData = experiment.toJSON();

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
            } (Latest) - Created: ${agentData.evolutions[0].created.toLocaleString()}
          </div>
          <div class="diff-content" id="diffContent"></div>
        </div>
      </div>
    </div>
    <script>
      let currentEvolutionIndex = 0;
      const evolutions = ${JSON.stringify(agentData.evolutions)};

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
        const oldLines = oldText.split('\\n');
        const newLines = newText.split('\\n');
        const result = [];

        let i = 0, j = 0;
        while (i < oldLines.length || j < newLines.length) {
          if (i >= oldLines.length) {
            result.push(\`<span class="diff-added">+ \${newLines[j]}</span>\`);
            j++;
          } else if (j >= newLines.length) {
            result.push(\`<span class="diff-removed">- \${oldLines[i]}</span>\`);
            i++;
          } else if (oldLines[i] === newLines[j]) {
            // result.push(\`  \${oldLines[i]}\`);
            i++; j++;
          } else {
            result.push(\`<span class="diff-removed">- \${oldLines[i]}</span>\`);
            result.push(\`<span class="diff-added">+ \${newLines[j]}</span>\`);
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
    <h1>${agentData.name}</h1>
    <div class="card">
      <p><strong>Provider:</strong> ${agentData.provider}</p>
      <p><strong>Model:</strong> ${agentData.model}</p>
      <div class="meta">Created: ${agentData.created.toLocaleString()}</div>
    </div>

    ${evolutionsCarousel}

    <h2>Publications <span class="count">(${
      agentPublications.length
    })</span></h2>
    ${agentPublications
      .map((pub) => {
        const pubData = pub.toJSON();
        return `
        <div class="card">
          <h3><a href="/experiments/${id}/publications/${pubData.id}">${
          pubData.title
        }</a></h3>
          <div class="abstract">${pubData.abstract}</div>
          <div class="meta">
            <span class="status ${pubData.status.toLowerCase()}">${
          pubData.status
        }</span> |
            Reference: ${pubData.reference}
          </div>
        </div>
      `;
      })
      .join("")}

    <h2>Solutions <span class="count">(${agentSolutions.length})</span></h2>
    ${agentSolutions
      .map((sol) => {
        const solData = sol.toJSON();
        return `
        <div class="card">
          <h3>Solution</h3>
          <div><span class="reason-badge ${
            solData.reason
          }">${solData.reason.replace("_", " ")}</span></div>
          <p>${solData.rationale}</p>
          <div class="meta">Created: ${solData.created.toLocaleString()}</div>
        </div>
      `;
      })
      .join("")}
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${expData.name}</a> > <a href="/experiments/${id}/agents">Agents</a> > ${agentData.name}`;
  return c.html(baseTemplate(agentData.name, content, breadcrumb));
});

// Experiment publications
app.get("/experiments/:id/publications", async (c) => {
  const id = parseInt(c.req.param("id"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const experimentPublications = await PublicationResource.listByExperiment(
    experiment
  );
  const expData = experiment.toJSON();

  const content = `
    ${experimentNav(id, "publications")}
    ${experimentPublications
      .map((pub) => {
        const pubData = pub.toJSON();
        return `
        <div class="card">
          <h3><a href="/experiments/${id}/publications/${pubData.id}">${
          pubData.title
        }</a></h3>
          <div class="abstract">${pubData.abstract}</div>
          <div class="meta">
            Author: ${pubData.author.name} |
            <span class="status ${pubData.status.toLowerCase()}">${
          pubData.status
        }</span> |
            Reference: ${pubData.reference} |
            Created: ${pubData.created.toLocaleString()} |
            Citations: ${pubData.citations.to.length} |
            Reviews: ${
              pubData.reviews
                .filter((r) => r.grade)
                .map(
                  (r) =>
                    `<span class="grade ${r.grade?.toLowerCase()}">${
                      r.grade
                    }</span>`
                )
                .join("") || "No reviews yet"
            }
          </div>
        </div>
      `;
      })
      .join("")}
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${expData.name}</a> > Publications`;
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

  const content = `
    ${experimentNav(id, "publications")}
    <h1>${pubData.title}</h1>
    <div class="card">
      <p><strong>Author:</strong> ${pubData.author.name}</p>
      <p><strong>Status:</strong> <span class="status ${pubData.status.toLowerCase()}">${
    pubData.status
  }</span></p>
      <p><strong>Reference:</strong> ${pubData.reference}</p>
      <div class="abstract"><strong>Abstract:</strong> ${pubData.abstract}</div>
      <div class="meta">Created: ${pubData.created.toLocaleString()}</div>
    </div>
    <div class="card">
      <h3>Content</h3>
      <div class="content">${pubData.content}</div>
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
          <div class="citation">→ <a href="/experiments/${id}/publications/${cit.to}">${cit.to}</a></div>
        `
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
          <div class="citation">← <a href="/experiments/${id}/publications/${cit.from}">${cit.from}</a></div>
        `
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
          <h3>Review by ${review.author?.name || "Unknown"}</h3>
          ${
            review.grade
              ? `<span class="grade ${review.grade.toLowerCase()}">${review.grade.replace(
                  "_",
                  " "
                )}</span>`
              : ""
          }
          <div class="meta">Created: ${
            review.created
              ? new Date(review.created).toLocaleString()
              : "Unknown"
          }</div>
        </div>
        ${
          review.content
            ? `
        <div class="card">
          <div class="content">${review.content || "(empty)"}</div>
        </div>
        `
            : ""
        }
      `
        )
        .join("")}
    `
        : ""
    }
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${expData.name}</a> > <a href="/experiments/${id}/publications">Publications</a> > ${pubData.title}`;
  return c.html(baseTemplate(pubData.title, content, breadcrumb));
});

// Experiment solutions
app.get("/experiments/:id/solutions", async (c) => {
  const id = parseInt(c.req.param("id"));

  const experiment = await ExperimentResource.findById(id);
  if (!experiment) return c.notFound();

  const experimentSolutions = await SolutionResource.listByExperiment(
    experiment
  );
  const expData = experiment.toJSON();

  const content = `
    ${experimentNav(id, "solutions")}
    ${experimentSolutions
      .map((sol) => {
        const solData = sol.toJSON();
        return `
        <div class="card">
          <h3>Solution by ${solData.agent.name}</h3>
          <div><span class="reason-badge ${
            solData.reason
          }">${solData.reason.replace("_", " ")}</span>
          ${
            solData.publication
              ? `
            <a href="/experiments/${id}/publications/${solData.publication.id}">${solData.publication.reference}</a>`
              : ""
          }
          </div>
          <p>${solData.rationale}</p>
          <div class="meta">Created: ${solData.created.toLocaleString()}</div>
        </div>
      `;
      })
      .join("")}
  `;

  const breadcrumb = `<a href="/">Experiments</a> > <a href="/experiments/${id}">${expData.name}</a> > Solutions`;
  return c.html(baseTemplate("Solutions", content, breadcrumb));
});

export default app;
