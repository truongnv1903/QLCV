# Kiểm chứng ngày 08/11/2026

Môi trường: macOS, Python 3.13.5, Node 24.13.1, SQLite. Không có Docker/PostgreSQL server trong môi trường hiện tại.

| Kiểm tra | Kết quả |
| --- | --- |
| Ruff backend và script smoke | Đạt |
| mypy, 11 module backend | Đạt |
| pytest unit + integration | 110 test đạt |
| ESLint frontend | Đạt |
| TypeScript strict | Đạt |
| Vitest | 17 test đạt: 8 tính toán ngày/thống kê/nhắc việc và 9 tương tác giao diện |
| Production build Vite | Đạt |
| Kiểm tra dependency npm lúc cài đặt | 0 vulnerability |
| pip check | Không có dependency hỏng |
| Prettier | Đạt |
| Bash syntax | Đạt |
| Alembic SQLite | Upgrade lặp lại, schema check và khôi phục kết nối đạt |
| PostgreSQL offline migration | Sinh SQL cho đầy đủ bảng thành công |
| Compose YAML | Đọc được cấu hình và kiểm tra dịch vụ/cổng |
| Preview dev | HTML và `/api/health` qua Vite proxy trả thành công |
| Preview bản build | HTML, 3 tài nguyên, health, 401 khi chưa đăng nhập, JSON 404 và no-store đạt |

## Những luồng đã kiểm tra

- Đăng ký, đăng nhập, đăng xuất, cookie phiên, phiên hết hạn và thu hồi phiên.
- Đặt lại mật khẩu: token hash, hạn dùng, dùng một lần, thu hồi mọi phiên; TLS SMTP xác minh chứng chỉ trước khi gửi thông tin đăng nhập.
- Chặn API khi chưa đăng nhập, truy cập chéo tài khoản và gán `user_id` từ client; kiểm tra chủ sở hữu của các quan hệ roadmap.
- CRUD task, timestamp hoàn thành, tiến độ roadmap, chuyển nhánh và xóa kế hoạch giữ lại công việc.
- Đề xuất không thay đổi DB trước xác nhận; append sau xác nhận; kế hoạch qua ranh giới năm/quý, hạn ngắn và giới hạn thời gian mỗi tuần.
- Dữ liệu còn sau khi thay hoàn toàn engine và TestClient; đăng nhập client mới nhận lại dữ liệu cũ, tài khoản khác không nhìn thấy.
- Cài đặt múi giờ/nhắc việc, tổng kết tuần, seed riêng và không nhân đôi.
- Tương tác React trong JSDOM: đăng ký, đăng nhập/đăng xuất, chống dữ liệu phiên cũ, reset link, task CRUD, xác nhận planner và quyền thông báo do người dùng chủ động bật.
- Menu di động và bảy ngày của tuần được kiểm tra trong DOM giả lập; kiểm thử này không xác nhận bố cục CSS hoặc kích thước chạm trên thiết bị thật.

## Giới hạn kiểm chứng

Kết nối browser host không khả dụng; hai lần truy cập Safari bằng công cụ điều khiển đều timeout. Chưa kiểm tra trực quan desktop/mobile hoặc console của trình duyệt thật. Các test tương tác JSDOM đạt, không có lỗi không xử lý trong lượt chạy test.

Chưa chạy image Docker, PostgreSQL trực tiếp, SMTP thật hoặc HTTPS/reverse proxy production. Cần kiểm tra các thành phần này trong môi trường triển khai trước khi phát hành. Có một cảnh báo deprecation từ Starlette TestClient dùng httpx; không làm test thất bại.

Nhắc việc hiện chỉ hoạt động khi tab đang mở. Chưa có Web Push, email nhắc việc, AI thật hoặc Google OAuth. Xem README và SECURITY.md để cấu hình, triển khai và hiểu giới hạn.

## Chạy lại

```bash
./scripts/check.sh
```

Để kiểm tra bản build đã được FastAPI phục vụ:

```bash
backend/.venv/bin/python scripts/smoke.py http://127.0.0.1:8000
```

Script smoke chỉ đọc dữ liệu và không tạo tài khoản. Muốn dùng lệnh này, build frontend trước, chạy migration và khởi động API như hướng dẫn README.
