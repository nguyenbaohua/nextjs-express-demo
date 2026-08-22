/*
 * ============================================================================
 * KHỞI TẠO PRISMA CLIENT — một kết nối database dùng chung cho cả app
 * ============================================================================
 *
 * File chỉ ba dòng, nhưng đứng sau là một ý tưởng quan trọng.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CHỈ TẠO ĐÚNG MỘT `PrismaClient`?
 * ---------------------------------------------------------------------------
 * `new PrismaClient()` không đơn thuần tạo một object. Nó dựng cả một CONNECTION
 * POOL — một nhóm kết nối TCP tới Postgres được giữ sẵn để tái sử dụng. Mở một
 * kết nối database tốn khoảng vài chục mili-giây (bắt tay mạng, xác thực...),
 * nên giữ sẵn vài kết nối và dùng đi dùng lại là cách tăng tốc rất lớn.
 *
 * Nếu mỗi service, mỗi request lại `new PrismaClient()` một lần, bạn sẽ có hàng
 * trăm pool cùng lúc, mỗi pool lại ôm vài kết nối. Postgres mặc định chỉ cho
 * khoảng 100 kết nối đồng thời → server sập với lỗi "too many connections".
 *
 * Mẫu thiết kế này gọi là SINGLETON: chỉ tồn tại một thể hiện duy nhất trong
 * toàn ứng dụng.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CHỈ CẦN VIẾT `export const` LÀ ĐỦ, KHÔNG CẦN CODE PHỨC TẠP?
 * ---------------------------------------------------------------------------
 * Vì Node.js CACHE module: dù có 10 file cùng `import { prisma } from "./lib/prisma"`,
 * Node chỉ THỰC THI file này đúng một lần ở lần import đầu tiên, rồi phát lại
 * cùng một kết quả cho chín lần sau. Nên dòng `new PrismaClient()` chỉ chạy một
 * lần duy nhất — cơ chế của ngôn ngữ đã lo giúp bạn.
 *
 * (Nếu bạn đọc tài liệu Prisma và thấy đoạn code dài dòng `globalThis.prisma ??= ...`,
 * đó là để né vấn đề riêng của Next.js: chế độ dev của Next.js nạp lại module
 * liên tục mỗi khi bạn sửa file, khiến client bị tạo mới nhiều lần. Backend
 * Express này không gặp chuyện đó — `tsx watch` khởi động lại cả tiến trình,
 * mọi thứ sạch sẽ từ đầu — nên ba dòng là đủ.)
 *
 * ---------------------------------------------------------------------------
 * NÓ LẤY THÔNG TIN KẾT NỐI Ở ĐÂU?
 * ---------------------------------------------------------------------------
 * Không thấy mật khẩu hay địa chỉ nào ở đây cả, vì `PrismaClient` tự đọc biến
 * môi trường `DATABASE_URL` — đúng biến đã khai trong `prisma/schema.prisma`:
 *
 *     datasource db {
 *       provider = "postgresql"
 *       url      = env("DATABASE_URL")
 *     }
 *
 * Biến đó được nạp từ file `.env` nhờ dòng `import "dotenv/config"` ở đầu
 * `src/index.ts`. Đây chính là lý do dòng import đó phải nằm TRÊN CÙNG: nếu
 * file này được nạp trước khi `.env` được đọc, Prisma sẽ không tìm thấy URL.
 *
 * Chuỗi kết nối có dạng:
 *     postgresql://user:matkhau@localhost:5432/todo_list_node_db?schema=public
 *                  └─┬─┘ └──┬───┘ └───┬───┘ └┬─┘ └──────┬──────┘
 *                  người dùng  máy chủ  cổng    tên database
 *
 * Vì chứa mật khẩu nên `.env` KHÔNG BAO GIỜ được commit lên git (đã có trong
 * `.gitignore`). File `.env.example` là bản mẫu, chỉ chứa giá trị giả để người
 * khác biết cần khai báo những gì.
 */

import { PrismaClient } from "@prisma/client";

/*
 * Lưu ý: `@prisma/client` là code được SINH RA bởi lệnh `prisma generate`, dựa
 * trên `prisma/schema.prisma` của chính dự án bạn. Nghĩa là thư mục
 * `node_modules/@prisma/client` trên máy bạn khác với máy người khác.
 *
 * Hệ quả: sau khi `git clone` và `npm install`, bạn PHẢI chạy
 * `npm run prisma:generate` thì code mới biên dịch được. Nhiều dự án thêm lệnh
 * này vào script `postinstall` để tự động hoá.
 */
export const prisma = new PrismaClient();
