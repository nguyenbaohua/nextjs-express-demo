/*
  ----------------------------------------------------------------------------
  MIGRATION: thêm bảng User — gộp hai danh tính của cùng một con người
  ----------------------------------------------------------------------------

  Migration này làm ba việc, và việc thứ ba là việc phá vỡ dữ liệu cũ:

    1. Tạo bảng "User" với ba cột nhận diện: email, cognitoSub, googleSub
    2. Thêm ba chỉ mục UNIQUE lên ba cột đó
    3. Biến "Todo"."userId" thành KHOÁ NGOẠI trỏ vào "User"."id"

  ----------------------------------------------------------------------------
  VÌ SAO PHẢI XOÁ TODO CŨ?
  ----------------------------------------------------------------------------

  Cột "Todo"."userId" ĐỔI Ý NGHĨA ở migration này:

      trước:  sub của Cognito   ("a4e8b1c2-9f3d-...")
      sau:    id của bảng User  ("9f3d4a1b-7c2e-...")

  Hai chuỗi này trông giống nhau (đều là UUID) nhưng thuộc hai không gian hoàn
  toàn khác nhau. Ngay khi câu ADD CONSTRAINT ở cuối file chạy, Postgres sẽ kiểm
  từng dòng Todo xem "userId" có tồn tại trong bảng User không — và mọi dòng cũ
  đều trượt, vì bảng User lúc đó còn trống. Migration sẽ dừng với lỗi
  `insert or update on table "Todo" violates foreign key constraint`.

  Có ba hướng xử lý, giống hệt lần migration trước (thêm cột userId):

    1. XOÁ dữ liệu cũ                                          ← đang dùng
    2. Tạo một hàng User cho mỗi sub đang có (email tạm), rồi trỏ todo sang đó
    3. Cho "Todo"."userId" tạm nullable, dọn dần sau

  Ta chọn hướng 1 vì đây là dự án học và bảng Todo đang trống. Hướng 2 mới là
  hướng dùng cho database thật — nó giữ được dữ liệu, đổi lại SQL dài hơn và
  phải bịa email tạm (dạng `<sub>@migrated.local`) để chờ người dùng đăng nhập
  lại rồi mới cập nhật email thật.

  ⚠️ Nhắc lại bài học của lần trước, vì nó đúng thêm một lần nữa: SỬA CẤU TRÚC
  BẢNG THÌ DỄ, quyết định "dữ liệu cũ đi về đâu" mới là phần thật sự khó. Và câu
  hỏi đó không có đáp án chung — nó phụ thuộc dữ liệu của bạn quý tới mức nào.
*/

-- Xoá todo cũ: "userId" của chúng là sub Cognito, không trỏ được vào bảng User.
-- (Câu này được thêm bằng tay, xem giải thích ở trên.)
DELETE FROM "Todo";

-- Bảng User. Ba cột nhận diện, và hai trong ba được phép NULL:
--   email      NOT NULL — luôn có, vì đây là khoá để liên kết hai luồng
--   cognitoSub NULL     — trống nghĩa là "chưa từng đặt mật khẩu"
--   googleSub  NULL     — trống nghĩa là "chưa từng bấm nút Google"
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cognitoSub" TEXT,
    "googleSub" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_cognitoSub_key" ON "User"("cognitoSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- Khoá ngoại: từ đây Postgres TỪ CHỐI mọi todo có userId không tồn tại trong
-- bảng User. Ràng buộc ở tầng database đúng kể cả khi ai đó chạy SQL bằng tay,
-- khác với ràng buộc chỉ nằm trong code ứng dụng.
-- ON DELETE CASCADE: xoá một User thì todo của họ bị xoá theo.
-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
