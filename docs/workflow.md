# Unified workflow (F-05d)

An external AI agent drives the workflow. This module observes current artifacts and chooses a bounded next task; it does not call an LLM or substitute heuristic task selection for creative/technical reasoning.

```sh
avp workflow next
avp workflow step --hash TASK_HASH
avp workflow step --hash TASK_HASH --allow-actions --allow-launch
```

Every decision includes a taskHash bound to source/config and current decision, plus owner and stage. Only NEXT tasks are executed. AGENT_REQUIRED means the agent must investigate/author a real solution using existing project intelligence, storyboard, adapter or skill workflows. REVIEW_REQUIRED means use the existing explicit review command; the orchestrator never approves on behalf of a user. BLOCKED means diagnose/repair. When a valid frozen Build exists, delegate one step to the existing production executor. Production recovery uses the existing production diagnose/step commands.

Build steps allow bounded static analysis, bundled capability matching, draft creation without overwriting existing planning, canonical recompilation, authorized managed runtime/adapter trials and authorized missing scene rehearsal. Source/config drift invalidates the appropriate caches. Source-derived gaps are not proven behavior; unresolved required capabilities are handed to the agent, never auto-installed. Opt-in creative director projects without a source-linked storyboard are directed to author one. Risk priority is a simple adapter/action heuristic, not semantic risk assessment. Failed/stale rehearsal needs explicit inspection rather than automatic replay. Voice listening, creative approval, coverage/storyboard review and freeze are explicit checkpoints. Existing direct CLI remains available for reviewed repair, and existing gates are authoritative.

The local workflow journal records RUNNING/EXECUTED/FAILED, duration and safe failure codes for each config/source/engine revision. Maximum 100 Build dispatches, three attempts per task key and 600000 ms of observed completed/failed dispatch time per revision. These are conservative dispatch bounds, not a hard wall-clock deadline, token budget, or paid API allowance. Interrupted or failed steps require manual inspection and task-specific repair; no automatic replay. A crash may leave step.lock; inspect process before manual cleanup. Lock is only for workflow invocations, not all CLI mutations. No automatic retry, external model calls, online skill search, app install, or cross-scene dependencies. A frozen Build and actual production QA remain necessary.

Use workflow next after each external agent decision or explicit review. Return to Build by changing canonical inputs via reviewed commands, then use the same workflow. The orchestration layer is not an autonomous agent benchmark.
