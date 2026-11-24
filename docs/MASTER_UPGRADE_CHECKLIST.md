# AI Video Producer — MASTER UPGRADE CHECKLIST

> **Nguồn chân lý cho kế hoạch nâng cấp AVP (App-to-Video).**
>
> Cập nhật khởi tạo: 2026-11-24. Baseline được đối chiếu với `Irthn1311/AI-Video-Producer@3442e255b2bfc1b76dcc79e30b66ee34af89acb3` (`main`, CI PASS). MathMate reference: `Phat-le2005/Coach_Learning`, branch `chore/archive-hackathon-video-20261110`, `CoachLearningVideo/`.
>
> **Phạm vi:** Chỉ AI-Video-Producer; **không** đưa Prompt-to-Video/Agentic-Video-Studio vào repo này.

## 0. Cách sử dụng — chống bỏ sót

- `[x]` = đã triển khai và có bằng chứng test/code tương ứng tại baseline; **không hàm ý hoàn thiện mọi trường hợp**.
- `[ ]` = chưa đạt tiêu chí nghiệm thu; các mục có nhãn **PARTIAL** đã có nền tảng nhưng vẫn phải hoàn thiện.
- Mỗi PR phải ghi: **Checklist ID → files/changes → test → CI → giới hạn còn lại**. Chỉ tick `[x]` sau khi đạt tiêu chí nghiệm thu, có link commit/PR và test hoặc bằng chứng kiểm chứng.
- Không được tick mục chỉ vì đã thêm `SKILL.md`, `README`, schema hay một lệnh CLI chưa được thực thi thực tế.
- Với một tính năng tổng quát, cần test **MathMate parity** và test **ứng dụng khác** nếu phù hợp. Không hardcode chức năng viết tay/hai thiết bị làm thuộc tính phổ quát của AVP.
- `Quality` là mặc định. Autonomy ≠ Quality: tự động có thể quyết định trong phạm vi được cấp quyền nhưng không được bỏ qua chứng cứ, ngân sách, bảo mật hoặc gate bắt buộc.
- Status mặc định cho mục chưa triển khai là `TODO`; nhãn `PARTIAL` không được dùng thay cho `DONE`.

### Trạng thái thực tế đã có trên `main`

- [x] `BASE-01` Có Node CLI `doctor/init/inspect/plan/approve/unlock/capture/attach/asset/voice/captions/preview/qa/run/render/status/route/evidence/snapshot/versions/restore` và cấu hình project.
- [x] `BASE-02` Scene-first artifacts, input/content hash, stale tracking, approval locks, QA kỹ thuật và concat FFmpeg; Remotion là đường dựng tùy chọn.
- [x] `BASE-03` Các primitive dựng MathMate: trim, playback rate footage, zoom/focus, held final frame, chapter, callout, video inset (`scene.edit`, PR #5).
- [x] `BASE-04` Browser DOM/API assertions và report có hash (`requireAssertions`, PR #6).
- [x] `BASE-05` Claim-to-evidence contract có điều kiện và mặc định trong project mới (`verification.mode=claims`, PR #7/#8). **Chưa phải semantic QA tự động toàn diện**.
- [x] `BASE-06` Caption timing từ khoảng lặng WAV hoặc mốc câu do người cung cấp; caption JSON/SRT có hash (PR #9). **Chưa forced alignment cấp từ**.
- [x] `BASE-07` Scene snapshot/list/manual rollback có kiểm tra SHA-256 và hủy QA/approval khi restore (PR #10). **Chưa tự tạo snapshot sau mọi thay đổi**.
- [x] `BASE-08` CI có test ứng dụng web mẫu bằng Chromium thật và render/QA Remotion. **Chưa chứng minh tổng quát trên các ứng dụng lạ**.
- [ ] `BASE-09` **PARTIAL** Capability Router tồn tại nhưng đang là `planning-only`; chưa dispatch tool/skill/agent, chưa có build orchestrator hoặc job recovery tổng quát.

---

# A. BUILD — Analyze, Discover, Design & Prepare

**Định nghĩa:** Build phải tạo ra một **Build Package thực thi được**, không chỉ viết outline. Bất kỳ rủi ro nào có thể kiểm tra trước khi sản xuất phải được xác minh hoặc đánh dấu blocker/fallback.

## A1. Project Intake & Repository Intelligence — P0

> **F-02 source discovery (PARTIAL; chưa tick Done):** `avp analyze` đã nhận diện framework, entrypoint candidates, routes/API và một số nhu cầu tool chuyên biệt từ mã nguồn qua scan giới hạn; phát sinh `.avp/intelligence/project-analysis.json` có path/line evidence, và đưa gợi ý chưa kiểm chứng vào `project-profile`, `feature-inventory`, `capability-profile`. Chưa có agent tự hiểu nghiệp vụ, xác minh runtime, quản lý launch/auth/dataset hoặc thử trên repo lạ ngoài fixtures. Để A1 ở `[ ]` cho tới khi các tiêu chí đầy đủ đạt. Xem `docs/project-intelligence.md` và PR F-02.



- [ ] `A1-01` Nhận input repo/path, revision/branch, mục tiêu video, đối tượng xem, giới hạn dữ liệu, ngôn ngữ, thời lượng, nền tảng; không suy luận những thông tin bắt buộc chưa có.
- [ ] `A1-02` Tự phát hiện stack/framework, monorepo/services, entrypoints, cách chạy ứng dụng, ports, dependencies, auth, environment, test/deploy workflow.
- [ ] `A1-03` Phân tích tính năng từ source, docs, route, UI, API, tests và runtime; phân biệt **có code / có thể chạy / đã quan sát thành công**.
- [ ] `A1-04` Phân loại features theo độ quan trọng cho video, user journeys, visual demonstrability, mức rủi ro, thời lượng trình diễn, chi phí thiết lập.
- [ ] `A1-05` Phát hiện những năng lực đặc thù: canvas/handwriting, multi-device, realtime/WebSocket, streaming chat, maps, 3D/WebGL, dashboard, mobile, checkout sandbox, v.v.
- [ ] `A1-06` Tạo `project-profile.json` + `feature-inventory.json` có nguồn và confidence; báo rõ giả định và vùng chưa được kiểm tra.
- [ ] `A1-07` Tạo/cấu hình test dataset, test accounts, trạng thái reset, mock/sandbox nếu cần; không ghi/quay dữ liệu người dùng thật khi không được phép.
- [ ] `A1-08` Project fingerprint có source, runtime version, ports/backend/schema, environment ảnh hưởng kết quả; cập nhật build khi thay đổi liên quan.

**Done khi:** AI có thể đưa ra feature inventory và executable launch/check guide cho **một ứng dụng chưa biết trước**, không chỉ đọc README hay dùng prompt chung.

## A2. Dynamic Capability / Skill Discovery — P0

> **F-03 first slice (PARTIAL, chưa tick Done):** `src/skill-discovery.mjs` và `config/domain-tools.json` nối signals từ Project Intelligence với bộ implementation/skill local theo từng dự án; phân biệt `BUNDLED_IMPLEMENTATION_AVAILABLE`, `GUIDANCE_ONLY`, `NO_BUNDLED_MATCH`. `avp skills search --online` tìm **GitHub repository metadata có giới hạn, chỉ khi có opt-in**, cache theo source/registry; không tải/cài/chạy. `project.json.capabilityRequirements` làm Build chặn capability bắt buộc chưa có implementation. Capability Profile/Toolchain Lock giữ hash local. **Chưa xong A2**: chưa đánh giá code/license/permission đến mức trusted, chưa pin commit upstream hoặc thử nghiệm sandbox, chưa có lazy-load runtime/agent orchestrator, chưa benchmark 2 app lạ thực tế. Xem `docs/skill-discovery.md` và PR F-03.



- [ ] `A2-01` Rút ra **capability requirements từ từng feature/cảnh**, trước khi tìm skill; ví dụ `draw on canvas`, `pair devices`, `verify OCR`.
- [ ] `A2-02` Đối chiếu kho có sẵn trước (`Playwright`, FFmpeg, Remotion, AVP skills, CLI, adapters); không tìm/trang bị công cụ trùng lặp vô ích.
- [ ] `A2-03` Tìm nguồn **bên ngoài** khi thiếu năng lực: skill registry, GitHub, MCP servers, thư viện, CLI, tài liệu API; tìm có mục tiêu, không thu gom hàng loạt.
- [ ] `A2-04` Chấm điểm candidate theo khả năng giải quyết yêu cầu, độ tin cậy, maintenance, license, bảo mật, tương thích OS/agent, chi phí/token và khả năng offline.
- [ ] `A2-05` Kiểm tra provenance/commit/version/permission của nguồn; **không tự động cài hoặc thực thi** skill/MCP bên thứ ba chưa được thẩm định.
- [ ] `A2-06` Sinh `capability-profile.json` và `toolchain-lock.json`: capability → tool/skill → source/version/hash → quyền → confidence → fallback.
- [ ] `A2-07` Nạp đúng skill/tool theo từng bước (**lazy load, least context**); không nhét toàn bộ skill/repo vào một lời gọi LLM.
- [ ] `A2-08` Thử nghiệm candidate tối thiểu và đo hiệu quả trước khi chấp nhận; nếu không phù hợp, trả blocker hoặc chuyển hướng tự tạo adapter.
- [ ] `A2-09` Cache kết quả discovery theo revision, có invalidation khi source/version đổi; không nhầm cache cũ với bằng chứng hiện tại.

**Done khi:** Trên hai ứng dụng thuộc hai domain khác nhau, AVP chọn ra **hai bộ năng lực khác nhau** có giải thích, bằng chứng thử và manifest tái lập.

## A3. Project-specific Module / Adapter Builder — P0

> **Pointer extension (PARTIAL A3-04/A3-06):** Generic bounded `pointerPath` in reviewed project adapters, paired before/after attribute assertions, interpreter-bound approval and trial; same action in rehearsal and production. No handwriting/OCR or multi-device capability is implied. See `docs/project-adapters.md`; keep checklist items open pending broader acceptance.

> **F-03b first safe slice (PARTIAL — chưa tick Done):** `src/adapters.mjs` và CLI `adapters init/status/approve/trial` đã hỗ trợ manifest recipe **declarative Playwright** trong project, operator review, real-browser trial trên loopback origin, hash-bound trial receipt, Build Gate + QA stale invalidation và shared recipe giữa rehearsal/capture. Capability không chứng minh được bằng actions hiện có vẫn BLOCKED (multi-device/pointer thật/payment). **Không có OS/container sandbox**, chỉ browser-origin guard; không chạy code/script từ GitHub, không tự động xây adapter, không hỗ trợ multi-context và chưa có benchmark 2 ứng dụng lạ. Các mục A3-01/A3-06/A3-08 chỉ đạt một phần, cần nghiệm thu theo kịch bản thực tế. Xem `docs/project-adapters.md`.



- [ ] `A3-01` Định nghĩa interface/plugin contract cho adapter riêng của project: inputs, outputs, start state, end state, capture markers, assertions, reset/cleanup, error types, timeout, dependencies.
- [ ] `A3-02` Agent tự tạo/cấu hình adapter khi built-in không đủ, lưu ở **project workspace** thay vì hardcode vào core AVP.
- [ ] `A3-03` Cho phép Scripted Capture trong sandbox với quyền giới hạn, ngoài declarative actions; giới hạn filesystem/network/secrets và xác nhận trước khi chạy mã sinh ra.
- [ ] `A3-04` Hỗ trợ multi-browser context/device, đồng bộ timeline, viewport, touch/pointer/canvas/drag-drop khi một dự án **thực sự** yêu cầu.
- [ ] `A3-05` Hỗ trợ xác minh API, DB/test-state, events/WebSocket hoặc business logic bằng adapter có contract rõ; không chỉ tin vào UI screenshot.
- [ ] `A3-06` Bắt buộc adapter có smoke test + fixture + cleanup/reset, không chỉ tồn tại dưới dạng mã AI vừa sinh.
- [ ] `A3-07` Chuẩn hóa adapter output để downstream production biết import footage/evidence và mốc shot, không phụ thuộc script riêng của project.
- [ ] `A3-08` Có fallback/blocked decision nếu adapter không đạt: AI không được tự quay kết quả giả hoặc bypass assertion.

**Done khi:** Workflow kiểu MathMate (hai browser + viết tay + trạng thái API) có thể triển khai **qua adapter**, đồng thời một app đơn giản không cần tải các adapter đó.

## A4. Creative Brief & Adaptive Interaction — P0

> **F-04 first slice (PARTIAL; pending CI):** opt-in `creative.director` contract, context-specific advisory recommendations, scene-level editorial directions, independent creative/production review modes, exact-hash interactive approval and Build Gate blockers for missing intent, duration overflow or missing review. No automatic storyboard generation, voice audition execution, shot application, targeted invalidation or semantic quality proof yet. See `docs/creative-director.md`. Keep all A4 criteria unchecked until their full acceptance tests pass.

- [ ] `A4-01` Xây `creative-brief.json`: mục đích, đối tượng, phong cách, ngôn ngữ, format, aspect ratio, target duration, độ chi tiết, tone, thương hiệu.
- [ ] `A4-02` Đặt sớm các ràng buộc ảnh hưởng **kịch bản** (thời lượng, 9:16/16:9, ngôn ngữ, định hướng voice, mục tiêu trình bày); không chờ render mới quyết định.
- [ ] `A4-03` AI tự đề xuất số scene, thứ tự tính năng, hook, kết luận, voice preset, nhịp dựng, cách zoom/focus, transition; giải thích sự phù hợp với app.
- [ ] `A4-04` Chế độ **Interactive**: AI chủ động hỏi **có chọn lọc** tại decision points như phạm vi tính năng, giọng đọc, visual style, transition, storyboard, review.
- [ ] `A4-05` Chế độ **Autonomous**: AI tự suy luận defaults từ project/context/policy và tự thiết kế, nhưng dừng khi thiếu quyền, bằng chứng, ngân sách hoặc quyết định có rủi ro.
- [ ] `A4-06` Tách autonomy theo quyết định/giai đoạn: Build auto + Production review; Build review + Production auto; hoặc cả hai auto theo policy; Quality giữ nguyên.
- [ ] `A4-07` Lưu mọi quyết định sáng tạo đã duyệt vào profile/brief; preference học từ chỉnh sửa phải có thể xem và sửa, không cần “trí nhớ” thiếu kiểm soát.
- [ ] `A4-08` Có version/review cho brief; nếu thay format/voice làm đổi kịch bản thì invalidation quay về đúng bước Build.

**Done khi:** Agent chủ động đề xuất một video hợp đặc điểm app, hỏi đúng quyết định cần hỏi ở Interactive, và có thể chọn các quyết định tương tự trong Autonomous mà vẫn tuân thủ policy.

## A5. Storyboard, Scene/Shot Design & Rehearsal — P0

> **F-04e integration candidate:** combines reviewed pointer adapter and F-04a–d histories. CI includes two distinct local browser fixtures through source analysis, agent-authored storyboard, voice selection/timing, visual composition, Build freeze and real production capture/render/QA; scoped edit-repair and cache assertions. Fixture-authored proposals and synthetic audio are test inputs, not proof of autonomous creative generation, voice quality or unknown-app benchmarking. No A4/A5 item is promoted to DONE on this basis. See `docs/integrated-build-validation.md`.

> **F-04d first slice (PARTIAL; CI pending):** opt-in `creative.visual` requires explicit `edit.design` and stable shot IDs, validates scene duration/frame budget, stable/static framing, documented trims and speed changes, bounded in-shot fade and consistent accessible panel/text palette. Remotion renders camera modes and theme; storyboard check exposes shot spec diff. Scene previews still render as a unit; no cross-scene transitions, measured semantic evidence visibility, automatic creative generation or independent shot render/cache yet. See `docs/visual-direction.md`.

> **F-04c first slice (PARTIAL; CI pending):** opt-in `creative.timing` measures full-scene audition duration and amplitude silence via FFprobe/FFmpeg, maintains content-addressed voice variants and explicit selection, shares Gemini budget reservation, compares actual browser rehearsal action durations against scene slots, binds selection to Build lock, and reuses exact selected audio in Production. No live paid TTS test, automatic language/accent or speech correctness scoring, word-level alignment, semantic audio/action synchronization, or automatic timing edits. See `docs/voice-timing.md`.

> **F-04b first slice (PARTIAL; CI pending):** agent-authored storyboard can replace/add/reorder canonical scenes via bounded source context, source-file hash references, strict claim/recipe validation, explicit hash-confirmed apply and per-scene diff. Editorial roles/state/fallback metadata are recorded and bound to Build; locked scenes are protected. Cross-scene dependencies are recorded but block Build until orchestration exists. This is not automatic LLM story generation or proof of semantic truth, shot-level timing, runtime reset or unknown-app generalization. See `docs/agent-storyboard.md`. Keep A5 unchecked pending full acceptance.

- [ ] `A5-01` Sinh storyboard theo features **đã khảo sát**, không hallucinate; claim → evidence conditions → scene IDs → shot IDs.
- [ ] `A5-02` Định nghĩa scene/shot ID ổn định, thời lượng mục tiêu, narrator text, UI route, actions, reset state, assertions, capture markers và assets.
- [ ] `A5-03` Thiết kế shot/camera plan, zoom, transitions, overlays, inset, callout, caption layout phù hợp đặc thù project — không dùng preset vô điều kiện.
- [ ] `A5-04` Xác định dependency giữa scene/shot (shared auth, DB state, demo data, thứ tự thao tác), và shot nào **thật sự** có thể quay độc lập.
- [ ] `A5-05` **Dry-run/rehearsal** các capture actions, assertions và adapter trước Production; đo sự ổn định và tỷ lệ fail.
- [ ] `A5-06` Kiểm tra khả năng thời lượng (ước lượng speech rate, action wait, animation, transitions) và budget; đề xuất cắt cảnh/đổi nội dung nếu không khả thi.
- [ ] `A5-07` Chốt style + sơ đồ chuyển cảnh, voice choice và media/asset source; câu hỏi Interactive giải quyết trước gate.
- [ ] `A5-08` Lưu fallback của từng cảnh: retry rule, alternate locator, mock được phép/không được phép, manual takeover, return-to-Build trigger.
- [ ] `A5-09` Có review storyboard với diff và impact analysis; ai duyệt nội dung gì, khi nào, source revision nào.

**Done khi:** Mỗi scene có **playable execution recipe** và rehearsal evidence, không còn kiểu “Scene 3: nhấn chức năng ABC” chung chung.

## A6. Canonical Build Package & Readiness Gate — P0 / KIẾN TRÚC QUAN TRỌNG NHẤT

> **Triển khai nền tảng đầu tiên (PARTIAL, chưa tick Done):** `src/build.mjs`, `src/rehearsal.mjs`, `src/capture-actions.mjs` và CLI `avp build prepare/rehearse/check/freeze` đã tạo manifest, chạy rehearsal, phân biệt blocker/review/ready và giữ frozen plan theo hash. New `avp init` bật Build Gate; project cũ vẫn tương thích. **Chưa đạt đầy đủ A6** vì thiếu capability discovery/adapter security, creative choices, rehearsal rủi ro theo domain và benchmark unknown app. Chỉ tick từng mục khi có bằng chứng nghiệm thu đúng phạm vi, không coi schema/CLI là hoàn thành. Xem `docs/build-production.md` và PR triển khai.



- [ ] `A6-01` Định nghĩa artifact schemas và versioning cho `project-profile`, `feature-inventory`, `capability-profile`, `toolchain-lock`, `creative-brief`, `storyboard`, `production-plan`, `build-report`.
- [ ] `A6-02` Có **Build Orchestrator** với stages có đầu vào/đầu ra, checkpoint, trạng thái `PENDING/RUNNING/PASS/REVIEW_REQUIRED/BLOCKED/FAILED`.
- [ ] `A6-03` Có **Build Readiness Gate**: feature feasibility, tool availability/trust, adapter tests, runtime rehearsal, storyboard, voice/style choices, evidence plan, dependency map, budget.
- [ ] `A6-04` Gate trả về `READY`, `REVIEW_REQUIRED` hoặc `BLOCKED` **với lý do và action cần làm**; không cho bắt đầu Production khi critical blocker chưa giải quyết.
- [ ] `A6-05` Biên dịch **một** `production-plan.json` từ các artifact Build: scene/shot, capture recipe, adapters, media settings, assertions, fallback và dependencies.
- [ ] `A6-06` Freeze production plan theo revision/hash và manifest của project/toolchain/assets; Production chỉ chạy phiên bản đã được gate/duyệt.
- [ ] `A6-07` Phân biệt **Build rehearsal proof** và **Production runtime evidence**: bằng chứng rehearsal không được tự coi là bằng chứng footage mới nhất.
- [ ] `A6-08` Build có cache/reuse theo project/revision, hỗ trợ `resume` và chỉ rebuild phần affected khi thay input hoặc thay lựa chọn sáng tạo.
- [ ] `A6-09` Không overbuild: có time/cost budget cho giai đoạn Build, tránh research không điểm dừng; riskiest-feature rehearsal ưu tiên trước.
- [ ] `A6-10` Test fail-closed: thiếu adapter, storyboard chưa duyệt, tool thiếu quyền hoặc dependency drift → Production bị chặn đúng chỗ.

**Done khi:** Một project lạ có thể sinh **Build Package reproducible** và được `READY` chỉ khi các điều kiện thực thi/biên tập có thể kiểm chứng trước đã đạt. `READY` không hứa mọi render sẽ thành công.

---

# B. PRODUCTION — Execute, Compose, Review, Deliver

## B1. Production Orchestrator & Scene Execution — P1

> **F-05b (PARTIAL; pending CI):** typed capture/assertion/navigation, provider HTTP/network/auth/budget, media-tool, QA and Build drift failures with bounded journal metadata; recovery disposition and `production diagnose`; same-revision retry forbidden for Build/QA blockers, capture and interrupted retry requires explicit reset confirmation. Required production evidence checked before downstream execution. No automatic DOM repair, reset implementation, paid retry loop, general root-cause inference or global timeout.

> **F-05a (PARTIAL; pending CI):** frozen-Build-bound `production next|step|recover`, allowlisted bundled dispatch, explicit capture/paid authorization, observed per-step journal and duration, one-step execution, review stops, bounded explicit retry and dead local executor lock recovery. Resume derives from current artifact integrity rather than journal success. No autonomous agent/model loop, global workspace locking against legacy CLI, automated app launch/reset, semantic QA, parallel/shot execution, or automatic error repair. See `docs/production-executor.md`.

- [ ] `B1-01` Orchestrator đọc duy nhất **approved/frozen Build Package**, có run ID, progress, resumable state, per-scene/shot steps; không tự chỉnh storyboard.
- [ ] `B1-02` Capability Router chuyển từ `planning-only` sang **execution-aware dispatch** cho tools/adapters được cấp quyền; log input/output/error và outcome thực tế.
- [ ] `B1-03` Agent có vòng `plan → act → observe → evaluate → repair`, có typed errors, retry policy, timeout, budget, escalation và stop conditions.
- [ ] `B1-04` Khởi chạy/kiểm tra app trong isolated demo environment, deterministic reset/seed và cleanup; quản lý ports/auth/runtime version.
- [ ] `B1-05` Chạy capture script/declarative actions theo từng scene/shot, record footage và assertion proof với trace/markers, không quay giả tính năng lỗi.
- [ ] `B1-06` Multi-device/multi-context capture dùng adapter project-specific, đồng bộ footage/timebase theo production plan.
- [ ] `B1-07` Giữ scene/shot artifacts và session metadata, log chi phí/thời gian, có stage checkpoint cho crash/resume.

**Done khi:** Agent thực thi một production plan từ app lạ mà không phải chủ động viết lại capture logic trong bước Production.

## B2. Audio, Storytelling & Visual Composition — P1

- [x] `B2-01` AVP có voice theo scene (Gemini adapter), audio cache theo input, captions và đường dựng preview.
- [x] `B2-02` Scene edit có trim, zoom/focus, playback speed, hold, inset và callout; bản edited preview được QA trước khi final concat.
- [ ] `B2-03` **PARTIAL** Audio production hoàn chỉnh: trim silence có kiểm soát, lead-in/out, intentional pauses, loudness normalization, clipping/noise QA, voice quality review, retry khi provider lỗi.
- [ ] `B2-04` **PARTIAL** Caption alignment: silence-aware hiện có; bổ sung kiểm tra bằng ASR/forced word alignment (khi cần), kiểm tra lời thoại/voice mismatch, hỗ trợ tiếng Việt, provenance rõ.
- [ ] `B2-05` Creative Director tự chọn visual primitives, camera choreography, composition, scene transitions và animation pacing theo nội dung thực tế.
- [ ] `B2-06` Transition system dựa trên quan hệ scene/shot, duration và handles; intro/outro/branding/overlay nhất quán, không tạo clip cứng rời rạc.
- [ ] `B2-07` Audio-mix/master: loudness giữa scenes, music tùy quyền sử dụng, fades, no clipping, không thay tốc độ giọng chỉ để ép thời lượng.
- [ ] `B2-08` Tái sử dụng voice/footage khi sửa captions/visual/transition; provider paid opt-in và budget kiểm soát.

**Done khi:** Video nhiều cảnh có âm thanh nhất quán, phụ đề bám lời đọc và chuyển cảnh tự nhiên, chất lượng tương đương hoặc tốt hơn các đặc điểm dựng đã kiểm chứng của MathMate.

## B3. Per-Scene Quality Gates & Interactive Review — P1

- [x] `B3-01` Technical QA kiểm tra H.264/AAC/resolution/duration/decode; có claim assertions và hash-bound QA theo contract.
- [ ] `B3-02` **PARTIAL** Runtime + Semantic QA chủ động: không chỉ match các `claim` đã khai báo, còn phát hiện claim quan trọng bị bỏ sót, UI/voice contradiction hoặc screenshot không chứng minh câu nói.
- [ ] `B3-03` Visual QA sheet tự lấy representative frames trước/sau thao tác, cảnh quan trọng và chuyển cảnh; AI/human đánh giá layout, crop, legibility, blank/frozen frame, pointer.
- [ ] `B3-04` Audio QA tự phát hiện speech cut, clipping, silence bất thường, caption drift, mismatch sau rewrite.
- [ ] `B3-05` Review theo scene có preview, evidence/QA summary, diff so với phiên bản trước, lựa chọn approve/revise/reject.
- [ ] `B3-06` Interactive asks chỉ xuất hiện khi cần quyết định sáng tạo/đổi phạm vi/chi phí; Autonomous chỉ auto-approve trong điều kiện policy cho phép và evidence đạt.
- [ ] `B3-07` Approvals gắn hash đúng footage/audio/captions/edit và plan version; sửa bất kỳ artifact phụ thuộc nào phải invalidate.

## B4. Final Assembly & Delivery — P1

- [x] `B4-01` AVP có FFmpeg final concat, optional Remotion, final file probe/decode và các gate xác định.
- [ ] `B4-02` **PARTIAL** Final assembly dùng scene/shot versions được duyệt và locked plan; re-time timelines, outro, global captions/mix nếu cần.
- [ ] `B4-03` Final QA đánh giá toàn video: continuity, transition, voice loudness, captions, visual consistency, truthful claims, source/asset provenance.
- [ ] `B4-04` Xuất MP4 + `final-report.json` + scene/claim/asset audit + actual usage; optional cover/thumbnail/other aspect ratio khi có yêu cầu.
- [ ] `B4-05` Duyệt final và khóa release artifact; sửa sau release sinh phiên bản video mới (không âm thầm ghi đè bản đã duyệt).

---

# C. TARGETED REPAIR — Sau khi video đã xong vẫn sửa cục bộ

## C1. Feedback → Repair Plan — P1

- [ ] `C1-01` Nhận câu lệnh tự nhiên như “Cảnh 3 nhấn ABC quá nhanh, kết quả chưa hiện”; ánh xạ tới scene/shot/timestamp/action và claim.
- [ ] `C1-02` Phân loại root cause: app bug, missing evidence, wrong action/timing, inaccurate script, camera/transition, TTS, captions, encoding, asset.
- [ ] `C1-03` Sinh `repair-plan.json` gồm target, cause confidence, proposed fix, impacted dependency nodes, preserved nodes, expected cost/retries, approval needed.
- [ ] `C1-04` Nếu nguyên nhân là **Build design/adapter/script deficiency**, quay về Build và duyệt lại affected plan; không retry vô hạn trong Production.
- [ ] `C1-05` Nếu ứng dụng thật lỗi, không dựng giả kết quả tốt: có thể sửa app có quyền, đổi narration hoặc bỏ claim theo review.

## C2. Fine-grained Dependency Graph & Selective Invalidation — P1

- [ ] `C2-01` Có DAG theo project → feature → scene → shot → capture/evidence → voice → captions → edit → preview → QA → final.
- [ ] `C2-02` Hash inputs theo **scene/shot dependency fingerprint**, không chỉ hash toàn source; theo dõi runtime/backend/test data nếu có ảnh hưởng.
- [ ] `C2-03` Sửa subtitle → rebuild captions/preview/QA của scene đó; giữ footage + voice + scene khác nếu hợp lệ.
- [ ] `C2-04` Sửa voice/text → chỉ rebuild audio/captions/preview liên quan và affected claims; giữ capture nếu không phụ thuộc nội dung.
- [ ] `C2-05` Sửa click/wait ở shot 3.2 → recapture shot nếu reset/state continuity chứng minh độc lập; nếu không thì recapture scene 3; giữ các scene khác khi không bị phụ thuộc.
- [ ] `C2-06` Sửa transition/callout/zoom → rerender phần edit/scene/final cần thiết; giữ cả voice và original capture.
- [ ] `C2-07` Nếu thay đổi kéo theo state của scene 4+, DAG tự mở rộng affected set; **không cố giữ cache sai**.
- [ ] `C2-08` Reuse output artifacts theo hash/version; giải thích chính xác vì sao một node bị rebuild hay được bảo toàn.

## C3. Shot/Scene Rebuild, Versioning & Final v2 — P1

- [ ] `C3-01` **PARTIAL** Snapshot/restore hiện có dạng **manual** theo scene; cần auto checkpoint trước khi sửa hỏng media, pin artifacts từng production run và bounded retention.
- [ ] `C3-02` Selective recapture với deterministic reset, capture markers/timecode, ability to splice **only** independent shot(s).
- [ ] `C3-03` Selective Remotion/FFmpeg recomposition: preview/QA của scene 3 mới, giữ approved scene 1/2/4/5...
- [ ] `C3-04` Reassembly video v2 từ các scene versions hợp lệ, cập nhật relative/global timeline và subtitles, kiểm tra codec/muxing.
- [ ] `C3-05` QA/regression trên phần sửa + boundary trước/sau scene + final toàn bộ; approval cũ của affected artifacts không được tự hồi sinh.
- [ ] `C3-06` Human review theo diff hoặc autonomous approval theo policy; báo số phút render/token/quota tiết kiệm so với full rebuild.
- [ ] `C3-07` Xử lý lỗi khi đang rollback/replace: backup integrity, atomicity/recovery journal hoặc hướng dẫn recovery rõ; không xóa sạch working state nếu restore lỗi giữa chừng.

**Done khi:** Sau khi xuất video 7 scene, yêu cầu sửa đúng Scene 3 cho ra **Final v2**, không gọi lại TTS hay recapture Scene 1/2/4–7, trừ khi dependency thực sự yêu cầu.

---

# D. AGENTIC INTELLIGENCE, AUTONOMY & QUOTA

- [ ] `D-01` **PARTIAL** Nối capability router với executor thực tế và audit log: planned ≠ executed ≠ verified.
- [ ] `D-02` Agent role separation hợp lý: Project Intelligence/Technical Director và Creative Director; dùng một agent hoặc subagents khi chi phí/context có lợi, không bắt buộc nhiều agent.
- [ ] `D-03` Decision policy theo **Build/Production/Repair**; Interactive hỏi khi ảnh hưởng chất lượng/chi phí, Autonomous tự xử lý trong scope cho phép.
- [ ] `D-04` Cost/time estimator có **observed** calls/tokens/latency/tool invocations/retry/cache hits; không giả vờ biết subscription quota của Codex/Claude/Gemini.
- [ ] `D-05` Cost guard per phase/scene/tool; provider/API paid opt-in, budget estimates rõ và hard blocks khi thiếu authorization.
- [ ] `D-06` Retry classification + capped retries; lỗi thiết kế quay về Build, lỗi thực thi sửa local, không loop gọi model vô hạn.
- [ ] `D-07` Context budget: selective file retrieval, reuse project capability profile, lazy-load skill, avoid duplicate analysis and provider calls.
- [ ] `D-08` Resumable run/job journal sau crash/restart; idempotent actions và locks tránh đồng thời chỉnh cùng scene.
- [ ] `D-09` Capability evaluation telemetry: sau khi dùng skill/adapter có record success, effort, failure, applicability để lần sau gợi ý thông minh hơn.
- [ ] `D-10` “Fully automatic” phải được kiểm chứng theo tình huống thực; AI không được tự công bố `PASS` nếu chưa chạy assertions/QA.

---

# E. SECURITY, OBSERVABILITY & RELEASE

## E1. Security & trust — P0 xuyên suốt

- [ ] `E1-01` Tách nguồn chưa tin cậy (repo app, Internet skills, README, webpage) khỏi quyền điều khiển agent: chống prompt injection và privilege escalation.
- [ ] `E1-02` Chỉ chạy mã/skills/MCP trong môi trường được cấp quyền, có allowlist network/files/secrets và kiểm tra license/source integrity trước execution.
- [ ] `E1-03` Demo account/test data, xử lý secrets, redaction screenshot/video/report, tránh upload artifacts riêng tư.
- [ ] `E1-04` Không tự thực hiện thao tác nhạy cảm (thanh toán thật, xóa dữ liệu, gửi thông tin riêng tư) khi không có sự cho phép rõ ràng; ưu tiên sandbox.
- [ ] `E1-05` Third-party asset provenance/license và chính sách dữ liệu đầu ra; caption/evidence report không tự log API response body bí mật.

## E2. Verification & release — P2

- [ ] `E2-01` Tạo **MathMate Parity Benchmark**: canvas handwriting, desktop/mobile pairing, real OCR/feedback assertions, Remotion timing/inset, voice/captions, final QA — dùng dữ liệu test an toàn, tránh gọi API trả phí ở CI mặc định.
- [ ] `E2-02` **Unknown App Benchmark**: ít nhất hai app khác MathMate, thuộc hai domain, có feature inventory, skill/tool selection, storyboard, real capture, final video, repair.
- [ ] `E2-03` Benchmark Interactive và Autonomous, bao gồm thiếu skill, app thực sự lỗi, provider outage, corrupt artifact, stale source, failed approval.
- [ ] `E2-04` CI Linux + smoke Windows/macOS (nếu công bố hỗ trợ); test phát hành sạch và tương thích Codex/Claude Code/Gemini CLI.
- [ ] `E2-05` Đo KPI: factual claim coverage, runtime assertion pass rate, audio/visual QA, scene repair success, cache hit, regenerated minutes, tokens/cost/time per video, human interventions.
- [ ] `E2-06` User onboarding: một người mới clone, chạy Build → Review/Autonomous → Production → Targeted Repair → Final với hướng dẫn có thể lặp lại.
- [ ] `E2-07` Đồng bộ `README`, `AGENTS.md`, `docs/roadmap.md`, CLI help, sample project, test matrix và changelog với **thực tế code**, không quảng bá kiến trúc mục tiêu như tính năng đã chạy.
- [ ] `E2-08` Chỉ tag release ổn định khi CI, parity, unknown-app tests, security gates và acceptance criteria hoàn thành.

---

# F. THỨ TỰ PR / MILESTONES (không có deadline giả định)

**P0 — Khóa đúng kiến trúc trước:**

1. `F-00` Audit **MathMate parity gap** và lập benchmark fixture an toàn (trước tiên ghi nhận gaps, không copy nguyên script cố định).
2. `F-01` Build Package contracts + Build Orchestrator + Readiness Gate (`A6`), tách rõ Build và Production, đóng băng plan.
3. `F-02` Project Intelligence + feature inventory + dependency map (`A1`).
4. `F-03` Dynamic Capability Discovery + security review + project-specific adapters (`A2`, `A3`).
5. `F-04` Creative Director + adaptive clarification + storyboard/rehearsal (`A4`, `A5`).

**P1 — Sản xuất và sửa đúng phạm vi:**

6. `F-05` Execution-aware Capability Router + resumable Production Orchestrator (`B1`, `D-01/06/08`).
7. `F-06` Audio mastering + intelligent composition/transition + semantic/visual/audio QA (`B2`, `B3`).
8. `F-07` Repair Planner + dependency graph + shot-level recapture + Final v2 (`C1`–`C3`).
9. `F-08` Interactive/Autonomous policies + cost accounting/measurement (`D`).

**P2 — Chứng minh tái sử dụng và phát hành:**

10. `F-09` MathMate Parity + Unknown App benchmark, đa OS/agent, security/release (`E`).

> Các milestone có thể chia thành PR nhỏ và triển khai song song **chỉ khi contract và dependency đã rõ**. Không dồn cả một giai đoạn vào một commit lớn.

---

# G. ACCEPTANCE SCENARIOS — BÀI KIỂM TRA BẮT BUỘC

| ID | Bài thử | Phải chứng minh |
|---|---|---|
| `AC-01` | Repo lạ → Build | Phân tích đúng tính năng, khởi chạy app, lựa chọn/kiểm chứng công cụ, lập plan có thể chạy |
| `AC-02` | MathMate-like app | Agent phát hiện canvas + multi-device và thiết kế adapter/capture phù hợp **không hardcode trong AVP** |
| `AC-03` | BUILD bị thiếu skill/adapter | Trả `BLOCKED` hoặc `REVIEW_REQUIRED`, không chuyển sang Production như đã sẵn sàng |
| `AC-04` | Interactive | Chủ động đề xuất rồi hỏi các lựa chọn thực sự ảnh hưởng như voice, thời lượng, transition, script |
| `AC-05` | Autonomous | Tự quyết định và tạo video trong policy, nhưng không bỏ qua quyền, evidence, quota, QA |
| `AC-06` | 7-scene video có lỗi ABC ở Scene 3 | Sửa đúng shot/scene 3, tái dùng các cảnh không bị ảnh hưởng, tạo Final v2, chạy QA |
| `AC-07` | Sửa captions/zoom | Không gọi lại TTS/recapture; QA phụ thuộc trở thành stale, làm lại đúng preview |
| `AC-08` | App thật trả kết quả sai | Không dựng giả “PASS”; dừng, sửa app/claim hoặc quay về Build |
| `AC-09` | Source/backend hoặc adapter đổi | Fingerprint/dependency làm stale đúng các scene/shot liên quan |
| `AC-10` | AI tự tìm skill từ Internet | Có source/license/security review, thử nghiệm trong sandbox, không chạy code không tin cậy tự động |
| `AC-11` | Video cuối đạt | Runtime/semantic/visual/audio/final QA có kết quả và nguồn; các phiên bản được duyệt có hash |
| `AC-12` | Quota benchmark | Có usage/cost/retry/cache metrics, chứng minh cải thiện so với full rebuild/research lại |

---

# H. MẪU ĐÓNG MỘT CHECKLIST ITEM / PR

```md
- ID: A3-04
- Trạng thái: TODO | IN_PROGRESS | BLOCKED | DONE
- Tình trạng trước đó: ...
- Thay đổi: ...
- Bằng chứng: PR #..., commit ..., test ...
- Benchmark: ...
- Điều kiện nghiệm thu: ...
- Kết quả thực tế: ...
- Giới hạn chưa giải quyết: ...
- Phụ thuộc / tác động đến items khác: ...
```

**Definition of Done cho từng hạng mục:** (1) có implementation, (2) có test tự động hoặc chứng cứ E2E tương ứng, (3) xử lý failure path và bảo mật, (4) CI PASS trên code đúng phiên bản, (5) tài liệu/skill cập nhật, (6) không phá backwards compatibility nếu chưa có migration, (7) không tạo thêm quota/model calls không cần thiết, (8) số liệu/bằng chứng được lưu ở PR.

**Definition of Done cho AVP tổng thể:** `AC-01` ... `AC-12` đạt ở môi trường đã công bố, không còn critical blocker, và người mới có thể sản xuất/review/sửa một video cho app lạ mà không phụ thuộc hardcoded MathMate workflow.
