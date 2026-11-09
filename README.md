# La Bàn Công Việc

Ứng dụng quản lý mục tiêu và công việc cá nhân bằng tiếng Việt, hỗ trợ nhiều tài khoản và dữ liệu riêng cho từng người.

## Chạy local

Yêu cầu Node.js 22.12+ (đã kiểm tra bằng Node 24), Python 3.13 và npm. SQLite có sẵn trong Python; không cần cài PostgreSQL để chạy local.

```bash
python3.13 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
npm --prefix frontend ci
cp .env.example .env
export DATABASE_URL=sqlite:///backend/data/laban.db
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
./scripts/dev.sh
```

Mở **http://localhost:5173**. API chạy ở http://127.0.0.1:8000. Đăng ký tài khoản mới; chọn tạo dữ liệu mẫu trong ứng dụng nếu muốn khám phá. Không có tài khoản mẫu dùng chung. Dữ liệu SQLite lưu tại `backend/data/laban.db`, tồn tại sau khi khởi động lại và dùng chung cho mọi thiết bị kết nối cùng máy chủ.

Nếu máy dùng lệnh `python` cho Python 3.13, thay `python3.13` bằng `python`. Không đưa `.env`, database hoặc thư đặt lại mật khẩu vào Git.

`scripts/dev.sh` chọn `DATABASE_URL` trong `.env` của dự án, mặc định SQLite như trên. Khi chạy API/migration riêng, biến môi trường của shell được ưu tiên hơn `.env`; hãy kiểm tra URL nếu máy đã cấu hình database cho dự án khác.

### Lỗi quyền cache npm (`EACCES`)

Dự án cấu hình cache riêng qua `frontend/.npmrc`, tránh phụ thuộc vào quyền của `~/.npm`. Chạy lại từ thư mục dự án:

```bash
npm --prefix frontend ci
```

Cache nằm trong `.npm-cache/` tại thư mục chạy lệnh và được bỏ qua trong Git/Docker. Nếu máy có biến `NPM_CONFIG_CACHE` ghi đè cấu hình này, chỉ định cache rõ ràng:

```bash
npm --prefix frontend ci --cache "$PWD/.npm-cache"
```

Không cần dùng `sudo npm`, xóa cache chung hoặc thêm `--force`.

### Quên mật khẩu ở local

Khi chưa cấu hình SMTP, gửi yêu cầu quên mật khẩu rồi mở thư mới trong `backend/dev-mailbox/`. Link chỉ được ghi vào thư phát triển, không trả qua API. Link dùng một lần và có thời hạn; đổi mật khẩu làm mất hiệu lực các phiên cũ. Với SMTP, ứng dụng gửi thư thật. Thông báo gửi yêu cầu luôn giống nhau dù email có tồn tại hay không.

## Chức năng

- Đăng ký, đăng nhập, đăng xuất, phiên đăng nhập, quên/đặt lại mật khẩu và sửa tên hồ sơ.
- Dashboard hôm nay: mục tiêu, tiến độ, việc hôm nay, quá hạn, sắp đến hạn, bước tiếp theo và tổng quan tuần.
- Roadmap thu gọn/mở rộng năm → quý → tháng → tuần; CRUD từng cấp và liên kết công việc.
- Công việc: mô tả, ghi chú, mức ưu tiên, hạn ngày giờ, hoàn thành, chỉnh sửa, lọc và xác nhận xóa.
- Đề xuất kế hoạch bằng service quy tắc: xem trước rồi xác nhận để thêm roadmap, không ghi đè kế hoạch hiện tại.
- Lịch tuần, chuyển hạn công việc, tổng kết tuần và thống kê từ dữ liệu thật.
- Cài đặt nhắc việc, múi giờ, quyền thông báo; giao diện điện thoại/máy tính và chế độ tối.

## Kiến trúc

React 19 + TypeScript + Vite cho SPA; CSS có cấu trúc và Lucide cho nhận diện. FastAPI + Pydantic cho API và validation; SQLAlchemy 2 + Alembic cho dữ liệu/migration. SQLite ở local, PostgreSQL qua psycopg ở production. Bản production phục vụ SPA và `/api` cùng origin để đơn giản hóa cookie/xác thực.

```text
frontend/src/         Giao diện, API client, tiện ích và kiểm thử
backend/app/          API, xác thực, model, schema, service kế hoạch
backend/alembic/      Migration có phiên bản
backend/tests/        Kiểm thử API và bảo mật
backend/dev-mailbox/  Thư phát triển (bỏ qua Git)
docs/API.md          Hợp đồng API
scripts/dev.sh       Khởi động local
scripts/check.sh     Toàn bộ kiểm tra
Dockerfile           Build frontend và runtime API
compose.yaml         PostgreSQL + ứng dụng production
```

Mọi dữ liệu nghiệp vụ gắn với `user_id`; API lấy danh tính từ phiên máy chủ và lọc chủ sở hữu, gồm cả kiểm tra quan hệ cha/con khi ghi. Không tin `user_id` của client. ID dùng UUID, mật khẩu được băm scrypt, session token ngẫu nhiên chỉ lưu hash trong DB. Cookie HttpOnly/SameSite; Secure trong production; kiểm tra Origin cho thao tác ghi, giới hạn tốc độ endpoint nhạy cảm và validation từ chối trường lạ. Việc xóa cấp roadmap giữ lại công việc, gỡ liên kết phù hợp.

Không sử dụng localStorage cho dữ liệu nghiệp vụ. Chỉ lựa chọn giao diện sáng/tối được phép lưu ở trình duyệt. Cơ sở dữ liệu là nguồn dữ liệu chính.

### Tiến độ

Tiến độ một cấp roadmap là số công việc hoàn thành / tổng số công việc liên quan đến cấp đó và các cấp con. Công việc được tính một lần nhờ liên kết tổ tiên chuẩn hóa. Không có công việc thì 0%; cấp được đánh dấu hoàn thành nhưng chưa có công việc là 100%. Việc đánh dấu lại chưa hoàn thành cập nhật tiến độ theo dữ liệu hiện tại.

## Kiểm tra

Kết quả gần nhất: [báo cáo kiểm chứng](docs/VERIFICATION.md), gồm các kiểm tra đạt và giới hạn còn lại.

```bash
./scripts/check.sh
```

Lệnh này chạy Ruff, mypy, pytest (unit + integration), ESLint, TypeScript, Vitest và production build. Kiểm thử API dùng database SQLite tạm biệt lập, không sửa dữ liệu local. Có thể chạy riêng:

```bash
backend/.venv/bin/pytest backend/tests -q
npm --prefix frontend run test
npm --prefix frontend run build
```

## Cấu hình

Xem [.env.example](.env.example). Các biến chính:

| Biến | Ý nghĩa |
| --- | --- |
| `APP_ENV` | `development` hoặc `production` |
| `APP_URL` | Origin công khai dùng cho link reset và kiểm tra Origin; production phải HTTPS |
| `DATABASE_URL` | SQLite local hoặc `postgresql+psycopg://…` |
| `SESSION_DAYS` | Thời gian sống phiên đăng nhập |
| `SMTP_HOST`, `SMTP_PORT` | Máy chủ gửi thư đặt lại mật khẩu |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Thông tin gửi thư |
| `SMTP_STARTTLS` | Bật STARTTLS cho SMTP |

## Triển khai production

Ứng dụng chạy trên máy chủ/container hỗ trợ Python, Node chỉ cần ở giai đoạn build. Không dùng Vite dev server để phục vụ production. Xem [Vite production build](https://vite.dev/guide/build) và [FastAPI HTTPS](https://fastapi.tiangolo.com/deployment/https/).

1. Sao chép `.env.example` thành `.env`; đặt `APP_ENV=production`, `APP_URL=https://tasks.example.com`, cấu hình SMTP thật và một `POSTGRES_PASSWORD` ngẫu nhiên an toàn khi dùng trong URL (chữ/số).
2. Build image, khởi động PostgreSQL và chạy migration trước khi bật ứng dụng:

```bash
docker compose build
docker compose up -d postgres
docker compose run --rm app python -m alembic -c backend/alembic.ini upgrade head
docker compose up -d app
```

3. Đặt reverse proxy Caddy hoặc nginx với HTTPS trước `127.0.0.1:8000`; origin phải trùng `APP_URL`. Không công khai cổng PostgreSQL. Cookie production cần HTTPS.
4. Sao lưu volume PostgreSQL định kỳ (ví dụ `pg_dump`), bảo vệ `.env` và SMTP secret; kiểm thử phục hồi dữ liệu. Khi nâng cấp, build image mới và chạy `alembic upgrade head` trước khi restart ứng dụng. Không chạy migration đồng thời từ nhiều container.

Với PostgreSQL được quản lý, dùng image riêng và `DATABASE_URL` trỏ tới dịch vụ đó thay cho Compose (Compose ghi đè URL để dùng service `postgres`):

```bash
docker build -t laban-cong-viec .
docker run --rm --env-file .env laban-cong-viec python -m alembic -c backend/alembic.ini upgrade head
docker run -d --name laban --env-file .env -p 127.0.0.1:8000:8000 laban-cong-viec
```

 Engine SQLAlchemy hỗ trợ cấu hình cả [SQLite và PostgreSQL](https://docs.sqlalchemy.org/en/20/core/engines.html).

### Giới hạn hiện tại

- Nhắc việc sử dụng Notification API khi ứng dụng đang mở; đóng tab/trình duyệt sẽ không nhận nhắc. Chỉ yêu cầu quyền sau thao tác bật thông báo. Chưa có Web Push hoặc email nhắc việc; email hiện chỉ phục vụ đặt lại mật khẩu.
- Đề xuất kế hoạch dùng quy tắc, chưa gọi dịch vụ AI. Service tách riêng để thay thế sau.
- Chưa tích hợp Google OAuth. Đăng ký/đăng nhập email và mật khẩu hoạt động độc lập.
- Giới hạn tốc độ trong một process; khi chạy nhiều worker/replica cần chuyển bộ đếm sang Redis hoặc dùng gateway chung.
- Docker/PostgreSQL production cần môi trường có Docker/DB thực để kiểm tra hạ tầng; kiểm thử local mặc định dùng SQLite.

### Seed qua dòng lệnh

Sau khi đã đăng ký tài khoản, có thể tạo dữ liệu mẫu riêng cho tài khoản đó:

```bash
backend/.venv/bin/python backend/seed.py --email ban@example.com
```

Seed có thể chạy lặp lại mà không nhân đôi dữ liệu. API `/api/demo/seed` dùng cùng service.
