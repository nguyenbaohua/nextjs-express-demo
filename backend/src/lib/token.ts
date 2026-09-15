/*
 * ============================================================================
 * REFRESH TOKEN — sinh chuỗi ngẫu nhiên và băm nó
 * ============================================================================
 *
 * File này dùng `node:crypto` — module có sẵn của Node, không phải cài gì thêm.
 * Tiền tố `node:` là cách viết hiện đại để nói rõ "đây là module lõi của Node",
 * không phải một gói npm nào đó trùng tên (một mẹo nhỏ chống nhầm lẫn, và cũng
 * chống một kiểu tấn công gọi là dependency confusion).
 *
 * ----------------------------------------------------------------------------
 * HAI HÀM Ở ĐÂY LÀM VIỆC THEO CẶP
 * ----------------------------------------------------------------------------
 *
 *     Lúc đăng nhập:
 *       raw  = generateRefreshToken()        → chuỗi 128 ký tự hex
 *       hash = hashRefreshToken(raw)         → lưu vào Session.tokenHash
 *       gửi `raw` về cho client, KHÔNG gửi `hash`
 *
 *     Lúc gia hạn:
 *       client nộp lại `raw`
 *       hash = hashRefreshToken(raw)         → tìm hàng Session có tokenHash này
 *
 * Điểm mấu chốt: DATABASE KHÔNG BAO GIỜ CHỨA `raw`. Ai đọc trộm được bảng
 * `Session` cũng chỉ thấy đám hash vô dụng — không dùng chúng để gia hạn được,
 * vì server luôn băm thứ client gửi lên rồi mới so sánh.
 *
 * Đây chính xác là cách nghĩ đã dùng cho mật khẩu ở `password.ts`, áp dụng lại
 * cho một loại bí mật khác. Nguyên tắc chung đáng nhớ:
 *
 *     Bất cứ thứ gì "cầm là vào được" thì trong database chỉ nên có HASH của nó.
 */

import { createHash, randomBytes } from "node:crypto";
import { REFRESH_TOKEN_BYTES } from "./constants";

/**
 * Sinh một refresh token mới — chuỗi hex hoàn toàn ngẫu nhiên.
 *
 * ⚠️ Chú ý là `randomBytes` của `node:crypto`, KHÔNG phải `Math.random()`.
 *
 * Khác biệt không hề nhỏ. `Math.random()` là bộ sinh số giả ngẫu nhiên: nó chạy
 * một công thức toán học từ một giá trị khởi đầu, nên dãy số nó cho ra ĐOÁN
 * ĐƯỢC nếu biết đủ số trước đó. Nó sinh ra để làm game và hiệu ứng, không phải
 * để làm bảo mật.
 *
 * `randomBytes` lấy entropy từ hệ điều hành (chuyển động chuột, nhiễu phần
 * cứng, thời điểm các ngắt...). Không có công thức nào để đoán, kể cả khi bạn
 * biết tất cả các giá trị trước đó.
 *
 * Quy tắc không có ngoại lệ: mọi giá trị bí mật (token, mã khôi phục, salt,
 * session id) đều phải dùng `crypto`. Thấy `Math.random()` trong code bảo mật
 * là thấy một lỗ hổng.
 *
 * `.toString("hex")` biến 64 byte thành 128 ký tự `0-9a-f` — dạng an toàn để
 * đặt trong JSON, trong header HTTP và trong cookie mà không cần escape gì.
 */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

/**
 * Băm refresh token bằng SHA-256 để lưu vào `Session.tokenHash`.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO LÀ SHA-256 CHỨ KHÔNG PHẢI BCRYPT NHƯ MẬT KHẨU?
 * ---------------------------------------------------------------------------
 * Câu hỏi rất đáng đặt ra, vì ở `password.ts` ta vừa nói SHA-256 là lựa chọn
 * SAI cho mật khẩu. Vậy sao ở đây lại đúng?
 *
 * Vì cái ta đang băm khác hẳn về bản chất:
 *
 *                        MẬT KHẨU                REFRESH TOKEN
 *     Ai tạo ra?         con người               `randomBytes`
 *     Đoán được không?   ĐƯỢC ("123456")         2^512 khả năng
 *     Có trong từ điển?  thường là có            không bao giờ
 *     → cần hàm chậm?    CÓ                      KHÔNG
 *
 * bcrypt chậm để chống dò từ điển. Refresh token không có từ điển nào để dò —
 * thử cạn 2^512 khả năng cần nhiều thời gian hơn tuổi vũ trụ, dù hàm băm nhanh
 * đến đâu. Dùng bcrypt ở đây không thêm được một chút an toàn nào, mà mỗi lần
 * gia hạn lại tốn 250ms CPU vô ích.
 *
 * Còn một lý do thực dụng nữa, và nó quyết định hơn cả tốc độ: bcrypt sinh salt
 * NGẪU NHIÊN mỗi lần băm, nên cùng một token cho ra hash khác nhau ở hai lần
 * gọi. Tra database sẽ thành bất khả thi — không thể viết
 * `findUnique({ where: { tokenHash } })`, mà phải đọc HẾT bảng `Session` rồi
 * `bcrypt.compare` từng hàng một. SHA-256 thì luôn cho cùng một kết quả, nên tra
 * được trực tiếp qua chỉ mục, dù bảng có một triệu hàng.
 *
 * Bài học: chọn công cụ theo ĐẶC TÍNH CỦA DỮ LIỆU và CÁCH BẠN SẼ TRA CỨU NÓ,
 * đừng chọn theo cảm giác "cái nào nghe an toàn hơn".
 */
export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
