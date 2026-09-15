/*
 * ============================================================================
 * BĂM MẬT KHẨU — hai hàm, và rất nhiều thứ để hiểu đằng sau chúng
 * ============================================================================
 *
 * File này nhỏ tới mức đáng ngờ: hai hàm, mỗi hàm một dòng. Nhưng đằng sau nó
 * là phần dễ làm sai nhất của một hệ thống đăng nhập, nên đáng đọc kỹ.
 *
 * ----------------------------------------------------------------------------
 * HÀM BĂM MỘT CHIỀU LÀ GÌ?
 * ----------------------------------------------------------------------------
 *
 * Một hàm băm biến dữ liệu bất kỳ thành một chuỗi có độ dài cố định, và có ba
 * tính chất:
 *
 *   1. CÙNG ĐẦU VÀO → CÙNG ĐẦU RA. Luôn luôn, không ngoại lệ.
 *   2. MỘT CHIỀU. Từ kết quả không lần ngược lại được đầu vào.
 *   3. ĐỔI MỘT BIT Ở ĐẦU VÀO → ĐỔI GẦN HẾT ĐẦU RA. Nên không thể "đoán dần".
 *
 * Nhờ tính chất 1 và 2, ta kiểm tra được mật khẩu mà không cần biết mật khẩu:
 *
 *     Lúc đăng ký:    băm("MatKhau123!") → lưu "$2b$12$Ot3k...w9Qe" vào DB
 *     Lúc đăng nhập:  băm("MatKhau123!") → so sánh với chuỗi đã lưu
 *
 * Toàn bộ hệ thống KHÔNG BAO GIỜ biết mật khẩu thật của người dùng — kể cả bạn,
 * người viết ra nó. Đó là một tính năng, không phải hạn chế: nó là lý do một
 * công ty đàng hoàng không bao giờ gửi lại được mật khẩu cũ cho bạn qua email,
 * mà chỉ cho bạn đặt mật khẩu mới.
 *
 * (Nếu một website nào đó email lại đúng mật khẩu cũ của bạn — hãy đổi mật
 * khẩu ở mọi nơi khác dùng chung mật khẩu đó. Họ đang lưu chữ thật.)
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO KHÔNG DÙNG SHA-256 CHO MẬT KHẨU?
 * ----------------------------------------------------------------------------
 *
 * Đây là cái bẫy kinh điển. SHA-256 đúng là hàm băm mật mã học một chiều, và
 * nghe rất "bảo mật". Nhưng nó được thiết kế để NHANH — một CPU thường băm được
 * hàng trăm triệu chuỗi mỗi giây, một card đồ hoạ thì hàng chục tỷ.
 *
 * Nhanh là đúng đắn khi bạn băm một file 2GB để kiểm tra toàn vẹn. Nhưng với
 * mật khẩu, nhanh chính là lỗ hổng: nó giúp kẻ tấn công thử cạn từ điển mật
 * khẩu trong vài phút.
 *
 * bcrypt sinh ra để làm điều ngược lại — xem `BCRYPT_COST` trong `constants.ts`.
 *
 * Quy tắc để nhớ:
 *   dữ liệu NGẪU NHIÊN, không đoán được  → hàm băm nhanh (SHA-256) là đủ
 *   dữ liệu DO NGƯỜI NGHĨ RA, đoán được  → bắt buộc hàm băm chậm (bcrypt)
 *
 * Trong dự án này bạn sẽ thấy đúng cả hai: mật khẩu dùng bcrypt (file này),
 * refresh token dùng SHA-256 (`token.ts`). Lý do khác nhau, lựa chọn khác nhau.
 */

import bcrypt from "bcryptjs";
import { BCRYPT_COST } from "./constants";

/**
 * Băm mật khẩu để chuẩn bị lưu vào cột `User.passwordHash`.
 *
 * `bcrypt.hash` làm hai việc trong một lời gọi, và việc thứ nhất là thứ người
 * mới học hay bỏ sót:
 *
 *   1. SINH MỘT SALT NGẪU NHIÊN — một chuỗi ngẫu nhiên riêng cho lần băm này.
 *   2. Băm (mật khẩu + salt) qua 2^BCRYPT_COST vòng lặp.
 *
 * Kết quả trả về là MỘT chuỗi đã gói sẵn cả ba thứ: phiên bản thuật toán, cost,
 * salt, và hash. Nhờ vậy không cần cột `salt` riêng trong database.
 *
 * ---------------------------------------------------------------------------
 * SALT GIẢI QUYẾT VẤN ĐỀ GÌ?
 * ---------------------------------------------------------------------------
 * Không có salt, cùng một mật khẩu luôn cho ra cùng một hash. Hai hậu quả:
 *
 *   a) KẺ TẤN CÔNG TRA BẢNG TÍNH SẴN. Người ta đã băm trước hàng tỷ mật khẩu
 *      phổ biến và lưu thành bảng tra ("rainbow table"). Có bảng đó thì phá
 *      một hash chỉ còn là một câu tìm kiếm, mất vài mili-giây — công sức làm
 *      chậm hàm băm thành vô nghĩa.
 *
 *   b) LỘ AI TRÙNG MẬT KHẨU VỚI AI. Nhìn cột hash thấy 500 hàng giống hệt nhau
 *      là biết ngay 500 người này dùng chung một mật khẩu, và gần như chắc chắn
 *      đó là "123456". Phá một hash là mở được cả 500 tài khoản.
 *
 * Salt ngẫu nhiên cho mỗi người xoá sạch cả hai vấn đề: bảng tính sẵn phải làm
 * lại riêng cho từng salt (tức là phải làm lại từ đầu cho từng người dùng), và
 * hai người trùng mật khẩu vẫn cho ra hai chuỗi hoàn toàn khác nhau.
 *
 * `await` ở đây là thật, không phải cho có: băm tốn khoảng 250ms CPU. Phiên bản
 * bất đồng bộ nhường luồng cho việc khác trong lúc chạy, thay vì khoá cứng
 * event loop của Node và làm treo mọi request đang đến. Đừng dùng `hashSync`
 * trong server.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

/**
 * Kiểm tra mật khẩu người dùng vừa nhập có khớp với hash đã lưu không.
 *
 * Chú ý: KHÔNG có bước "giải mã hash ra rồi so sánh" — điều đó bất khả thi.
 * `bcrypt.compare` làm thế này:
 *
 *   1. Đọc cost và salt nằm sẵn trong `passwordHash`.
 *   2. Băm `plainPassword` bằng ĐÚNG cost và salt vừa đọc được.
 *   3. So sánh hai chuỗi kết quả.
 *
 * Đó là lý do salt phải được lưu cùng hash: không có nó thì không tái tạo được
 * phép băm cũ, và không bao giờ đăng nhập lại được.
 *
 * ---------------------------------------------------------------------------
 * MỘT CHI TIẾT TINH TẾ: SO SÁNH THỜI GIAN HẰNG ĐỊNH
 * ---------------------------------------------------------------------------
 * Bước 3 KHÔNG dùng `===`. Toán tử `===` dừng lại ngay khi gặp ký tự đầu tiên
 * khác nhau, nên thời gian chạy của nó tiết lộ "đoán đúng được bao nhiêu ký tự".
 *
 * Kẻ tấn công đo thời gian phản hồi hàng nghìn lần có thể dò ra từng ký tự một —
 * gọi là "timing attack". `bcrypt.compare` so sánh toàn bộ chuỗi bất kể khác
 * nhau ở đâu, nên thời gian chạy luôn như nhau và không rò rỉ gì.
 *
 * Bài học chung: với dữ liệu bí mật, đừng bao giờ so sánh bằng `===`. Dùng hàm
 * so sánh chuyên dụng (`crypto.timingSafeEqual` của Node, hoặc như ở đây là
 * hàm có sẵn của thư viện).
 */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
