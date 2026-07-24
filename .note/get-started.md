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

Lệnh `prisma:migrate` sẽ tạo các bảng cần thiết (vd. bảng `Todo`) dựa trên `prisma/schema.prisma`.

(Tuỳ chọn) Xem dữ liệu bằng Prisma Studio:

```bash
npm run prisma:studio
```

## 6. Chạy project ở môi trường dev

```bash
npm run dev
```

Server sẽ chạy tại `http://localhost:3000` (hoặc theo giá trị `PORT` trong `.env`).

## 7. Build & chạy production (tuỳ chọn)

```bash
npm run build
npm run start
```

## Tóm tắt các bước nhanh

```bash
git clone <repo-url>
cd todo-list-be-nodejs
npm install
cp .env.example .env
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
npm run dev
```
