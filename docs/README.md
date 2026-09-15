# Học Next.js + Express qua một ứng dụng thật

Bộ tài liệu này dùng một ứng dụng todo-list có đăng nhập làm giáo cụ. Không phải
một loạt ví dụ rời rạc — mà là **một hệ thống hoàn chỉnh**, chạy được, có đủ
database, xác thực, và những đánh đổi thật mà bạn sẽ gặp ngoài đời.

## Bạn sẽ học được gì

| Chủ đề | Học qua |
|---|---|
| Express: routing, middleware, phân tầng | Toàn bộ `backend/src/` |
| Prisma: schema, migration, quan hệ bảng | `backend/prisma/` |
| Xác thực bằng mật khẩu, JWT, refresh token | `backend/src/lib/`, `backend/src/services/auth.service.ts` |
| Next.js App Router: Server Component, Server Action | `frontend/src/app/`, `frontend/src/features/` |
| Cất token an toàn bằng cookie `httpOnly` | `frontend/src/shared/lib/session.ts` |
| Tổ chức thư mục theo nghiệp vụ | `frontend/src/features/` |

## Lộ trình đọc

Đọc theo đúng thứ tự này. Mỗi chương giả định bạn đã nắm chương trước.

1. **[Cài đặt và chạy](01-cai-dat-va-chay.md)** — dựng dự án trên máy bạn. Làm
   xong chương này thì có một app chạy được để vừa đọc vừa nghịch.

2. **[Kiến trúc tổng quan](02-kien-truc-tong-quan.md)** — ba tiến trình, hai
   database call, và vì sao trình duyệt không bao giờ gọi thẳng Express. Chương
   quan trọng nhất để có bức tranh lớn.

3. **[Luồng xác thực](03-luong-xac-thuc.md)** — đăng ký, đăng nhập, gia hạn,
   đăng xuất. Từng bước, kèm sơ đồ và lý do đằng sau mỗi quyết định.

4. **[Cấu trúc thư mục](04-cau-truc-thu-muc.md)** — vì sao code nằm ở đâu, và
   làm sao để thêm một nghiệp vụ mới mà không phá vỡ cấu trúc.

Sau bốn chương này, hai file `LEARN.md` sẽ đi sâu hơn vào từng phía:

- **[backend/LEARN.md](../backend/LEARN.md)** — Express và Prisma, kèm bảng API
  đầy đủ, danh sách bẫy, và bài tập nghịch phá.
- **[frontend/LEARN.md](../frontend/LEARN.md)** — Next.js App Router, Server
  Component và Server Action.

Cuối cùng là chính **code**. Mọi file trong dự án đều có comment giải thích
không chỉ "làm gì" mà cả "vì sao làm vậy" và "làm cách khác thì hỏng thế nào".
Hai file `LEARN.md` có gợi ý thứ tự đọc code.

## Cách dùng bộ tài liệu này cho hiệu quả

Đừng đọc suông. Mỗi chương đều có phần thí nghiệm — hãy làm thật:

- Xoá một dòng đi và xem nó hỏng thế nào. Hiểu một dòng code qua việc thấy nó
  vắng mặt thì nhớ lâu hơn đọc mười lần giải thích.
- Mở DevTools xem cookie, mở `npm run prisma:studio` xem dữ liệu thật.
- Gọi API bằng `curl` để thấy backend hoạt động độc lập với giao diện.

## Yêu cầu nền tảng

Tài liệu giả định bạn đã biết:

- JavaScript cơ bản: hàm, object, `async/await`
- React cơ bản: component, props, JSX
- Dòng lệnh: `cd`, `npm install`

Không cần biết trước: TypeScript (đủ dùng là hiểu được), SQL, Docker, hay bất
cứ thứ gì về xác thực.
