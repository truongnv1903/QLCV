# Bảo mật và phạm vi kiểm chứng

## Quyền truy cập

Mọi API nghiệp vụ lấy người dùng từ phiên phía máy chủ. Cookie `laban_session` chứa token ngẫu nhiên; database chỉ giữ SHA-256 của token và thời hạn. Cookie có `HttpOnly`, `SameSite=Lax`, thời hạn 30 ngày và `Secure` khi `APP_ENV=production`. Đăng xuất thu hồi phiên; đặt lại mật khẩu thu hồi mọi phiên của tài khoản.

Mật khẩu được băm bằng scrypt với salt riêng cho từng tài khoản. Model đầu vào từ chối trường không được khai báo: client không thể gán `user_id`, timestamp hoàn thành hoặc ID đối tượng tự chọn. Tất cả truy vấn đọc/sửa/xóa dữ liệu riêng đều giới hạn theo `user_id`; ID của cấp cha cũng được kiểm tra quyền sở hữu. UUID chỉ giảm khả năng đoán ID, không thay thế kiểm tra quyền.

Backend là cổng truy cập dữ liệu. Không đưa thông tin đăng nhập database cho trình duyệt. PostgreSQL dùng quyền của tài khoản ứng dụng; phương án hiện tại thực thi authorization tại API, chưa bổ sung PostgreSQL Row Level Security.

## Xác thực, yêu cầu chéo trang và khôi phục mật khẩu

Các thao tác ghi từ trình duyệt phải có Origin thuộc `TRUSTED_ORIGINS`; `Sec-Fetch-Site: cross-site` bị từ chối. Cookie SameSite bổ sung bảo vệ. REST client không gửi Origin vẫn phải có phiên hợp lệ. Triển khai giao diện và `/api` trên cùng origin.

Đăng ký, đăng nhập, yêu cầu đặt lại mật khẩu và áp dụng đề xuất được giới hạn request. Bộ giới hạn hiện tại lưu trong bộ nhớ của tiến trình; khi tăng số worker/replica, cần dùng Redis hoặc giới hạn tại reverse proxy/API gateway để chia sẻ hạn mức. Không lấy IP từ `X-Forwarded-For` không được xác thực.

API quên mật khẩu trả cùng thông báo cho email có và chưa có tài khoản. Token có thời hạn 30 phút, dùng một lần, chỉ lưu dạng hash trong database. Production yêu cầu SMTP; môi trường phát triển ghi liên kết vào `backend/dev-mailbox/` với quyền file `0600`, không trả token qua API và không phục vụ thư mục này như tài nguyên web. Không đưa thư mục mailbox, `.env` hoặc database vào Git, log hay backup công khai.

## Dữ liệu và triển khai

Khóa ngoại được bật trên SQLite. Các bảng nghiệp vụ có `user_id`; task có index theo người dùng/ngày đến hạn và người dùng/trạng thái. Xóa roadmap giữ lại task và gỡ liên kết với cấp bị xóa. Dữ liệu demo chỉ được tạo khi người dùng chủ động yêu cầu và có cờ đánh dấu riêng theo tài khoản.

Production yêu cầu PostgreSQL, HTTPS và cấu hình SMTP. API riêng tư trả `Cache-Control: no-store`; có header chống MIME sniffing/nhúng iframe, cùng CSP và HSTS khi chạy production. Chạy migration trước khi phục vụ. Giữ database trong mạng riêng, giới hạn quyền tài khoản database và thiết lập backup định kỳ. Không dùng tài khoản quản trị database cho ứng dụng.

Không có dịch vụ gửi thông báo nền trong bản này. Nhắc việc của trình duyệt chỉ chạy khi ứng dụng đang mở; quyền thông báo chỉ được yêu cầu sau thao tác bật của người dùng.

## Kiểm chứng

Bộ `backend/tests` dùng database SQLite riêng cho mỗi test, bật khóa ngoại thật, kiểm tra HTTP qua FastAPI TestClient và chạy Alembic trên một database mới. Các nhóm kiểm tra gồm xác thực, thuộc tính cookie, phiên hết hạn/thu hồi, hash mật khẩu và token, token reset hết hạn/dùng lại, chống Origin chéo trang, chống truy cập chéo tài khoản ở task/roadmap/cấp cha/cài đặt/tổng kết, CRUD, tính tiến độ, đề xuất không ghi đè, seed riêng từng tài khoản và migration chạy lặp lại.

Các test tự động chưa thay thế kiểm thử hạ tầng PostgreSQL, SMTP thực, TLS/reverse proxy và dịch vụ email của môi trường production. Xem README để chạy bộ kiểm tra và cấu hình triển khai.
