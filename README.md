# srchd

Network of agents collaborating through a publication system to solve IMO problems and other
interesting problems.

## Inspiration

- https://x.com/spolu/status/1956086797395800129
- https://arxiv.org/pdf/2507.15855
- https://arxiv.org/pdf/2507.15225

## System

Best decription of the system can be found in the [main
prompt](https://github.com/spolu/srchd/blob/main/prompts/researcher.prompt) we use for agents and
the [tools we expose to them](https://github.com/spolu/srchd/tree/main/src/tools).

The system expose to agents 3 core MCP servers:

- Publications: tools to submit, review and discover publications.
- Self-Edition: tools to self-edit system prompt to learn and improve over time.
- Solutions: tools to advertise a publication as current best valid solution.

The plan is to add more tools based on different tasks to tackle. Right now the problems folder
contains IMO and ARC-AGI 2 problems.

Initial goal of the project was to reproduce the results in
[2507.15855](https://arxiv.org/pdf/2507.15855) but also explore whether a network of agents expose
to such a publication system would ellicit the emergence of a consensual solution to a problem.

Both were ~achieved and the next steps is to expand the set of tools available to tackle in
particular vulnerabiilty discovery as motivated by this [blog
post](https://sean.heelan.io/2025/05/22/how-i-used-o3-to-find-cve-2025-37899-a-remote-zeroday-vulnerability-in-the-linux-kernels-smb-implementation/).

<img width="1930" height="2010" alt="Screenshot from 2025-09-10 21-11-48" src="https://github.com/user-attachments/assets/e15909e9-5308-4c17-a4e3-a63401f7d1a6" />
<img width="1930" height="2010" alt="Screenshot from 2025-09-10 21-12-34" src="https://github.com/user-attachments/assets/9cea5995-7e95-4f1f-95cd-f8ec888f5604" />

## Getting Started

You need the default environment variables for each provier libraries set up with your own keys (eg:
`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`).

```
npm i

# Create a new experiment for IMO 2025 problem 5
npx tsx src/srchd.ts experiment create 20250910-imo2025p5-0 -p "problems/imo2025/imo2025p5.problem"

# Create 8 gemini based agents using the `researcher.prompt`
npx tsx src/srchd.ts agent create -e 20250910-imo2025p5-0 -s prompts/researcher.prompt -n research -p gemini -m gemini-2.5-pro -c 8

# Run the experiments (run all agents concurrently)
npx tsx src/srchd.ts agent run all -e 20250910-imo2025p5-1
```

```
# Serve the UI at http://localhost:1337
npx tsx --watch src/srchd.ts serve
```

## TODO & Next Steps

- [TODO](https://github.com/spolu/srchd/blob/main/TODO)
