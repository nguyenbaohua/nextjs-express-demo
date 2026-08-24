# Hướng dẫn cài đặt & chạy project

Tài liệu này dành cho người mới clone project về máy lần đầu.

## 1. Yêu cầu môi trường

- [Node.js](https://nodejs.org/) >= 18
- [Docker](https://www.docker.com/) & Docker Compose (để chạy database PostgreSQL)
- Git

## 2. Clone project & cài dependencies

```bash
git clone <repo-url>
cd todo-list-be-nodejs
npm install
```

## 3. Cấu hình biến môi trường

Copy file `.env.example` thành `.env`:

```bash
cp .env.example .env
```

Mở file `.env` và điền thông tin kết nối database. Ví dụ mặc định (khớp với `docker-compose.yml`):

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=todo_list_node_db
DB_USERNAME=postgres
DB_PASSWORD=123456

DATABASE_URL="postgresql://postgres:123456@localhost:5432/todo_list_node_db?schema=public"

PORT=3000
```

> Lưu ý: `DATABASE_URL` phải khớp với `DB_USERNAME`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` ở trên vì Prisma chỉ đọc `DATABASE_URL`.

### Cấu hình AWS Cognito (bắt buộc)

Từ khi có tính năng đăng nhập, backend **sẽ không khởi động** nếu thiếu bốn biến sau — nó dừng ngay kèm thông báo chỉ rõ biến nào còn trống:

```
AWS_REGION=
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=
```

👉 **Cách lấy từng giá trị trong AWS Console: xem [cognito-setup.md](cognito-setup.md).** Tài liệu đó viết cho người chưa từng dùng Cognito, khoảng 10–15 phút là xong và không tốn phí.

### Đăng nhập bằng Google (tuỳ chọn)

App còn có nút **"Đăng nhập bằng Google"**. Tính năng này cần thêm hai biến nữa:

```
# backend/.env
COGNITO_DOMAIN=

# frontend/.env.local
APP_BASE_URL=http://localhost:3001
```

Bỏ trống `COGNITO_DOMAIN` thì mọi thứ khác **vẫn chạy bình thường** — chỉ riêng nút Google báo lỗi khi bấm.

👉 **Cách lấy key ở Google Cloud Console và nối với Cognito: xem [google-login-setup.md](google-login-setup.md).** Khoảng 20–30 phút, cũng miễn phí. Đăng nhập bằng Google sẽ **tự động tạo người dùng mới trong Cognito** ở lần đầu, không cần bước đăng ký riêng.

## 4. Khởi động database bằng Docker

Project đã có sẵn `docker-compose.yml` để dựng một container PostgreSQL trống.

```bash
docker compose up -d
```

Kiểm tra container đã chạy:

```bash
docker compose ps
```

Để dừng database:

```bash
docker compose down
```

(dữ liệu vẫn được giữ lại trong volume `db_data`; dùng `docker compose down -v` nếu muốn xoá luôn dữ liệu).

## 5. Khởi tạo schema database bằng Prisma

Sau khi database đã chạy, generate Prisma client và áp migration:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Lệnh `prisma:migrate` sẽ tạo các bảng cần thiết dựa trên `prisma/schema.prisma`. Dự án hiện có **hai bảng**:

| Bảng | Giữ gì |
|---|---|
| `User` | Một hàng cho một CON NGƯỜI: email, `cognitoSub`, `googleSub` |
| `Todo` | Công việc, với `userId` trỏ vào `User.id` |

Bảng `User` tồn tại để gộp hai cách đăng nhập (mật khẩu và Google) của cùng một email thành một tài khoản duy nhất — xem [google-login-setup.md](google-login-setup.md) mục 7.

> ⚠️ Nếu bạn đã chạy dự án từ trước khi có bảng `User`: migration mới **xoá toàn bộ todo cũ**, vì cột `userId` đổi ý nghĩa từ `sub` của Cognito sang `User.id`. Lý do đầy đủ nằm ngay trong file migration.

(Tuỳ chọn) Xem dữ liệu bằng Prisma Studio:

```bash
npm run prisma:studio
```

## 6. Chạy project ở môi trường dev

Dự án gồm **hai** phần chạy song song, nên cần hai cửa sổ terminal.

**Terminal 1 — backend:**

```bash
cd backend
npm run dev
```

Chạy tại `http://localhost:3000` (hoặc theo `PORT` trong `.env`).

**Terminal 2 — frontend:**

```bash
cd frontend
npm install          # chỉ lần đầu
cp .env.example .env.local
npm run dev
```

Chạy tại `http://localhost:3001`. Đây là địa chỉ bạn mở trong trình duyệt — **không mở cổng 3000**, vì cổng đó chỉ trả về JSON.

Mở <http://localhost:3001> sẽ bị đưa thẳng tới trang đăng nhập. Bấm **Đăng ký**, dùng một email thật để nhận mã xác thực 6 số.

## 7. Build & chạy production (tuỳ chọn)

```bash
npm run build
npm run start
```

## Tóm tắt các bước nhanh

```bash
git clone <repo-url>
cd <ten-thu-muc>

# --- backend ---
cd backend
npm install
cp .env.example .env
# Điền DATABASE_URL và 4 biến Cognito vào .env — xem cognito-setup.md
# (muốn có nút đăng nhập Google thì điền thêm COGNITO_DOMAIN — xem google-login-setup.md)
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
npm run dev                    # cổng 3000

# --- frontend (terminal khác) ---
cd frontend
npm install
cp .env.example .env.local
npm run dev                    # cổng 3001 ← mở cái này trong trình duyệt
```

Nếu backend báo `❌ Chưa cấu hình AWS Cognito`, nghĩa là bạn còn thiếu bước [cognito-setup.md](cognito-setup.md).
