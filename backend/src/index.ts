/*
 * ============================================================================
 * ĐIỂM KHỞI ĐỘNG CỦA SERVER — file đầu tiên Node.js chạy
 * ============================================================================
 *
 * Khi bạn gõ `npm run dev`, thực chất máy chạy `tsx watch src/index.ts`. Nghĩa
 * là file NÀY được thực thi đầu tiên, và mọi file khác chỉ được nạp vì file này
 * (hoặc file nó import) cần tới.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO TÁCH `index.ts` VÀ `app.ts` LÀM HAI FILE?
 * ---------------------------------------------------------------------------
 * Nhìn qua thì thừa: gộp lại 20 dòng là xong. Nhưng tách ra có lý do thật:
 *
 *   - `app.ts` chỉ ĐỊNH NGHĨA ứng dụng (có những route nào, middleware nào).
 *     Nó không mở cổng mạng, không chiếm tài nguyên gì cả.
 *   - `index.ts` mới là nơi THỰC SỰ bật server lên, chiếm cổng 3000.
 *
 * Nhờ vậy, sau này khi viết test tự động, bộ test có thể `import app from
 * "./app"` để bắn request giả vào ứng dụng mà KHÔNG cần mở cổng thật. Nếu gộp
 * chung, hễ import là server tự chạy — rất phiền khi chạy nhiều test song song.
 *
 * Đây là quy ước gần như chuẩn trong cộng đồng Express, bạn sẽ gặp lại ở hầu
 * hết dự án thật.
 */

/*
 * `import "dotenv/config"` — kiểu import "chỉ để chạy", không lấy giá trị nào.
 *
 * Nó đọc file `.env` ở thư mục gốc của backend rồi nhét từng dòng vào
 * `process.env`. Từ sau dòng này, `process.env.PORT` và `process.env.DATABASE_URL`
 * mới có giá trị.
 *
 * CỰC KỲ QUAN TRỌNG: dòng này phải đứng TRÊN CÙNG, trước mọi import khác.
 * Vì JavaScript chạy các import theo thứ tự từ trên xuống. Nếu bạn để nó xuống
 * dưới, thì lúc `./app` được nạp (kéo theo Prisma Client được khởi tạo),
 * `process.env.DATABASE_URL` vẫn còn rỗng → Prisma báo lỗi "không có URL database".
 *
 * Lưu ý: `.env` chỉ nên chứa BÍ MẬT (mật khẩu, chuỗi kết nối) và những giá trị
 * khác nhau giữa các môi trường. Hằng số dùng chung thì để trong file constants.
 */
import "dotenv/config";

import app from "./app";

/*
 * Đọc cổng từ biến môi trường, chưa đặt thì mặc định 3000.
 *
 * Vì sao phải bọc `Number(...)`? Vì mọi biến môi trường đều là CHUỖI, kể cả khi
 * bạn viết `PORT=3000` trong `.env` thì `process.env.PORT` vẫn là `"3000"`.
 *
 * Vì sao phải viết dài dòng `process.env.PORT ? Number(...) : 3000` thay vì
 * `Number(process.env.PORT) || 3000`? Vì khi biến chưa đặt (`undefined`),
 * `Number(undefined)` cho ra `NaN` — một giá trị "số" nhưng vô nghĩa. Kiểm tra
 * trước rồi mới ép kiểu sẽ an toàn hơn.
 *
 * Vì sao cần đọc từ môi trường mà không hard-code? Vì khi deploy thật (Render,
 * Railway, Heroku...), nhà cung cấp TỰ CHỌN cổng cho bạn và đưa qua biến `PORT`.
 * App không đọc biến này sẽ không nhận được request nào.
 */
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

/*
 * `app.listen(port, callback)` — dòng làm server thực sự "sống".
 *
 * Nó bảo hệ điều hành: "cho tôi mượn cổng 3000, có ai gõ cửa thì báo tôi".
 * Từ giây phút này, tiến trình Node KHÔNG kết thúc nữa mà đứng chờ mãi mãi
 * (đó là lý do terminal không trả lại dấu nhắc lệnh cho bạn).
 *
 * Hàm callback chỉ chạy ĐÚNG MỘT LẦN, ngay khi server sẵn sàng nhận request —
 * nó không chạy lại ở mỗi request. Dùng nó để in ra thông báo cho lập trình viên.
 *
 * Toàn bộ Node.js hoạt động theo kiểu "hướng sự kiện" như vậy: bạn không viết
 * vòng lặp `while(true)` để chờ, bạn đăng ký hàm xử lý rồi để Node gọi lại
 * khi có việc.
 */
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
