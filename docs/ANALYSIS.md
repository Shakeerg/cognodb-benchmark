# Analysis

_To be written after a real benchmark run against live accounts — see README.md §8._

This file should cover, once real numbers exist:

1. **Headline takeaways** — 2-3 sentences on what the numbers show overall, without
   declaring a "winner" (the assignment explicitly grades methodology and honesty, not
   which database comes out on top).
2. **Where CognoDB is competitive, and where it isn't** — with specific metrics cited.
3. **Root-cause reasoning** — e.g. if Memgraph's in-memory model shows lower read
   latency but ArangoDB's multi-model storage shows different aggregation performance,
   explain *why* the architecture would predict that, not just report the number.
4. **Traversal depth scaling** — how each platform's 1-hop → 2-hop → 3-hop latency
   scales; whether any platform shows non-linear degradation and a hypothesis why.
5. **Concurrency behavior** — how throughput and error rate change across the
   concurrency sweep (1/10/40 clients); whether any platform's free tier visibly
   throttles under load.
6. **Fairness caveats that affect interpretation** — e.g. if any platform's actual
   provisioned resources ended up not perfectly matching CognoDB's tier despite best
   efforts, state the deviation and how it likely affected results.
7. **What a harness user should extend next** — e.g. additional platforms, larger
   dataset sizes, cold-start-specific measurement.