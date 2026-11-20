# AI Video Producer (AVP)

**Bản thử nghiệm dành cho lập trình viên v0.1.** Repo kết hợp kiến thức cho AI Coding Agent với CLI để nghiên cứu phần mềm, quay giao diện thật theo từng cảnh, tạo lời thuyết minh, phụ đề, review và xuất MP4. Core không phụ thuộc Codex, Claude Code hay Gemini CLI.

## Khởi động

Yêu cầu Node 22+, FFmpeg/ffprobe, Chromium cho Playwright. Bước TTS cần API key Gemini riêng và xác nhận cho phép gọi dịch vụ có thể tính phí.

```bash
git clone https://github.com/Irthn1311/AI-Video-Producer.git
cd AI-Video-Producer
npm install
npx playwright install chromium
node bin/avp.mjs doctor
```

Chạy app mẫu bằng `npm run demo` ở terminal thứ nhất. Ở terminal thứ hai:

```bash
node bin/avp.mjs inspect --project examples/sample-project
node bin/avp.mjs plan --project examples/sample-project
node bin/avp.mjs approve --project examples/sample-project --stage coverage
node bin/avp.mjs approve --project examples/sample-project --stage storyboard
node bin/avp.mjs run --project examples/sample-project
```

Chế độ review mặc định dừng sau mỗi cảnh để bạn xem `.avp/scenes/<scene-id>/preview.mp4`. Duyệt bằng `approve --stage scene --scene <scene-id>`, chạy tiếp `run`, và cuối cùng `render`. Output nằm tại `.avp/output/final.mp4` trong thư mục project. Đọc [hướng dẫn đầy đủ](docs/quickstart.md).

## Nguyên tắc

1. **Không quay giả tính năng.** Phải kiểm chứng sản phẩm thật và dùng dữ liệu demo riêng.
2. **Scene-first.** Mỗi cảnh có footage/voice/caption/preview/QA riêng; sửa một cảnh không tự động quay lại các cảnh đã khóa.
3. **Tiết kiệm token.** Dùng `repo-intelligence`, tìm kiếm và bản đồ symbol trước khi đưa code vào context; Graphify là tùy chọn.
4. **TTS tùy chọn.** Chọn ngôn ngữ, voice, provider qua `project.json`, API key qua `.env` (không commit). `voiceover.enabled: false` vẫn dựng được video với audio im lặng.
5. **Agent-agnostic.** AI đọc `AGENTS.md` và skill tương ứng; CLI cung cấp lệnh thực thi và kiểm tra, không tự suy luận thay AI.
6. **Tài liệu trung thực.** Subtitle v0.1 dùng thời gian ước tính, review là bắt buộc cho nội dung; tự chữa lỗi hoàn toàn và nhiều provider TTS nằm trong roadmap.

Xem [kiến trúc](docs/architecture.md), [bảo mật](docs/security.md), [hướng dẫn agent](docs/agent-prompt.md) và [roadmap](docs/roadmap.md).
