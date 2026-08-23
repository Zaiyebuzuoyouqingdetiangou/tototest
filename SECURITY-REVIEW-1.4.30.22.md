# Security Review: RabbitMirror 1.4.30.22 working-tree patch

## Scope

Security diff review of the RabbitMirror 1.4.30.22 presentation-quality and mobile semantic-ensemble repair patch.

- Scan mode: working_tree
- Target kind: git_diff
- Target ID: local:tototest-main#1.4.30.22-worktree
- Revision range: fc7ef027533ba649232a82e3bcc8d33e228cb2bf...WORKTREE
- Revision: fc7ef027533ba649232a82e3bcc8d33e228cb2bf
- Snapshot digest: codex-security-snapshot/v1:sha256:f650a75b1704509536c0d9566e8c18ac7a346915e6aba86ebe9dcb62280d183f
- Inventory strategy: diff
- Included paths: index.js, manifest.json, src/independentApi.js, src/injector.js, src/outputSanitizer.js, src/paletteCooldown.js, src/presentationQuality.js, src/promptBuilder.js, src/renderedVisualFeedbackHotfix.js, src/ui.js, src/visualScanner.js
- Excluded paths: tests/\*\*, APPLY-\*.md
- Runtime or test status: All three repository test files passed; all JavaScript and test modules passed syntax checks; static local import resolution found zero missing modules.
- Artifacts reviewed: artifacts/02_discovery/deep_review_input.jsonl, artifacts/02_discovery/work_ledger.jsonl, artifacts/fix_report.md
- Scan context: A repository-scoped threat model was generated for this scan. Two plausible client-side resource-exhaustion candidates were fixed during review and suppressed after deterministic pre-work limits closed their attacker-scaled sinks.

Limitations and exclusions:
- No full-browser timing benchmark was run because the available Playwright installation lacked a Chromium executable; deterministic bounds still closed the security paths, leaving only non-security integration/performance coverage.
- Excluded tests/\*\*: Developer-only tests were executed as validation but are not deployed runtime surfaces.
- Excluded APPLY-\*.md: Release notes are non-executable documentation.

### Scan Summary

| Field | Value |
| --- | --- |
| Reportable findings | 0 |
| Severity mix | none |
| Confidence mix | none |
| Coverage | complete |
| Validation mode | Full changed-file review, static source/control/sink tracing, focused unit/boundary harnesses, and final attack-path closure. |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

RabbitMirror renders model-controlled HTML/CSS inside a trusted SillyTavern page. The dominant boundary is untrusted completion and persisted mirror markup crossing parsing, sanitization, repair, and live DOM mounting.

### Assets

- SillyTavern page and extension UI integrity
- Chat, persona, and World Info confidentiality
- API/profile secret handling
- Browser availability and persisted mirror integrity

### Trust Boundaries

- Model completion and persisted HTML into sanitizer and live DOM
- Chat and World Info into generation prompts and requests
- Remote responses into parsing, storage, restore, and UI rendering
- Shared browser DOM/JavaScript realm with the host and other extensions

### Attacker Capabilities

- Influence model-generated passive and active-looking HTML/CSS
- Supply large nested markup and CSS within generation limits
- Cause persisted untrusted mirror output to be reopened

### Security Objectives

- Never execute model scripts or event attributes
- Block external resource and form/navigation abuse
- Keep generated selectors and layout repair scoped
- Bound automatic work driven by attacker-controlled DOM size

### Assumptions

- The installed extension package and SillyTavern host are trusted
- Host-managed secret/profile storage works as designed
- Compromise of another already-privileged extension is out of scope

## Findings

### No findings

No reportable findings survived the canonical discovery, validation, and reportability gates.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| Prompt and module graph | Prompt interpolation and cache/version consistency | No issue found | Prompt additions are inert text constraints and all changed module imports converge on 1.4.30.22; no executable or privileged sink was added. Evidence: artifacts/02_discovery/work_ledger_worker2.jsonl |
| Untrusted output visual repair boundary | DOM/CSS sanitization, scoped layout repair, and client-side resource exhaustion | Rejected | No XSS, URL/resource, CSS-scope, or state-mutation bypass survived. Two plausible CWE-400 candidates were fixed by pre-work DOM budgets and closed as suppressed after exact-boundary, wide, deep, bushy, and normal four-actor validation. Evidence: artifacts/02_discovery/work_ledger_worker1.jsonl, artifacts/05_findings/RM-WORKTREE-STYLELESS-DOM-DOS-001/candidate_ledger.jsonl, artifacts/05_findings/RM-WORKTREE-ENSEMBLE-DOM-DOS-002/candidate_ledger.jsonl, artifacts/fix_report.md |
| Runtime wiring and persistence | Completion parsing, sanitize-before-mount, restoration, and local state | No issue found | Independent, cached, history, repair, and restore paths continue to sanitize untrusted HTML before DOM mounting; new dynamic values remain numeric or allowlisted. Evidence: artifacts/02_discovery/work_ledger_worker3.jsonl |
