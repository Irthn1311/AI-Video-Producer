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
