# 1. Cài đặt và chạy

Mục tiêu của chương này: từ một máy trắng tới chỗ mở `http://localhost:3001`,
đăng ký một tài khoản, và thêm được một việc cần làm.

Thời gian: khoảng 10 phút, phần lớn là ngồi chờ `npm install`.

---

## 1.1. Cần có sẵn gì

| Công cụ | Bản tối thiểu | Kiểm tra |
|---|---|---|
| Node.js | 20 trở lên | `node -v` |
| npm | đi kèm Node | `npm -v` |
| Docker | bản nào cũng được | `docker --version` |

Docker chỉ dùng để chạy PostgreSQL. Nếu bạn đã có sẵn PostgreSQL trên máy thì bỏ
qua Docker cũng được — xem mục 1.3.

> **Về hệ điều hành:** mọi lệnh trong tài liệu này là lệnh bash (Linux, macOS,
> hoặc WSL trên Windows). Đừng chạy bằng PowerShell hay cmd.

---

## 1.2. Lấy code về

```bash
git clone <url-repo> nextjs-express-demo
cd nextjs-express-demo
```

Cấu trúc ở mức cao nhất:

```
nextjs-express-demo/
├── backend/     Express + Prisma  → cổng 3000
├── frontend/    Next.js           → cổng 3001
└── docs/        tài liệu bạn đang đọc
```

Hai thư mục con là **hai dự án npm độc lập**, mỗi cái có `package.json` riêng.
Không có workspace hay monorepo tool nào cả — bạn `cd` vào từng thư mục và cài
riêng. Cách này đơn giản hơn để học, và nó phản ánh đúng thực tế là hai chương
trình này chạy ở hai tiến trình tách biệt.

---

## 1.3. Dựng database

```bash
cd backend
docker compose up -d
```

Lệnh này đọc [`backend/docker-compose.yml`](../backend/docker-compose.yml) và
dựng một container PostgreSQL 16, mở cổng 5432.

Kiểm tra nó đã sẵn sàng:

```bash
docker compose ps
```

Cột `STATUS` phải là `Up ... (healthy)`. Chữ `healthy` đến từ khối `healthcheck`
trong file compose — nó chạy `pg_isready` định kỳ, nên bạn phân biệt được
"container đã khởi động" với "Postgres đã nhận kết nối được", hai chuyện khác
nhau vài giây.

Vài lệnh Docker đáng thuộc:

```bash
docker compose up -d      # bật (chạy nền)
docker compose stop       # tắt, GIỮ NGUYÊN dữ liệu
docker compose down -v    # tắt và XOÁ SẠCH dữ liệu
docker compose logs -f db # xem log Postgres
```

> ⚠️ `down -v` xoá cả volume, tức là mất toàn bộ dữ liệu. Chỉ dùng khi bạn cố ý
> muốn làm lại từ đầu. `stop` mới là lệnh dùng hằng ngày.

**Nếu bạn đã có PostgreSQL riêng:** bỏ qua Docker, chỉ cần tạo một database rỗng
rồi sửa `DATABASE_URL` ở bước sau cho khớp.

---

## 1.4. Cấu hình backend

Tạo file `.env` từ bản mẫu:

```bash
cp .env.example .env
```

Mở `.env` ra và điền hai thứ:

```bash
# 1. Chuỗi kết nối database. Nếu dùng Docker như trên thì đúng như dòng này:
DATABASE_URL="postgresql://postgres:123456@localhost:5432/todo_list_node_db?schema=public"
DB_PASSWORD=123456

# 2. Khoá ký token. TỰ SINH, đừng copy của ai:
JWT_SECRET="<dán kết quả lệnh bên dưới vào đây>"
```

Sinh khoá:

```bash
openssl rand -base64 48
```

### Vì sao `JWT_SECRET` phải tự sinh?

Đây không phải thủ tục cho có. Khoá này là thứ backend dùng để **ký** access
token, và cũng là thứ nó dùng để **kiểm** chữ ký. Ai biết chuỗi đó thì tự làm
được một token hợp lệ cho bất kỳ tài khoản nào — tức là đăng nhập được vào mọi
tài khoản mà không cần biết mật khẩu của ai cả.

Nên nó ngang hàng với mật khẩu database về mức độ bí mật:

- Không commit lên git (`.env` đã bị `.gitignore` chặn sẵn)
- Dev và production dùng hai giá trị khác nhau
- Sinh ngẫu nhiên, đừng gõ `"my-secret-key"`

Chi tiết kỹ thuật nằm trong [`backend/src/lib/jwt.ts`](../backend/src/lib/jwt.ts).

---

## 1.5. Cài và khởi tạo backend

```bash
# vẫn đang ở thư mục backend/
npm install
npm run prisma:migrate
```

Lệnh thứ hai làm ba việc cùng lúc:

1. Đọc [`prisma/schema.prisma`](../backend/prisma/schema.prisma), so với database thật
2. Chạy các file SQL trong `prisma/migrations/` để tạo bảng
3. Sinh lại Prisma Client — code TypeScript có đầy đủ kiểu dữ liệu

Nếu nó hỏi tên migration thì gõ gì cũng được (ví dụ `init`) — thư mục
`migrations/` đã có sẵn bản `init` nên thường nó chỉ áp dụng rồi thôi.

Xem thử database vừa tạo:

```bash
npm run prisma:studio
```

Một giao diện web mở ra ở cổng 5555, hiện ba bảng `User`, `Session`, `Todo` — tất
cả đang rỗng. Đây là công cụ rất đáng dùng khi học: mỗi lần làm gì trên app, mở
lại đây xem dữ liệu thật đã đổi thế nào.

Bật server:

```bash
npm run dev
```

Thấy dòng `Server is running on http://localhost:3000` là xong. **Để nguyên
terminal này**, mở một terminal mới cho bước sau.

---

## 1.6. Cài và chạy frontend

```bash
cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend chỉ cần đúng một biến môi trường:

```bash
API_BASE_URL=http://localhost:3000/api
```

Để ý nó **không** có tiền tố `NEXT_PUBLIC_`. Đó là chủ ý: Next.js chỉ gửi xuống
trình duyệt những biến có tiền tố đó. Không có tiền tố nghĩa là biến này chỉ tồn
tại phía server — và địa chỉ backend không bao giờ lộ ra ngoài.

Mở `http://localhost:3001`.

---

## 1.7. Thử cho chạy

Bạn sẽ bị đá ngay sang `/login` — đó là `proxy.ts` làm việc.

1. Bấm **Đăng ký**, tạo tài khoản với email bất kỳ (không cần email thật, không
   có bước xác thực nào) và mật khẩu từ 8 ký tự.
2. Đăng nhập.
3. Thêm vài việc cần làm.

Giờ mở lại Prisma Studio (`npm run prisma:studio` bên backend) và nhìn:

- Bảng `User` có một hàng. Cột `passwordHash` là một chuỗi bắt đầu bằng `$2b$12$`
  — **không phải** mật khẩu bạn vừa gõ. Đó là kết quả của bcrypt.
- Bảng `Session` có một hàng. Cột `tokenHash` là SHA-256 của refresh token —
  cũng không phải token gốc.
- Bảng `Todo` có các việc bạn vừa thêm, mỗi hàng mang `userId` trỏ về `User`.

Đây là lần đầu bạn nhìn thấy nguyên tắc xuyên suốt dự án bằng mắt thường:
**những thứ "cầm là vào được" thì trong database chỉ có hash của chúng.**

---

## 1.8. Chạy tóm tắt cho lần sau

Từ lần thứ hai trở đi, mỗi lần muốn làm việc:

```bash
# Terminal 1
cd backend && docker compose up -d && npm run dev

# Terminal 2
cd frontend && npm run dev
```

---

## 1.9. Khi có gì đó không chạy

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `Thiếu biến môi trường JWT_SECRET` | Chưa tạo `backend/.env`, hoặc chưa điền `JWT_SECRET` |
| `Can't reach database server at localhost:5432` | Chưa `docker compose up -d`, hoặc container đã bị stop |
| `Không kết nối được tới server` (hiện trên trang web) | Backend chưa chạy, hoặc chạy ở cổng khác 3000 |
| `Property 'session' does not exist` | Sửa `schema.prisma` mà quên `npm run prisma:migrate` |
| Port 3000/3001/5432 đã bị chiếm | Có tiến trình cũ còn sống: `lsof -i :3000` rồi `kill` |

Nếu muốn làm lại sạch sẽ từ đầu:

```bash
cd backend
docker compose down -v      # xoá container + toàn bộ dữ liệu
docker compose up -d
npm run prisma:migrate
```

---

## 1.10. Kiểm chứng backend không cần giao diện

Điều đáng nhớ: backend là một chương trình **độc lập**. Frontend chỉ là một
khách hàng của nó, và không phải khách hàng duy nhất. Bạn gọi thẳng bằng `curl`
được:

```bash
# Đăng ký
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MatKhau123"}'

# Đăng nhập, cất access token vào biến shell
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MatKhau123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["accessToken"])')

# Gọi API có bảo vệ
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/todos

# Thử bỏ token đi
curl -s http://localhost:3000/api/todos
# → {"success":false,"message":"Bạn cần đăng nhập để thực hiện thao tác này."}
```

Tập thói quen này sớm: khi có bug, `curl` giúp bạn trả lời ngay câu hỏi quan
trọng nhất — **lỗi nằm ở frontend hay backend?** Không có nó, bạn sẽ mất hàng giờ
sửa nhầm phía.

---

**Tiếp theo:** [2. Kiến trúc tổng quan](02-kien-truc-tong-quan.md)
