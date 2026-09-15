/*
  ----------------------------------------------------------------------------
  MIGRATION: thêm cột userId — gắn mỗi todo với một tài khoản Cognito
  ----------------------------------------------------------------------------

  Migration là một file SQL được đánh số theo thời gian, mô tả MỘT bước thay đổi
  cấu trúc database. Prisma ghi nhớ những migration đã chạy (trong bảng
  `_prisma_migrations`), nên trên máy đồng nghiệp hay trên server production, chỉ
  cần chạy `prisma migrate deploy` là database đi tới đúng trạng thái như máy bạn.

  File này Prisma sinh ra tự động, nhưng đã được SỬA TAY để thêm câu DELETE ở
  dưới. Lý do:

    Cột `userId` là NOT NULL và không có giá trị mặc định. Với 4 todo đã có sẵn
    trong bảng, Postgres không biết điền gì vào cột mới cho chúng, nên nó từ chối
    chạy. Đây là câu hỏi mà chỉ con người trả lời được, không phải lỗi của Prisma.

  Có ba hướng xử lý, và ta chọn hướng đầu tiên vì đây là dự án học, dữ liệu cũ
  chỉ là vài dòng test:

    1. XOÁ dữ liệu cũ                      ← đang dùng
    2. Gán hết cho một userId cụ thể       (ADD COLUMN có DEFAULT rồi bỏ DEFAULT)
    3. Cho cột nullable                    (giữ dữ liệu, nhưng code phải xử lý null)

  ⚠️ Với database THẬT, hướng 1 là thảm hoạ. Lúc đó bạn sẽ chọn hướng 2 hoặc 3.
  Đây cũng là bài học lớn nhất về migration: SỬA CẤU TRÚC BẢNG THÌ DỄ, còn quyết
  định "dữ liệu cũ đi về đâu" mới là phần thật sự khó.
*/

-- Xoá toàn bộ todo cũ vì chúng không có chủ sở hữu.
-- (Câu này được thêm bằng tay, xem giải thích ở trên.)
DELETE FROM "Todo";

-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Todo_userId_idx" ON "Todo"("userId");
