/*
 * ============================================================================
 * HẰNG SỐ DÙNG CHUNG CỦA BACKEND
 * ============================================================================
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO NHỮNG GIÁ TRỊ NÀY KHÔNG NẰM TRONG .env?
 * ----------------------------------------------------------------------------
 *
 * Quy ước của dự án (xem CLAUDE.md ở thư mục gốc): `.env` chỉ giữ hai loại thứ
 *
 *   1. BÍ MẬT      — mật khẩu database, JWT_SECRET...
 *   2. KHÁC NHAU GIỮA CÁC MÔI TRƯỜNG — cổng, chuỗi kết nối...
 *
 * "Access token sống 1 giờ" không thuộc loại nào cả. Nó là một QUYẾT ĐỊNH THIẾT
 * KẾ, giống hệt trên máy bạn và trên production, và chẳng có gì bí mật.
 *
 * Để nó ở đây được ba cái lợi mà `.env` không cho:
 *
 *   - TypeScript kiểm tra được. `process.env.ACCESS_TOKEN_TTL` luôn có kiểu
 *     `string | undefined`, phải ép kiểu và kiểm tra rỗng ở mọi chỗ dùng.
 *     Còn hằng số ở đây thì trình biên dịch biết chắc nó là `number`.
 *
 *   - Viết được BIỂU THỨC có ý nghĩa. `30 * 24 * 60 * 60` đọc là "30 ngày";
 *     còn `2592000` trong file .env thì phải bấm máy tính mới biết là gì.
 *
 *   - Ghi chú được lý do ngay cạnh giá trị, như những khối comment dưới đây.
 *
 * Nguyên tắc để tự quyết định: nếu đổi giá trị này giữa dev và production thì
 * cho vào `.env`; nếu không thì để ở đây.
 */

/**
 * Access token sống bao lâu (giây). 1 giờ.
 *
 * Đây là một sự đánh đổi trực tiếp giữa an toàn và trải nghiệm:
 *
 *   NGẮN hơn (5 phút)  → token bị lộ thì kẻ xấu chỉ dùng được 5 phút. Nhưng
 *                        phải gia hạn liên tục, mỗi lần là một request thừa.
 *   DÀI hơn (7 ngày)   → gần như không phải gia hạn. Nhưng token lộ là mất cả
 *                        tuần, mà JWT thì KHÔNG THU HỒI ĐƯỢC (xem `jwt.ts`).
 *
 * 1 giờ là con số quy ước phổ biến, cũng là mặc định của phần lớn dịch vụ danh
 * tính lớn. Đủ ngắn để thiệt hại có giới hạn, đủ dài để việc gia hạn không trở
 * thành gánh nặng.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Refresh token sống bao lâu (giây). 30 ngày.
 *
 * Dài hơn access token 720 lần, và điều đó chấp nhận được vì ba lý do:
 *
 *   1. Nó THU HỒI ĐƯỢC. Xoá hàng trong bảng `Session` là phiên chết ngay, khác
 *      hẳn access token.
 *   2. Nó hiếm khi ra khỏi máy — mỗi giờ một lần, thay vì mỗi request.
 *   3. Nó XOAY VÒNG. Mỗi lần gia hạn, token cũ bị xoá và cấp token mới, nên
 *      một token cụ thể hiếm khi sống đủ 30 ngày.
 *
 * Con số 30 ngày trả lời câu hỏi: "bao lâu không mở app thì bắt đăng nhập lại?".
 * Với một app ghi chú công việc thì một tháng là hợp lý.
 */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Số vòng lặp của bcrypt, dạng luỹ thừa: 12 nghĩa là 2^12 = 4096 vòng.
 *
 * ⚠️ Chú ý con số này TĂNG THEO LUỸ THỪA. 13 không phải "nhanh hơn 12 một
 * chút" — nó CHẬM GẤP ĐÔI. 15 chậm gấp 8 lần 12.
 *
 * Vì sao lại CỐ TÌNH làm chậm? Đọc kỹ chỗ này, vì nó ngược với mọi thứ khác bạn
 * học về lập trình:
 *
 *   Người dùng chọn mật khẩu dở. Rất nhiều người dùng "123456", "password",
 *   hoặc tên con mình. Một kẻ có file database bị lộ sẽ thử lần lượt vài triệu
 *   mật khẩu phổ biến nhất xem cái nào cho ra đúng chuỗi hash.
 *
 *   Nếu hàm băm chạy 1 micro-giây, hắn thử được 1 triệu mật khẩu mỗi giây và
 *   phá xong trong vài phút. Nếu hàm băm chạy 250 mili-giây, hắn chỉ thử được
 *   4 mật khẩu mỗi giây — cùng công việc đó nay mất nhiều năm.
 *
 *   Còn người dùng thật thì chỉ băm ĐÚNG MỘT LẦN mỗi lần đăng nhập. 250ms với
 *   họ là không cảm nhận được.
 *
 * Đó là toàn bộ ý tưởng: cái giá không đáng kể với một lần, nhưng không thể
 * trả nổi với vài triệu lần.
 *
 * Cách chọn con số cho dự án thật: đo thời gian băm trên chính máy chủ của bạn,
 * chọn giá trị cho ra khoảng 200–300ms. Phần cứng càng nhanh thì con số này
 * càng phải tăng theo thời gian — khuyến nghị của năm 2015 giờ đã quá yếu.
 */
export const BCRYPT_COST = 12;

/**
 * Độ dài (byte) của refresh token ngẫu nhiên.
 *
 * 64 byte = 512 bit, in ra dạng hex thành chuỗi 128 ký tự.
 *
 * Nhiều đến mức nào? Số khả năng là 2^512 — lớn hơn số nguyên tử trong vũ trụ
 * quan sát được (khoảng 2^266) rất nhiều lần. Đoán mò là chuyện không tưởng,
 * nên ta không cần thêm bất kỳ cơ chế chống dò nào cho refresh token.
 *
 * 32 byte đã là quá đủ theo mọi khuyến nghị. Chọn 64 vì cái giá của việc rộng
 * rãi ở đây bằng không: thêm 64 byte trong một cột database.
 */
export const REFRESH_TOKEN_BYTES = 64;
