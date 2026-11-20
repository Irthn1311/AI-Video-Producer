# Runtime capture evidence (MathMate parity, opt-in)

The historical MathMate workflow validated real UI and API behavior, including correct OCR persistence and actual teacher/student views, **before** using footage in a product demonstration. AVP now offers structured Playwright assertions to apply that practice to other apps.

## Configuration

In the relevant `project.json` scene:

```json
{
  "capture": {
    "evidencePolicy": {
      "requireAssertions": true,
      "failOnPageError": true
    },
    "actions": [
      {"type": "goto", "path": "/"},
      {"type": "assertVisible", "role": "heading", "name": "Learning Dashboard", "evidenceId": "dashboard-visible"},
      {"type": "clickExpectResponse",
        "role": "button", "name": "Save",
        "response": {"pathContains": "/api/save", "method": "POST", "status": 200, "bodyIncludes": "\"ok\":true"},
        "evidenceId": "save-response"
      },
      {"type": "assertText", "testId": "save-result", "expectedText": "Saved", "evidenceId": "save-visible", "evidenceScreenshot": true},
      {"type": "assertAttribute", "testId": "save-result", "attribute": "data-status", "expectedValue": "done"}
    ]
  }
}
```

New actions:
- `assertVisible` waits for visible DOM, using the standard `testId`/`role`/`label`/`text` locators.
- `assertText` requires an element to become visible and contain the expected text.
- `assertAttribute` compares a DOM attribute exactly.
- `clickExpectResponse` arms a network-response watcher **before clicking**, then verifies same-origin path, HTTP method, status and optional response-body substring. The body is inspected locally but **not recorded**.
- `evidenceScreenshot: true` saves the current UI to a local PNG, not to a cloud provider.

## Evidence and QA lifecycle

1. Create fresh test/demo app state; avoid production user accounts or irreversible actions.
2. `avp capture` records `.avp/scenes/ID/capture-report.json` with `status: PASS/FAIL`, assertion IDs and non-sensitive result metadata; failures are fail-closed and capture a local diagnostic screenshot.
3. `avp preview` and `avp qa` create/review footage normally.
4. When `requireAssertions=true`, a technical QA pass additionally requires a successful capture report with passing assertions and no unhandled page errors (unless explicitly allowed). Scene QA is bound to that exact report's content hash.
5. Changing/deleting the evidence report **after** scene QA makes previous approval invalid. Re-verify and review rather than changing JSON to fabricate a success.

## Scope and caveats

This provides **runtime evidence**, not complete semantic QA. A passing DOM/API assertion does not, by itself, prove that every spoken claim is correct or that UI results are meaningful. Independent content review and fact-to-scene binding remain future work.

This policy is opt-in for backward compatibility. Existing attached-footage projects without a capture report keep the old technical QA path. Opt-in scenes using `avp attach` cannot pass the new evidence gate without a legitimate capture report; separate imported-evidence support is a future feature. Quota: assertions are local browser operations and do not call an LLM or paid AI API.

For implementation reference, see `src/capture-assertions.mjs` and the historical MathMate `capture-solution.cjs`.
