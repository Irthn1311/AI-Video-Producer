# AI Video Producer

> **Từ mã nguồn ứng dụng đến video demo có thể kiểm tra và chỉnh sửa — theo từng cảnh.**

[**English**](README.md) · [Bắt đầu](docs/quickstart.md) · [Kiến trúc](docs/architecture.md) · [Agent Skills](docs/skills.md) · [Roadmap](docs/roadmap.md)

**AI Video Producer (AVP)** là bộ công cụ mã nguồn mở, ưu tiên chạy cục bộ, giúp **AI Coding Agent** sản xuất video giới thiệu phần mềm. AVP kết hợp tài liệu dành cho AI, quy trình làm việc theo từng cảnh và CLI Node.js để quay, lồng tiếng, tạo phụ đề, dựng và xuất video.

Có thể sử dụng với **Codex, Claude Code, Gemini CLI** hoặc agent tương thích khác. Agent tìm hiểu sản phẩm, kiểm chứng tính năng và viết kịch bản; CLI thực thi và lưu trạng thái sản xuất.

## Quy trình

```text
Repository ứng dụng
    ↓
Khảo sát tiết kiệm token (Repo Intelligence)
    ↓
Duyệt danh sách tính năng → Duyệt storyboard
    ↓
Quay từng cảnh → Tạo giọng đọc/phụ đề → Preview/QA
    ↓                          ↑
Duyệt cảnh ── cần chỉnh sửa ───┘
    ↓
Ghép và xuất MP4
```

**Scene-first:** Mỗi cảnh giữ footage, audio, phụ đề, preview, QA và trạng thái duyệt riêng. Khi sửa kịch bản hoặc thao tác quay, AVP xác định các đầu ra bị ảnh hưởng, tránh dựng lại những phần không cần thiết.

## Chức năng chính

| Thành phần | Khả năng |
| --- | --- |
| **Agent Skills** | Hướng dẫn rõ ràng cho việc nghiên cứu, lập kịch bản, quay, dựng và QA |
| **Repo Intelligence** | Quét mã nguồn cục bộ, hỗ trợ quy trình Graphify/RepoMap/Serena khi cần |
| **Software Demo** | Quay giao diện thật bằng Playwright trong môi trường demo riêng |
| **Scene Review** | Duyệt kịch bản, preview và khóa từng cảnh |
| **Voice & Language** | Chọn ngôn ngữ, giọng đọc; Gemini TTS là tùy chọn |
| **Incremental Build** | Cache bằng hash và phát hiện đầu vào đã thay đổi |
| **Rendering** | FFmpeg; tùy chọn backend Remotion |
| **QA** | Kiểm tra kỹ thuật và lưu bằng chứng theo cảnh |

## Adapter riêng theo dự án (F-03b — PARTIAL)

Recipe JSON khai báo thao tác pointer, quyền và assertion. Agent/người dùng duyệt đúng phiên bản, chạy thử Build rồi mới quay. Không chạy mã tùy ý hoặc tự cài skill ngoài. [Hướng dẫn](docs/project-adapters.md).

## Tìm skill/tool theo đặc thù dự án (F-03 — PARTIAL)

`avp skills recommend` đối chiếu nhu cầu rút từ source với implementation và skill hướng dẫn sẵn có trong AVP. `avp skills search --online` chỉ khi được cho phép sẽ tra cứu metadata repository trên GitHub theo năng lực còn thiếu. **Tìm thấy repo không có nghĩa đã kiểm chứng/cài/chạy được skill.** Các năng lực bắt buộc nhưng chưa có implementation sẽ chặn Build. [Hướng dẫn](docs/skill-discovery.md).

## Project Intelligence — phân tích source theo đặc thù dự án

`avp analyze` khảo sát mã nguồn cục bộ để nhận diện framework, entrypoints, routes/API và các tín hiệu chuyên biệt như canvas, ghép thiết bị, WebSocket, charts hoặc bản đồ. Kết quả được đưa vào Build Package cùng đường dẫn chứng cứ, **không tự chạy mã của app hay gọi AI trả phí**. Đây chỉ là **dấu hiệu từ source**, chưa khẳng định chức năng hoạt động thật. [Hướng dẫn](docs/project-intelligence.md).

## BUILD → PRODUCTION: chuẩn bị đủ trước khi quay

Project mới tạo bằng `avp init` yêu cầu giai đoạn BUILD: `avp build prepare` tạo các artifact và kế hoạch; `avp build rehearse --scene ID --allow-actions` chạy thử thao tác Playwright thực tế **không quay video**; `avp build freeze --confirm` chốt production plan đã được xem xét. Thiếu công cụ, lỗi assertion, thay source/plan sẽ chặn Production. Project cũ vẫn tương thích cho tới khi chủ động bật BUILD. **Chưa tự tìm skill ngoài Internet hoặc tự thiết kế sáng tạo hoàn toàn.** [Hướng dẫn](docs/build-production.md).

## Snapshot và rollback từng cảnh

Dùng `avp snapshot --scene ID` để lưu phiên bản media cục bộ, `avp versions` để xem lịch sử và `avp restore --scene ID --version v0001 --confirm` để khôi phục cảnh đã unlock. AVP xác minh hash của file, tự sao lưu phiên bản trước khi khôi phục và **luôn yêu cầu QA/duyệt lại sau rollback**. Không gọi lại Gemini hoặc Playwright chỉ để lấy lại phiên bản cũ. [Hướng dẫn](docs/scene-versions.md).

## Phụ đề bám theo âm thanh thực tế

Khi có voiceover, AVP đo các khoảng nói/nghỉ trong WAV bằng FFmpeg để **ước lượng mốc câu** hợp lý hơn so với chia đều theo độ dài chữ. Có thể dùng `captionTiming.anchors` để khai báo mốc đã nghe/duyệt thủ công như workflow MathMate. SRT và `captions.json` đều có hash ràng buộc với QA; thay phụ đề không cần gọi lại Gemini. Đây **không phải forced alignment cấp từ**. [Hướng dẫn](docs/audio-captions.md).

## Liên kết lời thoại với bằng chứng

Các project mới khởi tạo và project ví dụ mặc định bật `verification.mode: "claims"` (project cũ vẫn giữ tương thích). Chế độ này để buộc mỗi tính năng được giới thiệu phải có một đoạn lời thoại đã khai báo, dẫn tới các assertion Playwright thật. Scene QA kiểm tra hash của capture và evidence hiện tại; `avp evidence` hiển thị phần nào đã/chưa xác minh. Đây là kiểm chứng theo điều kiện khai báo, **chưa phải đánh giá ngữ nghĩa tự động hoàn chỉnh**. Xem [Claim Evidence](docs/claim-evidence.md).

## Kiểm chứng hành vi ứng dụng khi quay

AVP có thể cấu hình kiểm tra DOM và response API thật bằng Playwright trong lúc quay cảnh: `capture.evidencePolicy.requireAssertions=true`. Báo cáo `capture-report.json` gắn hash với scene QA; sửa bằng chứng sau khi duyệt khiến QA không còn hợp lệ. Đây là kiểm chứng **các điều kiện được khai báo**, chưa thay thế hoàn toàn Semantic QA. Xem [Capture Evidence](docs/capture-evidence.md).

## Dựng cảnh nâng cao từ kinh nghiệm MathMate

Từng scene có thể chọn chế độ biên tập Remotion qua `scene.edit`: cắt clip, thay tốc độ footage (giữ nguyên giọng đọc), zoom/focus, giữ frame cuối, nhãn chương, callout và video phụ (inset). **Preview được dựng trước khi QA/duyệt**, nên video cuối dùng đúng những cảnh đã kiểm tra. Cảnh không dùng `edit` vẫn chạy FFmpeg nhanh gọn. Xem [hướng dẫn Scene Editing](docs/scene-editing.md).

## Capability Router — mặc định Quality

AVP mặc định dùng profile **Quality**: ưu tiên bằng chứng runtime, kiểm tra ngữ nghĩa độc lập khi rủi ro cao và các điểm duyệt quan trọng. [Capability Router](docs/capability-router.md) hiện tạo **kế hoạch sử dụng công cụ**, chưa tự kết nối MCP hay tiêu thụ quota. Nó ưu tiên công cụ cục bộ và artifact đã được xác minh trước khi cần tới model hoặc dịch vụ trả phí.

```bash
node bin/avp.mjs route --project examples/sample-project --task feature-verification --risk high
```

## Agent Skills đã tích hợp sẵn

Repo chứa **10 skill sản xuất video, 7 skill hướng dẫn Remotion do AVP tự viết và bộ Graphify Agent Skill đầy đủ kèm tài liệu tham chiếu** tại [`.agents/skills/`](.agents/skills/). Khi clone repo, Codex/Claude Code/Gemini có thể đọc trực tiếp các hướng dẫn này, không cần đi tải từng skill để có tài liệu cơ bản.

Phân biệt **skill** (hướng dẫn cho agent) với **công cụ thực thi**: Graphify CLI bằng Python, Remotion bằng npm và Chromium vẫn phải được cài khi cần. Nếu muốn dùng đúng bộ Remotion Skills chính thức, có thể tải trực tiếp từ nhà phát hành qua `npx skills add remotion-dev/skills`; nội dung `avp-remotion-*` trong repo là bản do AVP tự soạn. Xem [danh mục skill](docs/skills.md) và [thông tin nguồn/giấy phép](docs/third-party-skills.md).

## Bắt đầu nhanh

Cần **Node.js 22+**, Git, **FFmpeg/ffprobe**; cài Chromium nếu quay tự động bằng Playwright.

```bash
git clone https://github.com/Irthn1311/AI-Video-Producer.git
cd AI-Video-Producer
npm install
npx playwright install chromium
node bin/avp.mjs doctor
```

Chạy ứng dụng demo trong một terminal:

```bash
npm run demo
```

Ở terminal khác:

```bash
node bin/avp.mjs inspect  --project examples/sample-project
node bin/avp.mjs plan     --project examples/sample-project
# Xem và xác minh danh sách tính năng và storyboard trước khi duyệt.
node bin/avp.mjs approve --project examples/sample-project --stage coverage
node bin/avp.mjs approve --project examples/sample-project --stage storyboard
node bin/avp.mjs run     --project examples/sample-project
```

Chế độ `review` sẽ dừng tại mỗi cảnh. Xem video trong `.avp/scenes/<scene-id>/preview.mp4`, duyệt cảnh rồi chạy tiếp:

```bash
node bin/avp.mjs approve --project examples/sample-project --stage scene --scene scene-01-intro
node bin/avp.mjs run     --project examples/sample-project
node bin/avp.mjs approve --project examples/sample-project --stage scene --scene scene-02-feature
node bin/avp.mjs render  --project examples/sample-project
```

Video được lưu ở `examples/sample-project/.avp/output/final.mp4`. Đọc [hướng dẫn chi tiết](docs/quickstart.md) để sử dụng với ứng dụng riêng.

## Giao việc cho AI Coding Agent

Mở repo bằng Codex, Claude Code hoặc Gemini CLI rồi yêu cầu:

> Đọc `AGENTS.md` và skill `video-producer`. Hãy khảo sát dự án của tôi, xác minh những tính năng đáng giới thiệu, đề xuất storyboard, quay và dựng từng cảnh. Dừng để tôi duyệt ở các checkpoint và chỉ làm lại những artifact bị ảnh hưởng.

AVP **không tự tạo kịch bản bằng LLM trong CLI**. Agent đảm nhận phần suy luận, CLI hỗ trợ thực thi và kiểm tra. Ứng dụng cần được chạy trong môi trường demo an toàn, không dùng dữ liệu thật nếu chưa được phép.

## Cấu hình và giới hạn

File `project.json` cho phép đặt ngôn ngữ kịch bản, lời đọc, phụ đề, giọng TTS, kích thước video, review và chi phí API ước tính. Khi bật Gemini TTS, khai báo `GEMINI_API_KEY` trong `.env` cục bộ và cho phép gọi API bằng tùy chọn tương ứng. Không đưa key vào Git.

Phiên bản v0.1 sử dụng mốc phụ đề ước lượng thay vì đồng bộ chính xác theo từng từ; Graphify là công cụ tùy chọn; mức ngân sách API là giới hạn dựa trên **ước tính**, không phải hạn mức thanh toán từ provider. Những phần chưa triển khai xem ở [roadmap](docs/roadmap.md).

## Tài liệu dự án

[Kiến trúc](docs/architecture.md) · [Các skill](docs/skills.md) · [Bảo mật](docs/security.md) · [Ví dụ MathMate](examples/mathmate/README.md) · [Đóng góp](CONTRIBUTING.md)

Mã nguồn phát hành theo [MIT License](LICENSE).
